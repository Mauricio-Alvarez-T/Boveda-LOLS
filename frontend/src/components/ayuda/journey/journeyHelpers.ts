import type { Transferencia, TransferenciaItem, TransferenciaConDiscrepancias, TransferenciaDiscrepanciaItem } from '../../../types/entities';
import type { WizardEngine } from '../../inventario/nuevo-movimiento/wizardEngine';
import { itemsDemo, obrasDemo, bodegasDemo } from '../demo/mockData';

/**
 * Helpers del motor de journeys: construyen y hacen avanzar una `Transferencia` de
 * EJEMPLO (sin backend) a partir de las acciones reales del usuario sobre las
 * pantallas reales (wizard + TransferenciaDetail). El estado avanza
 * pendiente → aprobada → recibida.
 */

/** Ítem personalizado de ejemplo (el campo `items_custom` no está en la interface oficial). */
export interface TrfCustomDemo {
    id: number;
    descripcion: string;
    cantidad: number;
    unidad: string | null;
    observacion: string | null;
    cantidad_aprobada?: number | null;
    cantidad_recibida?: number;
    aprobado?: boolean;
    fuente?: 'comprar' | 'obra';
    origen_obra_id?: number | null;
}

/** Transferencia de ejemplo: la oficial + el campo `items_custom` que el detalle lee por cast. */
export type DemoTransferencia = Transferencia & { items_custom?: TrfCustomDemo[] };

const ahora = () => new Date().toISOString();

/** Payload de `onAprobar` (subconjunto que usamos para calcular lo enviado). */
type AprobarData = {
    items: Array<
        | { item_id: number; cantidad_enviada: number }
        | { item_id: number; splits: { cantidad: number }[] }
    >;
};

const obraNombre = (id?: number | null) => (id == null ? null : (obrasDemo.find(o => o.id === id)?.nombre ?? null));
const bodegaNombre = (id?: number | null) => (id == null ? null : (bodegasDemo.find(b => b.id === id)?.nombre ?? null));

/**
 * Construye la transferencia de ejemplo desde el estado del wizard. El estado
 * inicial depende del tipo inferido: los flujos sin aprobación (envío directo,
 * orden de gerencia) nacen `en_transito`; el resto, `pendiente`.
 */
export function buildTrfDemo(engine: WizardEngine): DemoTransferencia {
    const tipo = (engine.infer.tipoFlujo ?? 'solicitud') as Transferencia['tipo_flujo'];
    const sinAprobacion = tipo === 'push_directo' || tipo === 'orden_gerencia';

    const items: TransferenciaItem[] = engine.cart.map((l, idx) => {
        const it = itemsDemo.find(i => i.id === l.item_id);
        return {
            id: idx + 1,
            transferencia_id: 9001,
            item_id: l.item_id,
            item_descripcion: it?.descripcion,
            cantidad_solicitada: l.cantidad,
            // En los flujos sin aprobación ya sale despachado (enviada = solicitada).
            cantidad_enviada: sinAprobacion ? l.cantidad : null,
            cantidad_recibida: 0,
            observacion: null,
            unidad: it?.unidad,
        };
    });

    const itemsCustom: TrfCustomDemo[] = engine.customItems
        .filter(c => c.descripcion.trim())
        .map((c, idx) => ({
            id: idx + 1,
            descripcion: c.descripcion.trim(),
            cantidad: c.cantidad,
            unidad: c.unidad?.trim() || null,
            observacion: c.observacion?.trim() || null,
        }));

    const o = engine.origen;
    const d = engine.destino;
    const origen_obra_id = o && o.tipo === 'obra' ? o.id : null;
    const origen_bodega_id = o && o.tipo === 'bodega' ? o.id : null;
    const destino_obra_id = d && d.tipo === 'obra' ? d.id : null;
    const destino_bodega_id = d && d.tipo === 'bodega' ? d.id : null;

    return {
        id: 9001,
        codigo: 'TRF-DEMO-0001',
        estado: sinAprobacion ? 'en_transito' : 'pendiente',
        origen_obra_id,
        origen_bodega_id,
        destino_obra_id,
        destino_bodega_id,
        origen_obra_nombre: obraNombre(origen_obra_id),
        origen_bodega_nombre: bodegaNombre(origen_bodega_id),
        destino_obra_nombre: obraNombre(destino_obra_id),
        destino_bodega_nombre: bodegaNombre(destino_bodega_id),
        solicitante_id: -1,
        solicitante_nombre: 'Tú (demostración)',
        aprobador_id: null,
        transportista_id: null,
        receptor_id: null,
        fecha_solicitud: ahora(),
        fecha_aprobacion: null,
        fecha_despacho: null,
        fecha_recepcion: null,
        requiere_pionetas: engine.requierePionetas,
        cantidad_pionetas: engine.requierePionetas ? engine.cantidadPionetas : null,
        observaciones: engine.observaciones.trim() || null,
        tipo_flujo: tipo,
        motivo: engine.motivo.trim() || null,
        activo: true,
        items,
        items_custom: itemsCustom,
    };
}

/** Avanza a `aprobada`: fija cantidad_enviada por ítem y marca custom aprobados. */
export function aprobarTrfDemo(trf: DemoTransferencia, data: AprobarData): DemoTransferencia {
    const enviadaDe = (itemId: number, solicitada: number): number => {
        const entry = data.items.find(i => i.item_id === itemId);
        if (!entry) return solicitada;
        if ('splits' in entry) return entry.splits.reduce((s, sp) => s + (sp.cantidad || 0), 0) || solicitada;
        return entry.cantidad_enviada ?? solicitada;
    };
    return {
        ...trf,
        estado: 'aprobada',
        aprobador_id: -2,
        aprobador_nombre: 'Aprobador (demostración)',
        fecha_aprobacion: ahora(),
        items: (trf.items || []).map(it => ({ ...it, cantidad_enviada: enviadaDe(it.item_id, it.cantidad_solicitada) })),
        items_custom: (trf.items_custom || []).map(c => ({ ...c, aprobado: true, cantidad_aprobada: c.cantidad_aprobada ?? c.cantidad })),
    };
}

/** Recepción: `total` cierra (`recibida`); `parcial` acumula y queda `recepcion_parcial`. */
export function recibirTrfDemo(
    trf: DemoTransferencia,
    items: { item_id: number; cantidad_recibida: number }[],
    tipo: 'parcial' | 'total',
): DemoTransferencia {
    const recibidaDe = (itemId: number, previa: number): number => {
        const e = items.find(i => i.item_id === itemId);
        return previa + (e?.cantidad_recibida ?? 0);
    };
    const nuevosItems = (trf.items || []).map(it => ({
        ...it,
        cantidad_recibida: recibidaDe(it.item_id, Number(it.cantidad_recibida) || 0),
    }));
    if (tipo === 'total') {
        return {
            ...trf,
            estado: 'recibida',
            receptor_id: -3,
            receptor_nombre: 'Receptor (demostración)',
            fecha_recepcion: ahora(),
            items: nuevosItems,
        };
    }
    return { ...trf, estado: 'recepcion_parcial', items: nuevosItems };
}

/** Estados terminales por rechazo/cancelación. */
export function rechazarTrfDemo(trf: DemoTransferencia, motivo: string): DemoTransferencia {
    return { ...trf, estado: 'rechazada', observaciones_rechazo: motivo };
}
export function cancelarTrfDemo(trf: DemoTransferencia): DemoTransferencia {
    return { ...trf, estado: 'cancelada' };
}

/** ¿La transferencia recibida quedó con diferencia (merma/sobrante)? */
export function tieneDiferencia(trf: DemoTransferencia): boolean {
    return (trf.items || []).some(it => {
        const enviada = Number(it.cantidad_enviada) || Number(it.cantidad_solicitada) || 0;
        return (Number(it.cantidad_recibida) || 0) !== enviada;
    });
}

/** Construye la discrepancia de ejemplo a partir de una TRF recibida con diferencia. */
export function buildDiscrepanciaDemo(trf: DemoTransferencia): TransferenciaConDiscrepancias {
    const discrepancias: TransferenciaDiscrepanciaItem[] = (trf.items || [])
        .map((it, idx): TransferenciaDiscrepanciaItem | null => {
            const enviada = Number(it.cantidad_enviada) || Number(it.cantidad_solicitada) || 0;
            const recibida = Number(it.cantidad_recibida) || 0;
            const diferencia = enviada - recibida;
            if (diferencia === 0) return null;
            const itDemo = itemsDemo.find(i => i.id === it.item_id);
            return {
                id: idx + 1,
                transferencia_id: trf.id,
                item_id: it.item_id,
                item_descripcion: it.item_descripcion || itDemo?.descripcion || `Ítem #${it.item_id}`,
                nro_item: itDemo?.nro_item ?? it.item_id,
                unidad: it.unidad || itDemo?.unidad || 'un',
                cantidad_enviada: enviada,
                cantidad_recibida: recibida,
                diferencia,
                observacion: null,
                estado: 'pendiente',
                resolucion: null,
                resuelto_por: null,
                resuelto_por_nombre: null,
                fecha_resolucion: null,
                reportado_por: -3,
                reportado_por_nombre: 'Receptor (demostración)',
                created_at: ahora(),
            };
        })
        .filter((x): x is TransferenciaDiscrepanciaItem => x !== null);

    return {
        id: trf.id,
        codigo: trf.codigo,
        fecha_solicitud: trf.fecha_solicitud,
        fecha_aprobacion: trf.fecha_aprobacion,
        fecha_despacho: trf.fecha_despacho,
        fecha_recepcion: trf.fecha_recepcion,
        origen_obra_nombre: trf.origen_obra_nombre ?? null,
        origen_bodega_nombre: trf.origen_bodega_nombre ?? null,
        destino_obra_nombre: trf.destino_obra_nombre ?? null,
        destino_bodega_nombre: trf.destino_bodega_nombre ?? null,
        solicitante_id: trf.solicitante_id,
        solicitante_nombre: trf.solicitante_nombre ?? null,
        aprobador_id: trf.aprobador_id,
        aprobador_nombre: trf.aprobador_nombre ?? null,
        transportista_id: trf.transportista_id,
        transportista_nombre: trf.transportista_nombre ?? null,
        receptor_id: trf.receptor_id,
        receptor_nombre: trf.receptor_nombre ?? null,
        discrepancias,
        total_unidades_perdidas: discrepancias.reduce((s, d) => s + Math.max(0, d.diferencia), 0),
        total_items_afectados: discrepancias.length,
    };
}

/** Marca un ítem de la discrepancia como resuelto/descartado. */
export function resolverDiscrepanciaDemo(
    disc: TransferenciaConDiscrepancias,
    itemId: number,
    estado: 'resuelta' | 'descartada',
    resolucion: string,
): TransferenciaConDiscrepancias {
    return {
        ...disc,
        discrepancias: disc.discrepancias.map(d => d.id === itemId
            ? { ...d, estado, resolucion, resuelto_por: 0, resuelto_por_nombre: 'Tú (demostración)', fecha_resolucion: ahora() }
            : d),
    };
}
