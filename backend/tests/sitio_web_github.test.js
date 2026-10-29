/**
 * Sitio web — cliente de GitHub y lectura de «en línea» (mig 147, plan 4.4 y 6).
 *
 * Lo que fijan (con `fetchImpl` simulado; nunca la red):
 *   · gitBlobSha da el SHA que git le da a un archivo;
 *   · headers (Bearer, versión de la API, User-Agent), redirect:'manual', token nunca en la URL;
 *   · 401 → 424 TOKEN_INVALIDO; 403/404 → 424 SIN_ACCESO; retry-after corto → espera y reintenta, largo → 503;
 *     timeout → 504; un error de red cuyo texto trae el token no lo deja salir ni en el error ni en el log;
 *   · un árbol `truncated` aborta; crearArbol revisa la lista blanca ANTES de llamar (ni .gitkeep, ni .php, ni
 *     scripts, ni `..`, ni el 1.jpg de una carpeta compartida); base_tree y sha:null para borrar;
 *   · moverRef con force:false y 422 → SITIO_WEB_REF_AVANZO; compare (contiene); estado de la compilación;
 *   · build.txt: solo un SHA de 40 hex vale, sin token, sin seguir redirecciones, con tope de 1 KB y caché de 15 s.
 */
const logger = require('../src/utils/logger-structured');
const gh = require('../src/services/sitioWebGithub.service');
const enLinea = require('../src/services/sitioWebEnLinea');

const TOKEN = 'github_pat_SECRETO_de_prueba_1234567890';
const ENV = { GITHUB_TOKEN_SITIO: TOKEN, GITHUB_REPO_SITIO: 'Mauricio-Alvarez-T/lols-cl-prueba', GITHUB_BRANCH_SITIO: 'main' };
const SHA = (c) => c.repeat(40);

const json = (status, cuerpo, headers = {}) => new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status, headers: { 'content-type': 'application/json', ...headers },
});
/** fetch simulado: responde en orden la lista de respuestas (o funciones) y guarda cada llamada. */
function fetchCon(...respuestas) {
    const fn = jest.fn(async () => {
        const r = respuestas.shift();
        if (!r) throw new Error('sin respuesta preparada');
        return typeof r === 'function' ? r() : r;
    });
    return fn;
}
const cliente = (fetchImpl, extra = {}) => gh.crearCliente({ env: ENV, fetchImpl, esperar: jest.fn().mockResolvedValue(undefined), ...extra });

let logs;
beforeEach(() => {
    logs = [];
    for (const nivel of ['info', 'warn', 'error']) jest.spyOn(logger, nivel).mockImplementation((msg, meta) => { logs.push(JSON.stringify([msg, meta])); });
    enLinea.limpiarCache();
});
afterEach(() => jest.restoreAllMocks());

describe('gitBlobSha', () => {
    test('el SHA de git de un archivo (vectores conocidos)', () => {
        expect(gh.gitBlobSha(Buffer.alloc(0))).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
        expect(gh.gitBlobSha('hello world\n')).toBe('3b18e512dba79e4c8300dd08aeb37f8e728b8dad');
        expect(gh.gitBlobSha(Buffer.from('hello world\n'))).toBe('3b18e512dba79e4c8300dd08aeb37f8e728b8dad');
    });
});

describe('llamadas y errores', () => {
    test('headers de la API, sin redirecciones y el token solo en Authorization', async () => {
        const f = fetchCon(json(200, { object: { sha: SHA('a') } }));
        await expect(cliente(f).leerRef()).resolves.toBe(SHA('a'));
        const [url, op] = f.mock.calls[0];
        expect(url).toBe('https://api.github.com/repos/Mauricio-Alvarez-T/lols-cl-prueba/git/ref/heads/main');
        expect(url).not.toContain(TOKEN);
        expect(op.method).toBe('GET');
        expect(op.redirect).toBe('manual');
        expect(op.headers).toMatchObject({
            Authorization: `Bearer ${TOKEN}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'BovedaLOLS-SitioWeb/1.0',
        });
        expect(op.signal).toBeDefined();
    });

    test('401 → 424 SITIO_WEB_TOKEN_INVALIDO, sin el token en el mensaje ni en el log', async () => {
        const f = fetchCon(json(401, { message: `Bad credentials ${TOKEN}` }));
        const e = await cliente(f).leerRef().catch(x => x);
        expect(e).toMatchObject({ statusCode: 424, code: 'SITIO_WEB_TOKEN_INVALIDO' });
        expect(e.message).not.toContain(TOKEN);
        expect(JSON.stringify(e)).not.toContain(TOKEN);
        expect(logs.join(' ')).not.toContain(TOKEN);
    });

    test('un token con caracteres raros ni se intenta (no llega a fetch)', async () => {
        const f = fetchCon();
        const e = await gh.crearCliente({ env: { ...ENV, GITHUB_TOKEN_SITIO: 'abc\ndef ghijklmnopqrstuvwxyz' }, fetchImpl: f }).leerRef().catch(x => x);
        expect(e.code).toBe('SITIO_WEB_TOKEN_INVALIDO');
        expect(f).not.toHaveBeenCalled();
    });

    test('403 y 404 → 424 SITIO_WEB_SIN_ACCESO; un 3xx también (el token no sigue a otro lado)', async () => {
        for (const st of [403, 404, 301]) {
            const e = await cliente(fetchCon(json(st, { message: 'x' }))).leerRef().catch(x => x);
            expect(e).toMatchObject({ statusCode: 424, code: 'SITIO_WEB_SIN_ACCESO' });
        }
    });

    test('retry-after corto: espera y reintenta una vez; largo → 503 SITIO_WEB_GITHUB_LIMITE', async () => {
        const esperar = jest.fn().mockResolvedValue(undefined);
        const f = fetchCon(json(403, {}, { 'retry-after': '2' }), json(200, { object: { sha: SHA('b') } }));
        await expect(cliente(f, { esperar }).leerRef()).resolves.toBe(SHA('b'));
        expect(esperar).toHaveBeenCalledWith(2000);
        expect(f).toHaveBeenCalledTimes(2);

        const e = await cliente(fetchCon(json(429, {}, { 'retry-after': '60' }))).leerRef().catch(x => x);
        expect(e).toMatchObject({ statusCode: 503, code: 'SITIO_WEB_GITHUB_LIMITE' });
        const e2 = await cliente(fetchCon(json(403, {}, { 'retry-after': '1' }), json(403, {}, { 'retry-after': '1' }))).leerRef().catch(x => x);
        expect(e2.code).toBe('SITIO_WEB_GITHUB_LIMITE');
    });

    test('timeout → 504 (solo el mensaje); error de red con el token adentro → 502 sin el token', async () => {
        const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
        const e = await cliente(fetchCon(() => { throw timeout; })).leerRef().catch(x => x);
        expect(e).toMatchObject({ statusCode: 504, code: 'SITIO_WEB_GITHUB_TIMEOUT' });

        const red = new TypeError(`Headers.append: "Bearer ${TOKEN}" is an invalid header value`);
        const e2 = await cliente(fetchCon(() => { throw red; })).leerRef().catch(x => x);
        expect(e2).toMatchObject({ statusCode: 502, code: 'SITIO_WEB_GITHUB_ERROR' });
        expect(e2.message).not.toContain(TOKEN);
        expect(logs.join(' ')).not.toContain(TOKEN);
    });

    test('5xx → 502 con el número, sin la respuesta cruda', async () => {
        const e = await cliente(fetchCon(json(503, { message: 'detalle interno' }))).leerRef().catch(x => x);
        expect(e).toMatchObject({ statusCode: 502, code: 'SITIO_WEB_GITHUB_ERROR' });
        expect(e.message).toContain('503');
        expect(e.message).not.toContain('detalle interno');
    });
});

describe('árbol, blobs y commit', () => {
    test('leerArbol: un árbol truncated aborta; si no, solo los blobs', async () => {
        const e = await cliente(fetchCon(json(200, { truncated: true, tree: [] }))).leerArbol(SHA('c')).catch(x => x);
        expect(e.code).toBe('SITIO_WEB_ARBOL_TRUNCADO');
        const f = fetchCon(json(200, { truncated: false, tree: [
            { path: 'src', type: 'tree', sha: SHA('1') },
            { path: 'src/content/obras/a.json', type: 'blob', sha: SHA('2'), mode: '100644' },
        ] }));
        const arbol = await cliente(f).leerArbol(SHA('c'));
        expect([...arbol.keys()]).toEqual(['src/content/obras/a.json']);
        expect(f.mock.calls[0][0]).toMatch(/\/git\/trees\/c{40}\?recursive=1$/);
    });

    test('leerBlob verifica el SHA; crearBlob verifica lo que GitHub guardó', async () => {
        const contenido = Buffer.from('{"a":1}\n');
        const sha = gh.gitBlobSha(contenido);
        await expect(cliente(fetchCon(json(200, { encoding: 'base64', content: contenido.toString('base64') }))).leerBlob(sha)).resolves.toEqual(contenido);
        const malo = await cliente(fetchCon(json(200, { encoding: 'base64', content: Buffer.from('otro').toString('base64') }))).leerBlob(sha).catch(x => x);
        expect(malo.code).toBe('SITIO_WEB_GITHUB_ERROR');

        const f = fetchCon(json(201, { sha }));
        await expect(cliente(f).crearBlob(contenido)).resolves.toBe(sha);
        expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ content: contenido.toString('base64'), encoding: 'base64' });
        const e = await cliente(fetchCon(json(201, { sha: SHA('d') }))).crearBlob(contenido).catch(x => x);
        expect(e.code).toBe('SITIO_WEB_GITHUB_ERROR');
    });

    test('crearArbol revisa la lista blanca ANTES de llamar: una sola ruta mala y no hay ninguna llamada', async () => {
        const malas = [
            { escribir: [{ ruta: 'scripts/x.sh', sha: SHA('1') }] },
            { escribir: [{ ruta: 'public/a.php', sha: SHA('1') }] },
            { escribir: [{ ruta: 'src/content/obras/../x.json', sha: SHA('1') }] },
            { escribir: [{ ruta: '.github/workflows/deploy.yml', sha: SHA('1') }] },
            { escribir: [{ ruta: 'public/proyectos/gorbea-3082/1.jpg', sha: SHA('1') }] },   // el 1.jpg nunca se escribe
            { borrar: ['src/content/obras/.gitkeep'] },
            { borrar: ['public/proyectos/abate-molina-211/1.jpg'] },                       // carpeta compartida
            { borrar: ['public/.htaccess'] },
            { escribir: [{ ruta: 'src/content/obras/a.json', sha: SHA('1') }], borrar: ['src/content/obras/a.json'] },
        ];
        for (const cambios of malas) {
            const f = fetchCon();
            const e = await cliente(f).crearArbol(SHA('9'), cambios).catch(x => x);
            expect(e.code).toBe('SITIO_WEB_RUTA_NO_PERMITIDA');
            expect(f).not.toHaveBeenCalled();
        }
    });

    test('crearArbol sobre base_tree; borrar = sha null; el 1.jpg heredado (no compartido) sí se puede borrar', async () => {
        const f = fetchCon(json(201, { sha: SHA('e') }));
        await cliente(f).crearArbol(SHA('9'), {
            escribir: [{ ruta: 'src/content/obras/a.json', sha: SHA('1') }, { ruta: 'public/proyectos/a/portada.0123abcd-1600.webp', sha: SHA('2') }],
            borrar: ['public/proyectos/a/1.jpg'],
        });
        expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
            base_tree: SHA('9'),
            tree: [
                { path: 'src/content/obras/a.json', mode: '100644', type: 'blob', sha: SHA('1') },
                { path: 'public/proyectos/a/portada.0123abcd-1600.webp', mode: '100644', type: 'blob', sha: SHA('2') },
                { path: 'public/proyectos/a/1.jpg', mode: '100644', type: 'blob', sha: null },
            ],
        });
    });

    test('crearCommit con un padre y el autor; moverRef con force:false y 422 → SITIO_WEB_REF_AVANZO', async () => {
        const f = fetchCon(json(201, { sha: SHA('f') }));
        await cliente(f).crearCommit({ mensaje: 'sitio: publicar obras (pub #3)', arbol: SHA('e'), padre: SHA('a'), autor: { name: 'Bóveda LOLS', email: 'b@lols.cl' } });
        expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
            message: 'sitio: publicar obras (pub #3)', tree: SHA('e'), parents: [SHA('a')], author: { name: 'Bóveda LOLS', email: 'b@lols.cl' },
        });

        const p = fetchCon(json(200, { object: { sha: SHA('f') } }));
        await cliente(p).moverRef(SHA('f'));
        expect(p.mock.calls[0][1].method).toBe('PATCH');
        expect(p.mock.calls[0][0]).toMatch(/\/git\/refs\/heads\/main$/);
        expect(JSON.parse(p.mock.calls[0][1].body)).toEqual({ sha: SHA('f'), force: false });

        const e = await cliente(fetchCon(json(422, { message: 'Update is not a fast forward' }))).moverRef(SHA('f')).catch(x => x);
        expect(e).toMatchObject({ statusCode: 409, code: 'SITIO_WEB_REF_AVANZO' });
    });
});

describe('compare y compilación', () => {
    test('contiene: identical/ahead sí; behind/diverged no; un commit que GitHub no conoce (404) no', async () => {
        expect(await cliente(fetchCon()).contiene(SHA('a'), SHA('a'))).toBe(true);
        for (const [status, esperado] of [['identical', true], ['ahead', true], ['behind', false], ['diverged', false]]) {
            const f = fetchCon(json(200, { status }));
            expect(await cliente(f).contiene(SHA('a'), SHA('b'))).toBe(esperado);
            expect(f.mock.calls[0][0]).toMatch(/\/compare\/a{40}\.\.\.b{40}$/);
        }
        expect(await cliente(fetchCon(json(404, {}))).contiene(SHA('a'), SHA('b'))).toBe(false);
    });

    test('estadoBuild: en cola, compilando, ok, fallo y reemplazada (cancelada); solo el workflow del sitio', async () => {
        const run = (o) => ({ id: 1, run_number: 1, path: '.github/workflows/deploy.yml', html_url: 'https://github.com/x/y/actions/runs/1', ...o });
        const casos = [
            [[], 'en_cola'],
            [[run({ status: 'queued' })], 'en_cola'],
            [[run({ status: 'in_progress' })], 'compilando'],
            [[run({ status: 'completed', conclusion: 'success' })], 'ok'],
            [[run({ status: 'completed', conclusion: 'failure' })], 'fallo'],
            [[run({ status: 'completed', conclusion: 'cancelled' })], 'reemplazada'],
            [[run({ status: 'completed', conclusion: 'success', path: '.github/workflows/otro.yml' })], 'en_cola'],
        ];
        for (const [corridas, estado] of casos) {
            const f = fetchCon(json(200, { workflow_runs: corridas }));
            expect((await cliente(f).estadoBuild(SHA('a'))).estado).toBe(estado);
            expect(f.mock.calls[0][0]).toMatch(/\/actions\/runs\?head_sha=a{40}&per_page=10$/);
        }
        const r = await cliente(fetchCon(json(200, { workflow_runs: [run({ status: 'completed', conclusion: 'failure', html_url: 'javascript:alert(1)' })] }))).estadoBuild(SHA('a'));
        expect(r).toEqual({ estado: 'fallo', url: null });
    });
});

describe('en línea: build.txt y deploy-status.txt', () => {
    const texto = (status, cuerpo, headers = {}) => new Response(cuerpo, { status, headers });
    const fetchSitio = (build, deploy = '2026-10-29 10:00:00 · OK · abc1234\n') => jest.fn(async (url) => (
        url.endsWith('/build.txt') ? (typeof build === 'function' ? build() : texto(200, build)) : texto(200, deploy)));

    test('un SHA de 40 hex → en línea; cualquier otra cosa → desconocido', async () => {
        const f = fetchSitio(`${SHA('a')}\n`);
        expect(await enLinea.leerEnLinea({ env: {}, fetchImpl: f, ahora: 1 })).toMatchObject({ build: SHA('a'), estado: 'ok', deploy: { estado: 'ok' } });
        for (const malo of ['<html>404</html>', SHA('a').slice(0, 7), `${SHA('a')}x`, '']) {
            enLinea.limpiarCache();
            expect(await enLinea.leerEnLinea({ env: {}, fetchImpl: fetchSitio(malo), ahora: 1 })).toMatchObject({ build: null, estado: 'desconocido' });
        }
    });

    test('sin token, sin seguir redirecciones, a la URL del sitio', async () => {
        const f = fetchSitio(SHA('a'));
        await enLinea.leerEnLinea({ env: { GITHUB_TOKEN_SITIO: TOKEN, SITIO_WEB_URL: 'https://nuevo.lols.cl/' }, fetchImpl: f, ahora: 1 });
        const urls = f.mock.calls.map(c => c[0]).sort();
        expect(urls).toEqual(['https://nuevo.lols.cl/build.txt', 'https://nuevo.lols.cl/deploy-status.txt']);
        for (const [, op] of f.mock.calls) {
            expect(op.redirect).toBe('error');
            expect(JSON.stringify(op.headers)).not.toContain(TOKEN);
            expect(op.headers.Authorization).toBeUndefined();
        }
    });

    test('más de 1 KB → desconocido (anunciado o leyendo); un error de red → desconocido', async () => {
        const grande = `${SHA('a')}${' '.repeat(2000)}`;
        expect((await enLinea.leerEnLinea({ env: {}, fetchImpl: fetchSitio(grande), ahora: 1 })).estado).toBe('desconocido');
        enLinea.limpiarCache();
        const anunciado = fetchSitio(() => texto(200, SHA('a'), { 'content-length': '5000' }));
        expect((await enLinea.leerEnLinea({ env: {}, fetchImpl: anunciado, ahora: 1 })).estado).toBe('desconocido');
        enLinea.limpiarCache();
        const caido = jest.fn(async () => { throw new TypeError('fetch failed'); });
        expect(await enLinea.leerEnLinea({ env: {}, fetchImpl: caido, ahora: 1 })).toMatchObject({ estado: 'desconocido', deploy: { estado: 'desconocido' } });
    });

    test('caché de 15 s', async () => {
        const f = fetchSitio(SHA('a'));
        await enLinea.leerEnLinea({ env: {}, fetchImpl: f, ahora: 1000 });
        await enLinea.leerEnLinea({ env: {}, fetchImpl: f, ahora: 15000 });
        expect(f).toHaveBeenCalledTimes(2);   // build.txt + deploy-status.txt, una vez
        await enLinea.leerEnLinea({ env: {}, fetchImpl: f, ahora: 16001 });
        expect(f).toHaveBeenCalledTimes(4);
    });

    test('deploy-status.txt: OK, FALLO · filtro y lo que no se entiende', () => {
        expect(enLinea.leerDeployStatus('2026-10-29 10:00:00 · OK · abc1234')).toEqual({ estado: 'ok', fecha: '2026-10-29 10:00:00', motivo: null });
        expect(enLinea.leerDeployStatus('2026-10-29 10:05:00 · FALLO · filtro · abc1234')).toEqual({ estado: 'fallo', fecha: '2026-10-29 10:05:00', motivo: 'filtro' });
        expect(enLinea.leerDeployStatus('<html>')).toEqual({ estado: 'desconocido', fecha: null, motivo: null });
    });
});
