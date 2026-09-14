/**
 * Finiquito de trabajador (plan Gestiones B5). Se emite a un trabajador DESVINCULADO con baja vigente:
 * POST /documentos-laborales/emitir/:tid { codigo: 'FINIQUITO', … }. RRHH digita haberes (y descuentos si
 * los hay); el total en cifras y en letras lo pone el servidor. Si la baja se registró con una causal
 * operativa LOLS (sin artículo del Código del Trabajo), acá se elige la causal legal que se imprime.
 *
 * Se abre desde el éxito de DesvincularModal (con la baja en mano) y desde la ficha del trabajador
 * (DocumentosGeneradosList). Cuando el caller no tiene la baja (`desvinculacion === undefined`) se pide a
 * GET /trabajadores/:id/resumen; `null` significa "sé que no hay baja vigente".
 */
import React, { useEffect, useState } from 'react';
import { Download, Printer, CheckCircle2, AlertTriangle, FileSignature, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { CurrencyInput } from '../ui/CurrencyInput';
import { showApiError } from '../../utils/toastUtils';
import { formatCLP } from '../../utils/currency';
import { fmtFecha } from '../../utils/format';
import type { CausalDesvinculacion, UltimaDesvinculacion } from '../workers/desvinculacionSchema';
import {
    MAX_LINEAS_FINIQUITO, LUGAR_FIRMA_DEFAULT, conceptoDiasTrabajados, totalFiniquito, validarFiniquito, buildFiniquitoPayload,
    avisoEnlaceFiniquito, faltanDesdeError, hoyYmd, nombreDe,
    type DocumentoEmitido, type WorkerBasico, type LineaMonto,
} from './documentosLaborales';
import { abrirGenerado } from './abrirDocumentoGenerado';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    worker: WorkerBasico | null;
    /** Baja vigente. `undefined` = no la tengo (se pide al resumen); `null` = sé que no hay. */
    desvinculacion?: UltimaDesvinculacion | null;
    /** Se llama al emitir (el padre refresca la lista de generados / la nota de éxito). */
    onEmitido?: (doc: DocumentoEmitido) => void;
}

const CAJA_AVISO = 'flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-300';
const CAJA_BLOQUEO = 'flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-brand-dark';

const lineaVacia = (concepto = ''): LineaMonto => ({ concepto, monto: 0 });

/** Editor de líneas concepto/monto (haberes o descuentos). */
const Lineas: React.FC<{
    titulo: string;
    lineas: LineaMonto[];
    onChange: (l: LineaMonto[]) => void;
    agregarLabel: string;
    disabled?: boolean;
}> = ({ titulo, lineas, onChange, agregarLabel, disabled }) => {
    const set = (i: number, patch: Partial<LineaMonto>) => onChange(lineas.map((l, k) => (k === i ? { ...l, ...patch } : l)));
    const quitar = (i: number) => onChange(lineas.filter((_, k) => k !== i));
    return (
        <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{titulo}</p>
            {lineas.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_11rem_auto] gap-2 items-end">
                    <div className="col-span-2 sm:col-span-1">
                        <Input placeholder="Concepto (ej: Días trabajados septiembre 2026)" value={l.concepto} maxLength={120} disabled={disabled}
                            onChange={e => set(i, { concepto: e.target.value })} />
                    </div>
                    <CurrencyInput value={l.monto} onChange={monto => set(i, { monto })} disabled={disabled} />
                    <IconButton size="sm" variant="ghost" aria-label="Quitar línea" title="Quitar línea" disabled={disabled}
                        onClick={() => quitar(i)} icon={<Trash2 className="h-4 w-4" />} />
                </div>
            ))}
            <Button type="button" size="sm" variant="ghost" leftIcon={<Plus className="h-4 w-4" />} disabled={disabled || lineas.length >= MAX_LINEAS_FINIQUITO}
                onClick={() => onChange([...lineas, lineaVacia()])}>
                {agregarLabel}{lineas.length >= MAX_LINEAS_FINIQUITO ? ` (máx. ${MAX_LINEAS_FINIQUITO})` : ''}
            </Button>
        </div>
    );
};

export const EmitirFiniquitoModal: React.FC<Props> = ({ isOpen, onClose, worker, desvinculacion, onEmitido }) => {
    const { hasPermission } = useAuth();
    const puedeDescargar = hasPermission('documentos.laborales.descargar');
    const [baja, setBaja] = useState<UltimaDesvinculacion | null>(null);
    const [cargandoBaja, setCargandoBaja] = useState(false);
    // El resumen exige trabajadores.ver: un 403 NO es "sin baja" y no debe decirlo.
    const [errorBaja, setErrorBaja] = useState<string | null>(null);
    const [causales, setCausales] = useState<CausalDesvinculacion[]>([]);
    const [fechaFiniquito, setFechaFiniquito] = useState(hoyYmd());
    const [lugarFirma, setLugarFirma] = useState(LUGAR_FIRMA_DEFAULT);
    const [haberes, setHaberes] = useState<LineaMonto[]>([lineaVacia()]);
    const [descuentos, setDescuentos] = useState<LineaMonto[]>([]);
    const [causalCodigo, setCausalCodigo] = useState('');
    const [emitiendo, setEmitiendo] = useState(false);
    const [faltan, setFaltan] = useState<string[] | null>(null);
    const [emitido, setEmitido] = useState<DocumentoEmitido | null>(null);
    const [ocupado, setOcupado] = useState<'download' | 'print' | null>(null);
    const workerId = worker?.id ?? null;
    const sinBaja = desvinculacion === undefined;

    // Al abrir: limpiar el formulario. Depende SOLO de abrir / cambiar de trabajador — nunca del objeto
    // `desvinculacion`: el padre puede reconstruirlo en cada render (DesvincularModal) o recargarlo (el
    // resumen de la ficha tras emitir) y eso no debe borrar lo escrito ni la pantalla de éxito.
    useEffect(() => {
        if (!isOpen) return;
        setEmitido(null); setFaltan(null); setCausalCodigo(''); setDescuentos([]);
        setFechaFiniquito(hoyYmd()); setLugarFirma(LUGAR_FIRMA_DEFAULT);
        setHaberes([lineaVacia(conceptoDiasTrabajados(hoyYmd()))]);
    }, [isOpen, workerId]);

    // La baja: la que viene por props (idempotente: recibirla de nuevo no resetea nada) o la del resumen.
    useEffect(() => {
        if (!isOpen) return;
        setErrorBaja(null);
        if (!sinBaja) { setBaja(desvinculacion ?? null); return; }
        setBaja(null);
        if (!workerId) return;
        let cancelado = false;
        setCargandoBaja(true);
        api.get<{ data?: { ultima_desvinculacion?: UltimaDesvinculacion | null } }>(`/trabajadores/${workerId}/resumen`)
            .then(r => { if (!cancelado) setBaja(r.data?.data?.ultima_desvinculacion ?? null); })
            .catch(err => {
                if (cancelado) return;
                const status = (err as { response?: { status?: number } })?.response?.status;
                setErrorBaja(status === 403
                    ? 'Tu rol no puede leer la desvinculación del trabajador (requiere "Ver Trabajadores"). Pide a RRHH que emita el finiquito desde la ficha.'
                    : 'No se pudo leer la desvinculación del trabajador. Reintenta en unos segundos.');
            })
            .finally(() => { if (!cancelado) setCargandoBaja(false); });
        return () => { cancelado = true; };
    }, [isOpen, workerId, sinBaja, desvinculacion]);

    // Concepto por defecto de la primera línea con el mes de la baja ("Días trabajados septiembre 2026"),
    // mientras el usuario no haya puesto monto ni cambiado el texto.
    const fechaBaja = baja?.fecha ?? null;
    useEffect(() => {
        if (!isOpen || !fechaBaja) return;
        setHaberes(prev => (prev.length === 1 && prev[0].monto === 0 && /^Días trabajados/.test(prev[0].concepto)
            ? [lineaVacia(conceptoDiasTrabajados(fechaBaja))] : prev));
    }, [isOpen, fechaBaja]);

    // Causal operativa (sin artículo): hay que elegir la legal que se imprime → catálogo con artículo.
    const causalSinArticulo = !!baja && !baja.articulo_texto;
    useEffect(() => {
        if (!isOpen || !causalSinArticulo || causales.length) return;
        api.get<{ data: CausalDesvinculacion[] }>('/trabajadores/catalogos/causales-desvinculacion')
            .then(r => setCausales((r.data?.data || []).filter(c => c.articulo)))
            .catch(err => showApiError(err, 'No se pudo cargar el catálogo de causales'));
    }, [isOpen, causalSinArticulo, causales.length]);

    if (!worker) return null;

    const activo = worker.activo !== false;
    const bloqueo = activo
        ? 'El trabajador está activo: el finiquito se emite después de desvincularlo (Gestiones → Desvincular).'
        : errorBaja ? errorBaja
            : (!cargandoBaja && baja === null) ? 'No hay una baja vigente registrada en el historial de este trabajador. Si se dio de baja antes del registro de causales, pide a TI que la complete.' : null;
    const avisoEnlace = avisoEnlaceFiniquito(emitido);
    const total = totalFiniquito({ haberes, descuentos });
    const form = { fechaFiniquito, lugarFirma, haberes, descuentos, causalCodigo };

    const emitir = async () => {
        if (bloqueo) { toast.error(bloqueo); return; }
        const error = validarFiniquito(form, { fechaDesvinculacion: baja?.fecha, causalSinArticulo });
        if (error) { toast.error(error); return; }
        setEmitiendo(true); setFaltan(null);
        try {
            const res = await api.post<{ data: DocumentoEmitido }>(`/documentos-laborales/emitir/${worker.id}`, buildFiniquitoPayload(form));
            setEmitido(res.data.data);
            onEmitido?.(res.data.data);
            if (avisoEnlaceFiniquito(res.data.data)) toast.warning('Finiquito guardado, pero sin enlazar a la baja', { description: 'Revisa el aviso en el modal.' });
            else toast.success('Finiquito guardado en la ficha');
        } catch (err) {
            const f = faltanDesdeError(err);
            if (f) setFaltan(f);
            showApiError(err, 'No se pudo emitir el finiquito');
        } finally {
            setEmitiendo(false);
        }
    };

    const abrir = async (modo: 'download' | 'print') => {
        if (!emitido) return;
        setOcupado(modo);
        try { await abrirGenerado(emitido.documento_id, emitido.nombre_archivo, modo); } finally { setOcupado(null); }
    };

    const footer = emitido ? (
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cerrar</Button>
            <Button variant="outline" leftIcon={<Printer className="h-4 w-4" />} onClick={() => abrir('print')} isLoading={ocupado === 'print'}
                disabled={!puedeDescargar} title={puedeDescargar ? 'Vista previa de impresión' : 'Requiere "Descargar / Imprimir Documentos Laborales"'}>
                Imprimir
            </Button>
            <Button leftIcon={<Download className="h-4 w-4" />} onClick={() => abrir('download')} isLoading={ocupado === 'download'}
                disabled={!puedeDescargar} title={puedeDescargar ? 'Word editable' : 'Requiere "Descargar / Imprimir Documentos Laborales"'}>
                Descargar Word
            </Button>
        </div>
    ) : (
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-sm text-brand-dark">Total: <b>{formatCLP(total)}</b></p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                <Button variant="ghost" onClick={onClose} disabled={emitiendo}>Cancelar</Button>
                <Button leftIcon={<FileSignature className="h-4 w-4" />} onClick={emitir} isLoading={emitiendo} disabled={!!bloqueo || cargandoBaja}>Emitir finiquito</Button>
            </div>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Finiquito de Trabajador" size="lg" footer={footer}>
            <div className="space-y-4">
                <div className="bg-background rounded-2xl p-4 border border-border text-sm">
                    <p className="font-bold text-brand-dark">{nombreDe(worker)}</p>
                    <div className="mt-1 grid grid-cols-1 gap-0.5 text-xs text-muted-foreground">
                        {worker.rut && <span>RUT: {worker.rut}</span>}
                        {worker.cargo_nombre && <span>Cargo: {worker.cargo_nombre}</span>}
                        {worker.empresa_nombre && <span>Empresa: {worker.empresa_nombre}</span>}
                    </div>
                    {baja && (
                        <p className="mt-2 text-xs text-brand-dark">
                            Baja del <b>{baja.fecha ? fmtFecha(baja.fecha) : '—'}</b>
                            {baja.causal_nombre ? <> · Causal: <b>{baja.causal_nombre}</b></> : null}
                            {baja.articulo_texto ? ` (${baja.articulo_texto})` : ''}
                        </p>
                    )}
                    {cargandoBaja && <p className="mt-2 text-xs text-muted-foreground">Leyendo la desvinculación…</p>}
                    <p className="text-label text-brand-primary font-semibold mt-2">Empresa, representante legal, fechas y causal se completan solos en el documento.</p>
                </div>

                {emitido ? (
                    <div role="status" className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800/60 dark:bg-green-500/10 dark:text-green-300">
                        <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold">Finiquito guardado en la ficha</p>
                            <p className="mt-0.5 text-xs opacity-90">{emitido.nombre_archivo} · estado <b>Generado</b>. Al descargar o imprimir pasa a <b>Descargado</b>.</p>
                            <p className="mt-1 text-xs opacity-90">Ábrelo en Word para ajustar el texto legal si hace falta; se firma en papel, en dos ejemplares.</p>
                            {!puedeDescargar && <p className="mt-1 text-xs">Tu rol no descarga documentos laborales: RRHH lo hará desde la ficha.</p>}
                        </div>
                    </div>
                ) : null}
                {emitido && avisoEnlace ? (
                    <div role="alert" className={CAJA_AVISO}>
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{avisoEnlace}</span>
                    </div>
                ) : null}
                {emitido ? null : (
                    <>
                        {bloqueo && (
                            <div role="alert" className={CAJA_BLOQUEO}>
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                                <span>{bloqueo}</span>
                            </div>
                        )}
                        {!bloqueo && baja?.finiquito_documento_id != null && (
                            <div role="status" className={CAJA_AVISO}>
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>Esta baja ya tiene un finiquito emitido. Si emites otro, el nuevo pasa a ser el vigente; el anterior queda en la ficha.</span>
                            </div>
                        )}
                        {faltan && (
                            <div role="alert" className={CAJA_AVISO}>
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <div>
                                    <p className="font-bold">No se pudo emitir: falta</p>
                                    <ul className="mt-1 list-disc pl-4">{faltan.map(f => <li key={f}>{f}</li>)}</ul>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Input label="Fecha del finiquito" type="date" value={fechaFiniquito} min={baja?.fecha ?? undefined} disabled={!!bloqueo}
                                onChange={e => setFechaFiniquito(e.target.value)} />
                            <Input label="Lugar de firma" value={lugarFirma} maxLength={100} placeholder={LUGAR_FIRMA_DEFAULT} disabled={!!bloqueo}
                                onChange={e => setLugarFirma(e.target.value)} />
                        </div>

                        {causalSinArticulo && (
                            <div className="space-y-1.5">
                                <Select
                                    label="Causal legal que se imprime"
                                    value={causalCodigo}
                                    disabled={!!bloqueo}
                                    onChange={e => setCausalCodigo(e.target.value)}
                                    options={[{ value: '', label: causales.length ? 'Selecciona la causal del Código del Trabajo' : 'Cargando causales…' },
                                        ...causales.map(c => ({ value: c.codigo, label: `${c.nombre} — Art. ${c.articulo}${c.inciso ? ` N°${c.inciso}` : ''}` }))]}
                                />
                                <p className="text-caption text-muted-foreground">
                                    La baja quedó registrada como <b>{baja?.causal_nombre || baja?.causal_codigo}</b> (clasificación interna, sin artículo).
                                    El finiquito debe citar una causal del Código del Trabajo; la registrada no cambia.
                                </p>
                            </div>
                        )}

                        <Lineas titulo="Haberes" lineas={haberes} onChange={setHaberes} agregarLabel="Agregar haber" disabled={!!bloqueo} />
                        {descuentos.length === 0 ? (
                            <Button type="button" size="sm" variant="ghost" leftIcon={<Plus className="h-4 w-4" />} disabled={!!bloqueo}
                                onClick={() => setDescuentos([lineaVacia()])}>Agregar descuento</Button>
                        ) : (
                            <Lineas titulo="Descuentos" lineas={descuentos} onChange={setDescuentos} agregarLabel="Agregar descuento" disabled={!!bloqueo} />
                        )}

                        <p className="text-label text-muted-foreground">
                            El sistema suma el total y lo escribe en letras. No calcula indemnizaciones ni feriado proporcional: RRHH digita cada concepto.
                        </p>
                    </>
                )}
            </div>
        </Modal>
    );
};
