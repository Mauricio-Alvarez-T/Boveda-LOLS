import * as fs from 'fs';
import * as path from 'path';
import {
    CLAVE_RESPALDO, RAFAGA_MS, aplicar, borrarRespaldo, cambiosValidos, camposTocados, contarCambios, crearBorrador, cuerpoCambios,
    deshacer, diferencias, erroresGuardar, faltantesDe, formActual, formBase, guardarRespaldo, jsonConCambios, leerRespaldo,
    obrasParaPuente, ofrecerRespaldo, payloadGuardar, puedeDeshacer, puedeRehacer, rebasar, recargarConChoques, rehacer,
    respaldoDesactualizado,
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
            { id: A.meta.id, obra: A.json.nombre, campo: 'nombre', etiqueta: 'Nombre', antes: A.json.nombre, despues: 'Otro nombre' },
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
        expect(r).toEqual({ cambios: e.cambios, versiones: { [A.meta.id]: A.meta.updated_at }, guardado_at: '2026-11-17T10:00:00.000Z' });
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
