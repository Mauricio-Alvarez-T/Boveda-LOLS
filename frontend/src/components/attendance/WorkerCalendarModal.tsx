import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { VisorAdjunto } from '../ui/VisorAdjunto';
import { Check, Loader2, AlertTriangle, CalendarRange, Camera, Upload, Paperclip, X, FileText, Maximize2 } from 'lucide-react';
import WorkerCalendar from './WorkerCalendar';
import api from '../../services/api';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import type { Trabajador, EstadoAsistencia, PeriodoAusencia } from '../../types/entities';
import { empresaTag } from '../../utils/empresaTag';
import { navegadorMuestraPdf, formatearTamano } from '../../utils/archivos';
import { compressImage } from '../../utils/compressImage';

/** Estados que llevan respaldo: la falta (para justificarla después) y la justificada. */
const CODIGOS_CON_JUSTIFICATIVO = ['F', 'FJ'];

interface Props {
    isOpen: boolean;
    onClose: () => void;
    worker: Trabajador | null;
    estados: EstadoAsistencia[];
    obraId?: number;
    onSuccess?: () => void;
}

export const WorkerCalendarModal: React.FC<Props> = ({
    isOpen,
    onClose,
    worker,
    estados,
    obraId,
    onSuccess,
}) => {
    const { hasPermission } = useAuth();

    // ── Period form state ──
    const [estadoId, setEstadoId] = useState<number | null>(null);
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');
    const [observacion, setObservacion] = useState('');
    // Justificativo (foto o archivo) que viaja DESPUÉS de crear el período, atado a su id.
    const [justificativo, setJustificativo] = useState<File | null>(null);
    // Si la imagen elegida no se puede pintar (formato raro), se muestra la ficha en su lugar.
    const [previewRoto, setPreviewRoto] = useState(false);
    // Vista previa en grande (visor con zoom): recetas y certificados tienen letra chica.
    const [verGrande, setVerGrande] = useState(false);
    const camaraRef = useRef<HTMLInputElement>(null);
    const archivoRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(false);
    const [existingPeriods, setExistingPeriods] = useState<PeriodoAusencia[]>([]);
    // Incrementar para forzar re-mount de WorkerCalendar después de crear/borrar períodos
    const [calendarKey, setCalendarKey] = useState(0);

    const estadosAusencia = useMemo(() => estados.filter(e => !e.es_presente), [estados]);

    // Sigla de la empresa a la que pertenece el trabajador (L=LOLS, M=MAUA,
    // D=Dedalius, P=Provisorio). Mapea desde empresa_nombre (razon_social).
    // Etiqueta de empresa: usa el util canónico (clases tokenizadas + dark-mode),
    // igual que <EmpresaBadge>. Evita duplicar el mapeo con hex crudo.
    const empresaInfo = useMemo(() => empresaTag(worker?.empresa_nombre), [worker]);

    const diasAfectados = useMemo(() => {
        if (!fechaInicio || !fechaFin) return 0;
        const start = new Date(fechaInicio + 'T12:00:00');
        const end = new Date(fechaFin + 'T12:00:00');
        if (end < start) return 0;
        return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }, [fechaInicio, fechaFin]);

    const overlappingPeriods = useMemo(() => {
        if (!fechaInicio || !fechaFin) return [];
        return existingPeriods.filter(p => {
            const pStart = String(p.fecha_inicio).split('T')[0];
            const pEnd = String(p.fecha_fin).split('T')[0];
            return pStart <= fechaFin && pEnd >= fechaInicio;
        });
    }, [existingPeriods, fechaInicio, fechaFin]);

    const selectedEstado = estados.find(e => e.id === estadoId);
    const admiteJustificativo = !!selectedEstado && CODIGOS_CON_JUSTIFICATIVO.includes(selectedEstado.codigo);

    // Fetch períodos activos para la detección de superposición
    useEffect(() => {
        if (!isOpen || !worker || !obraId) return;
        api.get(`/asistencias/periodos?trabajador_id=${worker.id}&obra_id=${obraId}&activo=true`)
            .then(res => setExistingPeriods(res.data.data || []))
            .catch(() => setExistingPeriods([]));
    }, [isOpen, worker, obraId]);

    // Reset del formulario al cerrar
    useEffect(() => {
        if (!isOpen) {
            setEstadoId(null);
            setFechaInicio('');
            setFechaFin('');
            setObservacion('');
            setJustificativo(null);
            setLoading(false);
        }
    }, [isOpen]);

    // URL local del archivo elegido, para verlo ANTES de confirmar. Se deriva del
    // archivo y se libera cuando cambia o se quita.
    const previewUrl = useMemo(() => (justificativo ? URL.createObjectURL(justificativo) : null), [justificativo]);
    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

    const elegirJustificativo = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] || null;
        // Permitir volver a elegir el mismo archivo tras quitarlo.
        e.target.value = '';
        if (f) {
            setPreviewRoto(false);
            setJustificativo(f);
        }
    };

    const quitarJustificativo = () => {
        setVerGrande(false);
        setJustificativo(null);
    };

    const refreshPeriods = () => {
        if (!worker || !obraId) return;
        api.get(`/asistencias/periodos?trabajador_id=${worker.id}&obra_id=${obraId}&activo=true`)
            .then(res => setExistingPeriods(res.data.data || []))
            .catch(() => {});
    };

    const handleSubmit = async () => {
        if (!hasPermission('asistencia.periodo.crear')) {
            toast.error('No tienes permisos para crear períodos de ausencia');
            return;
        }
        if (!worker || !obraId || !estadoId || !fechaInicio || !fechaFin) {
            toast.error('Completa todos los campos requeridos');
            return;
        }
        setLoading(true);
        try {
            const res = await api.post('/asistencias/periodos', {
                trabajador_id: worker.id,
                obra_id: obraId,
                estado_id: estadoId,
                fecha_inicio: fechaInicio,
                fecha_fin: fechaFin,
                observacion: observacion || null,
            });
            const data = res.data.data;
            toast.success(`Período asignado: ${data.dias_afectados} días actualizados`, { duration: 4000 });

            // El adjunto va en una segunda llamada, con el id recién creado. Si falla,
            // el período ya existe y vale: se avisa, no se deshace.
            if (justificativo && admiteJustificativo && data?.id) {
                // Las fotos de cámara pesan 3–10 MB: se comprimen como los documentos de
                // vehículos (PDF pasa sin tocar). Si la compresión falla, va el original.
                const archivo = await compressImage(justificativo, { maxBytes: 500 * 1024 }).catch(() => justificativo);
                const fd = new FormData();
                fd.append('archivo', archivo, archivo.name || justificativo.name);
                try {
                    await api.post(`/asistencias/periodos/${data.id}/justificativo`, fd,
                        { headers: { 'Content-Type': 'multipart/form-data' } });
                } catch (e) {
                    const detalle = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'error al subir';
                    toast.warning(
                        `El período quedó asignado, pero el justificativo no se pudo subir: ${detalle}. Puedes volver a intentarlo desde el período.`,
                        { duration: 7000 }
                    );
                }
            }

            setEstadoId(null);
            setFechaInicio('');
            setFechaFin('');
            setObservacion('');
            setJustificativo(null);

            refreshPeriods();
            setCalendarKey(k => k + 1);
            onSuccess?.();
        } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Error al crear el período');
        } finally {
            setLoading(false);
        }
    };

    if (!worker) return null;

    const isValid = !!(estadoId && fechaInicio && fechaFin && diasAfectados > 0);

    const modalTitle = (
        <div className="flex flex-col min-w-0 pr-8">
            <span className="text-caption uppercase font-black text-brand-dark/40 tracking-widest leading-none mb-1">
                Calendario de Asistencia
            </span>
            <div className="flex items-center gap-2">
                <h3 className="text-sm md:text-base font-bold text-brand-dark truncate">
                    {worker.apellido_paterno} {worker.apellido_materno || ''} {worker.nombres}
                </h3>
                <span className="hidden md:inline px-1.5 py-0.5 rounded-md bg-muted text-brand-dark text-caption font-bold">
                    {worker.rut}
                </span>
                {empresaInfo && (
                    <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-caption font-black shrink-0 ${empresaInfo.color}`}
                        title={`Empresa: ${empresaInfo.label}`}
                    >
                        {empresaInfo.letra.charAt(0)}
                        <span className="hidden md:inline font-bold opacity-90">{empresaInfo.label}</span>
                    </span>
                )}
            </div>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={modalTitle}
            size="2xl"
            headerAction={
                obraId ? (
                    <div className="hidden md:flex items-center gap-3">
                        {/* Rango seleccionado — visible solo cuando hay fechas */}
                        {(fechaInicio || fechaFin) && (
                            <div className="flex flex-col leading-tight">
                                <span className="text-micro uppercase font-black text-muted-foreground/70 tracking-widest">Rango seleccionado</span>
                                <span className="text-xs font-bold text-brand-dark tabular-nums">
                                    {fechaInicio ? fechaInicio.split('-').reverse().join('/') : '—'}
                                    {fechaFin && fechaFin !== fechaInicio && ` — ${fechaFin.split('-').reverse().join('/')}`}
                                </span>
                            </div>
                        )}
                        <Button
                            onClick={handleSubmit}
                            disabled={!isValid || loading || !hasPermission('asistencia.periodo.crear')}
                            size="sm"
                        >
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <>
                                    <Check className="h-4 w-4 mr-1.5" />
                                    Confirmar Período
                                </>
                            )}
                        </Button>
                    </div>
                ) : undefined
            }
        >
            {/* Móvil: apilado (calendario arriba, formulario abajo).
                Desktop: dos columnas — calendario a la izquierda, formulario a la derecha. */}
            <div className="flex flex-col md:flex-row">
                {/* ── Calendario + períodos activos (izquierda en desktop) ── */}
                <div className="md:flex-1 md:min-w-0 md:pr-6">
                    <WorkerCalendar
                        key={calendarKey}
                        worker={worker}
                        estados={estados}
                        obraId={obraId}
                        showLegend={false}
                        onSelectRange={(start, end) => {
                            setFechaInicio(start);
                            setFechaFin(end);
                        }}
                        onPeriodDeleted={() => {
                            refreshPeriods();
                            setCalendarKey(k => k + 1);
                            onSuccess?.();
                        }}
                    />
                </div>

                {/* ── Formulario de asignación (derecha en desktop, abajo en móvil) ── */}
                {obraId && (
                    <div className="border-t border-border mt-4 pt-5 md:border-t-0 md:border-l md:border-border md:mt-0 md:pt-0 md:pl-6 md:w-[360px] md:shrink-0">
                        <div className="flex items-center gap-2 mb-4">
                            <CalendarRange className="h-4 w-4 text-brand-primary" />
                            <span className="text-xs font-black text-brand-dark/60 uppercase tracking-widest">
                                Asignar Período
                            </span>
                        </div>

                        {/* Formulario en una sola columna */}
                        <div className="flex flex-col gap-4">
                            {/* ── Estado de ausencia ── */}
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                    Estado de ausencia
                                </label>
                                {/* Compacto: nombre y código en UNA sola línea. 2 columnas en desktop. */}
                                <div className="grid grid-cols-2 gap-1.5">
                                    {estadosAusencia.map(est => (
                                        // eslint-disable-next-line no-restricted-syntax -- card selector de estado con color de BD inline (est.color border+bg) y left-align; Button no soporta este patrón
                                        <button
                                            key={est.id}
                                            onClick={() => {
                                                setEstadoId(est.id);
                                                if (!CODIGOS_CON_JUSTIFICATIVO.includes(est.codigo)) setJustificativo(null);
                                            }}
                                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-all ${
                                                estadoId === est.id
                                                    ? 'border-current shadow-sm'
                                                    : 'border-border hover:border-border'
                                            }`}
                                            style={
                                                estadoId === est.id
                                                    ? { borderColor: est.color, backgroundColor: `${est.color}10` }
                                                    : {}
                                            }
                                        >
                                            <span
                                                className="w-2 h-2 rounded-full shrink-0"
                                                style={{ backgroundColor: est.color }}
                                            />
                                            <span className="text-xs font-semibold text-brand-dark truncate flex-1 min-w-0">
                                                {est.nombre}
                                            </span>
                                            <span className="text-micro font-bold text-muted-foreground/70 shrink-0">
                                                {est.codigo}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* ── Justificativo: solo para Falta / Falta justificada ── */}
                            {admiteJustificativo && (
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                        Justificativo <span className="font-normal">(opcional)</span>
                                    </label>
                                    {/* Dos entradas: la cámara abre directo en el teléfono (capture);
                                        el archivo acepta foto de galería o PDF. En escritorio ambas
                                        abren el selector. */}
                                    <input ref={camaraRef} type="file" accept="image/*" capture="environment"
                                        className="hidden" onChange={elegirJustificativo} />
                                    <input ref={archivoRef} type="file" accept="image/*,application/pdf"
                                        className="hidden" onChange={elegirJustificativo} />
                                    {justificativo ? (
                                        <div className="rounded-xl border border-border bg-card overflow-hidden">
                                            {/* Vista previa: la foto tal cual se eligió; el PDF embebido donde el
                                                navegador sabe pintarlo (en el celular, Chrome no) y una ficha donde no. */}
                                            {previewUrl && justificativo.type.startsWith('image/') && !previewRoto ? (
                                                // eslint-disable-next-line no-restricted-syntax -- la imagen entera es el disparador del visor; Button no envuelve media
                                                <button
                                                    type="button"
                                                    onClick={() => setVerGrande(true)}
                                                    className="group relative block w-full cursor-zoom-in bg-muted/40"
                                                    title="Ver más grande"
                                                >
                                                    <img
                                                        src={previewUrl}
                                                        alt={`Vista previa de ${justificativo.name}`}
                                                        onError={() => setPreviewRoto(true)}
                                                        className="block w-full max-h-56 object-contain"
                                                    />
                                                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-card/90 backdrop-blur border border-border px-2 py-1 text-micro font-semibold text-brand-dark shadow-sm">
                                                        <Maximize2 className="h-3 w-3" />
                                                        Ampliar
                                                    </span>
                                                </button>
                                            ) : previewUrl && justificativo.type === 'application/pdf' && navegadorMuestraPdf() ? (
                                                <iframe
                                                    src={previewUrl}
                                                    title={`Vista previa de ${justificativo.name}`}
                                                    className="block w-full h-56 border-0 bg-white"
                                                />
                                            ) : (
                                                <div className="flex flex-col items-center justify-center gap-1.5 h-28 bg-muted/40">
                                                    <FileText className="h-7 w-7 text-muted-foreground" />
                                                    <span className="text-micro text-muted-foreground">
                                                        {justificativo.type === 'application/pdf' ? 'PDF listo para subir' : 'Sin vista previa'}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
                                                <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-semibold text-brand-dark truncate" title={justificativo.name}>
                                                        {justificativo.name}
                                                    </p>
                                                    <p className="text-micro text-muted-foreground">
                                                        {justificativo.type === 'application/pdf' ? 'PDF' : 'Imagen'} · {formatearTamano(justificativo.size)}
                                                    </p>
                                                </div>
                                                {previewUrl && !previewRoto && (
                                                    <IconButton
                                                        size="sm"
                                                        onClick={() => setVerGrande(true)}
                                                        aria-label="Ver más grande"
                                                        title="Ver más grande"
                                                        icon={<Maximize2 className="h-3.5 w-3.5" />}
                                                    />
                                                )}
                                                <IconButton
                                                    size="sm"
                                                    onClick={quitarJustificativo}
                                                    aria-label="Quitar justificativo"
                                                    title="Quitar"
                                                    icon={<X className="h-3.5 w-3.5" />}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button variant="outline" size="sm" onClick={() => camaraRef.current?.click()} leftIcon={<Camera className="h-4 w-4" />}>
                                                Tomar foto
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => archivoRef.current?.click()} leftIcon={<Upload className="h-4 w-4" />}>
                                                Subir archivo
                                            </Button>
                                        </div>
                                    )}
                                    <p className="mt-1.5 text-micro text-muted-foreground">
                                        Foto o PDF, hasta 10 MB. Las fotos se comprimen al subir; queda guardado junto al período.
                                    </p>
                                </div>
                            )}

                            {/* Date range */}
                            <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                            Fecha inicio
                                        </label>
                                        <input
                                            type="date"
                                            value={fechaInicio}
                                            onChange={e => setFechaInicio(e.target.value)}
                                            className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm font-medium text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                            Fecha fin
                                        </label>
                                        <input
                                            type="date"
                                            value={fechaFin}
                                            onChange={e => setFechaFin(e.target.value)}
                                            min={fechaInicio}
                                            className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm font-medium text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                                        />
                                    </div>
                                </div>

                                {/* Preview badge */}
                                {diasAfectados > 0 && selectedEstado && (
                                    <div
                                        className="p-3 rounded-xl border flex items-center gap-3"
                                        style={{
                                            borderColor: `${selectedEstado.color}40`,
                                            backgroundColor: `${selectedEstado.color}08`,
                                        }}
                                    >
                                        <div
                                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
                                            style={{ backgroundColor: selectedEstado.color }}
                                        >
                                            {diasAfectados}
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-brand-dark">
                                                {diasAfectados} día{diasAfectados > 1 ? 's' : ''} de {selectedEstado.nombre}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {fechaInicio.split('-').reverse().join('/')} →{' '}
                                                {fechaFin.split('-').reverse().join('/')}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Overlap warning */}
                                {overlappingPeriods.length > 0 && (
                                    <div className="p-3 rounded-xl bg-warning/10 border border-warning/30">
                                        <div className="flex items-start gap-2">
                                            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300 mt-0.5 shrink-0" />
                                            <div>
                                                <p className="text-xs font-bold text-amber-700 dark:text-amber-300">Superposición detectada</p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {overlappingPeriods.length === 1
                                                        ? 'Un período existente'
                                                        : `${overlappingPeriods.length} períodos existentes`}{' '}
                                                    se superpone{overlappingPeriods.length > 1 ? 'n' : ''} con este rango y será
                                                    {overlappingPeriods.length > 1 ? 'n' : ''} reemplazado
                                                    {overlappingPeriods.length > 1 ? 's' : ''}:
                                                </p>
                                                {overlappingPeriods.map(p => (
                                                    <p key={p.id} className="text-xs text-muted-foreground mt-0.5">
                                                        • {p.estado_nombre} (
                                                        {String(p.fecha_inicio).split('T')[0].split('-').reverse().join('/')} al{' '}
                                                        {String(p.fecha_fin).split('T')[0].split('-').reverse().join('/')})
                                                    </p>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Observación */}
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                        Observación <span className="font-normal">(opcional)</span>
                                    </label>
                                    <textarea
                                        value={observacion}
                                        onChange={e => setObservacion(e.target.value)}
                                        placeholder="Ej: Licencia médica presentada el día..."
                                        rows={2}
                                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                                    />
                                </div>

                                {/* Confirmar (solo móvil; en desktop está en la cabecera) */}
                                <Button
                                    onClick={handleSubmit}
                                    disabled={!isValid || loading || !hasPermission('asistencia.periodo.crear')}
                                    className="w-full md:hidden"
                                >
                                    {loading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <>
                                            <Check className="h-4 w-4 mr-2" />
                                            Confirmar Período
                                        </>
                                    )}
                                </Button>
                        </div>
                    </div>
                )}
            </div>

            {verGrande && justificativo && previewUrl && (
                <VisorAdjunto
                    url={previewUrl}
                    mime={justificativo.type}
                    nombre={justificativo.name}
                    size={justificativo.size}
                    descripcion="Vista previa — todavía no se ha subido"
                    onClose={() => setVerGrande(false)}
                />
            )}
        </Modal>
    );
};
