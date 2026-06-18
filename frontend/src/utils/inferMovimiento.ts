/**
 * Inferencia del tipo de flujo de un "Nuevo movimiento" a partir de origen/destino
 * (+ permisos + toggles). Núcleo del wizard adaptativo (Fase 4). FUNCIÓN PURA y
 * testeable: no toca React, red ni estado. El paso "Revisar" del wizard muestra el
 * resultado (tipoFlujoLabel) antes de enviar → red de seguridad ante una inferencia
 * incorrecta. El backend NO cambia: cada tipo mapea a una función existente del hook
 * useTransferencias y su payload.
 */

export type TipoFlujo =
    | 'solicitud'
    | 'solicitud_materiales'
    | 'push_directo'
    | 'intra_bodega'
    | 'intra_obra'
    | 'devolucion'
    | 'orden_gerencia';

export interface ItemInput { item_id: number; cantidad: number; }
export interface CustomItemInput { descripcion: string; cantidad: number; unidad?: string; observacion?: string; }

/** Origen: 'central' = sin origen fijo (lo decide el aprobador → es una solicitud). */
export type Origen = { tipo: 'central' } | { tipo: 'obra'; id: number } | { tipo: 'bodega'; id: number };
export type Destino = { tipo: 'obra'; id: number } | { tipo: 'bodega'; id: number };

export interface WizardState {
    origen: Origen | null;
    destino: Destino | null;
    /** Toggle avanzado "Orden de gerencia" (bypass) — cualquier combinación, con permiso. */
    ordenGerencia: boolean;
    items: ItemInput[];
    itemsCustom: CustomItemInput[];
    motivo: string;
    observaciones: string;
    requierePionetas: boolean;
    cantidadPionetas: number;
}

export interface PermisosMovimiento {
    solicitar: boolean;
    solicitudMateriales: boolean;
    pushDirecto: boolean;
    intraBodega: boolean;
    devolucion: boolean;
    intraObra: boolean;
    ordenGerencia: boolean;
}

/**
 * Resultado tipado. `kind` mapea 1:1 a una función de useTransferencias; `data` es
 * estructuralmente compatible con su parámetro. El caller hace `switch (kind)`.
 */
export type MovimientoResuelto =
    | { kind: 'crear'; data: { destino_obra_id?: number | null; destino_bodega_id?: number | null; origen_obra_id?: number | null; origen_bodega_id?: number | null; items: ItemInput[]; items_custom?: CustomItemInput[]; observaciones?: string; requiere_pionetas?: boolean; cantidad_pionetas?: number; tipo_flujo?: 'solicitud' | 'solicitud_materiales' | 'devolucion'; motivo?: string } }
    | { kind: 'solicitudMateriales'; data: { destino_obra_id?: number | null; items: ItemInput[]; items_custom?: CustomItemInput[]; observaciones?: string; motivo?: string } }
    | { kind: 'pushDirecto'; data: { origen_bodega_id: number; destino_obra_id: number; items: ItemInput[]; observaciones?: string; motivo?: string } }
    | { kind: 'intraBodega'; data: { origen_bodega_id: number; destino_bodega_id: number; items: ItemInput[]; observaciones?: string; motivo?: string } }
    | { kind: 'devolucion'; data: { origen_obra_id: number; destino_bodega_id: number; items: ItemInput[]; observaciones?: string; requiere_pionetas?: boolean; cantidad_pionetas?: number; motivo?: string } }
    | { kind: 'intraObra'; data: { origen_obra_id: number; destino_obra_id: number; items: ItemInput[]; observaciones?: string; motivo?: string } }
    | { kind: 'ordenGerencia'; data: { origen_obra_id?: number | null; origen_bodega_id?: number | null; destino_obra_id?: number | null; destino_bodega_id?: number | null; items: ItemInput[]; motivo: string; observaciones?: string } };

export interface InferResult {
    tipoFlujo: TipoFlujo | null;
    tipoFlujoLabel: string;
    /** Payload listo para enviar; null si falta info o hay errores. */
    resuelto: MovimientoResuelto | null;
    /** Qué toggles ofrecer en la UI según la ruta + permisos. */
    togglesDisponibles: { ordenGerencia: boolean };
    /** true si origen+destino forman una ruta válida y con permiso (ignora ítems/motivo). Habilita "Siguiente" en el paso Ruta. */
    rutaOk: boolean;
    errores: string[];
}

export const TIPO_FLUJO_LABEL: Record<TipoFlujo, string> = {
    solicitud: 'Solicitud',
    solicitud_materiales: 'Solicitud de materiales',
    push_directo: 'Envío directo',
    intra_bodega: 'Movimiento entre bodegas',
    intra_obra: 'Traslado entre obras',
    devolucion: 'Devolución',
    orden_gerencia: 'Orden de gerencia',
};

const PERMISO_POR_FLUJO = (p: PermisosMovimiento): Record<TipoFlujo, boolean> => ({
    solicitud: p.solicitar,
    solicitud_materiales: p.solicitudMateriales,
    push_directo: p.pushDirecto,
    intra_bodega: p.intraBodega,
    intra_obra: p.intraObra,
    devolucion: p.devolucion,
    orden_gerencia: p.ordenGerencia,
});

export function inferMovimiento(state: WizardState, permisos: PermisosMovimiento): InferResult {
    const { origen, destino } = state;

    const togglesDisponibles = {
        ordenGerencia: !!origen && !!destino && permisos.ordenGerencia,
    };

    const usarOrdenGerencia = state.ordenGerencia && togglesDisponibles.ordenGerencia;

    const vacio: InferResult = { tipoFlujo: null, tipoFlujoLabel: '', resuelto: null, togglesDisponibles, rutaOk: false, errores: [] };
    if (!origen || !destino) return vacio;

    // Errores de RUTA (origen/destino/permiso) — gobiernan rutaOk (paso 1).
    const rutaErrores: string[] = [];
    if (origen.tipo !== 'central' && origen.tipo === destino.tipo && origen.id === destino.id) {
        rutaErrores.push('El origen y el destino no pueden ser el mismo.');
    }
    if (origen.tipo === 'central' && destino.tipo !== 'obra') {
        rutaErrores.push('“Bodega central” solo puede enviar a una obra (es una solicitud).');
    }

    // ── Inferir el tipo de flujo ──
    let tipoFlujo: TipoFlujo;
    if (usarOrdenGerencia) {
        tipoFlujo = 'orden_gerencia';
    } else if (origen.tipo === 'central') {
        tipoFlujo = state.items.length === 0 && state.itemsCustom.length > 0 ? 'solicitud_materiales' : 'solicitud';
    } else if (origen.tipo === 'bodega' && destino.tipo === 'obra') {
        // Elegir una bodega de origen ES enviar/mover (modo "Mover stock"); requiere permiso.
        // La solicitud (sin origen) vive en el modo "Pedir" → rama origen 'central'.
        tipoFlujo = 'push_directo';
    } else if (origen.tipo === 'obra' && destino.tipo === 'bodega') {
        tipoFlujo = 'devolucion';
    } else if (origen.tipo === 'obra' && destino.tipo === 'obra') {
        tipoFlujo = 'intra_obra';
    } else if (origen.tipo === 'bodega' && destino.tipo === 'bodega') {
        tipoFlujo = 'intra_bodega';
    } else {
        return { ...vacio, errores: ['Combinación de origen y destino no soportada.'] };
    }

    if (!PERMISO_POR_FLUJO(permisos)[tipoFlujo]) {
        rutaErrores.push('No tienes permiso para este tipo de movimiento.');
    }
    const rutaOk = rutaErrores.length === 0;

    // Errores de ÍTEMS / motivo — no bloquean el paso 1, sí el "Crear" final.
    const itemErrores: string[] = [];
    if (tipoFlujo === 'solicitud_materiales') {
        if (state.itemsCustom.length === 0) itemErrores.push('Agrega al menos un material.');
    } else if (state.items.length === 0) {
        itemErrores.push('Agrega al menos un ítem.');
    }
    if (tipoFlujo === 'orden_gerencia' && !state.motivo.trim()) {
        itemErrores.push('La orden de gerencia requiere un motivo.');
    }

    const errores = [...rutaErrores, ...itemErrores];
    const resuelto = errores.length === 0 ? buildPayload(tipoFlujo, state) : null;
    return { tipoFlujo, tipoFlujoLabel: TIPO_FLUJO_LABEL[tipoFlujo], resuelto, togglesDisponibles, rutaOk, errores };
}

function buildPayload(tipoFlujo: TipoFlujo, state: WizardState): MovimientoResuelto {
    const { origen, destino, items, itemsCustom, motivo, observaciones, requierePionetas, cantidadPionetas } = state;
    const obs = observaciones.trim() || undefined;
    const mot = motivo.trim() || undefined;
    const pionetas = requierePionetas ? { requiere_pionetas: true, cantidad_pionetas: cantidadPionetas } : {};

    // Invariantes garantizadas por inferMovimiento (origen/destino ya validados).
    const oObra = origen && origen.tipo === 'obra' ? origen.id : undefined;
    const oBodega = origen && origen.tipo === 'bodega' ? origen.id : undefined;
    const dObra = destino && destino.tipo === 'obra' ? destino.id : undefined;
    const dBodega = destino && destino.tipo === 'bodega' ? destino.id : undefined;

    switch (tipoFlujo) {
        case 'solicitud': {
            const data: Extract<MovimientoResuelto, { kind: 'crear' }>['data'] = {
                destino_obra_id: dObra,
                items,
                observaciones: obs,
                motivo: mot,
                tipo_flujo: 'solicitud',
                ...pionetas,
            };
            if (itemsCustom.length) data.items_custom = itemsCustom;
            return { kind: 'crear', data };
        }
        case 'solicitud_materiales':
            return { kind: 'solicitudMateriales', data: { destino_obra_id: dObra, items: [], items_custom: itemsCustom, observaciones: obs, motivo: mot } };
        case 'push_directo':
            return { kind: 'pushDirecto', data: { origen_bodega_id: oBodega as number, destino_obra_id: dObra as number, items, observaciones: obs, motivo: mot } };
        case 'intra_bodega':
            return { kind: 'intraBodega', data: { origen_bodega_id: oBodega as number, destino_bodega_id: dBodega as number, items, observaciones: obs, motivo: mot } };
        case 'devolucion':
            return { kind: 'devolucion', data: { origen_obra_id: oObra as number, destino_bodega_id: dBodega as number, items, observaciones: obs, motivo: mot, ...pionetas } };
        case 'intra_obra':
            return { kind: 'intraObra', data: { origen_obra_id: oObra as number, destino_obra_id: dObra as number, items, observaciones: obs, motivo: mot } };
        case 'orden_gerencia':
            return {
                kind: 'ordenGerencia',
                data: {
                    origen_obra_id: oObra ?? null,
                    origen_bodega_id: oBodega ?? null,
                    destino_obra_id: dObra ?? null,
                    destino_bodega_id: dBodega ?? null,
                    items,
                    motivo: motivo.trim(),
                    observaciones: obs,
                },
            };
    }
}
