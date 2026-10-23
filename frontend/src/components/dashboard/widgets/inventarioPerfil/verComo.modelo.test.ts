import { DESCRIPCION_RESPALDO, DESCRIPCION_SUPER_ADMIN } from './perfil';
import type { InventarioPerfilApi, SolicitudPerfil } from './tipos';
import {
    OPCIONES_VER_COMO, PUEDE_JEFATURA, VER_COMO_INICIAL, claveVerComo, comoJefatura, datosVerComo, descripcionVerComo,
    guardarVerComo, leerVerComo, notaVerComo, verComoGuardado,
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
    test('en orden, con los nombres pedidos, y parte en «Super Admin»', () => {
        expect(OPCIONES_VER_COMO.map(o => [o.key, o.texto])).toEqual([
            ['superadmin', 'Super Admin'], ['leonardo', 'Leonardo'], ['jefatura', 'Daphne'], ['obra', 'Jefe de obra'], ['otro', 'El resto'],
        ]);
        expect(VER_COMO_INICIAL).toBe('superadmin');
    });

    test('leerVerComo: solo una opción válida; lo demás, «Super Admin»', () => {
        expect(leerVerComo('obra')).toBe('obra');
        expect(leerVerComo('otro')).toBe('otro');
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
        expect(descripcionVerComo('otro')).toBe(DESCRIPCION_RESPALDO);
    });

    test('nota chica solo en «Jefe de obra» y «El resto»', () => {
        expect(notaVerComo('obra', { obra: 'Domeyko' }))
            .toBe('Lo que va a Domeyko: todas las solicitudes con ese destino. Un jefe de obra real ve solo las que pidió él.');
        expect(notaVerComo('obra')).toBe('Lo que va a esa obra: todas las solicitudes con ese destino. Un jefe de obra real ve solo las que pidió él.');
        expect(notaVerComo('otro')).toBe('Así lo ven Paula, Rodrigo, Matías, Luis y los bodegueros, pero con tus cifras: cada uno ve las suyas.');
        expect(notaVerComo('superadmin')).toBeNull();
        expect(notaVerComo('leonardo')).toBeNull();
        expect(notaVerComo('jefatura')).toBeNull();
    });
});

describe('datos de cada vista', () => {
    test('Super Admin y Leonardo: los mismos datos', () => {
        expect(datosVerComo('superadmin', DATOS)).toBe(DATOS);
        expect(datosVerComo('leonardo', DATOS)).toBe(DATOS);
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

    test('El resto: no usa estos datos', () => {
        expect(datosVerComo('otro', DATOS)).toBeNull();
    });
});
