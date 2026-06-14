import React, { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { cn } from '../../utils/cn';
import {
    ChevronLeft, FileText, CheckCircle2, PackageCheck, PackageOpen,
    XCircle, Ban, AlertTriangle, MessageSquare, Users,
    MapPin, Package, Check, X as XIcon, Zap, Split, Plus, Minus, Trash2, Warehouse, Send,
    ShoppingBag, Info, History, ChevronDown, ChevronUp,
} from 'lucide-react';
import { estadoConfig, tipoFlujoConfig } from './TransferenciasList';
import TransferenciaActionsMenu from './TransferenciaActionsMenu';
import type { Transferencia, TransferenciaItem, ApprovalItemState, ApprovalSplit, TransferenciaRecepcion } from '../../types/entities';
import { useItemDetail } from '../../hooks/inventario/useItemDetail';
import ItemDetailModal from './ItemDetailModal';
import FaltanteDecisionModal from './FaltanteDecisionModal';
import { Modal } from '../ui/Modal';
import { fmtFecha, fmtFechaHora } from '../../utils/fechas';
import { formatBodegaNombreResponsable } from '../../utils/formatBodega';
import { prepareAndShareWithToast } from '../../utils/whatsappShare';
import { buildTransferenciaWhatsappText } from '../../utils/transferenciaWhatsApp';
import { showConfirmToast } from '../../utils/toastUtils';
import { useTransferenciaDetail, type StockLocation } from '../../hooks/inventario/useTransferenciaDetail';
import MaterialesAprobacionPanel from './transferencia-detail/MaterialesAprobacionPanel';
import MaterialesRecepcionPanel from './transferencia-detail/MaterialesRecepcionPanel';
import { MatEmpty, MatRequestRow, DetailSection } from './transferencia-detail/MaterialesReadonly';
import { SodBanner } from './transferencia-detail/SodBanner';
import { TransferenciaTimeline } from './transferencia-detail/TransferenciaTimeline';
import { ItemsTable } from './transferencia-detail/ItemsTable';
import { RechazarForm } from './transferencia-detail/RechazarForm';
import { RecibirForm } from './transferencia-detail/RecibirForm';
import { AprobarForm } from './transferencia-detail/AprobarForm';

// ════════════════════════════════════════════════════════════════════
// Los paneles interactivos del flujo "Solicitud de Materiales" (aprobación y
// recepción) se movieron a ./transferencia-detail/ (refactor Fase 1).
// ════════════════════════════════════════════════════════════════════
// (tipos Mat* movidos junto a MaterialesAprobacionPanel)

// (MaterialesAprobacionPanel movido a ./transferencia-detail/MaterialesAprobacionPanel.tsx)

// (MaterialesRecepcionPanel movido a ./transferencia-detail/MaterialesRecepcionPanel.tsx)

// ── Helpers read-only del flujo "Solicitud de Materiales" ──
// Columna izquierda del detalle ("Lo que se pide"). Solo lectura: no edita
// nada ni participa en el payload de aprobación. Estilo fila tipo Vehículos.
// (MatEmpty, MatRequestRow y DetailSection movidos a ./transferencia-detail/MaterialesReadonly.tsx)

// StockLocation se movió a hooks/inventario/useTransferenciaDetail.ts (refactor Fase 1)
// y se importa arriba — sigue usándose en Props y en los handlers del JSX.

interface Props {
    transferencia: Transferencia;
    obras: { id: number; nombre: string }[];
    actionLoading: boolean;
    hasPermission: (p: string) => boolean;
    userId: number;
    onBack: () => void;
    onFetchStock: (itemIds: number[]) => Promise<Record<number, StockLocation[]>>;
    onAprobar: (data: {
        origen_obra_id?: number | null;
        origen_bodega_id?: number | null;
        items: Array<
            | { item_id: number; cantidad_enviada: number; origen_obra_id?: number | null; origen_bodega_id?: number | null }
            | { item_id: number; splits: { origen_obra_id: number | null; origen_bodega_id: number | null; cantidad: number }[] }
        >;
        // Solicitud de Materiales: ediciones del aprobador a ítems custom + nuevos.
        items_custom?: Array<{ id: number; descripcion?: string; unidad?: string; cantidad_aprobada?: number; aprobado?: boolean; nota_aprobador?: string; fuente?: 'comprar' | 'obra'; origen_obra_id?: number | null }>;
        items_custom_nuevos?: { descripcion: string; cantidad: number; unidad?: string; observacion?: string; fuente?: 'comprar' | 'obra'; origen_obra_id?: number | null }[];
    }) => Promise<boolean>;
    onCrearFaltante?: (transferenciaId: number) => Promise<{ id: number; codigo: string; items?: number; ya_existia?: boolean } | null>;
    onRecibir: (
        items: { item_id: number; cantidad_recibida: number; observacion?: string }[],
        tipo?: 'parcial' | 'total',
        observacion?: string
    ) => Promise<boolean>;
    /** Fetcher del historial de eventos de recepción. Inyectado por el panel padre. */
    onFetchRecepciones?: (id: number) => Promise<TransferenciaRecepcion[]>;
    onRechazar: (motivo: string) => Promise<boolean>;
    onRechazarRecepcion?: (motivo: string) => Promise<boolean>;
    onCancelar: () => Promise<boolean>;
}

// ── Timeline: 3 steps (no "Despachada") ──
// STEPS/STEP_INDEX viven ahora en ./transferencia-detail/TransferenciaTimeline.tsx

// Auditoría 4.2: usar helper centralizado de fechas (utils/fechas.ts) para formato día/mes/año.
const fmtDate = (d: string | null) => fmtFecha(d);
// fmtDateTime (con hora) se centralizó en utils/fechas.ts como fmtFechaHora;
// alias local para no tocar las llamadas existentes en el JSX.
const fmtDateTime = fmtFechaHora;

const TransferenciaDetail: React.FC<Props> = ({
    transferencia: t, obras, actionLoading, hasPermission, userId,
    onBack, onFetchStock, onAprobar, onCrearFaltante, onRecibir, onFetchRecepciones, onRechazar, onRechazarRecepcion, onCancelar,
}) => {
    const items: TransferenciaItem[] = t.items || [];
    // Items personalizados (fuera de catálogo). Schema mínimo, no comparte interfaz
    // con TransferenciaItem porque no tiene item_id ni splits.
    interface TransferenciaItemCustom {
        id: number;
        descripcion: string;
        cantidad: number;
        unidad: string | null;
        observacion: string | null;
        compra_realizada?: boolean;
        // Aprobación (migración 070): el aprobador ajusta cantidad, quita ítems,
        // corrige descripción/unidad, agrega ítems y deja nota.
        cantidad_aprobada?: number | null;
        aprobado?: boolean;
        nota_aprobador?: string | null;
        agregado_por_aprobador?: boolean;
        // Origen (migración 071): comprar | traer de otra obra (sobrante).
        fuente?: 'comprar' | 'obra';
        origen_obra_id?: number | null;
        origen_obra_nombre?: string | null;
    }
    const itemsCustom: TransferenciaItemCustom[] = (t as { items_custom?: TransferenciaItemCustom[] }).items_custom || [];
    const cfg = estadoConfig[t.estado] || estadoConfig.pendiente;
    const itemDetail = useItemDetail();
    const Icon = cfg.icon;

    const origen = t.origen_obra_nombre
        || (t.origen_bodega_nombre
            ? formatBodegaNombreResponsable(t.origen_bodega_nombre, t.origen_bodega_responsable_nombre)
            : null)
        || '—';
    const destino = t.destino_obra_nombre
        || (t.destino_bodega_nombre
            ? formatBodegaNombreResponsable(t.destino_bodega_nombre, t.destino_bodega_responsable_nombre)
            : null)
        || '—';

    // ── Estado, efectos y permisos/SoD: orquestados por el hook (refactor Fase 1) ──
    // El hook centraliza el estado de los formularios, los 3 efectos y toda la
    // lógica de permisos/SoD. La vista (abajo) consume estos valores por nombre.
    const {
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
        canAprobar, canRechazar, canRecibir, canRechazarRecepcion, canCancelar,
        canCompartirWhatsApp,
        showSodBannerSolicitante, showSodBannerAprobador, showSodBannerTransportista,
        pendientePorItem,
    } = useTransferenciaDetail({ t, items, userId, hasPermission, onFetchStock, onFetchRecepciones, onRechazarRecepcion });

    // ── WhatsApp share ──
    // Patrón replicado del módulo de asistencia (useAttendanceExport):
    //  1) Copia al portapapeles (respaldo ante mangling de URL)
    //  2) Muestra toast con botón "ENVIAR AHORA" — así window.open ocurre dentro
    //     de un user gesture fresco, evitando popup blockers en dispositivos
    //     lentos donde el gesto original se invalida tras los awaits.
    //  3) Fallback con setTimeout si todo el flujo peta.
    // Emojis construidos con String.fromCodePoint para blindar el encoding.
    const handleShareWhatsApp = async () => {
        const TOAST_ID = `wa-transfer-${t.id}`;
        const text = buildTransferenciaWhatsappText({
            t, items, itemsCustom,
            estadoLabel: cfg.label,
            origen, destino,
        });

        // Mecanismo de envío centralizado (copia al portapapeles + toast con
        // botón "ENVIAR AHORA" dentro del user-gesture + fallback). Vive en
        // utils/whatsappShare.ts y lo reusan asistencia y sábados extra.
        await prepareAndShareWithToast({
            text,
            title: `Transferencia ${t.codigo}`,
            toastId: TOAST_ID,
        });
    };

    // Confirmación antes de cancelar (acción de alto impacto: la TRF queda
    // cancelada y, si era legacy aprobada, revierte stock). Usa el toast-confirm
    // del Design System en vez de disparar onCancelar directo desde el menú.
    const handleCancelarConfirm = () => {
        showConfirmToast({
            message: `¿Cancelar la transferencia ${t.codigo}?`,
            confirmLabel: 'Sí, cancelar',
            cancelLabel: 'No',
            onConfirm: async () => { await onCancelar(); },
        });
    };

    // Menú de acciones — UNA sola fuente (antes duplicado en los 2 layouts, origen
    // del bug de Cancelar). El guard `!activeForm` se aplica por-layout (catálogo
    // lo oculta con forms inline; materiales lo deja visible bajo el modal).
    const actionsMenu = (
        <TransferenciaActionsMenu
            canAprobar={canAprobar}
            canRechazar={canRechazar}
            canRecibir={canRecibir}
            canRechazarRecepcion={canRechazarRecepcion}
            canCancelar={canCancelar}
            canCompartirWhatsApp={canCompartirWhatsApp}
            actionLoading={actionLoading}
            onAprobar={() => setActiveForm('aprobar')}
            onRechazar={() => setActiveForm('rechazar')}
            onRecibir={() => setActiveForm('recibir')}
            onRechazarRecepcion={() => setActiveForm('rechazar_recepcion')}
            onCancelar={handleCancelarConfirm}
            onWhatsApp={handleShareWhatsApp}
            isPendiente={t.estado === 'pendiente'}
        />
    );

    // ── Inline form states ──
    // (Estado de formularios, helpers de recepción y los 3 efectos se movieron al
    //  hook useTransferenciaDetail — ver el destructure de arriba. Refactor Fase 1.)

    // ── Timeline ──
    // estado/stepper → <TransferenciaTimeline> (computa activeStep/terminada internamente)

    // Nota: `correcto` y `observacion` del state se mantienen en el shape por
    // back-compat con onRecibir(), pero ya no se exponen en UI tras el rediseño
    // V2. Toda discrepancia se infiere de la diferencia entre enviada y recibida.

    // Flujo "Solicitud de Materiales" (ítems custom, sin catálogo) usa el layout
    // de dos columnas (izq = lo que se pide, der = acciones). El catálogo
    // (items.length > 0) se mantiene 1:1 con renderCatalogo().
    const isMateriales = items.length === 0;

    const renderCatalogo = () => (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto p-3 md:p-6">
            {/* Mobile back */}
            <button onClick={onBack} className="md:hidden flex items-center gap-1 mb-3 text-xs text-muted-foreground hover:text-brand-dark transition-colors shrink-0">
                <ChevronLeft className="h-4 w-4" /> Volver
            </button>

            {/* ── Header — chip estado + menú "Acciones ▾" ── */}
            <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-black text-brand-dark tracking-tight">{t.codigo}</h2>
                        {t.tipo_flujo && t.tipo_flujo !== 'solicitud' && (
                            <span className={cn("text-caption font-bold px-1.5 py-0.5 rounded-md border", (tipoFlujoConfig[t.tipo_flujo] || tipoFlujoConfig.solicitud).color)}>
                                {(tipoFlujoConfig[t.tipo_flujo] || tipoFlujoConfig.solicitud).label}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <span className="font-medium">{origen}</span>
                        <span>→</span>
                        <span className="font-medium">{destino}</span>
                    </div>
                    {t.motivo && (
                        <div className="text-label text-muted-foreground mt-1 italic">
                            Motivo: {t.motivo}
                        </div>
                    )}
                </div>
                <div className="flex items-start gap-2 shrink-0">
                    <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold shrink-0", cfg.color)}>
                        <Icon className="h-3.5 w-3.5" />
                        {cfg.label}
                    </div>
                    {!activeForm && actionsMenu}
                </div>
            </div>

            {/* ── Timeline Stepper (3 steps) ── */}
            <div className="shrink-0 mb-5">
                <TransferenciaTimeline
                    estado={t.estado}
                    observacionesRechazo={t.observaciones_rechazo}
                />
            </div>

            {/* ── Items Table ── */}
            <ItemsTable items={items} onOpenItem={itemDetail.openItem} />

            {/* ── Historial de recepciones (parciales + total) ──
                Solo se muestra si hubo al menos 1 evento. Permite al receptor
                ver cuándo y qué llegó en viajes anteriores antes de registrar
                el siguiente. Datos vienen del endpoint GET /:id/recepciones. */}
            {recepciones.length > 0 && (
                <div className="shrink-0 mb-5">
                    <button
                        type="button"
                        onClick={() => setHistorialOpen(o => !o)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-muted/60 hover:bg-muted border border-border rounded-xl transition-all"
                    >
                        <h4 className="text-xs font-bold text-brand-dark flex items-center gap-1.5">
                            <History className="h-3.5 w-3.5" />
                            Historial de recepciones ({recepciones.length})
                        </h4>
                        {historialOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    {historialOpen && (
                        <div className="mt-2 space-y-2">
                            {recepciones.map((rec, idx) => (
                                <div
                                    key={rec.id}
                                    className="border border-border rounded-xl p-3 bg-muted/40"
                                >
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-caption font-bold text-muted-foreground">#{idx + 1}</span>
                                            <span className="text-caption font-bold px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground">
                                                {rec.tipo === 'total' ? 'Total · cierre' : 'Parcial'}
                                            </span>
                                            <span className="text-caption text-muted-foreground">{fmtDateTime(rec.fecha_recepcion)}</span>
                                        </div>
                                        <span className="text-caption text-muted-foreground">
                                            por <strong className="text-brand-dark">{rec.receptor_nombre || `Usuario #${rec.receptor_id}`}</strong>
                                        </span>
                                    </div>
                                    <ul className="space-y-0.5 ml-2">
                                        {rec.items.map(ri => (
                                            <li key={ri.id} className="text-label flex justify-between">
                                                <span className="text-brand-dark">
                                                    <span className="font-semibold">{Number(ri.cantidad_recibida)}</span>
                                                    {ri.unidad ? <span className="text-muted-foreground"> {ri.unidad}</span> : null}
                                                    <span className="text-muted-foreground"> · {ri.item_descripcion || `Item #${ri.item_id}`}</span>
                                                </span>
                                                {ri.observacion && (
                                                    <span className="text-caption text-muted-foreground italic ml-2">{ri.observacion}</span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Items Personalizados (a comprar) ── */}
            {itemsCustom.length > 0 && (
                <div className="shrink-0 mb-5">
                    <h4 className="text-xs font-bold text-brand-dark mb-2 flex items-center gap-1.5">
                        <ShoppingBag className="h-3.5 w-3.5" />
                        Items personalizados ({itemsCustom.length})
                    </h4>
                    <div className="border border-border rounded-xl overflow-hidden bg-muted/30">
                        <table className="w-full text-label">
                            <thead>
                                <tr className="bg-muted">
                                    <th className="text-left px-3 py-2 font-bold text-brand-dark">Descripción</th>
                                    <th className="text-center px-2 py-2 font-bold text-brand-dark w-20">Cantidad</th>
                                    <th className="text-left px-2 py-2 font-bold text-brand-dark w-24">Unidad</th>
                                </tr>
                            </thead>
                            <tbody>
                                {itemsCustom.map((it, idx) => {
                                    const rechazado = it.aprobado === false;
                                    const ajustada = it.cantidad_aprobada != null && Number(it.cantidad_aprobada) !== Number(it.cantidad);
                                    return (
                                        <tr key={it.id || idx} className={cn(idx % 2 === 0 ? "bg-card" : "bg-muted/40", rechazado && "opacity-50")}>
                                            <td className="px-3 py-1.5 font-medium text-brand-dark">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className={cn(rechazado && "line-through")}>{it.descripcion}</span>
                                                    {it.agregado_por_aprobador && (
                                                        <span className="px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-green-700 dark:text-green-300 text-micro font-bold uppercase">+ aprobador</span>
                                                    )}
                                                    {rechazado && (
                                                        <span className="px-1.5 py-0.5 rounded-full bg-destructive/10 text-red-700 dark:text-red-300 text-micro font-bold uppercase">No se compra</span>
                                                    )}
                                                    {/* La fuente la decide el aprobador → solo mostrar el chip cuando ya
                                                        está decidida (no en 'pendiente', donde 'comprar' es solo el default). */}
                                                    {t.estado !== 'pendiente' && !rechazado && it.fuente === 'obra' && (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-green-700 dark:text-green-300 text-micro font-bold"><MapPin className="h-2.5 w-2.5" /> Traer de {it.origen_obra_nombre || 'otra obra'}</span>
                                                    )}
                                                    {t.estado !== 'pendiente' && !rechazado && it.fuente !== 'obra' && (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border text-micro font-bold"><ShoppingBag className="h-2.5 w-2.5" /> Comprar</span>
                                                    )}
                                                </div>
                                                {it.observacion && (
                                                    <div className="text-caption text-muted-foreground italic mt-0.5">{it.observacion}</div>
                                                )}
                                                {it.nota_aprobador && (
                                                    <div className="text-caption text-muted-foreground mt-0.5 inline-flex items-center gap-1"><MessageSquare className="h-2.5 w-2.5 shrink-0" /> {it.nota_aprobador}</div>
                                                )}
                                            </td>
                                            <td className="px-2 py-1.5 text-center font-semibold">
                                                {ajustada ? (
                                                    <span><span className="line-through text-muted-foreground/60 mr-1">{Number(it.cantidad)}</span><span className="text-foreground">{Number(it.cantidad_aprobada)}</span></span>
                                                ) : (
                                                    <span className={cn(rechazado && "line-through text-muted-foreground")}>{Number(it.cantidad_aprobada != null ? it.cantidad_aprobada : it.cantidad)}</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-1.5 text-left text-muted-foreground">{it.unidad || '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Info ── */}
            <div className="shrink-0 mb-5 space-y-2">
                {t.observaciones && (
                    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                        <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{t.observaciones}</span>
                    </div>
                )}
                {Boolean(t.requiere_pionetas) && (
                    <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-3 py-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>Requiere {t.cantidad_pionetas || ''} pionetas</span>
                    </div>
                )}
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                    <Users className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                        <p>Solicitante: <span className="font-medium text-brand-dark">{t.solicitante_nombre || '—'}</span> · {fmtDateTime(t.fecha_solicitud)}</p>
                        {t.fecha_aprobacion && <p>Aprobador: <span className="font-medium text-brand-dark">{t.aprobador_nombre || '—'}</span> · {fmtDate(t.fecha_aprobacion)}</p>}
                        {t.fecha_recepcion && (
                            <p>Recepción: {fmtDate(t.fecha_recepcion)}
                                {t.receptor_nombre ? <> · por <span className="font-medium text-brand-dark">{t.receptor_nombre}</span></> : null}
                                {recepciones.length > 0 && <span className="text-green-700 dark:text-green-300 font-semibold"> · {recepciones.length} viaje{recepciones.length !== 1 ? 's' : ''}</span>}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── SoD Banner: explica por qué el botón de acción no aparece ── */}
            {!activeForm && (
                <SodBanner
                    solicitante={showSodBannerSolicitante}
                    aprobador={showSodBannerAprobador}
                    transportista={showSodBannerTransportista}
                    className="shrink-0 mb-3"
                />
            )}


            {/* ════════════════════════════════════════════════
                ── APPROVAL FORM — splits multi-origen + quick-fix ──
               ════════════════════════════════════════════════ */}
            {activeForm === 'aprobar' && items.length === 0 && (
                <MaterialesAprobacionPanel
                    items={itemsCustom}
                    obras={obras}
                    loading={actionLoading}
                    onConfirm={async (edits, nuevos) => {
                        const ok = await onAprobar({ items: [], items_custom: edits, items_custom_nuevos: nuevos });
                        if (ok) setActiveForm(null);
                    }}
                    onCancel={() => setActiveForm(null)}
                />
            )}
            {activeForm === 'aprobar' && items.length > 0 && (
                <AprobarForm
                    items={items}
                    stockData={stockData}
                    stockLoading={stockLoading}
                    approvalItems={approvalItems}
                    setApprovalItems={setApprovalItems}
                    faltanteModal={faltanteModal}
                    setFaltanteModal={setFaltanteModal}
                    onAprobar={onAprobar}
                    onCrearFaltante={onCrearFaltante}
                    transferenciaId={t.id}
                    loading={actionLoading}
                    onClose={() => setActiveForm(null)}
                    onOpenItem={itemDetail.openItem}
                />
            )}

            {/* ════════════════════════════════════
                ── REJECT FORM ──
               ════════════════════════════════════ */}
            {activeForm === 'rechazar' && (
                <div className="shrink-0 border border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/20 rounded-xl p-4 mb-4 space-y-3">
                    <h4 className="text-sm font-bold text-red-800 dark:text-red-300 flex items-center gap-1.5">
                        <XCircle className="h-4 w-4" /> Rechazar Transferencia
                    </h4>
                    <RechazarForm
                        value={rejectMotivo}
                        onChange={setRejectMotivo}
                        onConfirm={async () => {
                            if (!rejectMotivo.trim()) return;
                            const ok = await onRechazar(rejectMotivo);
                            if (ok) setActiveForm(null);
                        }}
                        onCancel={() => setActiveForm(null)}
                        loading={actionLoading}
                        confirmLabel="Confirmar Rechazo"
                        compact
                    />
                </div>
            )}

            {/* ════════════════════════════════════
                ── REJECT RECEPTION FORM ──
               ════════════════════════════════════ */}
            {activeForm === 'rechazar_recepcion' && (
                <div className="shrink-0 border border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/20 rounded-xl p-4 mb-4 space-y-3">
                    <h4 className="text-sm font-bold text-red-800 dark:text-red-300 flex items-center gap-1.5">
                        <XCircle className="h-4 w-4" /> Rechazar Recepción
                    </h4>
                    <RechazarForm
                        value={rejectMotivo}
                        onChange={setRejectMotivo}
                        onConfirm={async () => {
                            if (!rejectMotivo.trim() || !onRechazarRecepcion) return;
                            const ok = await onRechazarRecepcion(rejectMotivo);
                            if (ok) setActiveForm(null);
                        }}
                        onCancel={() => setActiveForm(null)}
                        loading={actionLoading}
                        confirmLabel="Confirmar Rechazo de Recepción"
                        placeholder="Motivo del rechazo de recepción..."
                        description='Rechaza físicamente el material recibido. La transferencia pasa a "rechazada" y el stock no se actualiza.'
                        compact
                    />
                </div>
            )}

            {/* ════════════════════════════════════════════
                ── RECEIVE FORM — parcial vs total ──
                Por ítem: Enviada total / Recibida previa (de viajes anteriores)
                / Pendiente (lo que aún falta llegar). El usuario ingresa cuánto
                trajo ESTE viaje. Dos botones:
                  · Recepción Parcial → estado recepcion_parcial, más viajes vendrán.
                  · Recepción Total   → estado recibida, cierra el flujo, gaps =
                    discrepancia.
               ════════════════════════════════════════════ */}
            {activeForm === 'recibir' && items.length === 0 && (
                <MaterialesRecepcionPanel
                    loading={actionLoading}
                    yaIniciada={t.estado === 'recepcion_parcial'}
                    onConfirm={async (obs, tipo) => {
                        const ok = await onRecibir([], tipo, obs);
                        if (ok) setActiveForm(null);
                    }}
                    onCancel={() => setActiveForm(null)}
                />
            )}
            {activeForm === 'recibir' && items.length > 0 && (
                <RecibirForm
                    items={items}
                    receiveItems={receiveItems}
                    setReceiveItems={setReceiveItems}
                    cierreFinal={cierreFinal}
                    setCierreFinal={setCierreFinal}
                    confirmMermaOpen={confirmMermaOpen}
                    setConfirmMermaOpen={setConfirmMermaOpen}
                    pendientePorItem={pendientePorItem}
                    onRecibir={onRecibir}
                    loading={actionLoading}
                    onClose={() => setActiveForm(null)}
                    onOpenItem={itemDetail.openItem}
                />
            )}

        </div>
    );

    // ── Layout dos columnas (solo flujo Solicitud de Materiales) ──
    // IZQUIERDA = "Lo que se pide" (solo lectura). DERECHA = acciones.
    // Responsive: apila vertical < xl (botones grandes a ancho completo);
    // lado a lado en xl (≥1280px). Móvil mantiene el toggle lista↔detalle
    // del panel padre + el botón "Volver".
    const renderMateriales = () => (
        <div className="flex flex-col flex-1 min-h-0 p-3 md:p-6 overflow-hidden">
            {/* Header con chip estado + menú "Acciones ▾" */}
            <div className="flex items-center gap-3 mb-4 shrink-0">
                <button onClick={onBack} className="md:hidden p-2 rounded-xl hover:bg-muted text-muted-foreground">
                    <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="flex-1 min-w-0">
                    <p className="text-caption uppercase font-black text-muted-foreground tracking-widest">Detalle solicitud</p>
                    <h4 className="text-base font-black text-brand-dark truncate">{t.codigo}</h4>
                    <p className="text-label text-muted-foreground truncate">{origen} → {destino}</p>
                </div>
                <span className={cn("hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-label font-bold shrink-0", cfg.color)}>
                    <Icon className="h-3 w-3" /> {cfg.label}
                </span>
                {actionsMenu}
                <button onClick={onBack} className="hidden md:flex p-1.5 rounded-full hover:bg-muted text-muted-foreground shrink-0">
                    <XIcon className="h-4 w-4" />
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-5">
                {/* Estado: stepper o banner terminado */}
                <TransferenciaTimeline
                    estado={t.estado}
                    observacionesRechazo={t.observaciones_rechazo}
                    noun="Solicitud"
                    compact
                />

                {/* SoD banner */}
                <SodBanner
                    solicitante={showSodBannerSolicitante}
                    aprobador={showSodBannerAprobador}
                    transportista={showSodBannerTransportista}
                />

                {/* Materiales pedidos (solo lectura) */}
                <DetailSection icon={<ShoppingBag className="h-3.5 w-3.5" />} title={`Materiales pedidos (${itemsCustom.length})`}>
                    {itemsCustom.length === 0
                        ? <MatEmpty>Sin materiales en esta solicitud</MatEmpty>
                        : itemsCustom.map((it, idx) => <MatRequestRow key={it.id || idx} it={it} estado={t.estado} />)}
                </DetailSection>

                {/* Historial de entregas — un bloque por cada viaje, con su receptor.
                    Útil cuando la solicitud se entrega en múltiples viajes (parciales):
                    deja registro de quién recibió y qué llegó en cada instancia. */}
                {recepciones.length > 0 && (
                    <DetailSection icon={<History className="h-3.5 w-3.5" />} title={`Historial de entregas (${recepciones.length})`}>
                        {recepciones.map((rec, idx) => (
                            <div key={rec.id} className="p-3 rounded-xl bg-muted/40 border border-border">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-caption font-bold text-muted-foreground">Viaje #{idx + 1}</span>
                                        <span className="text-micro font-bold px-1.5 py-0.5 rounded-full border border-border bg-muted text-muted-foreground leading-none">
                                            {rec.tipo === 'total' ? 'Total · cierre' : 'Parcial'}
                                        </span>
                                    </div>
                                    <span className="text-caption text-muted-foreground">{fmtDateTime(rec.fecha_recepcion)}</span>
                                </div>
                                <p className="text-label text-muted-foreground mt-1">
                                    Recibido por <span className="font-semibold text-brand-dark">{rec.receptor_nombre || `Usuario #${rec.receptor_id}`}</span>
                                </p>
                                {rec.items && rec.items.length > 0 && (
                                    <ul className="mt-1 space-y-0.5 ml-1">
                                        {rec.items.map(ri => (
                                            <li key={ri.id} className="text-caption text-muted-foreground">
                                                <span className="font-semibold text-brand-dark">{Number(ri.cantidad_recibida)}</span>
                                                {ri.unidad ? ` ${ri.unidad}` : ''} · {ri.item_descripcion || `Item #${ri.item_id}`}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </DetailSection>
                )}

                {/* Información */}
                <DetailSection icon={<Users className="h-3.5 w-3.5" />} title="Información">
                    {t.motivo && (
                        <div className="text-xs text-muted-foreground"><span className="font-semibold text-brand-dark">Motivo:</span> {t.motivo}</div>
                    )}
                    {t.observaciones && (
                        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                            <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>{t.observaciones}</span>
                        </div>
                    )}
                    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                        <Users className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <div className="space-y-0.5">
                            <p>Solicitante: <span className="font-medium text-brand-dark">{t.solicitante_nombre || '—'}</span> · {fmtDateTime(t.fecha_solicitud)}</p>
                            {t.fecha_aprobacion && <p>Aprobador: <span className="font-medium text-brand-dark">{t.aprobador_nombre || '—'}</span> · {fmtDate(t.fecha_aprobacion)}</p>}
                            {t.fecha_recepcion && (
                                <p>Recepción: {fmtDate(t.fecha_recepcion)}
                                    {t.receptor_nombre ? <> · por <span className="font-medium text-brand-dark">{t.receptor_nombre}</span></> : null}
                                    {recepciones.length > 0 && <span className="text-green-700 dark:text-green-300 font-semibold"> · {recepciones.length} viaje{recepciones.length !== 1 ? 's' : ''}</span>}
                                </p>
                            )}
                        </div>
                    </div>
                </DetailSection>
            </div>

            {/* ── MODALES (solo flujo materiales) ── */}
            <Modal isOpen={activeForm === 'aprobar'} onClose={() => setActiveForm(null)} title="Revisar y aprobar materiales" size="lg">
                <MaterialesAprobacionPanel
                    embedded
                    items={itemsCustom}
                    obras={obras}
                    loading={actionLoading}
                    onConfirm={async (edits, nuevos) => {
                        const ok = await onAprobar({ items: [], items_custom: edits, items_custom_nuevos: nuevos });
                        if (ok) setActiveForm(null);
                    }}
                    onCancel={() => setActiveForm(null)}
                />
            </Modal>

            <Modal isOpen={activeForm === 'recibir'} onClose={() => setActiveForm(null)} title={t.estado === 'recepcion_parcial' ? 'Registrar otro viaje' : 'Registrar entrega'} size="md">
                <MaterialesRecepcionPanel
                    embedded
                    loading={actionLoading}
                    yaIniciada={t.estado === 'recepcion_parcial'}
                    onConfirm={async (obs, tipo) => {
                        const ok = await onRecibir([], tipo, obs);
                        if (ok) setActiveForm(null);
                    }}
                    onCancel={() => setActiveForm(null)}
                />
            </Modal>

            <Modal isOpen={activeForm === 'rechazar'} onClose={() => setActiveForm(null)} title="Rechazar solicitud" size="sm">
                <div className="space-y-3">
                    <RechazarForm
                        value={rejectMotivo}
                        onChange={setRejectMotivo}
                        onConfirm={async () => {
                            if (!rejectMotivo.trim()) return;
                            const ok = await onRechazar(rejectMotivo);
                            if (ok) setActiveForm(null);
                        }}
                        onCancel={() => setActiveForm(null)}
                        loading={actionLoading}
                        confirmLabel="Confirmar Rechazo"
                    />
                </div>
            </Modal>

            <Modal isOpen={activeForm === 'rechazar_recepcion'} onClose={() => setActiveForm(null)} title="Rechazar recepción" size="sm">
                <div className="space-y-3">
                    <RechazarForm
                        value={rejectMotivo}
                        onChange={setRejectMotivo}
                        onConfirm={async () => {
                            if (!rejectMotivo.trim() || !onRechazarRecepcion) return;
                            const ok = await onRechazarRecepcion(rejectMotivo);
                            if (ok) setActiveForm(null);
                        }}
                        onCancel={() => setActiveForm(null)}
                        loading={actionLoading}
                        confirmLabel="Confirmar Rechazo"
                        placeholder="Motivo del rechazo de recepción..."
                        description='Rechaza físicamente el material recibido. La solicitud pasa a "rechazada" y el stock no se actualiza.'
                    />
                </div>
            </Modal>
        </div>
    );

    return (
        <>
            {isMateriales ? renderMateriales() : renderCatalogo()}

            {/* Item Detail Modal — compartido por ambos flujos */}
            <ItemDetailModal
                isOpen={!!itemDetail.selectedItemId}
                onClose={itemDetail.closeItem}
                itemData={itemDetail.itemData}
                stockLocations={itemDetail.stockLocations}
                loading={itemDetail.loading}
                stockLoading={itemDetail.stockLoading}
            />
        </>
    );
};

export default TransferenciaDetail;
