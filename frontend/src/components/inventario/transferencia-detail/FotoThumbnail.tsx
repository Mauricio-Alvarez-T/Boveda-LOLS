import React from 'react';
import { Eye, Download } from 'lucide-react';
import { resolveImageUrl } from '../../../utils/resolveImageUrl';
import { Button } from '../../ui/Button';

/**
 * Miniatura de una foto adjunta (recepción/discrepancia) con botones de Ver y
 * Descargar (Fase 3). Los botones están SIEMPRE visibles (no hover) para que
 * funcionen en móvil. "Ver" abre la imagen en grande en pestaña nueva; "Descargar"
 * baja el archivo (fetch → blob → <a download>, mismo patrón que DocumentList).
 * Las fotos son estáticos públicos (/api/uploads/transferencias),
 * así que el fetch no necesita auth.
 */
export const FotoThumbnail: React.FC<{ url: string; alt?: string; filename?: string }> = ({
    url,
    alt = 'Foto adjunta',
    filename,
}) => {
    const src = resolveImageUrl(url);
    if (!src) return null;

    const nombre = filename || url.split('/').pop() || 'foto.jpg';

    const handleVer = () => window.open(src, '_blank', 'noopener,noreferrer');

    const handleDescargar = async () => {
        try {
            const res = await fetch(src);
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = nombre;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(objectUrl);
        } catch {
            // Fallback: si la descarga directa falla, abrir en pestaña nueva.
            window.open(src, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <div className="flex items-start gap-2 mb-1.5">
            {/* eslint-disable-next-line no-restricted-syntax -- celda de imagen clicable (miniatura 56px), no es un botón estándar */}
            <button type="button" onClick={handleVer} className="block shrink-0" title="Ver foto" aria-label="Ver foto">
                <img
                    src={src}
                    alt={alt}
                    className="h-14 w-14 rounded-lg object-cover border border-border hover:border-brand-primary/40 transition-colors"
                />
            </button>
            <div className="flex flex-col gap-1">
                <Button
                    variant="glass"
                    size="sm"
                    onClick={handleVer}
                    title="Ver foto en grande"
                    leftIcon={<Eye className="h-3.5 w-3.5" />}
                    className="h-7 px-2 gap-1 text-micro font-bold"
                >
                    Ver
                </Button>
                <Button
                    variant="glass"
                    size="sm"
                    onClick={handleDescargar}
                    title="Descargar foto"
                    leftIcon={<Download className="h-3.5 w-3.5" />}
                    className="h-7 px-2 gap-1 text-micro font-bold"
                >
                    Descargar
                </Button>
            </div>
        </div>
    );
};
