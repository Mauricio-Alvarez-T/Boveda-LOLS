import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import api from '../../services/api';
import { showApiError } from '../../utils/toastUtils';
import type { ApiResponse } from '../../types';
import type {
    RehacerDiscrepanciaPlan, ResolverDiscrepanciaResultado, SimulacionResolverDiscrepancia, Transferencia,
    TransferenciaConDiscrepancias, TransferenciaRecepcion,
} from '../../types/entities';
import {
    CODIGO_APLICADA_SIN_SIMULAR, ESTADOS_ERROR_EN_MODAL, TEXTO_REINTENTAR, avisoYaCerrada, esReintentar, esVerdadero,
    interpretarSimulacion, mensajeResultadoResolver, normalizarAjustes, normalizarPlanRehacer, parseAjusteStock,
    resumenAjustes, type MomentoDecision,
} from '../../components/inventario/mensajeDiferencia';
import { conDuracion } from '../../utils/avisos';

/** Error de una acción sobre una diferencia (status/code del servidor + mensaje legible). */
export interface ErrorDiscrepancia { status?: number; code?: string; message: string }

/** Resultado de resolver (aprobar) / descartar (rechazar) una diferencia: lo aplicado o el error. */
export type ResolverDiscrepanciaRespuesta =
    | { ok: true; data: ResolverDiscrepanciaResultado }
    | { ok: false; error: ErrorDiscrepancia };

/** Resultado de SIMULAR resolver / descartar (no escribe): el efecto exacto o el error. */
export type SimularDiscrepanciaRespuesta =
    | { ok: true; data: SimulacionResolverDiscrepancia }
    | { ok: false; error: ErrorDiscrepancia };

/**
 * «Otra persona ya la resolvió / ya no está»: toast INFORMATIVO (no error) con el mensaje del
 * servidor. Devuelve true si lo mostró (el modal se cierra y la lista se refresca). Al simular el
 * título no dice «no se aplicó tu decisión» (todavía no había decisión).
 */
function toastSiYaCerrada(error: ErrorDiscrepancia, accion: 'resolver' | 'rehacer', momento: MomentoDecision): boolean {
    const aviso = avisoYaCerrada(error, accion, momento);
    if (!aviso) return false;
    toast.info(aviso.titulo, aviso.detalle ? { description: aviso.detalle } : undefined);
    return true;
}

/** Resultado de rehacer (simulado o real) una diferencia de la regla anterior. */
export type RehacerDiscrepanciaRespuesta =
    | { ok: true; data: RehacerDiscrepanciaPlan }
    | { ok: false; error: ErrorDiscrepancia };

/** Datos de la fila que ya tiene la pantalla, para completar el plan si el servidor no los manda. */
export interface RespaldoRehacer {
    item?: string | null;
    enviada?: number | string | null;
    recibida?: number | string | null;
    unidad?: string | null;
}

/** status/code/mensaje de un error de axios (el backend manda { error, code }). */
function leerErrorApi(err: unknown, porDefecto: string): ErrorDiscrepancia {
    const e = err as { response?: { status?: number; data?: { error?: string; code?: string } }; message?: string };
    return {
        status: e.response?.status,
        code: e.response?.data?.code,
        message: e.response?.data?.error || e.message || porDefecto,
    };
}

interface TransferenciaListResponse {
    data: Transferencia[];
    total: number;
    page: number;
    limit: number;
}

interface CustomItemPayload {
    descripcion: string;
    cantidad: number;
    unidad?: string;
    observacion?: string;
}

interface CrearTransferenciaData {
    destino_obra_id?: number | null;
    destino_bodega_id?: number | null;
    // Origen opcional como PREFERENCIA (el backend lo acepta; el aprobador puede
    // reasignar). Lo usa el wizard adaptativo cuando se elige una bodega de origen
    // pero el flujo sigue siendo una solicitud (no un push).
    origen_obra_id?: number | null;
    origen_bodega_id?: number | null;
    items: { item_id: number; cantidad: number }[];
    // Items personalizados (fuera de catálogo). El aprobador los lee
    // para tramitar compra. Se incluyen en mensaje WhatsApp al transportista.
    items_custom?: CustomItemPayload[];
    observaciones?: string;
    requiere_pionetas?: boolean;
    cantidad_pionetas?: number;
    tipo_flujo?: 'solicitud' | 'solicitud_materiales' | 'devolucion';
    motivo?: string;
}

interface SolicitudMaterialesData {
    destino_obra_id?: number | null;
    destino_bodega_id?: number | null;
    items: { item_id: number; cantidad: number }[];
    items_custom?: CustomItemPayload[];
    observaciones?: string;
    motivo?: string;
    requiere_pionetas?: boolean;
    cantidad_pionetas?: number;
}

interface PushDirectoData {
    origen_bodega_id: number;
    destino_obra_id: number;
    items: { item_id: number; cantidad: number }[];
    observaciones?: string;
    motivo?: string;
}

interface IntraBodegaData {
    origen_bodega_id: number;
    destino_bodega_id: number;
    items: { item_id: number; cantidad: number }[];
    observaciones?: string;
    motivo?: string;
}

interface DevolucionData {
    origen_obra_id: number;
    destino_bodega_id: number;
    items: { item_id: number; cantidad: number }[];
    observaciones?: string;
    motivo?: string;
    requiere_pionetas?: boolean;
    cantidad_pionetas?: number;
}

interface IntraObraData {
    origen_obra_id: number;
    destino_obra_id: number;
    items: { item_id: number; cantidad: number }[];
    observaciones?: string;
    motivo?: string;
}

interface OrdenGerenciaData {
    origen_obra_id?: number | null;
    origen_bodega_id?: number | null;
    destino_obra_id?: number | null;
    destino_bodega_id?: number | null;
    items: { item_id: number; cantidad: number }[];
    motivo: string;
    observaciones?: string;
}

interface AprobarData {
    origen_obra_id?: number | null;
    origen_bodega_id?: number | null;
    items: Array<
        // Legacy shape
        | {
            item_id: number;
            cantidad_enviada: number;
            origen_obra_id?: number | null;
            origen_bodega_id?: number | null;
        }
        // Multi-origen shape
        | {
            item_id: number;
            splits: {
                origen_obra_id: number | null;
                origen_bodega_id: number | null;
                cantidad: number;
            }[];
        }
    >;
    // Solicitud de Materiales (ítems custom): ediciones del aprobador por ítem
    // existente (ajustar cantidad, corregir desc/unidad, nota, o quitar con
    // aprobado=false) + ítems que el aprobador agrega.
    items_custom?: Array<{
        id: number;
        descripcion?: string;
        unidad?: string;
        cantidad_aprobada?: number;
        aprobado?: boolean;
        nota_aprobador?: string;
        fuente?: 'comprar' | 'obra';
        origen_obra_id?: number | null;
    }>;
    items_custom_nuevos?: Array<{ descripcion: string; cantidad: number; unidad?: string; observacion?: string; fuente?: 'comprar' | 'obra'; origen_obra_id?: number | null }>;
}

export function useTransferencias() {
    const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
    const [selected, setSelected] = useState<Transferencia | null>(null);
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);
    const [discrepancias, setDiscrepancias] = useState<TransferenciaConDiscrepancias[]>([]);
    const [selectedDiscrepancia, setSelectedDiscrepancia] = useState<TransferenciaConDiscrepancias | null>(null);

    const fetchAll = useCallback(async (query: Record<string, any> = {}) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            Object.entries(query).forEach(([k, v]) => { if (v != null) params.set(k, String(v)); });
            const res = await api.get<TransferenciaListResponse>(`/transferencias?${params}`);
            setTransferencias(res.data.data);
            setTotal(res.data.total);
        } catch {
            setTransferencias([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchById = useCallback(async (id: number) => {
        setLoading(true);
        try {
            const res = await api.get<ApiResponse<Transferencia>>(`/transferencias/${id}`);
            setSelected(res.data.data);
            return res.data.data;
        } catch {
            setSelected(null);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    const crear = useCallback(async (data: CrearTransferenciaData) => {
        try {
            const res = await api.post<ApiResponse<{ id: number; codigo: string }>>('/transferencias', data);
            toast.success(`Solicitud ${res.data.data.codigo} creada`, {
                description: 'Queda pendiente de aprobación.',
            });
            return res.data.data;
        } catch (err) {
            showApiError(err, 'Error al crear solicitud');
            return null;
        }
    }, []);

    const solicitudMateriales = useCallback(async (data: SolicitudMaterialesData) => {
        try {
            const res = await api.post<ApiResponse<{ id: number; codigo: string }>>('/transferencias/solicitud-materiales', data);
            toast.success(`Solicitud de materiales ${res.data.data.codigo} creada`);
            return res.data.data;
        } catch (err) {
            showApiError(err, 'Error al crear solicitud de materiales');
            return null;
        }
    }, []);

    const pushDirecto = useCallback(async (data: PushDirectoData) => {
        try {
            const res = await api.post<ApiResponse<{ id: number; codigo: string; estado: string }>>(
                '/transferencias/push-directo', data
            );
            toast.success(`Push directo ${res.data.data.codigo} creado`);
            return res.data.data;
        } catch (err) {
            showApiError(err, 'Error al crear push directo');
            return null;
        }
    }, []);

    const intraBodega = useCallback(async (data: IntraBodegaData) => {
        try {
            const res = await api.post<ApiResponse<{ id: number; codigo: string; estado: string }>>(
                '/transferencias/intra-bodega', data
            );
            toast.success(`Movimiento intra-bodega ${res.data.data.codigo} creado — pendiente de aprobación`);
            return res.data.data;
        } catch (err) {
            showApiError(err, 'Error al crear movimiento intra-bodega');
            return null;
        }
    }, []);

    const devolucion = useCallback(async (data: DevolucionData) => {
        try {
            const res = await api.post<ApiResponse<{ id: number; codigo: string }>>(
                '/transferencias/devolucion', data
            );
            toast.success(`Devolución ${res.data.data.codigo} creada`);
            return res.data.data;
        } catch (err) {
            showApiError(err, 'Error al crear devolución');
            return null;
        }
    }, []);

    const intraObra = useCallback(async (data: IntraObraData) => {
        try {
            const res = await api.post<ApiResponse<{ id: number; codigo: string }>>(
                '/transferencias/intra-obra', data
            );
            toast.success(`Traslado intra-obra ${res.data.data.codigo} creado`);
            return res.data.data;
        } catch (err) {
            showApiError(err, 'Error al crear traslado intra-obra');
            return null;
        }
    }, []);

    const ordenGerencia = useCallback(async (data: OrdenGerenciaData) => {
        try {
            const res = await api.post<ApiResponse<{ id: number; codigo: string; estado: string }>>(
                '/transferencias/orden-gerencia', data
            );
            toast.success(`Orden de gerencia ${res.data.data.codigo} emitida`);
            return res.data.data;
        } catch (err) {
            showApiError(err, 'Error al emitir orden de gerencia');
            return null;
        }
    }, []);

    const aprobar = useCallback(async (id: number, data: AprobarData) => {
        try {
            await api.put(`/transferencias/${id}/aprobar`, data);
            toast.success('Transferencia aprobada', {
                description: 'Siguiente paso: despacharla o avisar al transportista.',
            });
            return true;
        } catch (err) {
            showApiError(err, 'Error al aprobar');
            return false;
        }
    }, []);

    const crearFaltante = useCallback(async (transferenciaId: number) => {
        try {
            const res = await api.post<ApiResponse<{ id: number; codigo: string; items?: number; ya_existia?: boolean } | null>>(
                `/transferencias/${transferenciaId}/crear-faltante`
            );
            const data = res.data.data;
            if (data?.ya_existia) {
                toast.info(`Ya existía la solicitud ${data.codigo} por el faltante`);
            } else if (data) {
                toast.success(`Solicitud ${data.codigo} creada por el faltante`);
            }
            return data;
        } catch (err) {
            showApiError(err, 'Error al crear solicitud por faltante');
            return null;
        }
    }, []);

    const despachar = useCallback(async (id: number) => {
        try {
            await api.put(`/transferencias/${id}/despachar`);
            toast.success('Transferencia despachada', {
                description: 'El receptor confirmará la entrega cuando llegue a destino.',
            });
            return true;
        } catch (err) {
            showApiError(err, 'Error al despachar');
            return false;
        }
    }, []);

    /**
     * Recepción de TRF. `tipo` controla si se cierra la TRF o se deja abierta:
     *   · 'total'   → cierra (estado 'recibida'). Al stock entra lo ENVIADO; si lo declarado
     *                 difiere, la diferencia queda PENDIENTE para Inventario (la aprueba o la
     *                 rechaza). Comportamiento por defecto (back-compat).
     *   · 'parcial' → registra lo que llegó en ESTE viaje. Estado queda en
     *                 'recepcion_parcial' para futuros viajes. Sin discrepancia.
     *                 Backend bloquea over-receive (acumulado > enviada).
     */
    const recibir = useCallback(async (
        id: number,
        items: { item_id: number; cantidad_recibida: number; observacion?: string }[],
        tipo: 'parcial' | 'total' = 'total',
        observacion?: string,
        itemsCustom?: { transferencia_item_custom_id: number; cantidad_recibida: number }[]
    ) => {
        try {
            const res = await api.put(`/transferencias/${id}/recibir`, { items, tipo, observacion, items_custom: itemsCustom });
            if (tipo === 'parcial') {
                toast.success('Cargamento registrado. La entrega sigue en curso esperando próximos viajes.', { ...conDuracion(5000) });
            } else {
                toast.success('Transferencia cerrada ✓');
            }
            // Devuelve el id de la recepción creada (para adjuntar una foto opcional). null = error.
            return (res.data?.data?.recepcion_id as number) ?? null;
        } catch (err) {
            showApiError(err, 'Error al recibir');
            return null;
        }
    }, []);

    /**
     * Adjunta una foto OPCIONAL a una recepción ya registrada (POST-then-attach).
     * Best-effort: si falla, NO rompe el flujo (la recepción ya quedó guardada).
     */
    const uploadFotoRecepcion = useCallback(async (transferenciaId: number, recepcionId: number, file: File) => {
        try {
            const fd = new FormData();
            fd.append('foto', file);
            // El axios `api` fuerza Content-Type: application/json por defecto; hay que
            // sobreescribirlo a multipart o el FormData viaja sin boundary y multer no ve
            // el archivo (mismo patrón que ItemInventarioForm/DocumentUploader).
            await api.post(`/transferencias/${transferenciaId}/recepciones/${recepcionId}/foto`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success('Foto adjuntada ✓');
            return true;
        } catch (err) {
            showApiError(err, 'No se pudo adjuntar la foto (la recepción sí se registró)');
            return false;
        }
    }, []);

    /**
     * Historial de eventos de recepción para una TRF.
     * Backend: GET /api/transferencias/:id/recepciones (migración 048).
     */
    const fetchRecepciones = useCallback(async (id: number): Promise<TransferenciaRecepcion[]> => {
        try {
            const res = await api.get<ApiResponse<TransferenciaRecepcion[]>>(`/transferencias/${id}/recepciones`);
            return res.data.data || [];
        } catch {
            return [];
        }
    }, []);

    const rechazar = useCallback(async (id: number, motivo: string) => {
        try {
            await api.put(`/transferencias/${id}/rechazar`, { motivo });
            toast.success('Transferencia rechazada');
            return true;
        } catch (err) {
            showApiError(err, 'Error al rechazar');
            return false;
        }
    }, []);

    const rechazarRecepcion = useCallback(async (id: number, motivo: string) => {
        try {
            await api.put(`/transferencias/${id}/rechazar-recepcion`, { motivo });
            toast.success('Recepción rechazada');
            return true;
        } catch (err) {
            showApiError(err, 'Error al rechazar recepción');
            return false;
        }
    }, []);

    const cancelar = useCallback(async (id: number) => {
        try {
            await api.put(`/transferencias/${id}/cancelar`);
            toast.success('Transferencia cancelada');
            return true;
        } catch (err) {
            showApiError(err, 'Error al cancelar');
            return false;
        }
    }, []);

    // Hard delete (permanente): saca la transferencia del historial. Gateado por
    // inventario.transferencias.eliminar. NO revierte stock (decisión de producto).
    const eliminar = useCallback(async (id: number) => {
        try {
            await api.delete(`/transferencias/${id}`);
            toast.success('Transferencia eliminada');
            return true;
        } catch (err) {
            showApiError(err, 'Error al eliminar la transferencia');
            return false;
        }
    }, []);

    const fetchDiscrepancias = useCallback(async (estado: string = 'pendiente') => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (estado) params.set('estado', estado);
            const res = await api.get<{ data: TransferenciaConDiscrepancias[]; total: number }>(
                `/transferencias/discrepancias?${params}`
            );
            setDiscrepancias(res.data.data);
            return res.data.data;
        } catch {
            setDiscrepancias([]);
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    // SIMULA resolver (aprobar) / descartar (rechazar) sin escribir: el servidor devuelve las
    // ubicaciones con su stock de hoy y cómo quedarían, el aviso y el bloqueo si no se puede. Sin
    // toasts de error (el modal muestra un texto genérico y el servidor decide al confirmar), salvo
    // «ya la resolvió otra persona» (informativo).
    const simularResolucionDiscrepancia = useCallback(async (
        id: number,
        estado: 'resuelta' | 'descartada',
    ): Promise<SimularDiscrepanciaRespuesta> => {
        try {
            const res = await api.put<{ data?: Record<string, unknown> }>(
                `/transferencias/discrepancias/${id}/resolver?simular=1`, { estado }
            );
            const r = interpretarSimulacion(res.data?.data ?? {});
            // Backend sin simulación: ignoró ?simular=1 y RESOLVIÓ. Avisar y que el modal se cierre.
            if (r.tipo === 'aplicada') {
                const message = 'El servidor aplicó la decisión al abrir la ventana (no sabía simular). Revisa el resultado en la lista.';
                toast.warning(estado === 'resuelta' ? 'Diferencia aprobada' : 'Diferencia rechazada', { description: message, ...conDuracion(12000) });
                return { ok: false, error: { code: CODIGO_APLICADA_SIN_SIMULAR, message } };
            }
            // El 409 NO_PENDIENTE llega como `bloqueo`: es «ya la resolvió otra persona» (aviso sin
            // «no se aplicó tu decisión»: todavía no había decisión).
            if (r.tipo === 'ya_cerrada') {
                toastSiYaCerrada(r.error, 'resolver', 'simular');
                return { ok: false, error: r.error };
            }
            // REINTENTAR como `bloqueo` no bloquea la decisión: la ventana lo trata como simulación fallida.
            if (r.tipo === 'reintentar') return { ok: false, error: r.error };
            return { ok: true, data: r.sim };
        } catch (err) {
            const error = leerErrorApi(err, 'No se pudo calcular el efecto en el stock');
            if (!toastSiYaCerrada(error, 'resolver', 'simular')) console.error(err);
            return { ok: false, error };
        }
    }, []);

    // Resolver = APROBAR lo declarado por quien recibió (el servidor suma/resta la diferencia y deja
    // kardex); descartar = RECHAZARLO (no mueve stock: queda lo enviado). La nota es opcional: vacía,
    // el servidor guarda un texto generado. Los 400/409 (destino sin stock, regla anterior) NO van a
    // toast: el modal los muestra adentro y queda abierto. «Ya la resolvió otra persona» (409
    // NO_PENDIENTE / 404) va a toast INFORMATIVO y el modal se cierra. 409 REINTENTAR (el stock
    // estaba ocupado) va a toast con el mensaje y el modal queda abierto para reintentar.
    // Una de la regla anterior que el servidor cerró sin mover stock (`cerrada_regla_anterior`)
    // tiene su propio toast.
    const resolverDiscrepancia = useCallback(async (
        id: number,
        estado: 'resuelta' | 'descartada',
        resolucion: string,
        unidad?: string | null,
    ): Promise<ResolverDiscrepanciaRespuesta> => {
        const nota = resolucion.trim();
        try {
            const body = nota ? { estado, resolucion: nota } : { estado };
            const res = await api.put<{ data?: Record<string, unknown> }>(
                `/transferencias/discrepancias/${id}/resolver`, body
            );
            const raw = res.data?.data ?? {};
            // Contrato: { id, estado, resolucion, ajustes, aviso }; si solo trae ajuste_stock, se lee de ahí.
            const deColumna = 'ajustes' in raw ? null : parseAjusteStock(raw.ajuste_stock);
            const avisoRaw = deColumna ? deColumna.aviso : raw.aviso;
            const data: ResolverDiscrepanciaResultado = {
                id: Number(raw.id ?? id),
                estado,
                resolucion: typeof raw.resolucion === 'string' ? raw.resolucion : nota,
                ajustes: deColumna ? deColumna.ajustes : normalizarAjustes(raw.ajustes),
                aviso: typeof avisoRaw === 'string' && avisoRaw.trim() ? avisoRaw.trim() : null,
                cerrada_regla_anterior: esVerdadero(raw.cerrada_regla_anterior),
            };
            const t = mensajeResultadoResolver(data, unidad);
            const opciones = {
                ...(t.descripcion ? { description: t.descripcion } : {}),
                ...(t.duracion ? conDuracion(t.duracion) : {}),
            };
            if (t.tipo === 'warning') toast.warning(t.titulo, opciones);
            else toast.success(t.titulo, opciones);
            return { ok: true, data };
        } catch (err) {
            const error = leerErrorApi(err, 'Error al actualizar la diferencia');
            if (toastSiYaCerrada(error, 'resolver', 'confirmar')) return { ok: false, error };
            if (esReintentar(error)) {
                toast.warning(error.message, { description: TEXTO_REINTENTAR, ...conDuracion(10000) });
                return { ok: false, error };
            }
            if (error.status !== undefined && ESTADOS_ERROR_EN_MODAL.includes(error.status)) {
                console.error(err);
            } else {
                showApiError(err, 'Error al actualizar la diferencia');
            }
            return { ok: false, error };
        }
    }, []);

    // Rehacer una diferencia de la REGLA ANTERIOR (solo Super Administrador): deja el stock como si
    // hubiera llegado lo enviado y la reabre como pendiente. `simular` = solo el plan, sin escribir.
    // 400/403/409 se muestran dentro del modal del plan; 404 / 409 YA_REGLA_NUEVA (otra persona ya la
    // rehízo o la borró) van a toast informativo y el modal se cierra.
    const rehacerDiscrepancia = useCallback(async (
        id: number,
        simular: boolean,
        respaldo: RespaldoRehacer = {},
    ): Promise<RehacerDiscrepanciaRespuesta> => {
        try {
            const res = await api.post<{ data?: Record<string, unknown> }>(
                `/transferencias/discrepancias/${id}/rehacer${simular ? '?simular=1' : ''}`
            );
            const data = normalizarPlanRehacer(res.data?.data ?? {}, { id, ...respaldo });
            if (!simular) {
                const resumen = data.ajustes.length ? resumenAjustes(data.ajustes, respaldo.unidad) : 'Sin cambios de stock';
                toast.success('Diferencia rehecha: volvió a Pendientes', {
                    description: data.aviso ? `${resumen}. ${data.aviso}` : resumen,
                    ...conDuracion(data.aviso ? 12000 : 6000),
                });
            }
            return { ok: true, data };
        } catch (err) {
            const error = leerErrorApi(err, 'Error al rehacer la diferencia');
            if (toastSiYaCerrada(error, 'rehacer', simular ? 'simular' : 'confirmar')) return { ok: false, error };
            if (esReintentar(error)) {
                toast.warning(error.message, { description: TEXTO_REINTENTAR, ...conDuracion(10000) });
                return { ok: false, error };
            }
            if (error.status !== undefined && [400, 403, 409].includes(error.status)) {
                console.error(err);
            } else {
                showApiError(err, 'Error al rehacer la diferencia');
            }
            return { ok: false, error };
        }
    }, []);

    // Hard delete de una diferencia: la saca del historial (sin tocar la
    // transferencia ni el stock). Gateado por inventario.transferencias.eliminar.
    const eliminarDiscrepancia = useCallback(async (id: number) => {
        try {
            await api.delete(`/transferencias/discrepancias/${id}`);
            toast.success('Diferencia eliminada');
            return true;
        } catch (err) {
            showApiError(err, 'Error al eliminar la diferencia');
            return false;
        }
    }, []);

    const fetchStockPorItems = useCallback(async (itemIds: number[]): Promise<Record<number, { type: string; id: number; nombre: string; cantidad: number }[]>> => {
        try {
            const res = await api.post<{ data: Record<number, { type: string; id: number; nombre: string; cantidad: number }[]> }>('/inventario/stock-por-items', { item_ids: itemIds });
            return res.data.data;
        } catch {
            return {};
        }
    }, []);

    // Solicitantes que han creado transferencias (para el filtro por usuario del panel).
    const fetchSolicitantes = useCallback(async (): Promise<{ id: number; nombre: string }[]> => {
        try {
            const res = await api.get<{ data: { id: number; nombre: string }[] }>('/transferencias/solicitantes');
            return res.data.data;
        } catch {
            return [];
        }
    }, []);

    return {
        transferencias, selected, loading, total,
        discrepancias, selectedDiscrepancia, setSelectedDiscrepancia,
        fetchAll, fetchById, crear, solicitudMateriales, pushDirecto, intraBodega, devolucion,
        intraObra, ordenGerencia,
        aprobar, crearFaltante, despachar, recibir, uploadFotoRecepcion, fetchRecepciones, rechazar, rechazarRecepcion, cancelar, eliminar,
        fetchDiscrepancias, simularResolucionDiscrepancia, resolverDiscrepancia, rehacerDiscrepancia, eliminarDiscrepancia,
        fetchStockPorItems, fetchSolicitantes, setSelected
    };
}
