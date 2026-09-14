/**
 * Kit de ingreso (plan Gestiones B2): un botón emite los 6 documentos del ingreso — contrato (plazo
 * fijo, días editables), ODI DS 44, Derecho a Saber, PTS en altura, recepción de EPP y de Reglamento
 * Interno — con casillas para desmarcar (decisión del dueño 2026-09-11). POST /kit-ingreso/:tid valida
 * TODO antes de escribir el primero: si falta el representante legal o el sueldo del cargo responde 409
 * con la lista `faltan`, que se muestra acá.
 *
 * B2b: el contrato imprime nacionalidad, estado civil, fecha de nacimiento y domicilio del trabajador.
 * Si la ficha no los tiene, el modal los PIDE acá, los guarda en la ficha y recién entonces emite —
 * antes salían como líneas de guiones y el hueco aparecía en el papel firmado.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Download, Printer, CheckCircle2, AlertTriangle, PackageOpen } from 'lucide-react';
import { toast } from 'sonner';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { showApiError } from '../../utils/toastUtils';
import { cn } from '../../utils/cn';
import {
    KIT_INGRESO, TITULOS, DIAS_PLAZO_DEFAULT, DURACION_CHARLA_DEFAULT, buildKitPayload, faltanDesdeError, hoyYmd, nombreDe,
    faltanDatosContrato, buildDatosPersonalesPayload, validarDatosContrato, camposFaltantesDesdeError,
    type CatalogoDocumentos, type DocumentoEmitido, type WorkerBasico, type CampoContrato,
} from './documentosLaborales';
import { abrirGenerado } from './abrirDocumentoGenerado';
import { CompletarDatosContrato } from './CompletarDatosContrato';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    worker: WorkerBasico | null;
    onEmitido?: (docs: DocumentoEmitido[]) => void;
    /**
     * Se avisa apenas la ficha del trabajador cambia (con lo guardado), aunque la emisión falle después:
     * el caller que no puede releer la ficha (aprobación de solicitud) la actualiza con `cambios`.
     */
    onFichaActualizada?: (cambios?: Record<string, string>) => void;
}

const textareaCls = 'w-full min-h-[96px] rounded-xl border border-border bg-card px-3 py-2 text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/40';

export const EmitirKitModal: React.FC<Props> = ({ isOpen, onClose, worker, onEmitido, onFichaActualizada }) => {
    const { hasPermission } = useAuth();
    const puedeDescargar = hasPermission('documentos.laborales.descargar');
    const puedeEditarTrabajador = hasPermission('trabajadores.editar');
    const [catalogo, setCatalogo] = useState<CatalogoDocumentos | null>(null);
    const [marcados, setMarcados] = useState<string[]>([...KIT_INGRESO]);
    const [fechaDocumento, setFechaDocumento] = useState(hoyYmd());
    const [diasPlazo, setDiasPlazo] = useState<string>(String(DIAS_PLAZO_DEFAULT));
    const [eppTexto, setEppTexto] = useState('');
    const [duracion, setDuracion] = useState(DURACION_CHARLA_DEFAULT);
    const [emitiendo, setEmitiendo] = useState(false);
    const [faltan, setFaltan] = useState<string[] | null>(null);
    const [emitidos, setEmitidos] = useState<DocumentoEmitido[] | null>(null);
    const [ocupado, setOcupado] = useState<string | null>(null);
    // Ficha completa del trabajador (el listado no trae los datos personales) + lo que el usuario escribe.
    const [ficha, setFicha] = useState<WorkerBasico | null>(null);
    const [datos, setDatos] = useState<Partial<Record<CampoContrato, string>>>({});
    const [errores, setErrores] = useState<Partial<Record<CampoContrato, string>>>({});
    // El backend manda las claves que faltan en el 409: manda sobre lo que calculó el front.
    const [faltantesServidor, setFaltantesServidor] = useState<CampoContrato[] | null>(null);
    // `worker` puede ser null mientras el modal está cerrado; el efecto necesita un id estable.
    const workerId = worker?.id ?? null;
    // La ficha rápida pasa la fila completa. `undefined` = objeto parcial (otro caller): hay que pedirla.
    const necesitaFicha = worker?.nacionalidad === undefined;

    useEffect(() => {
        if (!isOpen) return;
        setMarcados([...KIT_INGRESO]); setFechaDocumento(hoyYmd()); setDiasPlazo(String(DIAS_PLAZO_DEFAULT));
        setDuracion(DURACION_CHARLA_DEFAULT); setFaltan(null); setEmitidos(null);
        setDatos({}); setErrores({}); setFaltantesServidor(null); setFicha(null);
        api.get<{ data: CatalogoDocumentos }>('/documentos-laborales/catalogo')
            .then(r => {
                const c = r.data?.data;
                if (c) { setCatalogo(c); setEppTexto((c.epp_default || []).join('\n')); }
            })
            .catch(() => { /* etiquetas locales */ });
        // La ficha rápida ya pasa la fila completa; solo se pide si el objeto viene parcial
        // (`undefined` = no sé, distinto de `null` = sé que está vacío).
        if (workerId && necesitaFicha) {
            api.get<{ data?: WorkerBasico } | WorkerBasico>(`/trabajadores/${workerId}`)
                .then(r => {
                    const d = (r.data as { data?: WorkerBasico })?.data ?? (r.data as WorkerBasico);
                    if (d && typeof d === 'object') setFicha(d);
                })
                .catch(() => { /* sin ficha: el 409 del backend sigue cubriendo el caso */ });
        }
    }, [isOpen, workerId, necesitaFicha]);

    const titulos = useMemo(() => {
        const m: Record<string, string> = { ...TITULOS };
        catalogo?.kit.forEach(k => { m[k.codigo] = k.titulo; });
        return m;
    }, [catalogo]);

    if (!worker) return null;

    const toggle = (c: string) => setMarcados(prev => (prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]));
    const conContrato = marcados.includes('CONTRATO');
    const conEpp = marcados.includes('EPP_RECEPCION');
    const conOdi = marcados.includes('ODI_D40');
    // El servidor manda si ya respondió; si no, lo que dice la ficha que tenemos a mano.
    const faltanPersonales = faltantesServidor ?? faltanDatosContrato(ficha ?? worker);
    const pideDatos = conContrato && faltanPersonales.length > 0;
    const setDato = (campo: CampoContrato, valor: string) => {
        setDatos(prev => ({ ...prev, [campo]: valor }));
        setErrores(prev => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
    };

    const emitir = async () => {
        if (!marcados.length) { toast.error('Marca al menos un documento'); return; }
        // El contrato exige los datos personales: sin permiso de editar no hay forma de completarlos acá.
        if (pideDatos && !puedeEditarTrabajador) {
            toast.error('Faltan datos del trabajador para el contrato', { description: 'Desmarca el contrato o pide a administración que complete la ficha.' });
            return;
        }
        if (pideDatos) {
            const errs = validarDatosContrato(faltanPersonales, datos);
            if (Object.keys(errs).length) {
                setErrores(errs);
                toast.error('Completa los datos del trabajador que faltan para el contrato');
                return;
            }
            setErrores({});
        }
        setEmitiendo(true); setFaltan(null);
        let etapa: 'ficha' | 'emision' = 'ficha';
        try {
            // Primero la ficha, después la emisión: así nunca se emite un contrato con datos que no
            // quedaron guardados. El payload lleva SOLO lo completado (un null borraría datos existentes).
            const payload = pideDatos ? buildDatosPersonalesPayload(datos) : {};
            if (Object.keys(payload).length) {
                await api.put(`/trabajadores/${worker.id}`, payload);
                setFicha(prev => ({ ...(prev ?? worker), ...payload }));
                setFaltantesServidor(null);
                onFichaActualizada?.(payload);   // la ficha ya cambió, aunque la emisión falle después
            }
            etapa = 'emision';
            const res = await api.post<{ data: { emitidos: DocumentoEmitido[] } }>(
                `/documentos-laborales/kit-ingreso/${worker.id}`,
                buildKitPayload({ documentos: marcados, fecha_documento: fechaDocumento, dias_plazo: diasPlazo, epp_texto: eppTexto, duracion_charla: duracion })
            );
            setEmitidos(res.data.data.emitidos);
            onEmitido?.(res.data.data.emitidos);
            toast.success(`${res.data.data.emitidos.length} documento(s) guardado(s) en la ficha`);
        } catch (err) {
            if (etapa === 'ficha') {
                showApiError(err, 'No se pudieron guardar los datos del trabajador; no se emitió nada');
                return;
            }
            const campos = camposFaltantesDesdeError(err);
            if (campos) setFaltantesServidor(campos);   // la ficha cambió desde que se abrió el modal
            const f = faltanDesdeError(err);
            if (f) setFaltan(f); else showApiError(err, 'No se pudo emitir el kit');
        } finally {
            setEmitiendo(false);
        }
    };

    const abrir = async (d: DocumentoEmitido, modo: 'download' | 'print') => {
        setOcupado(`${d.documento_id}-${modo}`);
        try { await abrirGenerado(d.documento_id, d.nombre_archivo, modo); } finally { setOcupado(null); }
    };
    const descargarTodos = async () => {
        if (!emitidos) return;
        setOcupado('todos');
        try { for (const d of emitidos) await abrirGenerado(d.documento_id, d.nombre_archivo, 'download'); } finally { setOcupado(null); }
    };

    const footer = emitidos ? (
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cerrar</Button>
            <Button leftIcon={<Download className="h-4 w-4" />} onClick={descargarTodos} isLoading={ocupado === 'todos'} disabled={!puedeDescargar}
                title={puedeDescargar ? 'Descarga cada Word del kit' : 'Requiere "Descargar / Imprimir Documentos Laborales"'}>
                Descargar todos
            </Button>
        </div>
    ) : (
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={emitiendo}>Cancelar</Button>
            <Button leftIcon={<PackageOpen className="h-4 w-4" />} onClick={emitir} isLoading={emitiendo}
                disabled={!marcados.length || (pideDatos && !puedeEditarTrabajador)}
                title={pideDatos && !puedeEditarTrabajador ? 'Faltan datos del trabajador y tu rol no puede editarlos' : undefined}>
                {pideDatos ? 'Completar y emitir' : `Emitir ${marcados.length} documento${marcados.length === 1 ? '' : 's'}`}
            </Button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Kit de ingreso" size="md" footer={footer}>
            <div className="space-y-4">
                <div className="bg-background rounded-2xl p-4 border border-border text-sm">
                    <p className="font-bold text-brand-dark">{nombreDe(worker)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {[worker.rut, worker.cargo_nombre, worker.empresa_nombre].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-label text-brand-primary font-semibold mt-2">
                        Empleador, representante legal y sueldo del cargo se toman de Configuración. Cada documento queda en la ficha como Word editable.
                    </p>
                </div>

                {emitidos ? (
                    <div className="space-y-2">
                        <div role="status" className="flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800 dark:border-green-800/60 dark:bg-green-500/10 dark:text-green-300">
                            <CheckCircle2 className="h-5 w-5 shrink-0" /> {emitidos.length} documento(s) guardado(s) en la ficha
                        </div>
                        <ul className="divide-y divide-border rounded-2xl border border-border overflow-hidden">
                            {emitidos.map(d => (
                                <li key={d.documento_id} className="flex items-center justify-between gap-2 bg-card px-3 py-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-brand-dark truncate">{titulos[d.tipo_codigo] || d.tipo_nombre || d.tipo_codigo}</p>
                                        <p className="text-caption text-muted-foreground truncate">{d.nombre_archivo}</p>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        <IconButton size="sm" variant="ghost" aria-label="Imprimir" title={puedeDescargar ? 'Imprimir' : 'Solo oficina'} disabled={!puedeDescargar || ocupado === `${d.documento_id}-print`}
                                            onClick={() => abrir(d, 'print')} icon={<Printer className="h-4 w-4" />} />
                                        <IconButton size="sm" variant="ghost" aria-label="Descargar Word" title={puedeDescargar ? 'Descargar Word' : 'Solo oficina'} disabled={!puedeDescargar || ocupado === `${d.documento_id}-download`}
                                            onClick={() => abrir(d, 'download')} icon={<Download className="h-4 w-4" />} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <>
                        {faltan && (
                            <div role="alert" className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-500/10 dark:text-red-300">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <div>
                                    <p className="font-bold">No se emitió nada: faltan datos</p>
                                    <ul className="mt-1 list-disc pl-4 text-xs">{faltan.map(f => <li key={f}>{f}</li>)}</ul>
                                </div>
                            </div>
                        )}
                        <fieldset className="space-y-1">
                            <legend className="text-sm font-medium text-brand-dark mb-1">Documentos a emitir</legend>
                            {KIT_INGRESO.map(c => (
                                <label key={c} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2 text-sm cursor-pointer transition-colors',
                                    marcados.includes(c) ? 'border-brand-primary/40 bg-brand-primary/5' : 'border-border bg-card text-muted-foreground')}>
                                    <input type="checkbox" className="h-4 w-4 accent-[var(--brand-primary,#029E4D)]" checked={marcados.includes(c)} onChange={() => toggle(c)} />
                                    <span className="font-medium">{titulos[c]}</span>
                                </label>
                            ))}
                        </fieldset>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Input label="Fecha de los documentos" type="date" value={fechaDocumento} onChange={(e) => setFechaDocumento(e.target.value)} />
                            {conContrato && (
                                <Input label="Plazo del contrato (días)" type="number" inputMode="numeric" min={1} max={365} value={diasPlazo}
                                    onChange={(e) => setDiasPlazo(e.target.value)} helperText="Plazo fijo. Default 15 días." />
                            )}
                            {conOdi && (
                                <Input label="Duración de la charla ODI" value={duracion} onChange={(e) => setDuracion(e.target.value)} placeholder="30 minutos" />
                            )}
                        </div>
                        {/* El contrato imprime estos datos: si la ficha no los tiene, se piden acá (B2b). */}
                        {pideDatos && (
                            <CompletarDatosContrato
                                faltan={faltanPersonales}
                                valores={datos}
                                onChange={setDato}
                                puedeEditar={puedeEditarTrabajador}
                                errores={errores}
                            />
                        )}
                        {conEpp && (
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-brand-dark">Implementos de seguridad entregados (uno por línea)</label>
                                <textarea className={textareaCls} value={eppTexto} onChange={(e) => setEppTexto(e.target.value)} />
                            </div>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
};
