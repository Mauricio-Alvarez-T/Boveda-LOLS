/**
 * Carta de Amonestación — emitida por el SERVIDOR (plan Gestiones B2, mig 110). Sucesor de
 * workers/ConstanciaModal.tsx: antes el Word se armaba en el navegador sin permiso ni rastro; ahora
 * POST /documentos-laborales/emitir/:tid la guarda en la ficha (estado "Generado") y solo quien
 * tiene documentos.laborales.descargar puede bajarla o imprimirla.
 */
import React, { useEffect, useState } from 'react';
import { Download, Printer, CheckCircle2, FileText } from 'lucide-react';
import { toast } from 'sonner';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { showApiError } from '../../utils/toastUtils';
import {
    AMONESTACION_MOTIVOS, AMONESTACION_OTRO, buildAmonestacionPayload, validarAmonestacion, hoyYmd, nombreDe,
    type CatalogoDocumentos, type DocumentoEmitido, type WorkerBasico,
} from './documentosLaborales';
import { abrirGenerado } from './abrirDocumentoGenerado';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    worker: WorkerBasico | null;
    /** Se llama al emitir (el padre refresca la lista de generados). */
    onEmitido?: (doc: DocumentoEmitido) => void;
}

const textareaCls = 'w-full min-h-[88px] rounded-xl border border-border bg-card px-3 py-2 text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/40';

export const EmitirAmonestacionModal: React.FC<Props> = ({ isOpen, onClose, worker, onEmitido }) => {
    const { hasPermission } = useAuth();
    const puedeDescargar = hasPermission('documentos.laborales.descargar');
    const [fechaCarta, setFechaCarta] = useState(hoyYmd());
    const [fechaInfraccion, setFechaInfraccion] = useState('');
    const [motivo, setMotivo] = useState('');
    const [detalle, setDetalle] = useState('');
    const [motivos, setMotivos] = useState<string[]>(AMONESTACION_MOTIVOS);
    const [emitiendo, setEmitiendo] = useState(false);
    const [emitido, setEmitido] = useState<DocumentoEmitido | null>(null);
    const [ocupado, setOcupado] = useState<'download' | 'print' | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setFechaCarta(hoyYmd()); setFechaInfraccion(''); setMotivo(''); setDetalle(''); setEmitido(null);
        api.get<{ data: CatalogoDocumentos }>('/documentos-laborales/catalogo')
            .then(r => { const m = r.data?.data?.amonestacion_motivos; if (Array.isArray(m) && m.length) setMotivos(m); })
            .catch(() => { /* catálogo local */ });
    }, [isOpen]);

    if (!worker) return null;

    const emitir = async () => {
        const form = { fechaCarta, fechaInfraccion, motivo, detalle };
        const error = validarAmonestacion(form);
        if (error) { toast.error(error); return; }
        setEmitiendo(true);
        try {
            const res = await api.post<{ data: DocumentoEmitido }>(`/documentos-laborales/emitir/${worker.id}`, buildAmonestacionPayload(form));
            setEmitido(res.data.data);
            onEmitido?.(res.data.data);
            toast.success('Carta de amonestación guardada en la ficha');
        } catch (err) {
            showApiError(err, 'No se pudo emitir la carta');
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
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={emitiendo}>Cancelar</Button>
            <Button leftIcon={<FileText className="h-4 w-4" />} onClick={emitir} isLoading={emitiendo}>Emitir carta</Button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Carta de Amonestación" size="md" footer={footer}>
            <div className="space-y-4">
                <div className="bg-background rounded-2xl p-4 border border-border text-sm">
                    <p className="font-bold text-brand-dark">{nombreDe(worker)}</p>
                    <div className="mt-1 grid grid-cols-1 gap-0.5 text-xs text-muted-foreground">
                        {worker.rut && <span>RUT: {worker.rut}</span>}
                        {worker.cargo_nombre && <span>Cargo: {worker.cargo_nombre}</span>}
                        {worker.obra_nombre && <span>Obra: {worker.obra_nombre}</span>}
                        {worker.empresa_nombre && <span>Empresa: {worker.empresa_nombre}</span>}
                    </div>
                    <p className="text-label text-brand-primary font-semibold mt-2">Estos datos se completan solos en el documento.</p>
                </div>

                {emitido ? (
                    <div role="status" className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800/60 dark:bg-green-500/10 dark:text-green-300">
                        <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold">Documento guardado en la ficha</p>
                            <p className="mt-0.5 text-xs opacity-90">{emitido.nombre_archivo} · estado <b>Generado</b>. Al descargar o imprimir pasa a <b>Descargado</b>.</p>
                            {!puedeDescargar && <p className="mt-1 text-xs">Tu rol no descarga documentos laborales: RRHH lo hará desde la ficha.</p>}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Input label="Fecha de la carta" type="date" value={fechaCarta} onChange={(e) => setFechaCarta(e.target.value)} />
                            <Input label="Día de la infracción" type="date" value={fechaInfraccion} max={fechaCarta} onChange={(e) => setFechaInfraccion(e.target.value)} />
                        </div>
                        <Select
                            label="Motivo de la falta"
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            options={[{ value: '', label: 'Selecciona un motivo…' }, ...motivos.map(m => ({ value: m, label: m })), { value: AMONESTACION_OTRO, label: AMONESTACION_OTRO }]}
                        />
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-brand-dark">Detalle {motivo === AMONESTACION_OTRO ? '(obligatorio)' : '(opcional)'}</label>
                            <textarea className={textareaCls} value={detalle} maxLength={2000} onChange={(e) => setDetalle(e.target.value)}
                                placeholder="Qué pasó, dónde y quién lo constató. Se imprime debajo del motivo." />
                        </div>
                        <p className="text-label text-muted-foreground">
                            La carta queda en la ficha del trabajador con fecha, autor y estado. Lo que dejes vacío sale como línea en blanco para completar a mano.
                        </p>
                    </>
                )}
            </div>
        </Modal>
    );
};
