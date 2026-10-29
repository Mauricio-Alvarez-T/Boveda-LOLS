/**
 * Sitio web — guardas (plan 4.3 y 4.4, mig 147).
 *
 *   · modoEfectivo: staging NUNCA publica en el repo público. Publica solo con TODO: modo publicar, token,
 *     rama y, para el repo público, la BD de producción, la carpeta de producción y la variable exclusiva del
 *     .env de producción. Un repo privado de prueba sí se permite.
 *   · rutaPermitida: lista blanca de rutas del repo; el 1.jpg heredado solo se borra, y nunca en las carpetas
 *     que comparte «Han confiado en nosotros».
 *   · el token nunca aparece en lo que devuelve la guarda.
 *
 * Funciones puras: sin BD ni red.
 */
const g = require('../src/services/sitioWebGuarda');
const { BD_PRODUCCION } = require('../src/services/saneoStaging.service');
const { CARPETAS_COMPARTIDAS } = require('../src/config/sitioWeb.config');

const TOKEN = 'github_pat_SECRETO_de_prueba_123';
const PROD_DIR = '/home/lolscl/boveda/src/services';
const STAGING_DIR = '/home/lolscl/test-boveda/src/services';
/** Las líneas del .env de producción, completas. */
const envProd = (extra = {}) => ({
    SITIO_WEB_MODO: 'publicar',
    GITHUB_TOKEN_SITIO: TOKEN,
    GITHUB_REPO_SITIO: 'Mauricio-Alvarez-T/lols.cl',
    GITHUB_BRANCH_SITIO: 'main',
    SITIO_WEB_PERMITIR_REPO_PUBLICO: '1',
    ...extra,
});
const modo = (env, dbName = BD_PRODUCCION, dirname = PROD_DIR) => g.explicarModo({ env, dbName, dirname });

describe('modoEfectivo — staging nunca publica en el repo público', () => {
    test('producción con todo → publicar', () => {
        expect(modo(envProd())).toEqual({ modo: 'publicar', motivo: null });
        expect(g.modoEfectivo({ env: envProd(), dbName: BD_PRODUCCION, dirname: PROD_DIR })).toBe('publicar');
    });

    test('una BD *test* con TODAS las variables de producción → simulación', () => {
        expect(modo(envProd(), 'lolscl_test_boveda')).toEqual({ modo: 'simulacion', motivo: 'entorno_no_produccion' });
        expect(modo(envProd(), 'lolscl_staging')).toMatchObject({ modo: 'simulacion' });
        expect(modo(envProd(), '')).toMatchObject({ modo: 'simulacion' });
        expect(modo(envProd(), null)).toMatchObject({ modo: 'simulacion' });
        // Sin dbName explícito se lee DB_NAME del mismo env: el de test tampoco publica.
        expect(g.explicarModo({ env: envProd({ DB_NAME: 'lolscl_test' }), dirname: PROD_DIR })).toMatchObject({ modo: 'simulacion' });
        expect(modo(envProd(), 'LOLSCL_BOVEDA')).toMatchObject({ modo: 'simulacion' });   // otra grafía no es la de prod
    });

    test('la carpeta test-boveda → simulación aunque la BD diga producción', () => {
        expect(modo(envProd(), BD_PRODUCCION, STAGING_DIR)).toEqual({ modo: 'simulacion', motivo: 'entorno_no_produccion' });
        expect(modo(envProd(), BD_PRODUCCION, 'C:\\home\\Test-Boveda\\src')).toMatchObject({ modo: 'simulacion' });
    });

    test('sin SITIO_WEB_PERMITIR_REPO_PUBLICO=1 → simulación', () => {
        expect(modo(envProd({ SITIO_WEB_PERMITIR_REPO_PUBLICO: undefined }))).toEqual({ modo: 'simulacion', motivo: 'repo_publico_no_permitido' });
        expect(modo(envProd({ SITIO_WEB_PERMITIR_REPO_PUBLICO: 'true' }))).toMatchObject({ modo: 'simulacion' });
    });

    test('otra grafía del repo público no esquiva la guarda', () => {
        for (const repo of ['mauricio-alvarez-t/LOLS.CL', 'Mauricio-Alvarez-T/lols.cl.git']) {
            expect(modo(envProd({ GITHUB_REPO_SITIO: repo }), 'lolscl_test')).toMatchObject({ modo: 'simulacion', motivo: 'entorno_no_produccion' });
        }
        // Sin GITHUB_REPO_SITIO el destino por defecto ES el público: misma guarda.
        expect(modo(envProd({ GITHUB_REPO_SITIO: undefined }), 'lolscl_test')).toMatchObject({ modo: 'simulacion' });
    });

    test('un repo PRIVADO de prueba desde staging → publicar (plan 4.10)', () => {
        const env = envProd({ GITHUB_REPO_SITIO: 'Mauricio-Alvarez-T/lols-cl-prueba', SITIO_WEB_PERMITIR_REPO_PUBLICO: undefined });
        expect(modo(env, 'lolscl_test_boveda', STAGING_DIR)).toEqual({ modo: 'publicar', motivo: null });
    });

    test('sin modo publicar, sin token, sin rama o con un repo raro → simulación', () => {
        expect(modo(envProd({ SITIO_WEB_MODO: 'simulacion' }))).toMatchObject({ motivo: 'modo_simulacion' });
        expect(modo(envProd({ SITIO_WEB_MODO: undefined }))).toMatchObject({ motivo: 'modo_simulacion' });
        expect(modo(envProd({ GITHUB_TOKEN_SITIO: '   ' }))).toMatchObject({ motivo: 'sin_token' });
        expect(modo(envProd({ GITHUB_BRANCH_SITIO: '' }))).toMatchObject({ motivo: 'sin_rama' });
        expect(modo(envProd({ GITHUB_REPO_SITIO: '../../etc' }))).toMatchObject({ motivo: 'repo_invalido' });
        expect(modo({})).toMatchObject({ modo: 'simulacion' });
    });

    test('el token nunca aparece en lo que devuelve la guarda', () => {
        const env = envProd({ GITHUB_TOKEN_SITIO_VENCE: '2027-01-26' });
        const todo = JSON.stringify([
            modo(env), modo(env, 'x_test'), g.repoSitio(env), g.ramaSitio(env), g.hayToken(env),
            g.tokenVenceEnDias(env, '2026-10-29'), g.urlSitio(env, 'https://nuevo.lols.cl'),
        ]);
        expect(todo).not.toContain(TOKEN);
        expect(g.hayToken(env)).toBe(true);
        expect(g.tokenSitio(env)).toBe(TOKEN);              // solo quien lo pide explícitamente (cliente de GitHub)
        expect(g.tokenSitio({})).toBeNull();
    });
});

describe('vencimiento del token y URL del sitio', () => {
    test('días que faltan (negativo = vencido); null sin token o sin fecha válida', () => {
        const env = envProd({ GITHUB_TOKEN_SITIO_VENCE: '2027-01-26' });
        expect(g.tokenVenceEnDias(env, '2026-10-29')).toBe(89);
        expect(g.tokenVenceEnDias(env, '2027-01-26')).toBe(0);
        expect(g.tokenVenceEnDias(env, '2027-02-01')).toBe(-6);
        expect(g.tokenVenceEnDias(envProd({ GITHUB_TOKEN_SITIO_VENCE: '2027-02-30' }), '2026-10-29')).toBeNull();
        expect(g.tokenVenceEnDias(envProd({ GITHUB_TOKEN_SITIO_VENCE: 'enero' }), '2026-10-29')).toBeNull();
        expect(g.tokenVenceEnDias({ GITHUB_TOKEN_SITIO_VENCE: '2027-01-26' }, '2026-10-29')).toBeNull();
    });

    test('SITIO_WEB_URL solo si es https limpio', () => {
        const def = 'https://nuevo.lols.cl';
        expect(g.urlSitio({ SITIO_WEB_URL: 'https://lols.cl/' }, def)).toBe('https://lols.cl');
        expect(g.urlSitio({ SITIO_WEB_URL: 'http://lols.cl' }, def)).toBe(def);
        expect(g.urlSitio({ SITIO_WEB_URL: 'https://user:pass@lols.cl' }, def)).toBe(def);
        expect(g.urlSitio({ SITIO_WEB_URL: 'javascript:alert(1)' }, def)).toBe(def);
        expect(g.urlSitio({}, def)).toBe(def);
    });
});

describe('rutaPermitida — lista blanca del repo', () => {
    test('el JSON y las portadas de la Bóveda se escriben y se borran', () => {
        for (const r of ['src/content/obras/maipu-40.json', 'public/proyectos/maipu-40/portada.0a1b2c3d-800.webp',
            'public/proyectos/maipu-40/portada.0a1b2c3d-1600.webp']) {
            expect(g.rutaPermitida(r)).toBe(true);
            expect(g.rutaPermitida(r, { accion: 'borrar' })).toBe(true);
        }
    });

    test('rechaza todo lo que no es de la Bóveda (código, config, workflows, otros archivos)', () => {
        for (const r of ['scripts/x.sh', 'public/a.php', 'public/.htaccess', '.github/workflows/deploy.yml',
            'src/content/obras/.gitkeep', 'src/content/obras/sub/x.json', 'src/content/obras/X.json', 'src/content/obras/a.JSON',
            'src/data/proyectos.ts', 'public/proyectos/maipu-40/portada.0a1b2c3d-1200.webp',
            'public/proyectos/maipu-40/portada.0A1B2C3D-800.webp', 'public/proyectos/maipu-40/portada.0a1b2c3-800.webp',
            'public/proyectos/maipu-40/foto.jpg', 'public/proyectos/maipu-40/2.jpg', 'public/proyectos/placeholder.svg', '', null, 42]) {
            expect(g.rutaPermitida(r)).toBe(false);
            expect(g.rutaPermitida(r, { accion: 'borrar' })).toBe(false);
        }
    });

    test('rechaza trucos de ruta: «..», absolutas, «\\», dobles barras y caracteres de control', () => {
        for (const r of ['../src/content/obras/x.json', 'src/content/obras/../../../etc/passwd.json', '/src/content/obras/x.json',
            'src\\content\\obras\\x.json', 'src/content//obras/x.json', 'src/content/obras/x.json\n', 'src/content/obras/x\0.json']) {
            expect(g.rutaPermitida(r)).toBe(false);
        }
        expect(g.rutaPermitida(`src/content/obras/${'a'.repeat(81)}.json`)).toBe(false);   // slug de más de 80
    });

    test('el 1.jpg heredado solo se BORRA, y nunca en las carpetas compartidas con «Han confiado en nosotros»', () => {
        expect(g.rutaPermitida('public/proyectos/toesca-2770/1.jpg', { accion: 'borrar' })).toBe(true);
        expect(g.rutaPermitida('public/proyectos/toesca-2770/1.jpg')).toBe(false);          // escribir: nunca
        // Las 12 de obrasConfianza (lols.cl src/data/proyectos.ts), no solo las 4 que hoy también son una obra: una obra
        // del repo (o futura) con el slug de una de las otras 8 tampoco puede borrar ese 1.jpg (el build del sitio falla).
        const confianza = ['enfermera-lucia-vidal-arias-6679', 'claudio-gay-2970', 'av-providencia-1132', 'abate-molina-221',
            'bascunan-guerrero-818', 'grajales-2751', 'bascunan-guerrero-239', 'gorbea-2635', 'tucapel-jimenez-84', 'conferencia-442',
            'san-alfonso-580', 'abate-molina-211'];
        expect([...CARPETAS_COMPARTIDAS].sort()).toEqual([...confianza].sort());
        for (const slug of confianza) {
            expect(g.rutaPermitida(`public/proyectos/${slug}/1.jpg`, { accion: 'borrar' })).toBe(false);
            expect(g.esRutaDuena(`public/proyectos/${slug}/1.jpg`)).toBe(false);
            // Su JSON y sus portadas nuevas sí son de la Bóveda.
            expect(g.rutaPermitida(`src/content/obras/${slug}.json`, { accion: 'borrar' })).toBe(true);
            expect(g.rutaPermitida(`public/proyectos/${slug}/portada.0a1b2c3d-800.webp`)).toBe(true);
        }
        expect(g.rutaPermitida('public/proyectos/claudio-gay-2970/1.jpg', { accion: 'borrar' })).toBe(false);
    });

    test('una acción desconocida no pasa', () => {
        expect(g.rutaPermitida('src/content/obras/x.json', { accion: 'mover' })).toBe(false);
    });
});
