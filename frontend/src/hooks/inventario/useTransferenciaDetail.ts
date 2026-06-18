import { useState, useEffect } from 'react';
import type {
    Transferencia, TransferenciaItem, ApprovalItemState, TransferenciaRecepcion,
} from '../../types/entities';
import type { FaltanteItemRow } from '../../components/inventario/FaltanteDecisionModal';

/** Ubicación de stock disponible para un ítem (origen al aprobar). */
export interface StockLocation {
    type: string;
    id: number;
    nombre: string;
    cantidad: number;
    /** Solo aplica cuando type === 'bodega' (mig 060). */
    responsable_nombre?: string | null;
}

export interface UseTransferenciaDetailParams {
    t: Transferencia;
    items: TransferenciaItem[];
    userId: number;
    hasPermission: (p: string) => boolean;
    onFetchStock: (itemIds: number[]) => Promise<Record<number, StockLocation[]>>;
    onFetchRecepciones?: (id: number) => Promise<TransferenciaRecepcion[]>;
    onRechazarRecepcion?: (motivo: string) => Promise<boolean>;
}

/**
 * Orquesta el ESTADO, los EFECTOS y las derivaciones de permisos/SoD del detalle
 * de transferencia. Extraído de TransferenciaDetail.tsx (refactor Fase 1) para
 * sacar la lógica del monolito SIN cambiar comportamiento — la vista (JSX) y los
 * handlers siguen en el componente y consumen lo que retorna este hook.
 */
export function useTransferenciaDetail({
    t, items, userId, hasPermission, onFetchStock, onFetchRecepciones, onRechazarRecepcion,
}: UseTransferenciaDetailParams) {
    // ── Action permissions + SoD identity checks ──
    // SoD: solicitante ≠ aprobador ≠ transportista ≠ receptor. UI oculta el
    // botón cuando el usuario actual tiene rol previo en la TRF. Backend valida
    // igual con 403 (defensa en profundidad). El permiso `sod_bypass` permite
    // acciones consecutivas (obras unipersonales, emergencias) — queda en audit log.
    const hasBypass = hasPermission('inventario.transferencias.sod_bypass');
    const isSolicitante = t.solicitante_id === userId;
    const isAprobador = (t as any).aprobador_id === userId;
    const isTransportista = (t as any).transportista_id === userId;

    const canAprobar =
        t.estado === 'pendiente' &&
        hasPermission('inventario.transferencias.aprobar') &&
        (!isSolicitante || hasBypass);
    const canRechazar = canAprobar;
    const canDespachar =
        t.estado === 'aprobada' &&
        hasPermission('inventario.transferencias.despachar') &&
        (!isAprobador || hasBypass);
    const canRecibir =
        (t.estado === 'en_transito' || t.estado === 'aprobada' || t.estado === 'recepcion_parcial') &&
        hasPermission('inventario.transferencias.recibir') &&
        // si estado aprobada (sin paso por despacho), bloquea si soy el aprobador
        (t.estado === 'aprobada' ? (!isAprobador || hasBypass) : (!isTransportista || hasBypass));
    // Rechazo de recepción: solo en en_transito (antes de recibir nada). Una vez
    // en recepcion_parcial el receptor ya movió stock → rechazar dejaría inventario
    // inconsistente. Para "abortar" desde parcial, usar "Recepción Total" con
    // cantidad=0 en los pendientes → cierra el flujo y genera discrepancia.
    const canRechazarRecepcion =
        t.estado === 'en_transito' &&
        hasPermission('inventario.transferencias.recibir') &&
        (!isTransportista || hasBypass) &&
        !!onRechazarRecepcion;
    // Cancelar: el solicitante siempre puede cancelar su propia TRF pendiente/aprobada.
    // Para TRF ajena se requiere permiso. Despachada (en_transito) solo con el
    // permiso especial "Cancelar en Tránsito" (o sod_bypass) — su stock ya viaja.
    const puedeCancelarBase = hasPermission('inventario.transferencias.cancelar') || isSolicitante;
    const puedeCancelarEnTransito = hasPermission('inventario.transferencias.cancelar_en_transito') || hasBypass;
    const canCancelar =
        (['pendiente', 'aprobada'].includes(t.estado) && puedeCancelarBase) ||
        (t.estado === 'en_transito' && puedeCancelarEnTransito);

    // Banners SoD: explican visualmente por qué la acción no aparece.
    const showSodBannerSolicitante =
        isSolicitante && t.estado === 'pendiente' &&
        hasPermission('inventario.transferencias.aprobar') && !hasBypass;
    const showSodBannerAprobador =
        isAprobador && t.estado === 'aprobada' &&
        hasPermission('inventario.transferencias.despachar') && !hasBypass;
    const showSodBannerTransportista =
        isTransportista && (t.estado === 'en_transito' || t.estado === 'recepcion_parcial') &&
        hasPermission('inventario.transferencias.recibir') && !hasBypass;
    // Respaldo disponible en TODO el ciclo, incl. estados terminales (rechazada/
    // cancelada) — el mensaje incluye el motivo + quién, dejando evidencia de la transición.
    const canCompartirWhatsApp = ['pendiente', 'aprobada', 'en_transito', 'recepcion_parcial', 'recibida', 'rechazada', 'cancelada'].includes(t.estado);
    const hasActions = canAprobar || canRechazar || canDespachar || canRecibir || canRechazarRecepcion || canCancelar || canCompartirWhatsApp;

    // ── Inline form states ──
    const [activeForm, setActiveForm] = useState<'aprobar' | 'rechazar' | 'rechazar_recepcion' | 'recibir' | null>(null);

    // Approval state — cada ítem puede tener N splits (multi-origen).
    const [stockData, setStockData] = useState<Record<number, StockLocation[]>>({});
    const [stockLoading, setStockLoading] = useState(false);
    const [approvalItems, setApprovalItems] = useState<ApprovalItemState[]>([]);
    const [faltanteModal, setFaltanteModal] = useState<{
        isOpen: boolean;
        loading: boolean;
        faltantes: FaltanteItemRow[];
    }>({ isOpen: false, loading: false, faltantes: [] });

    // Receive state — cantidad_recibida = "cantidad de ESTE viaje". Para parciales
    // el default es lo PENDIENTE (enviada - recibida_acumulada).
    const [receiveItems, setReceiveItems] = useState<{ item_id: number; cantidad_recibida: number; correcto: boolean; observacion: string }[]>([]);

    // Historial de eventos de recepción (parciales + total).
    const [recepciones, setRecepciones] = useState<TransferenciaRecepcion[]>([]);
    const [historialOpen, setHistorialOpen] = useState(false);

    // Cierre final con merma (checkbox "última entrega" + modal defensivo).
    const [cierreFinal, setCierreFinal] = useState(false);
    const [confirmMermaOpen, setConfirmMermaOpen] = useState(false);

    // Reject state
    const [rejectMotivo, setRejectMotivo] = useState('');

    // Helpers: cantidad ya recibida acumulada + pendiente por viaje.
    // Number() defensivo: mysql2 puede devolver DECIMAL como string.
    const recibidaPrevia = (item: TransferenciaItem) => Number(item.cantidad_recibida) || 0;
    const pendientePorItem = (item: TransferenciaItem) =>
        (Number(item.cantidad_enviada) || Number(item.cantidad_solicitada)) - recibidaPrevia(item);

    // Reset forms when transferencia changes.
    useEffect(() => {
        setActiveForm(null);
        setStockData({});
        setApprovalItems(items.map(i => ({
            item_id: i.item_id,
            cantidad_solicitada: i.cantidad_solicitada,
            splits: [],
        })));
        // Default cantidad este viaje = pendiente (lo que aún no ha llegado).
        setReceiveItems(items.map(i => ({
            item_id: i.item_id,
            cantidad_recibida: pendientePorItem(i),
            correcto: true,
            observacion: '',
        })));
        setRejectMotivo('');
        setRecepciones([]);
        setHistorialOpen(false);
        setCierreFinal(false);
        setConfirmMermaOpen(false);
        // Sin esto, el modal de faltante quedaba "abierto" en el estado del hook y
        // reaparecía con datos viejos al abrir la aprobación de otra TRF.
        setFaltanteModal({ isOpen: false, loading: false, faltantes: [] });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [t.id]);

    // Cargar historial de recepciones cuando la TRF tiene eventos previos.
    useEffect(() => {
        if (!onFetchRecepciones) return;
        if (t.estado !== 'recepcion_parcial' && t.estado !== 'recibida') return;
        let cancelled = false;
        onFetchRecepciones(t.id).then(rows => {
            if (cancelled) return;
            setRecepciones(rows);
            // Default open si hay 1+ viajes previos — info contextual al receptor.
            if (rows.length > 0) setHistorialOpen(true);
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [t.id, t.estado, activeForm]);

    // Load stock when approval form opens
    useEffect(() => {
        if (activeForm === 'aprobar' && items.length > 0) {
            setStockLoading(true);
            onFetchStock(items.map(i => i.item_id)).then(data => {
                setStockData(data);
                setStockLoading(false);
            });
        }
    }, [activeForm]);

    return {
        // estado de formularios
        activeForm, setActiveForm,
        stockData, stockLoading,
        approvalItems, setApprovalItems,
        faltanteModal, setFaltanteModal,
        receiveItems, setReceiveItems,
        recepciones,
        historialOpen, setHistorialOpen,
        cierreFinal, setCierreFinal,
        confirmMermaOpen, setConfirmMermaOpen,
        rejectMotivo, setRejectMotivo,
        // permisos / SoD
        canAprobar, canRechazar, canDespachar, canRecibir, canRechazarRecepcion, canCancelar,
        canCompartirWhatsApp, hasActions,
        showSodBannerSolicitante, showSodBannerAprobador, showSodBannerTransportista,
        // helpers puros
        pendientePorItem,
    };
}
