import React, { useEffect, useState } from 'react';
import { Loader2, FileText, ExternalLink, Download, Paperclip, AlertTriangle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import api from '../../services/api';
import { cn } from '../../utils/cn';
import { navegadorMuestraPdf, formatearTamano } from '../../utils/archivos';
import type { PeriodoAusencia } from '../../types/entities';

interface Props {
    /** Período cuyo justificativo se muestra. El padre lo monta solo cuando hay uno. */
    periodo: PeriodoAusencia;
    onClose: () => void;
}

const fmtFecha = (f: string) => String(f).split('T')[0].split('-').reverse().join('/');

/**
 * Visor del justificativo adjunto a un período de ausencia (foto o PDF).
 *
 * El archivo se sirve por endpoint autenticado, así que se baja como blob y se
 * pinta acá adentro, en vez de abrir una pestaña: en el celular una pestaña con
 * un blob PDF se convierte en descarga sin nombre. Mismo trato que los
 * documentos de vehículos: la imagen se ve directo, el PDF se embebe donde el
 * navegador sabe pintarlo y, donde no, se ofrece Abrir / Descargar.
 */
export const JustificativoViewer: React.FC<Props> = ({ periodo, onClose }) => {
    // El componente vive mientras hay período (el padre lo monta con `&&`), así que
    // el estado nace "cargando" y el efecto solo dispara el fetch: nada se setea de
    // forma síncrona dentro del efecto.
    const [url, setUrl] = useState<string | null>(null);
    const [mime, setMime] = useState('');
    const [size, setSize] = useState(0);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const periodoId = periodo.id;
    const mimeGuardado = periodo.justificativo_mime;

    useEffect(() => {
        let objectUrl: string | null = null;
        let cancelado = false;
        api.get(`/asistencias/periodos/${periodoId}/justificativo`, { responseType: 'blob' })
            .then(res => {
                if (cancelado) return;
                const tipo = mimeGuardado || res.headers['content-type'] || 'application/octet-stream';
                const blob = new Blob([res.data], { type: tipo });
                objectUrl = URL.createObjectURL(blob);
                setUrl(objectUrl);
                setMime(tipo);
                setSize(blob.size);
                setCargando(false);
            })
            .catch(() => {
                if (cancelado) return;
                setError('No se pudo abrir el justificativo. Vuelve a intentarlo.');
                setCargando(false);
            });
        return () => {
            cancelado = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [periodoId, mimeGuardado]);

    const nombre = periodo.justificativo_nombre || 'Justificativo';
    const esImagen = mime.startsWith('image/');
    const esPdf = mime === 'application/pdf';

    return (
        <Modal
            isOpen
            onClose={onClose}
            size="lg"
            icon={Paperclip}
            title="Justificativo"
            description={
                <span>
                    {periodo.estado_nombre || periodo.estado_codigo} · {fmtFecha(periodo.fecha_inicio)}
                    {periodo.fecha_fin !== periodo.fecha_inicio && ` → ${fmtFecha(periodo.fecha_fin)}`}
                    <span className="mx-1.5 opacity-40">·</span>
                    <span className="break-all">{nombre}</span>
                    {size > 0 && <span className="text-muted-foreground"> · {formatearTamano(size)}</span>}
                </span>
            }
            footer={
                url && !error ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <a href={url} target="_blank" rel="noopener noreferrer"
                            className={cn('inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-full',
                                'text-sm font-medium transition-all duration-200 ease-apple',
                                'bg-muted text-brand-dark hover:bg-border')}>
                            <ExternalLink className="h-4 w-4" />
                            Abrir aparte
                        </a>
                        <a href={url} download={nombre}
                            className={cn('inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-full',
                                'text-sm font-medium transition-all duration-200 ease-apple',
                                'bg-brand-primary text-white shadow-sm hover:bg-[#027A3B]')}>
                            <Download className="h-4 w-4" />
                            Descargar
                        </a>
                    </div>
                ) : undefined
            }
        >
            <div className="min-h-[200px] flex items-center justify-center bg-muted/40 rounded-xl overflow-hidden">
                {cargando ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : error ? (
                    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                        <AlertTriangle className="h-6 w-6 text-amber-700 dark:text-amber-300" />
                        <p className="text-sm text-muted-foreground">{error}</p>
                    </div>
                ) : url && esImagen ? (
                    <img src={url} alt={nombre} className="max-w-full max-h-[75vh] object-contain" />
                ) : url && esPdf && navegadorMuestraPdf() ? (
                    <iframe src={url} title={nombre} className="w-full h-[75vh] border-0 bg-white" />
                ) : url ? (
                    /* Móvil con PDF (o un tipo que el navegador no pinta): ficha con los
                       dos botones del pie, que sí funcionan en el teléfono. */
                    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                            <FileText className="h-8 w-8 text-muted-foreground" />
                        </span>
                        <p className="text-sm font-semibold text-brand-dark break-all">{nombre}</p>
                        <p className="text-caption text-muted-foreground max-w-xs">
                            Este teléfono no muestra los PDF dentro de la página. Ábrelo con el visor del
                            teléfono o descárgalo con los botones de abajo.
                        </p>
                    </div>
                ) : null}
            </div>
        </Modal>
    );
};

export default JustificativoViewer;
