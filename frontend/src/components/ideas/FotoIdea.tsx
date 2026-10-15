import React, { useEffect, useState } from 'react';
import { ImageOff, Maximize2 } from 'lucide-react';
import api from '../../services/api';
import { VisorAdjunto } from '../ui/VisorAdjunto';
import { formatearTamano } from '../../utils/archivos';

/**
 * Foto de una idea ya guardada (mig 121). Se pide aparte —nunca viaja en los
 * listados— por el endpoint autenticado, y al tocarla se abre en el visor con zoom.
 * Es una miniatura de ~5 KB: sirve para ver qué pantalla o qué cosa es.
 */
export const FotoIdea: React.FC<{ ideaId: number; resumen: string; tamano?: number | null; compacta?: boolean }> = ({ ideaId, resumen, tamano, compacta }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [mime, setMime] = useState('image/jpeg');
    const [fallo, setFallo] = useState(false);
    const [grande, setGrande] = useState(false);

    useEffect(() => {
        let objectUrl: string | null = null;
        let vivo = true;
        api.get(`/ideas/${ideaId}/foto`, { responseType: 'blob' })
            .then(res => {
                if (!vivo) return;
                const tipo = res.headers['content-type'] || 'image/jpeg';
                objectUrl = URL.createObjectURL(new Blob([res.data], { type: tipo }));
                setUrl(objectUrl);
                setMime(tipo);
            })
            .catch(() => { if (vivo) setFallo(true); });
        return () => { vivo = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [ideaId]);

    if (fallo) {
        return (
            <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
                <ImageOff className="h-3.5 w-3.5" /> No se pudo cargar la foto
            </span>
        );
    }
    if (!url) return <div className={`${compacta ? 'h-16 w-24' : 'h-40 w-full'} animate-pulse rounded-xl bg-muted`} />;

    return (
        <>
            {/* eslint-disable-next-line no-restricted-syntax -- la miniatura entera abre el visor; Button no envuelve media */}
            <button type="button" onClick={() => setGrande(true)} title="Ver más grande"
                className={`group relative block overflow-hidden rounded-xl border border-border bg-muted/40 cursor-zoom-in ${compacta ? 'h-16 w-24' : 'w-full'}`}>
                <img src={url} alt={`Foto de la idea: ${resumen}`} className={compacta ? 'h-full w-full object-cover' : 'block w-full max-h-64 object-contain'} />
                {!compacta && (
                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-card/90 backdrop-blur border border-border px-2 py-1 text-micro font-semibold text-brand-dark shadow-sm">
                        <Maximize2 className="h-3 w-3" /> Ampliar
                    </span>
                )}
            </button>
            {grande && (
                <VisorAdjunto url={url} mime={mime} nombre={`idea-${ideaId}`} size={tamano || 0}
                    descripcion={tamano ? `Foto de la idea · ${formatearTamano(tamano)}` : 'Foto de la idea'}
                    onClose={() => setGrande(false)} />
            )}
        </>
    );
};

export default FotoIdea;
