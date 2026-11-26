/**
 * Carta de aviso de término de contrato (mig 160; Marcos 2026-11-26: «necesidades de la empresa, vencimiento de plazo
 * y no concurrencia… esas tres cartas… y que solo Matías pueda imprimir»). Como el finiquito, sale de la baja vigente:
 * la causal y la fecha de término son las registradas al desvincular. Según la causal pide:
 *   - no concurrencia: los días de falta (los trae de Asistencia, 60 días antes de la baja; se quitan o agregan);
 *   - necesidades de la empresa: los hechos (solo texto: sin montos, Marcos 2026-11-26);
 *   - vencimiento del plazo: nada más (la carta dice la fecha de término).
 * Solo con `documentos.cartas_aviso` (emitir, descargar e imprimir).
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileX2, Plus, Printer, X } from 'lucide-react';
import { toast } from 'sonner';

import api from '../../services/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Cargando, Skeleton } from '../ui/Skeleton';
import { cn } from '../../utils/cn';
import { showApiError } from '../../utils/toastUtils';
import { fmtFecha } from '../../utils/format';
import type { UltimaDesvinculacion } from '../workers/desvinculacionSchema';
import {
    LUGAR_FIRMA_DEFAULT, faltanDesdeError, hoyYmd, nombreDe,
    type DocumentoEmitido, type WorkerBasico,
} from './documentosLaborales';
import {
    CAUSALES_CARTA, NOMBRE_CAUSAL_CARTA, buildCartaPayload, causalDeLaBaja, validarCarta,
    type CausalCarta, type CartaAvisoForm,
} from './cartaAviso';
import { abrirGenerado } from './abrirDocumentoGenerado';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    worker: WorkerBasico | null;
    /** Baja vigente. `undefined` = no la tengo (se pide al resumen); `null` = sé que no hay. */
    desvinculacion?: UltimaDesvinculacion | null;
    onEmitido?: (doc: DocumentoEmitido) => void;
}

interface DiaFalta { fecha: string; obra: string | null }

const CAJA_AVISO = 'flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-300';
const CAJA_BLOQUEO = 'flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-brand-dark';
const TEXTAREA = 'w-full min-h-[88px] rounded-xl border border-border bg-card px-3 py-2 text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/40';
const ROTULO = 'text-xs font-bold uppercase tracking-wider text-muted-foreground';
const DIA_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const etiquetaDia = (f: string) => {
    const [y, m, d] = f.split('-').map(Number);
    return `${DIA_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${fmtFecha(f)}`;
};

export const EmitirCartaAvisoModal: React.FC<Props> = ({ isOpen, onClose, worker, desvinculacion, onEmitido }) => {
    const [baja, setBaja] = useState<UltimaDesvinculacion | null>(null);
    const [cargandoBaja, setCargandoBaja] = useState(false);
    const [errorBaja, setErrorBaja] = useState<string | null>(null);
    const [elegida, setElegida] = useState<CausalCarta | ''>('');
    const [fechaCarta, setFechaCarta] = useState(hoyYmd());
    const [lugar, setLugar] = useState(LUGAR_FIRMA_DEFAULT);
    const [faltas, setFaltas] = useState<DiaFalta[] | null>(null);
    const [dias, setDias] = useState<string[]>([]);
    const [diaNuevo, setDiaNuevo] = useState('');
    const [hechos, setHechos] = useState('');
    const [emitiendo, setEmitiendo] = useState(false);
    const [faltan, setFaltan] = useState<string[] | null>(null);
    const [emitido, setEmitido] = useState<DocumentoEmitido | null>(null);
    const [ocupado, setOcupado] = useState<'download' | 'print' | null>(null);
    const workerId = worker?.id ?? null;
    const sinBaja = desvinculacion === undefined;

    // Al abrir: formulario limpio (solo al abrir o cambiar de trabajador, como el finiquito).
    useEffect(() => {
        if (!isOpen) return;
        setEmitido(null); setFaltan(null); setElegida(''); setFechaCarta(hoyYmd()); setLugar(LUGAR_FIRMA_DEFAULT);
        setHechos(''); setDiaNuevo('');
    }, [isOpen, workerId]);

    // La baja: la que viene por props o la del resumen de la ficha.
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
            .catch(() => { if (!cancelado) setErrorBaja('No se pudo leer la desvinculación del trabajador. Reintenta en unos segundos.'); })
            .finally(() => { if (!cancelado) setCargandoBaja(false); });
        return () => { cancelado = true; };
    }, [isOpen, workerId, sinBaja, desvinculacion]);

    const deLaBaja = causalDeLaBaja(baja);
    const causal: CausalCarta | '' = deLaBaja.tipo === 'fija' ? deLaBaja.causal : deLaBaja.tipo === 'elegir' ? elegida : '';

    // No concurrencia: los días de falta de Asistencia (todos marcados de partida).
    useEffect(() => {
        if (!isOpen || causal !== 'INASISTENCIA' || !workerId) return;
        let cancelado = false;
        setFaltas(null);
        api.get<{ data: { dias: DiaFalta[] } }>(`/documentos-laborales/carta-aviso/inasistencias/${workerId}`)
            .then(r => {
                if (cancelado) return;
                const ds = r.data?.data?.dias ?? [];
                setFaltas(ds);
                setDias(ds.map(d => d.fecha));
            })
            .catch(err => { if (!cancelado) { setFaltas([]); showApiError(err, 'No se pudieron leer las faltas de Asistencia'); } });
        return () => { cancelado = true; };
    }, [isOpen, causal, workerId]);

    if (!worker) return null;

    const activo = worker.activo !== false;
    const bloqueo = activo
        ? 'El trabajador está activo: la carta de aviso se emite después de desvincularlo (Gestiones → Desvincular).'
        : errorBaja ? errorBaja
            : (!cargandoBaja && baja === null) ? 'No hay una baja vigente registrada para este trabajador.'
                : deLaBaja.tipo === 'otra' ? `La baja se registró como «${baja?.causal_nombre ?? baja?.causal_codigo}». La carta de aviso es solo para necesidades de la empresa, vencimiento del plazo o no concurrencia.`
                    : null;
    const form: CartaAvisoForm = { causal, elegida: deLaBaja.tipo === 'elegir', fechaCarta, lugar, dias, hechos };
    const extras = dias.filter(f => !(faltas ?? []).some(d => d.fecha === f)).sort();

    const toggleDia = (f: string) => setDias(ds => (ds.includes(f) ? ds.filter(x => x !== f) : [...ds, f]));
    const agregarDia = () => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(diaNuevo)) return;
        setDias(ds => (ds.includes(diaNuevo) ? ds : [...ds, diaNuevo]));
        setDiaNuevo('');
    };

    const emitir = async () => {
        if (bloqueo) { toast.error(bloqueo); return; }
        const error = validarCarta(form);
        if (error) { toast.error(error); return; }
        setEmitiendo(true); setFaltan(null);
        try {
            const res = await api.post<{ data: DocumentoEmitido }>(`/documentos-laborales/emitir/${worker.id}`, buildCartaPayload(form));
            setEmitido(res.data.data);
            onEmitido?.(res.data.data);
            toast.success('Carta de aviso guardada en la ficha');
        } catch (err) {
            const f = faltanDesdeError(err);
            if (f) setFaltan(f);
            showApiError(err, 'No se pudo emitir la carta de aviso');
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
            <Button variant="outline" leftIcon={<Printer className="h-4 w-4" />} onClick={() => abrir('print')} isLoading={ocupado === 'print'}>Imprimir</Button>
            <Button leftIcon={<Download className="h-4 w-4" />} onClick={() => abrir('download')} isLoading={ocupado === 'download'}>Descargar Word</Button>
        </div>
    ) : (
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button variant="ghost" onClick={onClose} disabled={emitiendo}>Cancelar</Button>
            <Button leftIcon={<FileX2 className="h-4 w-4" />} onClick={emitir} isLoading={emitiendo} disabled={!!bloqueo || cargandoBaja}>Emitir carta</Button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Carta de aviso de término" icon={FileX2} size="lg" footer={footer}
            description={[nombreDe(worker), worker.rut].filter(Boolean).join(' · ')}>
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
                            Término el <b>{baja.fecha ? fmtFecha(baja.fecha) : '—'}</b>
                            {baja.causal_nombre ? <> · Baja registrada como <b>{baja.causal_nombre}</b></> : null}
                        </p>
                    )}
                    {cargandoBaja && (
                        <Cargando que="la desvinculación" className="mt-2"><Skeleton className="h-3.5 w-72 max-w-full" /></Cargando>
                    )}
                    <p className="text-label text-brand-primary font-semibold mt-2">Empresa, representante, domicilio, causal y fecha de término se completan solos.</p>
                </div>

                {emitido ? (
                    <div role="status" className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800/60 dark:bg-green-500/10 dark:text-green-300">
                        <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold">Carta de aviso guardada en la ficha</p>
                            <p className="mt-0.5 text-xs opacity-90">{emitido.nombre_archivo}. Imprímela y adjunta los comprobantes de cotizaciones.</p>
                            <p className="mt-1 text-xs opacity-90">Solo quien tiene «Cartas de aviso de término» la puede abrir.</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {bloqueo && (
                            <div role="alert" className={CAJA_BLOQUEO}>
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" /><span>{bloqueo}</span>
                            </div>
                        )}
                        {faltan && (
                            <div role="alert" className={CAJA_AVISO}>
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <div><p className="font-bold">No se pudo emitir: falta</p><ul className="mt-1 list-disc pl-4">{faltan.map(f => <li key={f}>{f}</li>)}</ul></div>
                            </div>
                        )}

                        {!bloqueo && (deLaBaja.tipo === 'elegir' ? (
                            <div className="space-y-1.5">
                                <Select label="Causal de la carta" value={elegida} onChange={e => setElegida(e.target.value as CausalCarta | '')}
                                    options={[{ value: '', label: 'Elige la causal' }, ...CAUSALES_CARTA.map(c => ({ value: c, label: NOMBRE_CAUSAL_CARTA[c] }))]} />
                                <p className="text-caption text-muted-foreground">
                                    La baja quedó como <b>{baja?.causal_nombre || baja?.causal_codigo}</b> (clasificación interna, sin artículo). La carta cita una causal del Código del Trabajo; la registrada no cambia.
                                </p>
                            </div>
                        ) : causal ? (
                            <p className="text-sm text-brand-dark">Causal: <b>{NOMBRE_CAUSAL_CARTA[causal]}</b></p>
                        ) : null)}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Input label="Fecha de la carta" type="date" value={fechaCarta} disabled={!!bloqueo} onChange={e => setFechaCarta(e.target.value)} />
                            <Input label="Lugar" value={lugar} maxLength={100} placeholder={LUGAR_FIRMA_DEFAULT} disabled={!!bloqueo} onChange={e => setLugar(e.target.value)} />
                        </div>

                        {!bloqueo && causal === 'INASISTENCIA' && (
                            <div className="space-y-2">
                                <p className={ROTULO}>Días que no concurrió</p>
                                {faltas === null ? (
                                    <Cargando que="las faltas de Asistencia"><Skeleton className="h-9 w-full" /></Cargando>
                                ) : (
                                    <>
                                        <p className="text-xs text-muted-foreground">
                                            {faltas.length
                                                ? 'Faltas registradas en Asistencia los 60 días antes de la baja. Toque un día para quitarlo de la carta.'
                                                : 'Asistencia no tiene faltas registradas en los 60 días antes de la baja. Agregue los días a mano.'}
                                        </p>
                                        <div className="flex flex-wrap gap-2" role="group" aria-label="Días de inasistencia">
                                            {[...faltas.map(d => d.fecha), ...extras].map(f => {
                                                const marcado = dias.includes(f);
                                                return (
                                                    // eslint-disable-next-line no-restricted-syntax -- chip de selección (día dentro o fuera de la carta)
                                                    <button key={f} type="button" onClick={() => toggleDia(f)} aria-pressed={marcado}
                                                        className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                                                            marcado ? 'border-brand-primary bg-brand-primary/10 text-brand-dark' : 'border-border bg-card text-muted-foreground line-through')}>
                                                        {etiquetaDia(f)}{marcado && <X className="h-3 w-3" aria-hidden />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className="flex items-end gap-2">
                                            <div className="w-48"><Input label="Agregar un día" type="date" value={diaNuevo} onChange={e => setDiaNuevo(e.target.value)} /></div>
                                            <Button type="button" size="sm" variant="glass" leftIcon={<Plus className="h-4 w-4" />} disabled={!diaNuevo} onClick={agregarDia}>Agregar</Button>
                                        </div>
                                        <p className="text-xs text-brand-dark">{dias.length === 1 ? '1 día en la carta' : `${dias.length} días en la carta`}</p>
                                    </>
                                )}
                            </div>
                        )}

                        {!bloqueo && causal === 'NECESIDADES_EMPRESA' && (
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <p className={ROTULO}>Hechos en que se funda</p>
                                    <textarea className={TEXTAREA} value={hechos} maxLength={2000} onChange={e => setHechos(e.target.value)}
                                        placeholder="Ej.: el término de la etapa de obra gruesa en la obra … reduce la dotación necesaria, por lo que la empresa debe ajustar su personal." />
                                </div>
                                <p className="text-label text-muted-foreground">La carta explica la causal con estos hechos. No lleva montos: lo que se paga va en el finiquito.</p>
                            </div>
                        )}

                        {!bloqueo && causal === 'VENCIMIENTO_PLAZO' && (
                            <p className="text-xs text-muted-foreground">La carta dice que el plazo de su contrato vence el {baja?.fecha ? fmtFecha(baja.fecha) : '—'} (la fecha de término de la baja).</p>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
};

export default EmitirCartaAvisoModal;
