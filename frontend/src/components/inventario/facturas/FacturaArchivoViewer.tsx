import React, { useEffect, useState } from 'react';
import api from '../../../services/api';
import { VisorAdjunto } from '../../ui/VisorAdjunto';

/**
 * Foto o PDF de una factura de inventario (mig 157): se baja por el endpoint
 * autenticado (blob) y se muestra en el visor común con zoom — mismo patrón que la
 * foto de un gasto (FotoGastoViewer). El padre lo monta solo cuando hay archivo.
 */
export const FacturaArchivoViewer: React.FC<{
    facturaId: number;
    nombre?: string | null;
    mime?: string | null;
    descripcion?: React.ReactNode;
    onClose: () => void;
}> = ({ facturaId, nombre, mime: mimeGuardado, descripcion, onClose }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [mime, setMime] = useState('');
    const [size, setSize] = useState(0);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let objectUrl: string | null = null;
        let cancelado = false;
        api.get(`/facturas-inventario/${facturaId}/archivo`, { responseType: 'blob' })
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
    }, [facturaId, mimeGuardado]);

    return (
        <VisorAdjunto
            url={url}
            mime={mime}
            nombre={nombre || `factura-${facturaId}`}
            size={size}
            cargando={cargando}
            error={error}
            onClose={onClose}
            descripcion={descripcion}
        />
    );
};

export default FacturaArchivoViewer;
