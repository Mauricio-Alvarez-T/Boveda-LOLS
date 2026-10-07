import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { VisorAdjunto } from '../ui/VisorAdjunto';
import type { PeriodoAusencia } from '../../types/entities';

interface Props {
    /** Período cuyo justificativo se muestra. El padre lo monta solo cuando hay uno. */
    periodo: PeriodoAusencia;
    onClose: () => void;
}

const fmtFecha = (f: string) => String(f).split('T')[0].split('-').reverse().join('/');

/**
 * Justificativo adjunto a un período de ausencia: lo baja por el endpoint
 * autenticado (blob) y lo entrega al visor común con zoom. No se abre en una
 * pestaña porque en el celular un blob PDF se convierte en descarga sin nombre.
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

    return (
        <VisorAdjunto
            url={url}
            mime={mime}
            nombre={periodo.justificativo_nombre || 'Justificativo'}
            size={size}
            cargando={cargando}
            error={error}
            onClose={onClose}
            descripcion={
                <span>
                    Justificativo · {periodo.estado_nombre || periodo.estado_codigo} · {fmtFecha(periodo.fecha_inicio)}
                    {periodo.fecha_fin !== periodo.fecha_inicio && ` → ${fmtFecha(periodo.fecha_fin)}`}
                </span>
            }
        />
    );
};

export default JustificativoViewer;
