import React, { useId, useRef, useState } from 'react';
import {
    ArrowLeft, ArrowRight, ArrowDown, ArrowUp, AlertTriangle, Check, XCircle, Clock,
    CheckCircle2, Ban, Package, MapPin, Warehouse, User, Calendar, FileText, Trash2, Info, History, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../utils/cn';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { SkeletonText } from '../ui/Skeleton';
import type {
    SimulacionResolverDiscrepancia, TransferenciaConDiscrepancias, TransferenciaDiscrepanciaItem,
} from '../../types/entities';
import type {
    RehacerDiscrepanciaRespuesta, ResolverDiscrepanciaRespuesta, RespaldoRehacer, SimularDiscrepanciaRespuesta,
} from '../../hooks/inventario/useTransferencias';
import { useItemDetail } from '../../hooks/inventario/useItemDetail';
import ItemDetailModal from './ItemDetailModal';
import DiscrepanciaRehacerModal from './DiscrepanciaRehacerModal';
import { formatBodegaNombreResponsable } from '../../utils/formatBodega';
import { showDeleteToast } from '../../utils/toastUtils';
import {
    ESTADOS_ERROR_EN_MODAL, ROTULO_SIMULACION, TEXTO_CALCULANDO_STOCK, TEXTO_CON_AJUSTES, TEXTO_NOTA_VACIA,
    TEXTO_REGLA_ANTERIOR_APROBAR, TEXTO_REGLA_ANTERIOR_DESCARTAR, TEXTO_SIMULACION_FALLO, cerradaPorReglaAnterior,
    debeCerrarModal, esReglaAnterior, esReintentar, fmtAjuste, fmtCantidad, leerRehecha, lineaAjusteSimulado,
    mensajeAprobar, mensajeRechazar, motivoNoEliminar, parseAjusteStock, resueltaConAjustes, resumenAjustes,
    rotuloEstado, separarObservacion, signoDiscrepancia, type ContextoDiferencia,
} from './mensajeDiferencia';

interface Props {
    discrepancia: TransferenciaConDiscrepancias;
    canEdit: boolean;
    /** Permiso inventario.transferencias.eliminar — habilita el borrado permanente. */
    canEliminar: boolean;
    onBack: () => void;
    /**
     * Resolver = APROBAR lo declarado (el servidor suma/resta la diferencia) · descartar = RECHAZARLO
     * (no mueve stock). Nota opcional (vacía → el servidor guarda un texto generado). `unidad` solo
     * sirve para el texto del toast con los ajustes.
     */
    onResolver: (
        id: number,
        estado: 'resuelta' | 'descartada',
        resolucion: string,
        unidad?: string | null,
    ) => Promise<ResolverDiscrepanciaRespuesta>;
    /**
     * PUT …/resolver?simular=1 (no escribe): ubicaciones y cifras EXACTAS que dejaría la decisión, el
     * aviso y el bloqueo. Se pide al abrir la ventana. Sin esto la ventana muestra solo el texto.
     */
    onSimular?: (id: number, estado: 'resuelta' | 'descartada') => Promise<SimularDiscrepanciaRespuesta>;
    /** Hard delete de la transferencia completa (la saca del historial). false = falló (el hook ya avisó). */
    onEliminarTransferencia: (id: number) => Promise<boolean>;
    /** Hard delete de UNA fila de diferencia. false = falló (el hook ya avisó). */
    onEliminarDiscrepancia: (id: number) => Promise<boolean>;
    onRefresh: () => Promise<void>;
    /** Super Administrador (rol 1): puede REHACER las diferencias de la regla anterior. Solo UX: el servidor revalida. */
    esSuperAdmin?: boolean;
    /** POST /rehacer (simular = solo el plan). Sin esto no se ofrece «Rehacer». */
    onRehacer?: (id: number, simular: boolean, respaldo?: RespaldoRehacer) => Promise<RehacerDiscrepanciaRespuesta>;
}

/** Simulación de la decisión dentro del modal. 'sin' = no hay cómo simular (solo texto). */
type EstadoSimulacion =
    | { tipo: 'sin' }
    | { tipo: 'cargando' }
    | { tipo: 'lista'; sim: SimulacionResolverDiscrepancia }
    | { tipo: 'fallo' };

const estadoItemConfig: Record<string, { color: string; icon: React.ElementType }> = {
    pendiente:  { color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-800/60',  icon: Clock },
    resuelta:   { color: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-800/60', icon: CheckCircle2 },
    descartada: { color: 'bg-muted text-muted-foreground border-border',    icon: Ban },
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

const DiscrepanciaDetail: React.FC<Props> = ({
    discrepancia, canEdit, canEliminar, onBack, onResolver, onSimular, onEliminarTransferencia,
    onEliminarDiscrepancia, onRefresh, esSuperAdmin = false, onRehacer,
}) => {
    const itemDetail = useItemDetail();
    const [modalOpen, setModalOpen] = useState(false);
    const [modalAction, setModalAction] = useState<'resuelta' | 'descartada'>('resuelta');
    const [modalItem, setModalItem] = useState<TransferenciaDiscrepanciaItem | null>(null);
    const [resolucion, setResolucion] = useState('');
    // 400/409 del servidor al confirmar (destino sin stock, regla anterior): se muestran DENTRO del modal.
    const [errorModal, setErrorModal] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [simulacion, setSimulacion] = useState<EstadoSimulacion>({ tipo: 'sin' });
    // Turno de la VENTANA (sube al abrir y al cerrar): la respuesta de un «confirmar» que llega de un
    // turno viejo se ignora.
    const turnoVentana = useRef(0);
    // Turno de la SIMULACIÓN (sube en cada pedido y al cerrar): solo cuenta la última respuesta.
    const turnoSimulacion = useRef(0);
    // Confirmación en curso. Ref y no estado: el Escape del Modal llama al onClose del render en que
    // se abrió la ventana, y con estado vería siempre «no está enviando».
    const enviando = useRef(false);
    // Fila de la regla anterior que un Super Admin está rehaciendo (modal con el plan simulado).
    const [rehacerItem, setRehacerItem] = useState<TransferenciaDiscrepanciaItem | null>(null);
    const puedeRehacer = esSuperAdmin && !!onRehacer;

    const closeModal = () => {
        turnoVentana.current += 1;
        turnoSimulacion.current += 1;
        enviando.current = false;
        setModalOpen(false);
        setModalItem(null);
        setResolucion('');
        setErrorModal(null);
        setSubmitting(false);
        setSimulacion({ tipo: 'sin' });
    };

    // Cierre que pide la persona (Cancelar, X, Esc, fondo, arrastre en móvil): no mientras se confirma.
    const pedirCierre = () => {
        if (enviando.current) return;
        closeModal();
    };

    // Simulación: el servidor calcula con el stock de AHORA (el de la lista es una foto vieja). Se pide
    // al abrir y otra vez tras un 400/409 al confirmar (el stock pudo cambiar).
    const pedirSimulacion = (item: TransferenciaDiscrepanciaItem, action: 'resuelta' | 'descartada') => {
        const turno = ++turnoSimulacion.current;
        if (!onSimular) {
            setSimulacion({ tipo: 'sin' });
            return;
        }
        setSimulacion({ tipo: 'cargando' });
        onSimular(item.id, action)
            .then(async r => {
                if (turno !== turnoSimulacion.current) return;
                if (r.ok) {
                    setSimulacion({ tipo: 'lista', sim: r.data });
                    // El bloqueo nuevo ya explica el error de confirmar: no repetirlo dos veces en rojo.
                    if (r.data.bloqueo) setErrorModal(null);
                    return;
                }
                // Otra persona ya la resolvió o ya no está: el hook avisó; no queda nada que decidir.
                if (debeCerrarModal(r.error)) {
                    closeModal();
                    await onRefresh();
                    return;
                }
                setSimulacion({ tipo: 'fallo' });
            })
            .catch(() => {
                if (turno === turnoSimulacion.current) setSimulacion({ tipo: 'fallo' });
            });
    };

    const openModal = (item: TransferenciaDiscrepanciaItem, action: 'resuelta' | 'descartada') => {
        turnoVentana.current += 1;
        enviando.current = false;
        setModalItem(item);
        setModalAction(action);
        setResolucion('');
        setErrorModal(null);
        setSubmitting(false);
        setModalOpen(true);
        pedirSimulacion(item, action);
    };

    // El hook ya muestra el toast de éxito o de error: showDeleteToast no repite ninguno. Si falló,
    // onConfirm lanza para que no se muestre éxito.
    const handleEliminarTrf = () => showDeleteToast({
        message: `¿Eliminar la transferencia ${discrepancia.codigo}? Se borra del historial de forma permanente y no se puede deshacer.`,
        successMessage: '',
        errorMessage: '',
        onConfirm: async () => {
            if (!(await onEliminarTransferencia(discrepancia.id))) throw new Error('No se eliminó la transferencia');
        },
    });

    const handleEliminarDiff = (item: TransferenciaDiscrepanciaItem) => showDeleteToast({
        message: `¿Eliminar esta diferencia (#${item.nro_item} ${item.item_descripcion})? Se borra del historial.`,
        successMessage: '',
        errorMessage: '',
        onConfirm: async () => {
            if (!(await onEliminarDiscrepancia(item.id))) throw new Error('No se eliminó la diferencia');
        },
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

    // Nombres por ítem: el origen primario del ítem puede no ser el de la cabecera (splits). Lo manda
    // el servidor; si no viene, se cae a la cabecera.
    const contextoDe = (item: TransferenciaDiscrepanciaItem): ContextoDiferencia => ({
        enviada: item.cantidad_enviada,
        recibida: item.cantidad_recibida,
        unidad: item.unidad,
        origen: item.origen_nombre?.trim() || origenCabecera || 'el origen',
        destino: item.destino_nombre?.trim() || destinoCabecera || 'el destino',
        receptor: item.reportado_por_nombre || discrepancia.receptor_nombre,
    });

    // ── Derivados del modal ──
    const ctxModal = modalItem ? contextoDe(modalItem) : null;
    const reglaAnteriorModal = !!modalItem && esReglaAnterior(modalItem.diferencia_aplicada);
    const aprobar = ctxModal && modalAction === 'resuelta' ? mensajeAprobar(ctxModal) : null;
    const rechazar = ctxModal && modalAction === 'descartada' ? mensajeRechazar(ctxModal) : null;
    const bloqueo = simulacion.tipo === 'lista' ? simulacion.sim.bloqueo : null;
    // Si la simulación FALLA no se bloquea: decide el servidor al confirmar.
    const puedeConfirmar = !submitting
        && simulacion.tipo !== 'cargando'
        && !bloqueo
        && !(modalAction === 'resuelta' && !aprobar)
        && !(modalAction === 'descartada' && reglaAnteriorModal);
    const idBloqueo = modalItem ? `bloqueo-diferencia-${modalItem.id}` : undefined;
    // Frase FIJA del efecto: solo sin simulación lista (sin / cargando / falló). Con la simulación
    // mandan sus cifras exactas (Así queda el stock: …). Rechazar siempre la dice: no mueve stock.
    const fraseEfecto = modalAction === 'descartada'
        ? rechazar?.efecto
        : simulacion.tipo === 'lista' ? null
            : reglaAnteriorModal ? `${TEXTO_REGLA_ANTERIOR_APROBAR}.` : aprobar?.efecto;

    const handleSubmit = async () => {
        if (!modalItem || !puedeConfirmar || enviando.current) return;
        const item = modalItem;
        const action = modalAction;
        const turno = turnoVentana.current;
        enviando.current = true;
        setSubmitting(true);
        setErrorModal(null);
        let r: ResolverDiscrepanciaRespuesta;
        try {
            r = await onResolver(item.id, action, resolucion.trim(), item.unidad);
        } catch (err) {
            // El hook no lanza; esto es por si acaso, para no dejar la ventana trabada en «Guardando…».
            r = { ok: false, error: { message: err instanceof Error ? err.message : 'Error al actualizar la diferencia' } };
        }
        // La ventana se cerró o se abrió otra mientras tanto: esta respuesta ya no le corresponde.
        if (turno !== turnoVentana.current) return;
        enviando.current = false;
        setSubmitting(false);
        // Hecho, u otra persona ya la resolvió / se eliminó (el hook avisó): cerrar y refrescar.
        if (r.ok || debeCerrarModal(r.error)) {
            closeModal();
            await onRefresh();
            return;
        }
        if (r.error.status !== undefined && ESTADOS_ERROR_EN_MODAL.includes(r.error.status)) {
            // REINTENTAR: el hook ya mostró el toast con el mensaje; el resto se ve dentro de la ventana.
            if (!esReintentar(r.error)) setErrorModal(r.error.message);
            // El stock pudo cambiar: se vuelve a calcular (sin «Calculado con el stock de este momento»
            // hasta tener la nueva simulación).
            pedirSimulacion(item, action);
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
                        const reglaAnterior = esReglaAnterior(item.diferencia_aplicada);
                        // Signo desde las cantidades (la columna `diferencia` es enviada − recibida).
                        const sig = signoDiscrepancia(item.cantidad_enviada, item.cantidad_recibida);
                        const esFaltante = sig?.signo === 'faltante';
                        const obs = separarObservacion(item.observacion);
                        const rehecha = leerRehecha(item.ajuste_stock);
                        // El servidor rechazaría borrarla (ajustó stock / pendiente de la regla anterior).
                        const noEliminar = motivoNoEliminar(item);
                        // Regla anterior que ya ajustó stock (modelo de causas): no se rehace sola.
                        const conAjustes = resueltaConAjustes(item);
                        const idDescartarBloqueado = `descartar-bloqueado-${item.id}`;

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
                                                {rotuloEstado(item.estado, reglaAnterior)}
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
                                    {canEliminar && (noEliminar ? (
                                        // Deshabilitada a la vista pero tocable: explica por qué (en móvil no hay tooltip).
                                        <IconButton
                                            variant="ghost"
                                            size="sm"
                                            aria-disabled="true"
                                            aria-label={`Eliminar diferencia: no disponible. ${noEliminar}`}
                                            title={noEliminar}
                                            onClick={() => toast.info('No se puede eliminar esta diferencia', { description: noEliminar })}
                                            icon={<Trash2 className="h-3.5 w-3.5" />}
                                            className="shrink-0 opacity-40 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground dark:hover:bg-transparent"
                                        />
                                    ) : (
                                        <IconButton
                                            variant="danger"
                                            size="sm"
                                            aria-label="Eliminar diferencia"
                                            onClick={() => handleEliminarDiff(item)}
                                            icon={<Trash2 className="h-3.5 w-3.5" />}
                                            className="shrink-0"
                                        />
                                    ))}
                                </div>

                                {/* Enviado vs declarado (contenido neutro; color solo en la diferencia) */}
                                <div className="grid grid-cols-3 gap-1.5 mb-2">
                                    <div className="rounded-lg bg-muted border border-border px-2 py-1.5">
                                        <p className="text-micro text-muted-foreground uppercase font-bold leading-none mb-0.5">Enviado</p>
                                        <p className="text-xs font-black text-brand-dark leading-none">
                                            {fmtCantidad(Number(item.cantidad_enviada) || 0)} <span className="font-normal text-micro">{item.unidad}</span>
                                        </p>
                                    </div>
                                    <div className="rounded-lg bg-muted border border-border px-2 py-1.5">
                                        <p className="text-micro text-muted-foreground uppercase font-bold leading-none mb-0.5">Declarado</p>
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

                                {/* Nota que dejó quien recibió (si existe) */}
                                {obs.nota && (
                                    <div className="flex items-start gap-1.5 bg-muted rounded-lg px-2 py-1.5 mb-2 text-caption">
                                        <FileText className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
                                        <div className="min-w-0">
                                            <p className="text-micro font-bold text-muted-foreground uppercase mb-0.5">Nota al recibir</p>
                                            <p className="text-brand-dark leading-tight break-words">{obs.nota}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Decisión anterior que el servidor guardó al rehacerla (regla antigua) */}
                                {obs.anterior && (
                                    <div className="flex items-start gap-1.5 bg-muted rounded-lg px-2 py-1.5 mb-2 text-caption">
                                        <History className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
                                        <div className="min-w-0">
                                            <p className="text-micro font-bold text-muted-foreground uppercase mb-0.5">Decisión anterior (regla antigua)</p>
                                            <p className="text-brand-dark leading-tight break-words">{obs.anterior}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Ya se rehízo con la regla nueva: qué movió en el stock (lo guarda el servidor en ajuste_stock.rehecha) */}
                                {rehecha && (
                                    <div className="flex items-start gap-1.5 bg-muted rounded-lg px-2 py-1.5 mb-2 text-caption">
                                        <RotateCcw className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
                                        <div className="min-w-0">
                                            <p className="text-micro font-bold text-muted-foreground uppercase mb-0.5">
                                                Rehecha con la regla nueva{rehecha.fecha ? ` · ${fmtFecha(rehecha.fecha)}` : ''}
                                            </p>
                                            <p className="text-brand-dark leading-tight break-words">
                                                {rehecha.ajustes.length ? resumenAjustes(rehecha.ajustes, item.unidad) : 'Sin cambios de stock'}
                                            </p>
                                            {rehecha.aviso && (
                                                <p className="mt-0.5 font-medium text-amber-800 dark:text-amber-300 break-words">{rehecha.aviso}</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Reportado por (quien recibió y declaró la cantidad) */}
                                {item.reportado_por_nombre && (
                                    <p className="text-micro text-muted-foreground mb-2 flex flex-wrap items-center gap-1">
                                        <User className="h-2.5 w-2.5" />
                                        Declarado por <span className="font-semibold text-brand-dark break-words">{item.reportado_por_nombre}</span>
                                    </p>
                                )}

                                {/* Regla anterior: la diferencia ya está en el stock. Aprobar la cierra sin mover nada;
                                    rechazarla exige rehacerla antes (Super Administrador). */}
                                {isPendiente && reglaAnterior && (
                                    <div
                                        role="note"
                                        className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-caption text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                                    >
                                        <p className="flex items-start gap-1.5 font-bold">
                                            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" aria-hidden="true" />
                                            <span className="break-words min-w-0">{TEXTO_REGLA_ANTERIOR_APROBAR}.</span>
                                        </p>
                                        {canEdit && (
                                            <p id={idDescartarBloqueado} className="mt-0.5 break-words">
                                                Descartar: {TEXTO_REGLA_ANTERIOR_DESCARTAR}.
                                            </p>
                                        )}
                                        {puedeRehacer && (conAjustes ? (
                                            <p className="mt-1 font-medium break-words">{TEXTO_CON_AJUSTES}.</p>
                                        ) : (
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => setRehacerItem(item)}
                                                leftIcon={<RotateCcw className="h-3 w-3" />}
                                                className="mt-2"
                                            >
                                                Rehacer con la regla nueva
                                            </Button>
                                        ))}
                                    </div>
                                )}

                                {/* Acciones: Resolver = aprobar lo declarado · Descartar = rechazarlo */}
                                {isPendiente && canEdit && (
                                    <>
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
                                                disabled={reglaAnterior}
                                                aria-describedby={reglaAnterior ? idDescartarBloqueado : undefined}
                                                title={reglaAnterior ? `Descartar: ${TEXTO_REGLA_ANTERIOR_DESCARTAR}` : undefined}
                                                leftIcon={<XCircle className="h-3 w-3" />}
                                                className="flex-1"
                                            >
                                                Descartar
                                            </Button>
                                        </div>
                                        {!reglaAnterior && (
                                            <p className="mt-1.5 text-micro text-muted-foreground break-words">
                                                Resolver aprueba lo declarado y ajusta el stock · Descartar lo rechaza y deja lo enviado.
                                            </p>
                                        )}
                                    </>
                                )}

                                {/* Si ya está cerrada: decisión, nota, ajustes aplicados y aviso */}
                                {!isPendiente && (
                                    <ResolucionCerrada
                                        item={item}
                                        reglaAnterior={reglaAnterior}
                                        rehacer={puedeRehacer && reglaAnterior
                                            ? (conAjustes ? 'manual' : () => setRehacerItem(item))
                                            : null}
                                    />
                                )}

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

            {/* Modal: confirmar APROBAR (Resolver) o RECHAZAR (Descartar) lo declarado */}
            <Modal
                isOpen={modalOpen}
                onClose={pedirCierre}
                size="md"
                title={
                    <div className="flex items-center gap-2">
                        {modalAction === 'resuelta'
                            ? <Check className="h-4 w-4 text-green-700 dark:text-green-300" />
                            : <XCircle className="h-4 w-4 text-muted-foreground" />}
                        <span>{modalAction === 'resuelta' ? 'Aprobar lo declarado' : 'Rechazar lo declarado'}</span>
                    </div>
                }
                description={modalItem ? `#${modalItem.nro_item} · ${modalItem.item_descripcion}` : undefined}
                footer={
                    <div className="flex flex-wrap items-center justify-end gap-2 w-full">
                        <Button variant="ghost" onClick={pedirCierre} disabled={submitting}>
                            Cancelar
                        </Button>
                        <Button
                            variant={modalAction === 'resuelta' ? 'primary' : 'secondary'}
                            onClick={handleSubmit}
                            disabled={!puedeConfirmar}
                            aria-describedby={bloqueo ? idBloqueo : undefined}
                            title={bloqueo ? bloqueo.message : undefined}
                        >
                            {submitting ? 'Guardando…'
                                : modalAction === 'descartada' ? 'Rechazar lo declarado'
                                    : reglaAnteriorModal ? 'Aprobar y cerrar' : 'Aprobar y ajustar stock'}
                        </Button>
                    </div>
                }
            >
                {modalItem && ctxModal && (
                    <div className="space-y-4">
                        {/* Qué declaró quien recibió + ruta */}
                        <div className="bg-muted rounded-xl p-3 text-xs text-muted-foreground space-y-1">
                            <p className="text-brand-dark break-words">
                                {(aprobar?.declaro ?? rechazar?.declaro) || 'Lo declarado coincide con lo enviado.'}
                            </p>
                            <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                                <span className="break-words min-w-0">{ctxModal.origen}</span>
                                <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span className="sr-only">hacia</span>
                                <span className="break-words min-w-0">{ctxModal.destino}</span>
                            </p>
                        </div>

                        <div className="space-y-2">
                            {fraseEfecto && (
                                <p className="text-sm font-semibold text-brand-dark break-words">{fraseEfecto}</p>
                            )}
                            {modalAction === 'descartada' && reglaAnteriorModal && (
                                <p role="alert" className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
                                    <span className="break-words min-w-0">Regla anterior: {TEXTO_REGLA_ANTERIOR_DESCARTAR}.</span>
                                </p>
                            )}
                            <EfectoSimulado
                                simulacion={simulacion}
                                unidad={modalItem.unidad}
                                idBloqueo={idBloqueo}
                                avisoInformativo={modalAction === 'resuelta' && reglaAnteriorModal}
                            />
                        </div>

                        <div>
                            <label htmlFor={`nota-resolucion-${modalItem.id}`} className="block text-xs font-bold text-brand-dark mb-1.5">
                                Nota <span className="font-normal text-muted-foreground">(opcional)</span>
                            </label>
                            <textarea
                                id={`nota-resolucion-${modalItem.id}`}
                                value={resolucion}
                                onChange={e => setResolucion(e.target.value)}
                                rows={2}
                                disabled={submitting}
                                placeholder={modalAction === 'resuelta'
                                    ? 'Ej: El chofer confirmó que traía 2 cajas más.'
                                    : 'Ej: Se contó mal: llegó lo que se envió.'}
                                className="w-full px-3 py-2 text-sm bg-card border border-input rounded-xl focus:ring-2 focus:ring-brand-primary/40 outline-none resize-none"
                            />
                            <p className="text-caption text-muted-foreground mt-1 break-words">
                                Queda registrada con tu nombre y la fecha. {TEXTO_NOTA_VACIA}
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

            {/* Modal: rehacer una diferencia de la regla anterior (Super Admin). Se monta solo abierto. */}
            {rehacerItem && onRehacer && (
                <DiscrepanciaRehacerModal
                    key={rehacerItem.id}
                    item={rehacerItem}
                    codigo={discrepancia.codigo}
                    onClose={() => setRehacerItem(null)}
                    onRehacer={onRehacer}
                    onHecho={onRefresh}
                />
            )}

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
 * Efecto EXACTO que calculó el servidor (simulación): «Así queda el stock:» y, por ubicación, «hoy A
 * → quedará B (±N)»; el aviso (ámbar, o neutro si es informativo: cierre con la regla anterior) y el
 * bloqueo (rojo; el padre deshabilita Confirmar). Cargando = esqueleto. Si falló, un texto genérico:
 * decide el servidor al confirmar.
 */
const EfectoSimulado: React.FC<{
    simulacion: EstadoSimulacion;
    unidad?: string | null;
    idBloqueo?: string;
    /** Aprobar una de la regla anterior: su aviso («se cierra sin mover stock») no es una advertencia. */
    avisoInformativo?: boolean;
}> = ({ simulacion, unidad, idBloqueo, avisoInformativo = false }) => {
    const idRotulo = useId();
    if (simulacion.tipo === 'sin') return null;
    if (simulacion.tipo === 'cargando') {
        return (
            <div role="status" aria-live="polite">
                <span className="sr-only">{TEXTO_CALCULANDO_STOCK}</span>
                <SkeletonText lines={2} />
            </div>
        );
    }
    if (simulacion.tipo === 'fallo') {
        return (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
                <span className="break-words min-w-0">{TEXTO_SIMULACION_FALLO}</span>
            </p>
        );
    }
    const { ajustes, aviso, bloqueo } = simulacion.sim;
    const informativo = avisoInformativo || !!simulacion.sim.cerrada_regla_anterior;
    return (
        <div className="space-y-2">
            {ajustes.length > 0 ? (
                <div>
                    <p id={idRotulo} className="mb-1.5 text-xs font-bold text-brand-dark">{ROTULO_SIMULACION}</p>
                    <ul className="space-y-1.5 text-xs" aria-labelledby={idRotulo}>
                        {ajustes.map((a, i) => (
                            <li key={`${a.obra_id ?? 'o'}-${a.bodega_id ?? 'b'}-${i}`} className="flex items-start gap-1.5 text-brand-dark">
                                {a.cantidad > 0
                                    ? <ArrowUp className="h-3.5 w-3.5 shrink-0 mt-px text-muted-foreground" aria-hidden="true" />
                                    : <ArrowDown className="h-3.5 w-3.5 shrink-0 mt-px text-muted-foreground" aria-hidden="true" />}
                                <span className="min-w-0 break-words font-semibold">{lineaAjusteSimulado(a, unidad)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : !bloqueo && (
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
                    <span>No se mueve stock.</span>
                </p>
            )}
            {aviso && (informativo ? (
                <p className="flex items-start gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
                    <span className="break-words min-w-0">{aviso}</span>
                </p>
            ) : (
                <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
                    <span className="break-words min-w-0">{aviso}</span>
                </p>
            ))}
            {bloqueo && (
                <p
                    id={idBloqueo}
                    role="alert"
                    className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
                    <span className="break-words min-w-0">
                        <span className="font-bold">No se puede confirmar: </span>{bloqueo.message}
                    </span>
                </p>
            )}
            {ajustes.length > 0 && !bloqueo && (
                <p className="text-caption text-muted-foreground">
                    Calculado con el stock de este momento; al confirmar el servidor lo vuelve a revisar.
                </p>
            )}
        </div>
    );
};

/**
 * Bloque de una diferencia ya cerrada: decisión (Aprobada / Rechazada; Resuelta / Descartada en la
 * regla anterior), nota, ajustes de stock que aplicó el servidor (±N en neutro, con flecha) y el aviso
 * en ámbar. Datos anteriores a la mig 129 no traen ajuste_stock: se muestra solo la nota.
 */
const ResolucionCerrada: React.FC<{
    item: TransferenciaDiscrepanciaItem;
    reglaAnterior: boolean;
    /**
     * Solo Super Admin en filas de la regla anterior: función = botón «Rehacer»; 'manual' = ya ajustó
     * stock (modelo de causas) y se corrige a mano; null = nada.
     */
    rehacer: (() => void) | 'manual' | null;
}> = ({ item, reglaAnterior, rehacer }) => {
    const ajuste = parseAjusteStock(item.ajuste_stock);
    const ajustes = ajuste?.ajustes ?? [];
    const rechazada = item.estado === 'descartada';
    // Aprobada sobre la regla anterior: el servidor la cerró sin mover stock y su aviso lo dice (neutro, no ámbar).
    const cerradaAnterior = cerradaPorReglaAnterior(item);

    return (
        <div className="rounded-lg bg-muted border border-border px-2.5 py-2 text-caption space-y-1.5">
            <p className="font-bold text-micro uppercase tracking-wider text-muted-foreground">
                {rotuloEstado(item.estado, reglaAnterior)}
            </p>
            {item.resolucion && <p className="text-brand-dark leading-snug break-words">{item.resolucion}</p>}
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
            ) : reglaAnterior ? (
                // Si el servidor dejó su aviso («… se cierra sin mover stock»), lo dice él (abajo): no repetirlo.
                cerradaAnterior && ajuste?.aviso ? null : (
                    <p className="text-muted-foreground break-words">
                        Cerrada con la regla anterior: la diferencia se aplicó al stock al recibir.
                    </p>
                )
            ) : rechazada ? (
                <p className="text-muted-foreground">No se movió stock: quedó lo enviado.</p>
            ) : ajuste ? (
                // Solo si el servidor registró «sin ajustes»; si ajuste_stock no se pudo leer, no se afirma nada.
                <p className="text-muted-foreground">Sin cambios de stock.</p>
            ) : null}
            {ajuste?.aviso && (cerradaAnterior ? (
                <p className="flex items-start gap-1 text-muted-foreground">
                    <Info className="h-3 w-3 shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="break-words min-w-0">{ajuste.aviso}</span>
                </p>
            ) : (
                <p className="flex items-start gap-1 font-medium text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="break-words min-w-0">{ajuste.aviso}</span>
                </p>
            ))}
            <p className="text-micro text-muted-foreground break-words">
                {item.resuelto_por_nombre || 'Usuario'} · {fmtFecha(item.fecha_resolucion)}
            </p>
            {rehacer === 'manual' ? (
                <p className="text-muted-foreground break-words">{TEXTO_CON_AJUSTES}.</p>
            ) : rehacer && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={rehacer}
                    leftIcon={<RotateCcw className="h-3 w-3" />}
                >
                    Rehacer con la regla nueva
                </Button>
            )}
        </div>
    );
};

export default DiscrepanciaDetail;
