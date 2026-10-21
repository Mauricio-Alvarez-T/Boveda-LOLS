import React, { useState } from 'react';
import {
    ArrowLeft, ArrowRight, ArrowDown, ArrowUp, AlertTriangle, Check, XCircle, Clock,
    CheckCircle2, Ban, Package, MapPin, Warehouse, User, Calendar, FileText, Trash2, Info
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import type { CausaDiscrepancia, TransferenciaConDiscrepancias, TransferenciaDiscrepanciaItem } from '../../types/entities';
import type { ResolverDiscrepanciaRespuesta } from '../../hooks/inventario/useTransferencias';
import { useItemDetail } from '../../hooks/inventario/useItemDetail';
import ItemDetailModal from './ItemDetailModal';
import { formatBodegaNombreResponsable } from '../../utils/formatBodega';
import { showDeleteToast } from '../../utils/toastUtils';
import {
    AVISO_REGIMEN_ANTERIOR, CAUSA_LABEL, ESTADOS_ERROR_EN_MODAL, causaBloqueada, causasPara,
    efectoCausa, esRegimenAnterior, fmtAjuste, fmtCantidad, leerCausa, parseAjusteStock,
    signoDiscrepancia,
} from './discrepanciaCausa';

interface Props {
    discrepancia: TransferenciaConDiscrepancias;
    canEdit: boolean;
    /** Permiso inventario.transferencias.eliminar — habilita el borrado permanente. */
    canEliminar: boolean;
    onBack: () => void;
    /**
     * Resolver (con CAUSA: el servidor ajusta stock) o descartar (sin causa, no mueve stock).
     * `unidad` solo sirve para el texto del toast con los ajustes.
     */
    onResolver: (
        id: number,
        estado: 'resuelta' | 'descartada',
        resolucion: string,
        causa: CausaDiscrepancia | null,
        unidad?: string | null,
    ) => Promise<ResolverDiscrepanciaRespuesta>;
    /** Hard delete de la transferencia completa (la saca del historial). */
    onEliminarTransferencia: (id: number) => Promise<boolean>;
    /** Hard delete de UNA fila de diferencia. */
    onEliminarDiscrepancia: (id: number) => Promise<boolean>;
    onRefresh: () => Promise<void>;
}

const estadoItemConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    pendiente:  { label: 'Pendiente',  color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-800/60',  icon: Clock },
    resuelta:   { label: 'Resuelta',   color: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-800/60', icon: CheckCircle2 },
    descartada: { label: 'Descartada', color: 'bg-muted text-muted-foreground border-border',    icon: Ban },
};

const fmtFecha = (s: string | null) => s
    ? new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

/** Cascada de nombre: obra || bodega (responsable) || null. */
const nombreUbicacion = (
    obra: string | null | undefined,
    bodega: string | null | undefined,
    responsable: string | null | undefined,
): string | null => obra || (bodega ? formatBodegaNombreResponsable(bodega, responsable) : null) || null;

/** «12 un» / «12» (sin unidad no deja espacio colgando). */
const conUnidad = (n: number, unidad?: string | null) => {
    const u = unidad?.trim();
    return u ? `${fmtCantidad(n)} ${u}` : fmtCantidad(n);
};

const DiscrepanciaDetail: React.FC<Props> = ({ discrepancia, canEdit, canEliminar, onBack, onResolver, onEliminarTransferencia, onEliminarDiscrepancia, onRefresh }) => {
    const itemDetail = useItemDetail();
    const [modalOpen, setModalOpen] = useState(false);
    const [modalAction, setModalAction] = useState<'resuelta' | 'descartada'>('resuelta');
    const [modalItem, setModalItem] = useState<TransferenciaDiscrepanciaItem | null>(null);
    const [resolucion, setResolucion] = useState('');
    // Causa elegida al resolver (sin preselección: mueve stock, tiene que ser deliberada).
    const [causa, setCausa] = useState<CausaDiscrepancia | null>(null);
    // 400/409 del servidor (destino sin stock, régimen anterior, migración pendiente): se
    // muestran DENTRO del modal, que queda abierto para elegir otra causa.
    const [errorModal, setErrorModal] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const openModal = (item: TransferenciaDiscrepanciaItem, action: 'resuelta' | 'descartada') => {
        setModalItem(item);
        setModalAction(action);
        setResolucion('');
        setCausa(null);
        setErrorModal(null);
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setModalItem(null);
        setResolucion('');
        setCausa(null);
        setErrorModal(null);
    };

    const handleEliminarTrf = () => showDeleteToast({
        message: `¿Eliminar la transferencia ${discrepancia.codigo}? Se borra del historial de forma permanente y no se puede deshacer.`,
        successMessage: 'Transferencia eliminada',
        onConfirm: async () => { await onEliminarTransferencia(discrepancia.id); },
    });

    const handleEliminarDiff = (item: TransferenciaDiscrepanciaItem) => showDeleteToast({
        message: `¿Eliminar esta diferencia (#${item.nro_item} ${item.item_descripcion})? Se borra del historial.`,
        successMessage: 'Diferencia eliminada',
        onConfirm: async () => { await onEliminarDiscrepancia(item.id); },
    });

    const origenCabecera = nombreUbicacion(
        discrepancia.origen_obra_nombre, discrepancia.origen_bodega_nombre, discrepancia.origen_bodega_responsable_nombre,
    );
    const destinoCabecera = nombreUbicacion(
        discrepancia.destino_obra_nombre, discrepancia.destino_bodega_nombre, discrepancia.destino_bodega_responsable_nombre,
    );
    const origenLabel = origenCabecera || '—';
    const destinoLabel = destinoCabecera || '—';
    const origenIsObra = !!discrepancia.origen_obra_nombre;
    const destinoIsObra = !!discrepancia.destino_obra_nombre;

    // El origen de la cabecera es el del PRIMER ítem: si el backend trae el origen propio
    // del ítem, ese manda (si no, el texto del efecto podría nombrar la ubicación equivocada).
    const origenDe = (item: TransferenciaDiscrepanciaItem) =>
        nombreUbicacion(item.origen_obra_nombre, item.origen_bodega_nombre, item.origen_bodega_responsable_nombre)
        || origenCabecera
        || 'el origen';
    const destinoTexto = destinoCabecera || 'el destino';

    // ── Derivados del modal ──
    const regimenAnterior = esRegimenAnterior(discrepancia.stock_reconciliado);
    const signoModal = modalItem ? signoDiscrepancia(modalItem.cantidad_enviada, modalItem.cantidad_recibida) : null;
    const causasModal = signoModal ? causasPara(signoModal.signo) : [];
    const causaValida = !!causa && causasModal.includes(causa) && !causaBloqueada(causa, regimenAnterior);
    const puedeConfirmar = !submitting && !!resolucion.trim() && (modalAction === 'descartada' || causaValida);
    const primeraCausaHabilitada = causasModal.find(c => !causaBloqueada(c, regimenAnterior));

    const elegirCausa = (c: CausaDiscrepancia) => {
        setCausa(c);
        setErrorModal(null);
    };

    const handleSubmit = async () => {
        if (!modalItem || !puedeConfirmar) return;
        setSubmitting(true);
        setErrorModal(null);
        const r = await onResolver(
            modalItem.id,
            modalAction,
            resolucion.trim(),
            modalAction === 'resuelta' ? causa : null,
            modalItem.unidad,
        );
        setSubmitting(false);
        if (r.ok) {
            closeModal();
            await onRefresh();
            return;
        }
        // Otro usuario ya la resolvió/descartó o se eliminó: no queda nada que confirmar → cerrar y refrescar.
        if (r.error.code === 'NO_PENDIENTE' || r.error.status === 404) {
            closeModal();
            await onRefresh();
            return;
        }
        if (r.error.status !== undefined && ESTADOS_ERROR_EN_MODAL.includes(r.error.status)) {
            setErrorModal(r.error.message);
        }
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Header with back button (mobile) */}
            <div className="flex items-center gap-2 shrink-0 mb-3">
                <IconButton
                    onClick={onBack}
                    icon={<ArrowLeft className="h-4 w-4" />}
                    variant="ghost"
                    size="sm"
                    aria-label="Volver"
                    className="md:hidden"
                />
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300 flex items-center justify-center shrink-0">
                            <AlertTriangle className="h-3.5 w-3.5" />
                        </div>
                        <h3 className="text-sm font-black text-brand-dark">{discrepancia.codigo}</h3>
                    </div>
                </div>
                {canEliminar && (
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleEliminarTrf}
                        leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                    >
                        Eliminar
                    </Button>
                )}
            </div>

            {/* Scrollable body */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">

                {/* Summary card — superficie neutra (DS regla 1); los nombres parten línea, nunca «…». */}
                <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-muted rounded-xl p-2.5">
                            <p className="text-micro text-muted-foreground uppercase tracking-wider mb-0.5">Ítems afectados</p>
                            <p className="text-lg font-black leading-none text-brand-dark">{discrepancia.total_items_afectados}</p>
                        </div>
                        <div className="bg-muted rounded-xl p-2.5">
                            <p className="text-micro text-muted-foreground uppercase tracking-wider mb-0.5">Diferencia neta</p>
                            <p className="text-lg font-black leading-none text-brand-dark">
                                {discrepancia.total_unidades_perdidas > 0 ? '−' : discrepancia.total_unidades_perdidas < 0 ? '+' : ''}
                                {fmtCantidad(Math.abs(discrepancia.total_unidades_perdidas))}
                            </p>
                        </div>
                    </div>
                    {/* Ruta */}
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-label text-brand-dark">
                        <span className="inline-flex items-start gap-1 min-w-0">
                            {origenIsObra
                                ? <MapPin className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
                                : <Warehouse className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />}
                            <span className="font-semibold break-words min-w-0">{origenLabel}</span>
                        </span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="sr-only">hacia</span>
                        <span className="inline-flex items-start gap-1 min-w-0">
                            {destinoIsObra
                                ? <MapPin className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
                                : <Warehouse className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />}
                            <span className="font-semibold break-words min-w-0">{destinoLabel}</span>
                        </span>
                    </div>
                </div>

                {/* Metadata card */}
                <div className="rounded-xl border border-border bg-card p-3 text-label space-y-1.5">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span>Recibido:</span>
                        <span className="font-semibold text-brand-dark">{fmtFecha(discrepancia.fecha_recepcion)}</span>
                    </div>
                    {discrepancia.receptor_nombre && (
                        <div className="flex items-start gap-2 text-muted-foreground">
                            <User className="h-3 w-3 shrink-0 mt-0.5" />
                            <span className="shrink-0">Receptor:</span>
                            <span className="font-semibold text-brand-dark break-words min-w-0">{discrepancia.receptor_nombre}</span>
                        </div>
                    )}
                    {discrepancia.solicitante_nombre && (
                        <div className="flex items-start gap-2 text-muted-foreground">
                            <User className="h-3 w-3 shrink-0 mt-0.5" />
                            <span className="shrink-0">Solicitó:</span>
                            <span className="font-semibold text-brand-dark break-words min-w-0">{discrepancia.solicitante_nombre}</span>
                        </div>
                    )}
                </div>

                {/* Ítems con discrepancia */}
                <div className="space-y-2">
                    <h4 className="text-caption font-black uppercase tracking-wider text-muted-foreground px-1">
                        Ítems con diferencia ({discrepancia.discrepancias.length})
                    </h4>
                    {discrepancia.discrepancias.map(item => {
                        const cfg = estadoItemConfig[item.estado] || estadoItemConfig.pendiente;
                        const EstadoIcon = cfg.icon;
                        const isPendiente = item.estado === 'pendiente';
                        // Signo desde las cantidades (la columna `diferencia` es enviada − recibida).
                        const sig = signoDiscrepancia(item.cantidad_enviada, item.cantidad_recibida);
                        const esFaltante = sig?.signo === 'faltante';

                        return (
                            <div
                                key={item.id}
                                className="rounded-xl border border-border bg-card p-3"
                            >
                                {/* Header item */}
                                <div className="flex items-start gap-2 mb-2">
                                    <div className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
                                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                            <span className="text-caption font-bold text-muted-foreground">#{item.nro_item}</span>
                                            <span className={cn(
                                                "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-micro font-bold",
                                                cfg.color
                                            )}>
                                                <EstadoIcon className="h-2.5 w-2.5" />
                                                {cfg.label}
                                            </span>
                                        </div>
                                        {/* eslint-disable-next-line no-restricted-syntax -- enlace de texto multilínea custom (parte línea, sin chevron) */}
                                        <button
                                            type="button"
                                            onClick={() => itemDetail.openItem(item.item_id)}
                                            className="text-label font-semibold text-brand-dark leading-tight break-words text-left hover:underline hover:text-brand-primary transition-colors cursor-pointer"
                                        >
                                            {item.item_descripcion}
                                        </button>
                                    </div>
                                    {canEliminar && (
                                        <IconButton
                                            variant="danger"
                                            size="sm"
                                            aria-label="Eliminar diferencia"
                                            onClick={() => handleEliminarDiff(item)}
                                            icon={<Trash2 className="h-3.5 w-3.5" />}
                                            className="shrink-0"
                                        />
                                    )}
                                </div>

                                {/* Métricas cant. enviada vs recibida (contenido neutro; color solo en la diferencia) */}
                                <div className="grid grid-cols-3 gap-1.5 mb-2">
                                    <div className="rounded-lg bg-muted border border-border px-2 py-1.5">
                                        <p className="text-micro text-muted-foreground uppercase font-bold leading-none mb-0.5">Enviado</p>
                                        <p className="text-xs font-black text-brand-dark leading-none">
                                            {fmtCantidad(Number(item.cantidad_enviada) || 0)} <span className="font-normal text-micro">{item.unidad}</span>
                                        </p>
                                    </div>
                                    <div className="rounded-lg bg-muted border border-border px-2 py-1.5">
                                        <p className="text-micro text-muted-foreground uppercase font-bold leading-none mb-0.5">Recibido</p>
                                        <p className="text-xs font-black text-brand-dark leading-none">
                                            {fmtCantidad(Number(item.cantidad_recibida) || 0)} <span className="font-normal text-micro">{item.unidad}</span>
                                        </p>
                                    </div>
                                    <div className={cn(
                                        "rounded-lg px-2 py-1.5 border",
                                        esFaltante
                                            ? "bg-red-50 border-red-100 dark:bg-red-950/30 dark:border-red-900"
                                            : "bg-amber-50 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900"
                                    )}>
                                        <p className={cn(
                                            "text-micro uppercase font-bold leading-none mb-0.5",
                                            esFaltante ? "text-red-700 dark:text-red-300" : "text-amber-800 dark:text-amber-300"
                                        )}>
                                            {esFaltante ? 'Faltante' : 'Sobrante'}
                                        </p>
                                        <p className={cn(
                                            "text-xs font-black leading-none",
                                            esFaltante ? "text-red-700 dark:text-red-300" : "text-amber-800 dark:text-amber-300"
                                        )}>
                                            {esFaltante ? '−' : '+'}{fmtCantidad(sig?.n ?? 0)}{' '}
                                            <span className="font-normal text-micro">{item.unidad}</span>
                                        </p>
                                    </div>
                                </div>

                                {/* Observación al recibir (si existe) */}
                                {item.observacion && (
                                    <div className="flex items-start gap-1.5 bg-muted rounded-lg px-2 py-1.5 mb-2 text-caption">
                                        <FileText className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
                                        <div className="min-w-0">
                                            <p className="text-micro font-bold text-muted-foreground uppercase mb-0.5">Nota al recibir</p>
                                            <p className="text-brand-dark leading-tight break-words">{item.observacion}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Reportado por (quien recibió y detectó la discrepancia) */}
                                {item.reportado_por_nombre && (
                                    <p className="text-micro text-muted-foreground mb-2 flex flex-wrap items-center gap-1">
                                        <User className="h-2.5 w-2.5" />
                                        Reportado por <span className="font-semibold text-brand-dark break-words">{item.reportado_por_nombre}</span>
                                    </p>
                                )}

                                {/* Resolución / Acciones */}
                                {isPendiente && canEdit && (
                                    <div className="flex gap-1.5">
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={() => openModal(item, 'resuelta')}
                                            leftIcon={<Check className="h-3 w-3" />}
                                            className="flex-1"
                                        >
                                            Resolver
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => openModal(item, 'descartada')}
                                            leftIcon={<XCircle className="h-3 w-3" />}
                                            className="flex-1"
                                        >
                                            Descartar
                                        </Button>
                                    </div>
                                )}

                                {/* Si ya está cerrada: causa, nota, ajustes aplicados y aviso */}
                                {!isPendiente && item.resolucion && <ResolucionCerrada item={item} />}

                                {/* Si es pendiente y no puede editar */}
                                {isPendiente && !canEdit && (
                                    <p className="text-caption text-muted-foreground italic text-center py-1">
                                        Sin permiso para resolver
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Modal: resolver (elegir causa + nota) o descartar (solo nota) */}
            <Modal
                isOpen={modalOpen}
                onClose={closeModal}
                size={modalAction === 'resuelta' ? 'md' : 'sm'}
                title={
                    <div className="flex items-center gap-2">
                        {modalAction === 'resuelta'
                            ? <Check className="h-4 w-4 text-green-700 dark:text-green-300" />
                            : <XCircle className="h-4 w-4 text-muted-foreground" />}
                        <span>{modalAction === 'resuelta' ? 'Resolver diferencia' : 'Descartar diferencia'}</span>
                    </div>
                }
                description={modalItem ? `#${modalItem.nro_item} · ${modalItem.item_descripcion}` : undefined}
                footer={
                    <div className="flex flex-wrap items-center justify-end gap-2 w-full">
                        <Button variant="ghost" onClick={closeModal} disabled={submitting}>
                            Cancelar
                        </Button>
                        <Button
                            variant={modalAction === 'resuelta' ? 'primary' : 'secondary'}
                            onClick={handleSubmit}
                            disabled={!puedeConfirmar}
                        >
                            {submitting ? 'Guardando…' :
                                modalAction === 'resuelta' ? 'Confirmar' : 'Marcar como descartada'}
                        </Button>
                    </div>
                }
            >
                {modalItem && (
                    <div className="space-y-4">
                        {/* Qué pasó: cantidades y ruta */}
                        <div className="bg-muted rounded-xl p-3 text-xs text-muted-foreground space-y-1">
                            <p>
                                Enviado <span className="font-semibold text-brand-dark">{conUnidad(Number(modalItem.cantidad_enviada) || 0, modalItem.unidad)}</span>
                                {' · '}
                                Recibido <span className="font-semibold text-brand-dark">{conUnidad(Number(modalItem.cantidad_recibida) || 0, modalItem.unidad)}</span>
                                {signoModal && (
                                    <>
                                        {' · '}
                                        {signoModal.signo === 'sobrante' ? 'Sobran' : 'Faltan'}{' '}
                                        <span className="font-semibold text-brand-dark">{conUnidad(signoModal.n, modalItem.unidad)}</span>
                                    </>
                                )}
                            </p>
                            <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                                <span className="break-words min-w-0">{origenDe(modalItem)}</span>
                                <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span className="sr-only">hacia</span>
                                <span className="break-words min-w-0">{destinoTexto}</span>
                            </p>
                        </div>

                        {modalAction === 'resuelta' ? (
                            signoModal ? (
                                <fieldset className="space-y-2" disabled={submitting}>
                                    <legend className="mb-2 text-xs font-bold text-brand-dark">
                                        ¿Por qué {signoModal.signo === 'sobrante' ? 'llegó de más' : 'llegó de menos'}?{' '}
                                        <span className="text-red-700 dark:text-red-300" aria-hidden="true">*</span>
                                    </legend>
                                    {causasModal.map(c => {
                                        const bloqueada = causaBloqueada(c, regimenAnterior);
                                        const elegida = causa === c;
                                        const efectoId = `causa-efecto-${modalItem.id}-${c}`;
                                        return (
                                            <label
                                                key={c}
                                                className={cn(
                                                    'flex items-start gap-3 rounded-xl border p-3',
                                                    'motion-safe:transition-colors motion-safe:duration-200',
                                                    'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-primary/40',
                                                    bloqueada
                                                        ? 'cursor-not-allowed border-dashed border-border'
                                                        : elegida
                                                            ? 'cursor-pointer border-brand-primary bg-brand-primary/5'
                                                            : 'cursor-pointer border-border hover:border-muted-foreground/40'
                                                )}
                                            >
                                                <input
                                                    type="radio"
                                                    name={`causa-${modalItem.id}`}
                                                    value={c}
                                                    checked={elegida}
                                                    disabled={bloqueada}
                                                    onChange={() => elegirCausa(c)}
                                                    aria-describedby={efectoId}
                                                    autoFocus={c === primeraCausaHabilitada}
                                                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-primary focus-visible:outline-none disabled:cursor-not-allowed"
                                                />
                                                <span className="min-w-0 flex-1">
                                                    <span className={cn(
                                                        'block text-sm font-semibold break-words',
                                                        bloqueada ? 'text-muted-foreground' : 'text-brand-dark'
                                                    )}>
                                                        {CAUSA_LABEL[c]}
                                                    </span>
                                                    <span
                                                        id={efectoId}
                                                        className={cn(
                                                            'mt-0.5 block text-xs break-words',
                                                            bloqueada ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground'
                                                        )}
                                                    >
                                                        {bloqueada
                                                            ? AVISO_REGIMEN_ANTERIOR
                                                            : efectoCausa(c, {
                                                                n: signoModal.n,
                                                                recibida: Number(modalItem.cantidad_recibida) || 0,
                                                                unidad: modalItem.unidad,
                                                                origen: origenDe(modalItem),
                                                                destino: destinoTexto,
                                                            })}
                                                    </span>
                                                </span>
                                            </label>
                                        );
                                    })}
                                </fieldset>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    Lo recibido coincide con lo enviado: no hay causa que elegir.
                                </p>
                            )
                        ) : (
                            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                <Info className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
                                <span>Descartar no mueve stock: la diferencia se cierra solo con tu nota.</span>
                            </p>
                        )}

                        <div>
                            <label htmlFor={`nota-resolucion-${modalItem.id}`} className="block text-xs font-bold text-brand-dark mb-1.5">
                                Nota de resolución <span className="text-red-700 dark:text-red-300" aria-hidden="true">*</span>
                            </label>
                            <textarea
                                id={`nota-resolucion-${modalItem.id}`}
                                value={resolucion}
                                onChange={e => setResolucion(e.target.value)}
                                rows={3}
                                required
                                disabled={submitting}
                                placeholder={modalAction === 'resuelta'
                                    ? 'Ej: El chofer confirmó que 2 cajas se rompieron en el camino.'
                                    : 'Ej: Pérdida aceptada por desgaste de material. No requiere seguimiento.'}
                                className="w-full px-3 py-2 text-sm bg-card border border-input rounded-xl focus:ring-2 focus:ring-brand-primary/40 outline-none resize-none"
                                autoFocus={modalAction === 'descartada'}
                            />
                            <p className="text-caption text-muted-foreground mt-1">
                                Esta nota queda registrada junto con tu nombre y fecha.
                            </p>
                        </div>

                        {errorModal && (
                            <div
                                role="alert"
                                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                            >
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
                                <span className="break-words min-w-0">{errorModal}</span>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* Item Detail Modal */}
            <ItemDetailModal
                isOpen={!!itemDetail.selectedItemId}
                onClose={itemDetail.closeItem}
                itemData={itemDetail.itemData}
                stockLocations={itemDetail.stockLocations}
                loading={itemDetail.loading}
                stockLoading={itemDetail.stockLoading}
            />
        </div>
    );
};

/**
 * Bloque de una diferencia ya cerrada: causa (rótulo), nota, ajustes de stock que aplicó el
 * servidor (±N en neutro, con flecha) y el aviso en ámbar. Datos anteriores a la mig 129 no
 * traen causa ni ajuste_stock: se muestra solo la nota, como antes.
 */
const ResolucionCerrada: React.FC<{ item: TransferenciaDiscrepanciaItem }> = ({ item }) => {
    const causa = leerCausa(item.causa);
    const ajuste = parseAjusteStock(item.ajuste_stock);
    const ajustes = ajuste?.ajustes ?? [];

    return (
        <div className="rounded-lg bg-muted border border-border px-2.5 py-2 text-caption space-y-1.5">
            <p className="font-bold text-micro uppercase tracking-wider text-muted-foreground">
                Resolución
            </p>
            {causa && (
                <p className="text-muted-foreground break-words">
                    Causa: <span className="font-semibold text-brand-dark">{CAUSA_LABEL[causa]}</span>
                </p>
            )}
            <p className="text-brand-dark leading-snug break-words">{item.resolucion}</p>
            {ajustes.length > 0 ? (
                <div>
                    <p className="text-muted-foreground mb-0.5">Ajuste de stock aplicado:</p>
                    <ul className="space-y-0.5">
                        {ajustes.map((a, i) => (
                            <li key={`${a.obra_id ?? 'o'}-${a.bodega_id ?? 'b'}-${i}`} className="flex items-start gap-1 text-brand-dark">
                                {a.cantidad > 0
                                    ? <ArrowUp className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
                                    : <ArrowDown className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />}
                                <span className="font-semibold break-words min-w-0">{fmtAjuste(a, item.unidad)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : causa && item.estado === 'resuelta' && ajuste && Array.isArray(ajuste.ajustes) ? (
                // Solo si el servidor registró «sin ajustes»; si ajuste_stock no se pudo leer, no se afirma nada.
                <p className="text-muted-foreground">Sin cambios de stock.</p>
            ) : null}
            {ajuste?.aviso && (
                <p className="flex items-start gap-1 font-medium text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="break-words min-w-0">{ajuste.aviso}</span>
                </p>
            )}
            <p className="text-micro text-muted-foreground break-words">
                {item.resuelto_por_nombre || 'Usuario'} · {fmtFecha(item.fecha_resolucion)}
            </p>
        </div>
    );
};

export default DiscrepanciaDetail;
