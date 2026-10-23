import { DESCRIPCION_RESPALDO, DESCRIPCION_SUPER_ADMIN } from './perfil';
import type { InventarioPerfilApi, SolicitudPerfil } from './tipos';
import {
    OPCIONES_VER_COMO, PUEDE_JEFATURA, VER_COMO_INICIAL, claveVerComo, comoAprobador, comoJefatura, datosVerComo,
    descripcionVerComo, guardarVerComo, leerVerComo, notaVerComo, opcionesVerComo, verComoGuardado,
} from './verComo.modelo';

const PENDIENTE: SolicitudPerfil = {
    id: 41, codigo: 'TRF-202610-0041', estado: 'pendiente', etapa: 'pedida', tipo_flujo: 'solicitud_materiales', tipo: 'materiales',
    origen: null, destino: { tipo: 'obra', id: 1, nombre: 'Domeyko', responsable: null },
    solicitante: { id: 1, nombre: 'Marcos Uribe', rol: 'Super Administrador' }, propia: true, fecha_solicitud: '2026-10-13',
    aprobacion: null, despacho: null, recepcion: null, ultima_recepcion: null, rechazo: null, dias: 9, del_mes: false,
    puede_aprobar: true, bloqueo_aprobar: null, items: [],
};

const DATOS: InventarioPerfilApi = {
    hoy: '2026-10-22',
    perfil: 'aprueba',
    super_admin: true,
    alcance: { todas: true, bodega_id: null },
    obra: null,
    puede: { aprobar: true, ver_diferencias: true, resolver_diferencias: true, solicitar: true, recibir: true, sod_bypass: true },
    aprobadores: [{ id: 10, nombre: 'Leonardo López' }],
    circuito: {
        pedida: { total: 1, dias: 9 }, aprobada: { total: 0, dias: null }, despachada: { total: 0, dias: null },
        recibida: { total: 0, ultima: null }, diferencias: { total: 0, dias: null, items: 0 },
    },
    solicitudes: [PENDIENTE],
    diferencias: [],
    limites: { en_curso: 200, recibidas: 100, recibidas_recientes: 10, rechazadas: 50, diferencias: 100, aprobadores: 10 },
};

/** Un localStorage falso. */
function almacen(inicial: Record<string, string> = {}) {
    const datos = new Map(Object.entries(inicial));
    return {
        datos,
        getItem: (k: string) => datos.get(k) ?? null,
        setItem: (k: string, v: string) => { datos.set(k, v); },
    };
}
const ROTO = {
    getItem: () => { throw new Error('bloqueado'); },
    setItem: () => { throw new Error('bloqueado'); },
};

describe('opciones de «Ver como»', () => {
    test('en orden, por rol (nunca un nombre fijo); quien aprueba, con el nombre de la respuesta; parte en «Super Admin»', () => {
        expect(opcionesVerComo(DATOS.aprobadores).map(o => [o.key, o.texto])).toEqual([
            ['superadmin', 'Super Admin'], ['gerencia', 'Gerencia'], ['leonardo', 'Leonardo'], ['jefatura', 'Jefatura'], ['obra', 'Jefe de obra'],
        ]);
        expect(opcionesVerComo([{ id: 10, nombre: 'Leonardo López' }, { id: 12, nombre: 'Ana Pérez' }])[2].texto).toBe('Leonardo o Ana');
        // Sin nadie (o sin datos aún): el rol.
        expect(opcionesVerComo([])[2].texto).toBe('Quien aprueba');
        expect(OPCIONES_VER_COMO[2].texto).toBe('Quien aprueba');
        expect(VER_COMO_INICIAL).toBe('superadmin');
    });

    test('leerVerComo: solo una opción válida; lo demás, «Super Admin»', () => {
        expect(leerVerComo('obra')).toBe('obra');
        expect(leerVerComo('otro')).toBe(VER_COMO_INICIAL); // «Otros perfiles» se quitó: lo guardado vuelve a la inicial
        expect(leerVerComo('cualquiera')).toBe('superadmin');
        expect(leerVerComo(null)).toBe('superadmin');
        expect(leerVerComo(undefined)).toBe('superadmin');
        expect(leerVerComo(3)).toBe('superadmin');
    });
});

describe('recordar la elección por persona', () => {
    test('cada persona con su clave', () => {
        expect(claveVerComo(1)).toBe('boveda-inicio-inventario-ver-como:1');
        const a = almacen();
        guardarVerComo(a, 1, 'obra');
        guardarVerComo(a, 2, 'jefatura');
        expect(verComoGuardado(a, 1)).toBe('obra');
        expect(verComoGuardado(a, 2)).toBe('jefatura');
        expect(verComoGuardado(a, 3)).toBe('superadmin');
    });

    test('sin persona, sin almacén, con un valor raro o si el navegador lo bloquea: «Super Admin» y sin error', () => {
        const a = almacen({ [claveVerComo(1)]: 'nada' });
        expect(verComoGuardado(a, 1)).toBe('superadmin');
        expect(verComoGuardado(a, null)).toBe('superadmin');
        expect(verComoGuardado(null, 1)).toBe('superadmin');
        expect(verComoGuardado(ROTO, 1)).toBe('superadmin');
        expect(() => guardarVerComo(ROTO, 1, 'obra')).not.toThrow();
        guardarVerComo(a, undefined, 'obra');
        expect(a.datos.size).toBe(1);
    });
});

describe('descripción y nota', () => {
    test('la descripción es la de la vista elegida', () => {
        expect(descripcionVerComo('superadmin')).toBe(DESCRIPCION_SUPER_ADMIN);
        expect(descripcionVerComo('leonardo')).toBe('Lo que espera tu aprobación dentro del circuito completo, de la más antigua a la más nueva.');
        expect(descripcionVerComo('jefatura', { aprobadores: DATOS.aprobadores }))
            .toBe('El camino completo de todas las obras: lo que espera a Leonardo y las diferencias por aclarar.');
        expect(descripcionVerComo('obra', { obra: 'Domeyko' })).toBe('Pide materiales, recibe lo que llega a Domeyko y revisa tus aprobados.');
        // «Gerencia» (Marcos 2026-10-23): en Inventario, lo general, como el resto de los Administradores.
        expect(descripcionVerComo('gerencia')).toBe(DESCRIPCION_RESPALDO);
        expect(notaVerComo('gerencia')).toMatch(/^Así lo ve gerencia: /);
        expect(datosVerComo('gerencia', DATOS)).toBeNull();
        expect(leerVerComo('gerencia')).toBe('gerencia');
    });

    test('nota chica en todas las que no son la propia (dice qué se ve), sin nombres fijos', () => {
        expect(notaVerComo('obra', { obra: 'Domeyko' })).toBe('Lo de Domeyko: lo que va a ella y las devoluciones y traslados que salen de ahí. '
            + 'Un jefe de obra real ve solo lo que pidió él.');
        expect(notaVerComo('obra')).toMatch(/^Lo de esa obra: /);
        expect(notaVerComo('leonardo', { aprobadores: DATOS.aprobadores })).toBe('Así lo ve Leonardo, con los mismos datos.');
        expect(notaVerComo('leonardo')).toBe('Así lo ve quien aprueba, con los mismos datos.');
        expect(notaVerComo('jefatura')).toBe('Así lo ve jefatura (ve las diferencias, no aprueba), con los mismos datos.');
        expect(notaVerComo('superadmin')).toBeNull();
        for (const o of OPCIONES_VER_COMO) {
            expect(notaVerComo(o.key, { obra: 'Domeyko' }) ?? '').not.toMatch(/Paula|Rodrigo|Matías|Luis|Daphne/);
        }
    });
});

describe('datos de cada vista', () => {
    test('Super Admin: los mismos datos', () => {
        expect(datosVerComo('superadmin', DATOS)).toBe(DATOS);
    });

    test('quien aprueba: lo calculado para el Super Admin se recalcula para él (sin sod_bypass ni super_admin)', () => {
        const d = datosVerComo('leonardo', DATOS)!;
        expect(d).toEqual(comoAprobador(DATOS));
        expect(d.super_admin).toBe(false);
        expect(d.puede).toEqual({ ...DATOS.puede, sod_bypass: false });
        // La 41 la pidió Marcos: para Leonardo no es propia y la puede aprobar.
        expect(d.solicitudes[0]).toMatchObject({ id: 41, propia: false, puede_aprobar: true, bloqueo_aprobar: null });
        // Una que pidió Leonardo: propia y bloqueada (SoD), como la vería él.
        const leo = { id: 10, nombre: 'Leonardo López', rol: 'Administrador' };
        const suya: SolicitudPerfil = { ...PENDIENTE, id: 42, solicitante: leo };
        const recibida: SolicitudPerfil = { ...PENDIENTE, id: 43, estado: 'recibida', etapa: 'recibida', puede_aprobar: null, solicitante: leo };
        const c = comoAprobador({ ...DATOS, solicitudes: [PENDIENTE, suya, recibida] });
        expect(c.solicitudes[1]).toMatchObject({ id: 42, propia: true, puede_aprobar: false, bloqueo_aprobar: 'sod_solicitante' });
        expect(c.solicitudes[2]).toMatchObject({ id: 43, propia: true, puede_aprobar: null, bloqueo_aprobar: null });
        // Con varios que aprueban no se sabe quién mira: nada es propia.
        const varios = comoAprobador({ ...DATOS, aprobadores: [{ id: 10, nombre: 'Leonardo López' }, { id: 12, nombre: 'Ana' }], solicitudes: [suya] });
        expect(varios.solicitudes[0]).toMatchObject({ propia: false, puede_aprobar: true });
        // No cambia la respuesta original.
        expect(DATOS.solicitudes[0]).toMatchObject({ propia: true, puede_aprobar: true });
        expect(DATOS.puede.sod_bypass).toBe(true);
    });

    test('Daphne: lo que puede ella (ve diferencias, no aprueba ni pidió nada), sin cambiar la respuesta', () => {
        const d = datosVerComo('jefatura', DATOS)!;
        expect(d).toEqual(comoJefatura(DATOS));
        expect(d.perfil).toBe('jefatura');
        expect(d.super_admin).toBe(false);
        expect(d.puede).toEqual(PUEDE_JEFATURA);
        expect(d.alcance).toEqual({ todas: true, bodega_id: null });
        expect(d.diferencias).toBe(DATOS.diferencias);
        expect(d.solicitudes[0]).toMatchObject({ id: 41, propia: false, puede_aprobar: null, bloqueo_aprobar: null });
        expect(DATOS.solicitudes[0]).toMatchObject({ propia: true, puede_aprobar: true });
    });

    test('Jefe de obra: como esa obra; sin obra para elegir, nada', () => {
        const d = datosVerComo('obra', DATOS, { id: 1, nombre: 'Domeyko' })!;
        expect(d.perfil).toBe('obra');
        expect(d.obra).toEqual({ id: 1, nombre: 'Domeyko' });
        expect(d.solicitudes.map(s => s.id)).toEqual([41]);
        expect(datosVerComo('obra', DATOS, null)).toBeNull();
    });
});
