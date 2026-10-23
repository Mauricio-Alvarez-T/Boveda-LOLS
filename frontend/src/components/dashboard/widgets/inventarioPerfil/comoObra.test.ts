import { PUEDE_JEFE_OBRA, circuitoDe, comoObra, obraPorDefecto, obrasVerComo, type ObraVerComo } from './comoObra';
import type { DiferenciaPerfil, EstadoSolicitudPerfil, EtapaPerfil, InventarioPerfilApi, LugarPerfil, SolicitudPerfil } from './tipos';

const obra = (id: number, nombre: string): LugarPerfil => ({ tipo: 'obra', id, nombre, responsable: null });
const BODEGA: LugarPerfil = { tipo: 'bodega', id: 1, nombre: 'Bodega Cerrillos', responsable: 'Juan' };
const DOMEYKO = obra(1, 'Domeyko');
const GORBEA = obra(2, 'Gorbea 3082');
const ABATE = obra(4, 'Abate 80');

const ETAPA: Record<EstadoSolicitudPerfil, EtapaPerfil> = {
    pendiente: 'pedida', aprobada: 'aprobada', en_transito: 'despachada', recepcion_parcial: 'despachada', recibida: 'recibida', rechazada: 'rechazada',
};

let id = 100;
function sol(destino: LugarPerfil | null, estado: EstadoSolicitudPerfil, dias: number, extra: Partial<SolicitudPerfil> = {}): SolicitudPerfil {
    id += 1;
    return {
        id, codigo: `TRF-${id}`, estado, etapa: ETAPA[estado], tipo_flujo: 'solicitud', tipo: 'materiales',
        origen: estado === 'pendiente' ? null : BODEGA, destino,
        solicitante: { id: 20, nombre: 'Tomás Vera', rol: 'Jefe de Obra' }, propia: false, fecha_solicitud: '2026-10-10',
        aprobacion: null, despacho: null, recepcion: null, ultima_recepcion: null, rechazo: null,
        dias, del_mes: false,
        puede_aprobar: estado === 'pendiente' ? true : null, bloqueo_aprobar: null,
        items: [{ clave: `c${id}`, personalizado: false, descripcion: 'Cemento', unidad: 'SACO', pedida: 10, enviada: null, recibida: null }],
        ...extra,
    };
}

function dif(difId: number, s: SolicitudPerfil, dias: number, destino: LugarPerfil | null = s.destino): DiferenciaPerfil {
    return {
        id: difId, transferencia_id: s.id, codigo: s.codigo, descripcion: 'Cemento', unidad: 'SACO', enviada: 10, recibida: 8,
        diferencia: 2, faltan: 2, sobran: 0, origen: BODEGA, destino, aprobacion: null, despacho: null,
        recepcion: { por: { id: 20, nombre: 'Tomás Vera' }, fecha: '2026-10-08' }, dias,
    };
}

// Domeyko: 2 pendientes (6 y 1 días), 1 aprobada (4), 1 en tránsito (1), 2 recibidas (una de este mes, con diferencia), 1 rechazada.
const D_PEND_1 = sol(DOMEYKO, 'pendiente', 6);
const D_PEND_2 = sol(DOMEYKO, 'pendiente', 1, { puede_aprobar: false, bloqueo_aprobar: 'sod_solicitante' });
const D_APROB = sol(DOMEYKO, 'aprobada', 4);
const D_TRANS = sol(DOMEYKO, 'en_transito', 1);
const D_REC_MES = sol(DOMEYKO, 'recibida', 14, { del_mes: true, recepcion: { por: null, fecha: '2026-10-08' } });
const D_REC_VIEJA = sol(DOMEYKO, 'recibida', 25, { recepcion: { por: null, fecha: '2026-09-27' } });
const D_RECH = sol(DOMEYKO, 'rechazada', 12, { del_mes: true });
// Otras obras.
const G_PEND = sol(GORBEA, 'pendiente', 9);
const G_REC = sol(GORBEA, 'recibida', 12, { del_mes: true, recepcion: { por: null, fecha: '2026-10-10' } });
const A_PARCIAL = sol(ABATE, 'recepcion_parcial', 2);
// A una bodega (no es de ninguna obra).
const A_BODEGA = sol(BODEGA, 'aprobada', 3);

const DATOS: InventarioPerfilApi = {
    hoy: '2026-10-22',
    perfil: 'aprueba',
    super_admin: true,
    alcance: { todas: true, bodega_id: null },
    obra: null,
    puede: { aprobar: true, ver_diferencias: true, resolver_diferencias: true, solicitar: true, recibir: true, sod_bypass: true },
    aprobadores: [{ id: 10, nombre: 'Leonardo López' }],
    circuito: {
        pedida: { total: 3, dias: 9 }, aprobada: { total: 2, dias: 4 }, despachada: { total: 2, dias: 2 },
        recibida: { total: 2, ultima: '2026-10-10' }, diferencias: { total: 2, dias: 14, items: 3 },
    },
    solicitudes: [D_PEND_1, G_PEND, D_PEND_2, D_APROB, A_BODEGA, D_TRANS, A_PARCIAL, G_REC, D_REC_MES, D_REC_VIEJA, D_RECH],
    diferencias: [dif(1, D_REC_MES, 14), dif(2, D_REC_MES, 14), dif(3, G_REC, 12)],
    limites: { en_curso: 200, recibidas: 100, recibidas_recientes: 10, rechazadas: 50, diferencias: 100, aprobadores: 10 },
};

describe('comoObra: la respuesta del Super Administrador «como la vería esa obra»', () => {
    const r = comoObra(DATOS, { id: 1, nombre: 'Domeyko' });

    test('solo las que van a esa obra, en el mismo orden', () => {
        expect(r.solicitudes.map(s => s.id)).toEqual([D_PEND_1, D_PEND_2, D_APROB, D_TRANS, D_REC_MES, D_REC_VIEJA, D_RECH].map(s => s.id));
    });

    test('todas propias y sin nada de aprobar (un jefe de obra no aprueba)', () => {
        expect(r.solicitudes.every(s => s.propia)).toBe(true);
        expect(r.solicitudes.every(s => s.puede_aprobar === null && s.bloqueo_aprobar === null)).toBe(true);
    });

    test('perfil, obra, alcance y lo que puede: los de un jefe de obra, sin sod_bypass ni super_admin', () => {
        expect(r.perfil).toBe('obra');
        expect(r.super_admin).toBe(false);
        expect(r.obra).toEqual({ id: 1, nombre: 'Domeyko' });
        expect(r.alcance).toEqual({ todas: false, bodega_id: null });
        expect(r.puede).toEqual(PUEDE_JEFE_OBRA);
        expect(r.puede).toEqual({ aprobar: false, ver_diferencias: false, resolver_diferencias: false, solicitar: true, recibir: true, sod_bypass: false });
    });

    test('sin la lista de diferencias, pero con su conteo en el circuito', () => {
        expect(r.diferencias).toBeNull();
        expect(r.circuito.diferencias).toEqual({ total: 1, items: 2, dias: 14 });
    });

    test('el circuito, contado desde las solicitudes de esa obra', () => {
        expect(r.circuito.pedida).toEqual({ total: 2, dias: 6 });
        expect(r.circuito.aprobada).toEqual({ total: 1, dias: 4 });
        expect(r.circuito.despachada).toEqual({ total: 1, dias: 1 });
        // Recibidas de este mes: 1; la última, la más nueva de cualquier mes.
        expect(r.circuito.recibida).toEqual({ total: 1, ultima: '2026-10-08' });
    });

    test('lo demás queda igual y no cambia la respuesta original', () => {
        expect(r.hoy).toBe(DATOS.hoy);
        expect(r.aprobadores).toBe(DATOS.aprobadores);
        expect(r.limites).toBe(DATOS.limites);
        expect(DATOS.solicitudes).toHaveLength(11);
        expect(D_PEND_1.propia).toBe(false);
        expect(D_PEND_1.puede_aprobar).toBe(true);
        expect(DATOS.diferencias).toHaveLength(3);
        expect(DATOS.puede.aprobar).toBe(true);
    });

    test('una obra con recepción parcial cuenta como despachada; una sin nada da todo en cero', () => {
        const abate = comoObra(DATOS, { id: 4, nombre: 'Abate 80' });
        expect(abate.circuito.despachada).toEqual({ total: 1, dias: 2 });
        expect(abate.circuito.diferencias).toEqual({ total: 0, items: 0, dias: null });
        const vacia = comoObra(DATOS, { id: 99, nombre: 'Bascuñán 661' });
        expect(vacia.solicitudes).toEqual([]);
        expect(vacia.circuito).toEqual({
            pedida: { total: 0, dias: null }, aprobada: { total: 0, dias: null }, despachada: { total: 0, dias: null },
            recibida: { total: 0, ultima: null }, diferencias: { total: 0, items: 0, dias: null },
        });
    });

    test('las que van a una bodega no son de ninguna obra', () => {
        expect(comoObra(DATOS, { id: 1, nombre: 'Domeyko' }).solicitudes.some(s => s.id === A_BODEGA.id)).toBe(false);
        // Una bodega con el mismo id que una obra tampoco se confunde.
        expect(comoObra(DATOS, { id: BODEGA.id, nombre: 'Domeyko' }).solicitudes.some(s => s.id === A_BODEGA.id)).toBe(false);
    });

    test('una diferencia cuenta si va a esa obra o es de una de sus solicitudes', () => {
        const sinDestino = { ...DATOS, diferencias: [dif(9, D_REC_MES, 3, null)] };
        expect(comoObra(sinDestino, { id: 1, nombre: 'Domeyko' }).circuito.diferencias).toEqual({ total: 1, items: 1, dias: 3 });
        const sinLista = { ...DATOS, diferencias: null };
        expect(comoObra(sinLista, { id: 1, nombre: 'Domeyko' }).circuito.diferencias).toEqual({ total: 0, items: 0, dias: null });
    });
});

describe('circuitoDe', () => {
    test('una recibida sin fecha de recepción no da «última»', () => {
        expect(circuitoDe([sol(DOMEYKO, 'recibida', 0, { del_mes: true })], []).recibida).toEqual({ total: 1, ultima: null });
    });
});

describe('obrasVerComo: las obras para elegir', () => {
    test('las de la respuesta con cuántas solicitudes van a cada una, por nombre', () => {
        expect(obrasVerComo(DATOS)).toEqual([
            { id: 4, nombre: 'Abate 80', solicitudes: 1 },
            { id: 1, nombre: 'Domeyko', solicitudes: 7 },
            { id: 2, nombre: 'Gorbea 3082', solicitudes: 2 },
        ]);
    });

    test('suma las del selector global sin solicitudes, pero no las de prueba, finalizadas, inactivas ni sin transferencias', () => {
        const globales = [
            { id: 1, nombre: 'Domeyko (otro nombre)', activa: true },
            { id: 3, nombre: 'Bascuñán 661', activa: true },
            { id: 7, nombre: 'Obra de prueba', activa: true, es_prueba: true },
            { id: 8, nombre: 'Terminada', activa: true, finalizada: true },
            { id: 9, nombre: 'Inactiva', activa: false },
            { id: 10, nombre: 'Sin transferencias', activa: true, participa_transferencias: false },
        ];
        expect(obrasVerComo(DATOS, globales).map(o => [o.nombre, o.solicitudes])).toEqual([
            ['Abate 80', 1], ['Bascuñán 661', 0], ['Domeyko', 7], ['Gorbea 3082', 2],
        ]);
    });

    test('una obra que solo aparece en una diferencia también se puede elegir; sin nombre, «Obra N»', () => {
        const solo = { ...DATOS, solicitudes: [], diferencias: [dif(1, D_REC_MES, 3, obra(5, ''))] };
        expect(obrasVerComo(solo)).toEqual([{ id: 5, nombre: 'Obra 5', solicitudes: 0 }]);
    });
});

describe('obraPorDefecto', () => {
    const OPCIONES: ObraVerComo[] = [
        { id: 4, nombre: 'Abate 80', solicitudes: 2 },
        { id: 3, nombre: 'Bascuñán 661', solicitudes: 0 },
        { id: 1, nombre: 'Domeyko', solicitudes: 7 },
        { id: 2, nombre: 'Gorbea 3082', solicitudes: 7 },
    ];

    test('la elegida aquí, si no la del selector de arriba, si no la de más movimiento (a igualdad, la primera por nombre)', () => {
        expect(obraPorDefecto(OPCIONES, { elegida: 3, global: 2 })).toBe(3);
        expect(obraPorDefecto(OPCIONES, { elegida: null, global: 2 })).toBe(2);
        expect(obraPorDefecto(OPCIONES, { global: 3 })).toBe(3);
        expect(obraPorDefecto(OPCIONES)).toBe(1);
    });

    test('una elegida o global que no está en la lista no cuenta («Todas las Obras» = null)', () => {
        expect(obraPorDefecto(OPCIONES, { elegida: 99, global: 98 })).toBe(1);
        expect(obraPorDefecto(OPCIONES, { global: null })).toBe(1);
    });

    test('sin obras, null', () => {
        expect(obraPorDefecto([], { global: 1 })).toBeNull();
    });
});
