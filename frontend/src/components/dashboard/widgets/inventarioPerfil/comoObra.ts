import type {
    CircuitoPerfil, DiferenciaPerfil, EtapaCircuitoPerfil, EtapaPerfil, InventarioPerfilApi, LugarPerfil, PuedePerfil, SolicitudPerfil,
} from './tipos';

/**
 * «Ver como → Jefe de obra» del Super Administrador (Marcos 2026-10-22: «con Mauricio tengamos una vista propia como
 * super administradores pero que a la vez igual podamos ver los formatos de otros trabajadores»).
 *
 * Desde la respuesta del Super Administrador (GET /transferencias/inicio/perfil con alcance de TODAS las obras) arma la
 * respuesta «como la vería esa obra», para mostrarla con VistaObra sin pedirle nada más al servidor:
 *   - `solicitudes`: las que van a esa obra (destino = esa obra), todas como propias (un jefe de obra real solo
 *     recibe las que pidió él, todas `propia`), sin nada de aprobar (`puede_aprobar` / `bloqueo_aprobar` null).
 *   - `obra` = esa obra; `perfil` = 'obra'; sin `super_admin`; alcance sin `ver_todas` ni bodega.
 *   - `puede` = el de un jefe de obra (pide y recibe; no aprueba, no ve ni resuelve diferencias, sin `sod_bypass`).
 *   - `diferencias` = null (un jefe de obra no ve la lista), pero el `circuito` trae el CONTEO de las de esa obra.
 *   - `circuito` recalculado desde esas solicitudes y diferencias.
 * OJO, es «lo que va a esa obra», no exactamente lo de una persona: si dos personas piden para la misma obra, aquí se
 * ven las de las dos. Las cifras salen de las listas (con tope: `limites`), no de la consulta exacta del circuito; la
 * «última recibida» solo si está entre las recibidas que llegaron (las del mes y las 10 últimas de todas las obras).
 * Lógica PURA, con test en `comoObra.test.ts`.
 */

/** Una obra para elegir en «Ver como → Jefe de obra». */
export interface ObraVerComo {
    id: number;
    nombre: string;
    /** Cuántas solicitudes van a esa obra en la respuesta (en curso, recibidas y rechazadas que vinieron). */
    solicitudes: number;
}

/** Una obra del selector global de arriba (ObraContext): solo lo que se usa aquí. */
export interface ObraGlobal {
    id: number;
    nombre: string;
    activa?: boolean;
    es_prueba?: boolean;
    finalizada?: boolean;
    participa_transferencias?: boolean;
}

/** Lo que puede un jefe de obra (rol de terreno, RUNBOOK §16.5: solicitar + recibir). */
export const PUEDE_JEFE_OBRA: PuedePerfil = {
    aprobar: false,
    ver_diferencias: false,
    resolver_diferencias: false,
    solicitar: true,
    recibir: true,
    sod_bypass: false,
};

const esLaObra = (obraId: number) => (l: LugarPerfil | null | undefined): boolean => l?.tipo === 'obra' && l.id === obraId;

const ordenNombre = (a: { nombre: string }, b: { nombre: string }) =>
    a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base', numeric: true });

/**
 * Las obras que se pueden elegir: las que tienen solicitudes o diferencias en la respuesta, más las del selector global
 * (sin obras de prueba, finalizadas, inactivas ni las que no participan en transferencias: como la respuesta), por
 * nombre. El nombre, el de la respuesta; si no viene, el del selector; si tampoco, «Obra N».
 */
export function obrasVerComo(datos: InventarioPerfilApi, globales: readonly ObraGlobal[] = []): ObraVerComo[] {
    const obras = new Map<number, ObraVerComo>();
    const sumar = (l: LugarPerfil | null | undefined, n: number) => {
        if (l?.tipo !== 'obra') return;
        const previa = obras.get(l.id);
        const nombre = previa?.nombre || l.nombre?.trim() || '';
        obras.set(l.id, { id: l.id, nombre, solicitudes: (previa?.solicitudes ?? 0) + n });
    };
    datos.solicitudes.forEach(s => sumar(s.destino, 1));
    (datos.diferencias ?? []).forEach(d => sumar(d.destino, 0));
    globales
        .filter(o => o.activa !== false && !o.es_prueba && !o.finalizada && o.participa_transferencias !== false)
        .forEach(o => {
            const previa = obras.get(o.id);
            obras.set(o.id, { id: o.id, nombre: previa?.nombre || o.nombre?.trim() || '', solicitudes: previa?.solicitudes ?? 0 });
        });
    return [...obras.values()].map(o => ({ ...o, nombre: o.nombre || `Obra ${o.id}` })).sort(ordenNombre);
}

/**
 * La obra que se abre al elegir «Jefe de obra»: la que se eligió aquí (si sigue en la lista); si no, la del selector
 * global de arriba (si está en la lista); si no, la de más movimiento (a igualdad, la primera por nombre). null si no
 * hay ninguna obra.
 */
export function obraPorDefecto(
    opciones: readonly ObraVerComo[],
    { elegida, global }: { elegida?: number | null; global?: number | null } = {},
): number | null {
    const esta = (id?: number | null) => id != null && opciones.some(o => o.id === id);
    if (esta(elegida)) return elegida as number;
    if (esta(global)) return global as number;
    let mejor: ObraVerComo | null = null;
    for (const o of opciones) if (!mejor || o.solicitudes > mejor.solicitudes) mejor = o;
    return mejor?.id ?? null;
}

const etapa = (lista: readonly SolicitudPerfil[], e: EtapaPerfil): EtapaCircuitoPerfil => {
    const de = lista.filter(s => s.etapa === e);
    return { total: de.length, dias: de.length ? Math.max(...de.map(s => s.dias)) : null };
};

/** El circuito (Pedida → Aprobada → Despachada → Recibida, y las diferencias aparte) contado desde las listas. */
export function circuitoDe(solicitudes: readonly SolicitudPerfil[], diferencias: readonly DiferenciaPerfil[]): CircuitoPerfil {
    const recibidas = solicitudes.filter(s => s.etapa === 'recibida');
    const fechas = recibidas.map(s => s.recepcion?.fecha ?? null).filter((f): f is string => !!f).sort();
    return {
        pedida: etapa(solicitudes, 'pedida'),
        aprobada: etapa(solicitudes, 'aprobada'),
        despachada: etapa(solicitudes, 'despachada'),
        recibida: { total: recibidas.filter(s => s.del_mes).length, ultima: fechas.length ? fechas[fechas.length - 1] : null },
        diferencias: {
            total: new Set(diferencias.map(d => d.transferencia_id)).size,
            items: diferencias.length,
            dias: diferencias.length ? Math.max(...diferencias.map(d => d.dias)) : null,
        },
    };
}

/** La respuesta del Super Administrador «como la vería esa obra» (arriba, las reglas). No cambia `datos`. */
export function comoObra(datos: InventarioPerfilApi, obra: { id: number; nombre: string | null }): InventarioPerfilApi {
    const va = esLaObra(obra.id);
    const solicitudes = datos.solicitudes
        .filter(s => va(s.destino))
        .map((s): SolicitudPerfil => ({ ...s, propia: true, puede_aprobar: null, bloqueo_aprobar: null }));
    const ids = new Set(solicitudes.map(s => s.id));
    // Las diferencias de esa obra: por destino, o por pertenecer a una de sus solicitudes.
    const diferencias = (datos.diferencias ?? []).filter(d => va(d.destino) || ids.has(d.transferencia_id));
    return {
        ...datos,
        perfil: 'obra',
        super_admin: false,
        alcance: { todas: false, bodega_id: null },
        obra: { id: obra.id, nombre: obra.nombre },
        puede: { ...PUEDE_JEFE_OBRA },
        circuito: circuitoDe(solicitudes, diferencias),
        solicitudes,
        diferencias: null,
    };
}
