import * as fs from 'fs';
import * as path from 'path';
import {
    CLAVE_RESPALDO, RAFAGA_MS, aplicar, borrarRespaldo, cambiosValidos, camposTocados, contarCambios, crearBorrador, cuerpoCambios,
    deshacer, diferencias, erroresGuardar, faltantesDe, formActual, formBase, guardarRespaldo, jsonConCambios, leerRespaldo,
    obrasParaPuente, ofrecerRespaldo, payloadGuardar, puedeDeshacer, puedeRehacer, rebasar, recargarConChoques, rehacer,
    respaldoDesactualizado, crearNueva, cambiarEstado, mover, moverPaso, quitarDelSitio, incluirEnSitio, descartarNueva, idsDeLista,
    avisosDeLugar, fueraDelSitio, puedeBorrar, recuperarRespaldo, capaDeRespaldo, type EstadoBorrador, type ResultadoOp,
} from './borradorSitio';
import type { Almacen } from '../borradorObra';
import type { JsonObraSitio, ObraEditor } from '../tipos';

// Las 27 obras reales de lols.cl (las mismas que usa el backend para «cero diferencias»).
const DIR = path.join(__dirname, '../../../../../backend/tests/fixtures/sitio-web/obras');
const OBRAS: ObraEditor[] = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort().map((f, i) => {
    const json = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) as JsonObraSitio;
    return {
        json,
        meta: {
            id: 100 + i, incluir: true, nueva: false, faltantes: [], estadoDerivado: 'publicada', updated_at: `2026-11-10T12:00:${String(i).padStart(2, '0')}.000Z`,
            slug_congelado: true, foto: null, fotos_por_aprobar: 0, mandante: json.mandante, mandante_autoriza: json.mandante !== null,
            publicado_at: '2026-11-01T10:00:00.000Z', nunca_publicada: false,
        },
    };
});
const A = OBRAS[0];
const B = OBRAS[1];
const T = 1_000_000;

const memoria = (): Almacen & { datos: Map<string, string> } => {
    const datos = new Map<string, string>();
    return { datos, getItem: k => datos.get(k) ?? null, setItem: (k, v) => { datos.set(k, v); }, removeItem: k => { datos.delete(k); } };
};

describe('base: lo del servidor como formulario', () => {
    test('las 27 obras sin cambios: el JSON para el puente es exactamente el del servidor y no hay nada que guardar', () => {
        expect(OBRAS).toHaveLength(27);
        const e = crearBorrador(OBRAS);
        expect(obrasParaPuente(e).map(o => o.json)).toEqual(OBRAS.map(o => o.json));
        expect(obrasParaPuente(e)[0].meta).toEqual({ incluir: true, nueva: false });
        expect(contarCambios(e)).toBe(0);
        expect(payloadGuardar(e)).toEqual({ obras: [] });
        for (const o of OBRAS) expect(Object.keys(cuerpoCambios(e, o.meta.id))).toEqual([]);
    });

    test('formBase traduce la forma del sitio (superficieM2, en-curso) a la del formulario', () => {
        const f = formBase(A);
        expect(f.nombre).toBe(A.json.nombre);
        expect(f.superficie_m2).toBe(A.json.superficieM2 === null ? '' : String(A.json.superficieM2));
        expect(['en_construccion', 'contratado', 'terminado']).toContain(f.estado);
        expect(f.mandante_autoriza).toBe(A.json.mandante !== null);
    });
});

describe('aplicar, deshacer y rehacer', () => {
    test('escribir en el lugar: un cambio por obra y campo; volver al texto original no deja nada pendiente', () => {
        let e = crearBorrador(OBRAS);
        e = aplicar(e, A.meta.id, { nombre: 'Título nuevo' }, { t: T, grupo: `${A.meta.id}:nombre` });
        expect(e.cambios).toEqual({ [A.meta.id]: { nombre: 'Título nuevo' } });
        expect(contarCambios(e)).toBe(1);
        e = aplicar(e, A.meta.id, { nombre: A.json.nombre }, { t: T + 10, grupo: `${A.meta.id}:nombre` });
        expect(e.cambios).toEqual({});
        expect(contarCambios(e)).toBe(0);
    });

    test('una ráfaga de teclas del mismo campo es UN paso de deshacer; otro campo o una pausa abren otro', () => {
        let e = crearBorrador(OBRAS);
        const g = `${A.meta.id}:titular`;
        e = aplicar(e, A.meta.id, { titular: 'U' }, { t: T, grupo: g });
        e = aplicar(e, A.meta.id, { titular: 'Un' }, { t: T + 100, grupo: g });
        e = aplicar(e, A.meta.id, { titular: 'Un t' }, { t: T + 200, grupo: g });
        expect(e.pasado).toHaveLength(1);
        e = aplicar(e, A.meta.id, { titular: 'Un titular' }, { t: T + 200 + RAFAGA_MS, grupo: g });   // pausa
        expect(e.pasado).toHaveLength(2);
        e = aplicar(e, B.meta.id, { comuna: 'Ñuñoa' }, { t: T + 200 + RAFAGA_MS + 10, grupo: `${B.meta.id}:comuna` });
        expect(e.pasado).toHaveLength(3);
        e = aplicar(e, B.meta.id, { servicios: ['electricidad'] }, { t: T + 200 + RAFAGA_MS + 20 });   // sin grupo: siempre un paso
        expect(e.pasado).toHaveLength(4);

        e = deshacer(e);
        expect(formActual(e, B.meta.id)!.servicios).toEqual(formBase(B).servicios);
        e = deshacer(e);
        expect(e.cambios[B.meta.id]).toBeUndefined();
        e = deshacer(e);
        expect(formActual(e, A.meta.id)!.titular).toBe('Un t');
        e = deshacer(e);
        expect(e.cambios).toEqual({});
        expect(puedeDeshacer(e)).toBe(false);
        expect(deshacer(e)).toBe(e);

        e = rehacer(rehacer(e));
        expect(formActual(e, A.meta.id)!.titular).toBe('Un titular');
        expect(puedeRehacer(e)).toBe(true);
        // Escribir después de deshacer borra lo que se podía rehacer.
        e = aplicar(e, A.meta.id, { comuna: 'Maipú' }, { t: T + 99999, grupo: `${A.meta.id}:comuna` });
        expect(puedeRehacer(e)).toBe(false);
    });

    test('después de deshacer, la ráfaga no continúa (el siguiente cambio es un paso nuevo)', () => {
        let e = crearBorrador(OBRAS);
        const g = `${A.meta.id}:nombre`;
        e = aplicar(e, A.meta.id, { nombre: 'X' }, { t: T, grupo: g });
        e = aplicar(e, A.meta.id, { nombre: 'XY' }, { t: T + 1, grupo: g });
        e = deshacer(e);
        e = aplicar(e, A.meta.id, { nombre: 'Z' }, { t: T + 2, grupo: g });
        expect(e.pasado).toHaveLength(1);
    });

    test('un cambio que no cambia nada (o de una obra que no existe) devuelve el mismo estado', () => {
        const e = crearBorrador(OBRAS);
        expect(aplicar(e, A.meta.id, { nombre: A.json.nombre }, { t: T })).toBe(e);
        expect(aplicar(e, 999999, { nombre: 'x' }, { t: T })).toBe(e);
    });

    test('camposTocados: qué hay que volver a pintar en el sitio después de deshacer', () => {
        let e = crearBorrador(OBRAS);
        e = aplicar(e, A.meta.id, { nombre: 'N', superficie_m2: '9999' }, { t: T });
        const antes = e;
        e = deshacer(e);
        expect(camposTocados(antes, e)).toEqual(expect.arrayContaining([{ id: A.meta.id, campo: 'nombre' }, { id: A.meta.id, campo: 'superficie_m2' }]));
        expect(camposTocados(antes, e)).toHaveLength(2);
    });
});

describe('guardar: diferencias y cuerpo', () => {
    test('el cuerpo usa los nombres de la API, recorta y pasa vacío a null; mandante_autoriza solo con nombre', () => {
        let e = crearBorrador(OBRAS);
        e = aplicar(e, A.meta.id, { nombre: '  Nombre nuevo  ', titular: '', superficie_m2: '6.800', tipo: '' }, { t: T });
        // Una obra sin mandante autorizado: se escribe el nombre y se marca la casilla en el mismo guardado.
        const S = OBRAS.find(o => o.json.mandante === null && o.meta.id !== A.meta.id)!;
        e = aplicar(e, S.meta.id, { mandante: 'Inmobiliaria Nueva SpA', mandante_autoriza: true }, { t: T + 1 });
        const p = payloadGuardar(e);
        expect(p.obras.map(o => o.id)).toEqual([A.meta.id, S.meta.id].sort((x, y) => OBRAS.findIndex(o => o.meta.id === x) - OBRAS.findIndex(o => o.meta.id === y)));
        expect(p.obras.find(o => o.id === A.meta.id)).toEqual({
            id: A.meta.id, updated_at: A.meta.updated_at,
            cambios: expect.objectContaining({ nombre: 'Nombre nuevo', superficie_m2: 6800 }),
        });
        if (A.json.titular) expect(p.obras[0].cambios.titular).toBeNull();
        expect(p.obras[0].cambios).not.toHaveProperty('slug');
        expect(p.obras[0].cambios).not.toHaveProperty('estado');
        expect(p.obras[0].cambios).not.toHaveProperty('obra_id');
        expect(p.obras.find(o => o.id === S.meta.id)!.cambios).toMatchObject({ mandante: 'Inmobiliaria Nueva SpA', mandante_autoriza: true });
    });

    test('un espacio de más al final no cuenta como cambio (el servidor recorta)', () => {
        let e = crearBorrador(OBRAS);
        e = aplicar(e, A.meta.id, { nombre: `${A.json.nombre} ` }, { t: T });
        expect(contarCambios(e)).toBe(0);
        expect(payloadGuardar(e).obras).toEqual([]);
    });

    test('diferencias: obra, campo, antes → después, en palabras', () => {
        let e = crearBorrador(OBRAS);
        e = aplicar(e, A.meta.id, { nombre: 'Otro nombre', servicios: ['construccion', 'electricidad'] }, { t: T });
        const d = diferencias(e);
        expect(d).toEqual(expect.arrayContaining([
            { grupo: `obra:${A.meta.id}`, id: A.meta.id, obra: A.json.nombre, campo: 'nombre', etiqueta: 'Nombre', antes: A.json.nombre, despues: 'Otro nombre' },
        ]));
        const s = d.find(x => x.campo === 'servicios');
        if (s) expect(s.despues).toBe('Construcción, Electricidad');
    });

    test('lo que impide guardar: nombre vacío o superficie que no es un número', () => {
        let e = crearBorrador(OBRAS);
        e = aplicar(e, A.meta.id, { nombre: '   ', superficie_m2: '12,5' }, { t: T });
        const errs = erroresGuardar(e);
        expect(errs.map(x => x.id)).toEqual([A.meta.id, A.meta.id]);
        expect(errs.map(x => x.mensaje).join(' ')).toMatch(/nombre/);
    });

    test('rebasar: la base nueva del servidor y solo lo escrito MIENTRAS se guardaba', () => {
        let e = crearBorrador(OBRAS);
        e = aplicar(e, A.meta.id, { nombre: 'Guardado' }, { t: T });
        const enviado = e.cambios;
        e = aplicar(e, A.meta.id, { comuna: 'Escrito mientras' }, { t: T + 1 });
        const nuevas = OBRAS.map(o => (o.meta.id === A.meta.id ? { ...o, json: { ...o.json, nombre: 'Guardado' }, meta: { ...o.meta, updated_at: 'nueva' } } : o));
        const r = rebasar(e, nuevas, enviado);
        expect(r.cambios).toEqual({ [A.meta.id]: { comuna: 'Escrito mientras' } });
        expect(r.pasado).toEqual([]);
        expect(payloadGuardar(r).obras[0].updated_at).toBe('nueva');
    });

    test('recargar tras un 409: las obras que chocaron pierden lo escrito, las otras lo conservan', () => {
        let e = crearBorrador(OBRAS);
        e = aplicar(e, A.meta.id, { nombre: 'Mío A' }, { t: T });
        e = aplicar(e, B.meta.id, { nombre: 'Mío B' }, { t: T + 1 });
        const r = recargarConChoques(e, OBRAS, [A.meta.id]);
        expect(r.cambios).toEqual({ [B.meta.id]: { nombre: 'Mío B' } });
    });
});

describe('lo que ve el puente', () => {
    test('jsonConCambios: forma del sitio; el mandante solo autorizado; año solo en terminadas', () => {
        const o = OBRAS.find(x => x.json.estado !== 'terminado')!;
        const j = jsonConCambios(o, { nombre: ' Nuevo ', superficie_m2: '1.234', mandante: 'Empresa SpA', mandante_autoriza: false, anio: '2020' });
        expect(j).toMatchObject({ nombre: 'Nuevo', superficieM2: 1234, mandante: null, anio: null, slug: o.json.slug, fotos: o.json.fotos });
        expect(Object.keys(j)).toEqual(Object.keys(o.json));
        expect(jsonConCambios(o, { mandante: 'Empresa SpA', mandante_autoriza: true }).mandante).toBe('Empresa SpA');
        const t = OBRAS.find(x => x.json.estado === 'terminado');
        if (t) expect(jsonConCambios(t, { anio: '2019' }).anio).toBe(2019);
    });

    test('faltantesDe recalcula con lo escrito (comuna vacía → falta)', () => {
        let e = crearBorrador(OBRAS);
        expect(faltantesDe(e, A.meta.id)).toEqual([]);
        e = aplicar(e, A.meta.id, { comuna: '' }, { t: T });
        expect(faltantesDe(e, A.meta.id).map(f => f.campo)).toContain('comuna');
    });
});

describe('respaldo en la pestaña del navegador', () => {
    test('lo escrito sobrevive a salir y se ofrece al volver (solo si todavía cambia algo)', () => {
        const a = memoria();
        let e = crearBorrador(OBRAS);
        e = aplicar(e, A.meta.id, { desafio: 'Lo que escribí' }, { t: T });
        guardarRespaldo(e, a, new Date('2026-11-17T10:00:00Z'));
        const r = leerRespaldo(a);
        expect(r).toEqual({
            cambios: e.cambios, nuevas: [], estructura: { orden: {}, incluir: {} }, versiones: { [A.meta.id]: A.meta.updated_at }, guardado_at: '2026-11-17T10:00:00.000Z',
        });
        expect(ofrecerRespaldo(r, OBRAS)).toBe(true);
        expect(respaldoDesactualizado(r!, OBRAS)).toEqual([]);
        const otraVersion = OBRAS.map(o => (o.meta.id === A.meta.id ? { ...o, meta: { ...o.meta, updated_at: 'otra' } } : o));
        expect(respaldoDesactualizado(r!, otraVersion).map(o => o.meta.id)).toEqual([A.meta.id]);
        // Ya guardado (la base trae lo escrito): nada que ofrecer.
        const guardadas = OBRAS.map(o => (o.meta.id === A.meta.id ? { ...o, json: { ...o.json, desafio: 'Lo que escribí' } } : o));
        expect(ofrecerRespaldo(r, guardadas)).toBe(false);
        borrarRespaldo(a);
        expect(a.datos.has(CLAVE_RESPALDO)).toBe(false);
    });

    test('lo que no tiene la forma de hoy se descarta; un almacén que falla no rompe nada', () => {
        const a = memoria();
        a.setItem(CLAVE_RESPALDO, '{roto');
        expect(leerRespaldo(a)).toBeNull();
        expect(cambiosValidos({ 5: { nombre: 3, servicios: 'x', comuna: 'Ok', mandante_autoriza: 'si', slug: 'hack' }, x: { nombre: 'a' }, 0: { nombre: 'b' } }))
            .toEqual({ 5: { comuna: 'Ok' } });
        const roto: Almacen = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
        expect(() => guardarRespaldo(crearBorrador(OBRAS), roto)).not.toThrow();
        expect(leerRespaldo(roto)).toBeNull();
        expect(() => borrarRespaldo(roto)).not.toThrow();
        // Recuperarlo pasa por crearBorrador, que descarta obras que ya no existen.
        expect(crearBorrador(OBRAS, { 999999: { nombre: 'x' } }).cambios).toEqual({});
    });
});

/* ──────────────── A2: estructura ──────────────── */

const porSlug = (slug: string) => OBRAS.find(o => o.json.slug === slug)!;
const ok = (r: ResultadoOp): EstadoBorrador => {
    // (jest compila sin strictNullChecks: `in` en vez de estrechar por `ok`)
    if ('motivo' in r) throw new Error(`se esperaba ok: ${r.motivo}`);
    return (r as { e: EstadoBorrador }).e;
};
const motivo = (r: ResultadoOp): string => ('motivo' in r ? r.motivo : '');
const faltan = (r: ResultadoOp): string[] => ('faltantes' in r && r.faltantes ? r.faltantes.map(f => f.campo) : []);
const slugsDe = (e: EstadoBorrador, regla: Parameters<typeof idsDeLista>[1]) => idsDeLista(e, regla).map(id => [...OBRAS, ...e.nuevas].find(o => o.meta.id === id)!.json.slug);

describe('A2: obras nuevas', () => {
    test('crearNueva: ~n1 con id negativo, fuera del sitio, al final de su estado; el puente la recibe como nueva', () => {
        const r = crearNueva(crearBorrador(OBRAS), 'en_construccion');
        const e = ok(r);
        expect('id' in r && r.id).toBe(-1);
        const o = e.nuevas[0];
        expect(o.json).toMatchObject({ slug: '~n1', estado: 'en-curso', nombre: '', orden: 90, servicios: ['construccion'], fotos: [] });
        expect(o.meta).toMatchObject({ id: -1, incluir: false, nueva: true, nunca_publicada: true });
        expect(obrasParaPuente(e).slice(-1)[0]).toEqual({ json: o.json, meta: { incluir: false, nueva: true } });
        expect(slugsDe(e, 'proyectos-en-curso').slice(-1)[0]).toBe('~n1');
        expect(slugsDe(e, 'portada-en-obra')).not.toContain('~n1');
        expect(contarCambios(e)).toBe(1);
        expect(formBase(o).slug).toBe('');   // la dirección web la arma el servidor desde el nombre
        expect(ok(crearNueva(e, 'contratado')).nuevas[1].json).toMatchObject({ slug: '~n2', estado: 'contratado', orden: 80 });
        // Deshacer la quita.
        expect(deshacer(e).nuevas).toEqual([]);
    });

    test('el cuerpo de crear: los campos del POST /obras; sin nombre no se puede guardar; sus faltantes', () => {
        let e = ok(crearNueva(crearBorrador(OBRAS), 'en_construccion'));
        expect(erroresGuardar(e).map(x => x.mensaje).join(' ')).toMatch(/nombre/);
        e = aplicar(e, -1, { nombre: '  Edificio Nuevo 100 ', comuna: 'Ñuñoa' }, { t: T });
        expect(erroresGuardar(e)).toEqual([]);
        const p = payloadGuardar(e);
        expect(p.obras).toEqual([]);
        expect(p.nuevas).toEqual([{ tmp: '~n1', cambios: expect.objectContaining({ nombre: 'Edificio Nuevo 100', estado: 'en_construccion', comuna: 'Ñuñoa', servicios: ['construccion'] }) }]);
        expect(p.nuevas![0].cambios).not.toHaveProperty('slug');
        expect(p.nuevas![0].cambios).not.toHaveProperty('obra_id');
        expect(p).not.toHaveProperty('orden');   // al final, que es donde el servidor la deja solo
        expect(faltantesDe(e, -1).map(f => f.campo)).toEqual(['portada']);
        expect(diferencias(e)[0]).toMatchObject({ grupo: 'obra:-1', obra: 'Edificio Nuevo 100', campo: 'nueva', etiqueta: 'Nueva obra', antes: '' });
    });

    test('una nueva en proyecto completa se puede incluir en el mismo guardado; una en construcción sin portada no', () => {
        let e = ok(crearNueva(crearBorrador(OBRAS), 'contratado'));
        e = aplicar(e, -1, { nombre: 'Proyecto Nuevo', comuna: 'Santiago' }, { t: T });
        e = ok(incluirEnSitio(e, -1));
        expect(payloadGuardar(e).incluir).toEqual([{ id: '~n1', incluir: true }]);
        const f = ok(crearNueva(e, 'en_construccion'));
        const r = incluirEnSitio(aplicar(f, -2, { nombre: 'Otra', comuna: 'Santiago' }, { t: T + 1 }), -2);
        expect(r.ok).toBe(false);
        expect(faltan(r)).toEqual(['portada']);
        expect(motivo(quitarDelSitio(e, -1))).toMatch(/bórrala/);
    });

    test('descartarNueva: se va con lo escrito y su lugar; puedeBorrar = nueva, o guardada nunca publicada y fuera', () => {
        let e = ok(crearNueva(crearBorrador(OBRAS), 'contratado'));
        e = aplicar(e, -1, { nombre: 'Se descarta' }, { t: T });
        e = ok(descartarNueva(e, -1));
        expect(e.nuevas).toEqual([]);
        expect(e.cambios).toEqual({});
        expect(contarCambios(e)).toBe(0);
        expect(descartarNueva(e, A.meta.id).ok).toBe(false);
        expect(puedeBorrar(e, A)).toBe(false);
        const borrador = { ...A, meta: { ...A.meta, incluir: false, nunca_publicada: true, publicado_at: null } };
        const e2 = crearBorrador([borrador, ...OBRAS.slice(1)]);
        expect(puedeBorrar(e2, borrador)).toBe(true);
        expect(puedeBorrar(ok(incluirEnSitio(e2, A.meta.id)), borrador)).toBe(false);   // marcada para incluir: ya no
    });
});

describe('A2: estado', () => {
    const enCurso = porSlug('maipu-40');

    test('a Terminado pide año; con año pasa a /proyectos/ › Terminados en su año y el guardado lleva estado y año', () => {
        const e0 = crearBorrador(OBRAS);
        expect(motivo(cambiarEstado(e0, enCurso.meta.id, 'terminado'))).toMatch(/año de término/);
        expect(motivo(cambiarEstado(e0, enCurso.meta.id, 'terminado', '1800'))).toMatch(/año de término/);
        const e = ok(cambiarEstado(e0, enCurso.meta.id, 'terminado', '2024'));
        expect(slugsDe(e, 'proyectos-en-curso')).not.toContain('maipu-40');
        const t = slugsDe(e, 'proyectos-terminados');
        expect(t.indexOf('maipu-40')).toBe(t.indexOf('abate-molina-321') + 1);   // después de la de 2025, antes de la de 2022
        expect(obrasParaPuente(e).find(x => x.json.slug === 'maipu-40')!.json).toMatchObject({ estado: 'terminado', anio: 2024, orden: 130 });
        const p = payloadGuardar(e);
        expect(p.obras).toEqual([{ id: enCurso.meta.id, updated_at: enCurso.meta.updated_at, cambios: { estado: 'terminado', anio: 2024 } }]);
        expect(p).not.toHaveProperty('orden');
        expect(diferencias(e)).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'estado', etiqueta: 'Estado', antes: 'En construcción', despues: 'Terminado' })]));
        expect(avisosDeLugar(e0, e)).toEqual([{ id: enCurso.meta.id, regla: 'proyectos-terminados', texto: expect.stringMatching(/pasó a «Terminado».*Proyectos › Terminados/) }]);
        // Volver al estado de antes: nada que guardar, y vuelve a su lugar.
        const v = ok(cambiarEstado(e, enCurso.meta.id, 'en_construccion'));
        expect(contarCambios(v)).toBe(0);
        expect(slugsDe(v, 'proyectos-en-curso')).toEqual(slugsDe(e0, 'proyectos-en-curso'));
        expect(deshacer(e).cambios).toEqual({});
    });

    test('una de las 3 de la portada que cambia de estado sale de la portada y entra la cuarta', () => {
        const e0 = crearBorrador(OBRAS);
        expect(slugsDe(e0, 'portada-en-obra')).toEqual(['bascunan-guerrero-661', 'union-americana-325', 'toesca-2770']);
        const e = ok(cambiarEstado(e0, porSlug('union-americana-325').meta.id, 'contratado'));
        expect(slugsDe(e, 'portada-en-obra')).toEqual(['bascunan-guerrero-661', 'toesca-2770', 'escobar-williams-195']);
        expect(slugsDe(e, 'proyectos-contratados').slice(-1)[0]).toBe('union-americana-325');
    });
});

describe('A2: ordenar', () => {
    test('mover en «En proyecto»: el orden de todo el estado se reescribe 10, 20…; volver atrás no deja nada que guardar', () => {
        const e0 = crearBorrador(OBRAS);
        const antes = slugsDe(e0, 'proyectos-contratados');
        const e = ok(mover(e0, 'proyectos-contratados', 'alameda-2740', 0));
        expect(slugsDe(e, 'proyectos-contratados')).toEqual(['alameda-2740', ...antes.filter(s => s !== 'alameda-2740')]);
        expect(slugsDe(e, 'portada-proximos')).toEqual(slugsDe(e, 'proyectos-contratados'));
        const p = payloadGuardar(e);
        expect(p.orden).toEqual([{ estado: 'contratado', ids: slugsDe(e, 'proyectos-contratados').map(s => porSlug(s).meta.id) }]);
        expect(contarCambios(e)).toBe(1);
        expect(diferencias(e).slice(-1)[0]).toMatchObject({ grupo: 'orden:contratado', obra: 'Orden en «Proyectos › En proyecto»', campo: 'orden' });
        const v = ok(mover(e, 'proyectos-contratados', 'alameda-2740', 6));
        expect(payloadGuardar(v)).toEqual({ obras: [] });
        expect(contarCambios(v)).toBe(0);
        // Más allá del final = al final; la misma posición = mismo estado.
        expect(ok(mover(e0, 'proyectos-contratados', 'romero-3008', 99)).estructura.orden[porSlug('romero-3008').meta.id]).toBe(70);
        expect(ok(mover(e0, 'proyectos-contratados', 'romero-3008', 0))).toBe(e0);
        expect(motivo(mover(e0, 'proyectos-contratados', 'maipu-40', 0))).toMatch(/no está en esa lista/);
    });

    test('portada «En obra ahora»: se ordena entre las 3; la que sale de la portada se avisa', () => {
        const e0 = crearBorrador(OBRAS);
        const e = ok(mover(e0, 'portada-en-obra', 'toesca-2770', 0));
        expect(slugsDe(e, 'portada-en-obra')).toEqual(['toesca-2770', 'bascunan-guerrero-661', 'union-americana-325']);
        expect(slugsDe(e, 'proyectos-en-curso').slice(3)).toEqual(slugsDe(e0, 'proyectos-en-curso').slice(3));
        // La cuarta sube con ◀: entra a la portada y la tercera sale.
        const r = ok(moverPaso(e0, porSlug('escobar-williams-195').meta.id, -1));
        expect(slugsDe(r, 'portada-en-obra')).toEqual(['bascunan-guerrero-661', 'union-americana-325', 'escobar-williams-195']);
        expect(avisosDeLugar(e0, r)).toEqual([{ id: porSlug('toesca-2770').meta.id, regla: 'proyectos-en-curso', texto: expect.stringMatching(/«Toesca.*ya no sale en Inicio › En obra ahora/i) }]);
    });

    test('terminadas: solo dentro de su año (y de su grupo con o sin foto propia), con el porqué', () => {
        const e0 = crearBorrador(OBRAS);
        const t0 = slugsDe(e0, 'proyectos-terminados');
        expect(t0.slice(0, 5)).toEqual(['monumento-2212', 'san-alfonso-607', 'abate-molina-80', 'abate-molina-676', 'abate-molina-321']);
        expect(motivo(mover(e0, 'proyectos-terminados', 'abate-molina-321', 0))).toMatch(/2025/);
        expect(motivo(mover(e0, 'proyectos-terminados', 'monumento-2212', 1))).toMatch(/foto propia/);
        const e = ok(mover(e0, 'proyectos-terminados', 'abate-molina-676', 1));
        expect(slugsDe(e, 'proyectos-terminados').slice(0, 5)).toEqual(['monumento-2212', 'abate-molina-676', 'san-alfonso-607', 'abate-molina-80', 'abate-molina-321']);
        expect(payloadGuardar(e).orden).toHaveLength(1);
        // ◀ ▶ del panel: con el porqué cuando no se puede.
        expect(motivo(moverPaso(e0, porSlug('monumento-2212').meta.id, -1))).toMatch(/primera/);
        expect(motivo(moverPaso(e0, porSlug('san-alfonso-607').meta.id, -1))).toMatch(/foto propia/);
        expect(motivo(moverPaso(e0, porSlug('av-espana-778').meta.id, 1))).toMatch(/última/);
        expect(motivo(moverPaso(e0, porSlug('abate-molina-321').meta.id, 1))).toMatch(/2025/);
    });

    test('una fuera del sitio no se ordena (no se ve); las otras se mueven a su alrededor sin moverla', () => {
        const e0 = ok(quitarDelSitio(crearBorrador(OBRAS), porSlug('buzeta-3810').meta.id));
        expect(motivo(moverPaso(e0, porSlug('buzeta-3810').meta.id, -1))).toMatch(/fuera del sitio/);
        const e = ok(mover(e0, 'proyectos-contratados', 'abate-molina-502', 0));
        expect(slugsDe(e, 'proyectos-contratados').slice(0, 2)).toEqual(['abate-molina-502', 'romero-3008']);
        // buzeta conserva su lugar entre las del estado (la 2.ª).
        expect(e.estructura.orden[porSlug('buzeta-3810').meta.id] ?? 20).toBe(20);
    });

    test('nueva + mover + guardar: el orden lleva el slug provisorio', () => {
        let e = ok(crearNueva(crearBorrador(OBRAS), 'contratado'));
        e = aplicar(e, -1, { nombre: 'Primera nueva' }, { t: T });
        e = ok(mover(e, 'proyectos-contratados', '~n1', 0));
        const p = payloadGuardar(e);
        expect(p.orden).toEqual([{ estado: 'contratado', ids: ['~n1', ...slugsDe(crearBorrador(OBRAS), 'proyectos-contratados').map(s => porSlug(s).meta.id)] }]);
        expect(contarCambios(e)).toBe(2);
    });
});

describe('A2: fuera del sitio', () => {
    test('quitar e incluir: el puente la recibe con incluir:false; el guardado lleva incluir; la bandeja la lista', () => {
        const e0 = crearBorrador(OBRAS);
        const e = ok(quitarDelSitio(e0, A.meta.id));
        expect(obrasParaPuente(e).find(x => x.json.slug === A.json.slug)!.meta).toEqual({ incluir: false, nueva: false });
        expect(payloadGuardar(e).incluir).toEqual([{ id: A.meta.id, incluir: false }]);
        expect(fueraDelSitio(e).map(o => o.meta.id)).toEqual([A.meta.id]);
        expect(diferencias(e)).toEqual([expect.objectContaining({ campo: 'incluir', etiqueta: 'Fuera del sitio' })]);
        const v = ok(incluirEnSitio(e, A.meta.id));
        expect(contarCambios(v)).toBe(0);
        expect(deshacer(deshacer(v))).toMatchObject({ estructura: { orden: {}, incluir: {} } });
    });

    test('incluir con faltantes: no, con la lista; vuelve al sitio una que estaba fuera', () => {
        const fuera = { ...B, meta: { ...B.meta, incluir: false } };
        let e = crearBorrador([A, fuera, ...OBRAS.slice(2)]);
        e = aplicar(e, fuera.meta.id, { comuna: '' }, { t: T });
        const r = incluirEnSitio(e, fuera.meta.id);
        expect(faltan(r)).toEqual(['comuna']);
        const v = ok(incluirEnSitio(aplicar(e, fuera.meta.id, { comuna: 'Providencia' }, { t: T + 1 }), fuera.meta.id));
        expect(diferencias(v)).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'incluir', etiqueta: 'Vuelve al sitio' })]));
    });
});

describe('A2: después de guardar y respaldo', () => {
    test('rebasar con el mapa: lo escrito en una nueva MIENTRAS se guardaba pasa a su obra creada', () => {
        let e = ok(crearNueva(crearBorrador(OBRAS), 'contratado'));
        e = aplicar(e, -1, { nombre: 'Nueva guardada' }, { t: T });
        const enviado = e.cambios;
        e = aplicar(e, -1, { comuna: 'Escrita mientras' }, { t: T + 1 });
        const creada: typeof A = {
            json: { ...e.nuevas[0].json, slug: 'nueva-guardada', nombre: 'Nueva guardada' },
            meta: { ...e.nuevas[0].meta, id: 900, nueva: false, updated_at: 'v1' },
        };
        const r = rebasar(e, [...OBRAS, creada], enviado, { '~n1': 900 });
        expect(r.nuevas).toEqual([]);
        expect(r.cambios).toEqual({ 900: { comuna: 'Escrita mientras' } });
    });

    test('el respaldo guarda también nuevas y estructura, y se recupera como un paso de deshacer', () => {
        const a = memoria();
        let e = ok(crearNueva(crearBorrador(OBRAS), 'contratado'));
        e = aplicar(e, -1, { nombre: 'En la pestaña' }, { t: T });
        e = ok(quitarDelSitio(e, A.meta.id));
        e = ok(mover(e, 'proyectos-contratados', 'alameda-2740', 0));
        guardarRespaldo(e, a);
        const r = leerRespaldo(a)!;
        expect(r.nuevas).toEqual([{ n: 1, estado: 'contratado', orden: 80 }]);
        expect(capaDeRespaldo(r).nuevas[0].json.slug).toBe('~n1');
        expect(ofrecerRespaldo(r, OBRAS)).toBe(true);
        const v = recuperarRespaldo(crearBorrador(OBRAS), r);
        expect(payloadGuardar(v)).toEqual(payloadGuardar(e));
        expect(deshacer(v).nuevas).toEqual([]);
        // Basura en el respaldo: se descarta (nuevas con número raro; ids negativos que no son de una nueva).
        a.setItem(CLAVE_RESPALDO, JSON.stringify({ cambios: { '-7': { nombre: 'x' } }, nuevas: [{ n: 0, estado: 'x', orden: 1 }], estructura: { orden: { '-7': 5 }, incluir: { 3: 'si' } } }));
        expect(leerRespaldo(a)).toBeNull();
    });
});

describe('A2: borrador guardado que nunca salió al sitio', () => {
    test('va al puente como `nueva` (sigue a la vista con su insignia) hasta incluirlo', () => {
        const borrador = { ...A, meta: { ...A.meta, incluir: false, nunca_publicada: true, publicado_at: null } };
        const e = crearBorrador([borrador, ...OBRAS.slice(1)]);
        expect(obrasParaPuente(e)[0].meta).toEqual({ incluir: false, nueva: true });
        // Una publicada que se quitó del sitio no: va a la bandeja «Fuera del sitio».
        const quitada = { ...A, meta: { ...A.meta, incluir: false } };
        expect(obrasParaPuente(crearBorrador([quitada, ...OBRAS.slice(1)]))[0].meta).toEqual({ incluir: false, nueva: false });
    });
});
