import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { VisorAdjunto } from '../ui/VisorAdjunto';
import { fmtFechaCorta, fmtMoney } from '../../utils/format';
import { TIPOS_DOC } from './costosConfig';
import type { CostoGasto } from '../../types/entities';

/**
 * Foto o PDF de la factura de un gasto: se baja por el endpoint autenticado (blob)
 * y se muestra en el visor común con zoom (mismo patrón que JustificativoViewer).
 * El padre lo monta solo cuando hay foto, así que el estado nace "cargando".
 */
export const FotoGastoViewer: React.FC<{ gasto: CostoGasto; onClose: () => void }> = ({ gasto, onClose }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [mime, setMime] = useState('');
    const [size, setSize] = useState(0);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const gastoId = gasto.id;
    const mimeGuardado = gasto.foto_mime;

    useEffect(() => {
        let objectUrl: string | null = null;
        let cancelado = false;
        api.get(`/costos/gastos/${gastoId}/foto`, { responseType: 'blob' })
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
                setError('No se pudo abrir la foto de la factura. Vuelve a intentarlo.');
                setCargando(false);
            });
        return () => {
            cancelado = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [gastoId, mimeGuardado]);

    return (
        <VisorAdjunto
            url={url}
            mime={mime}
            nombre={gasto.foto_nombre || `gasto-${gasto.id}`}
            size={size}
            cargando={cargando}
            error={error}
            onClose={onClose}
            descripcion={
                <span>
                    {TIPOS_DOC[gasto.tipo_documento]}{gasto.folio ? ` N° ${gasto.folio}` : ''} · {fmtMoney(gasto.monto_total)} · {fmtFechaCorta(gasto.fecha)}
                    {gasto.proveedor ? ` · ${gasto.proveedor}` : ''}
                </span>
            }
        />
    );
};

export default FotoGastoViewer;
