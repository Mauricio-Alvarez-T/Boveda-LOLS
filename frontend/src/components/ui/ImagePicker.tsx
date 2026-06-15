import React, { useRef, useState, useEffect } from 'react';
import { Camera, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from './Button';
import { IconButton } from './IconButton';

/**
 * Selector de imagen OPCIONAL con preview (Fase 3). Solo captura el File y lo
 * entrega al padre vía onChange; NO sube nada (la subida es POST-then-attach,
 * best-effort). En móvil abre la cámara trasera (capture="environment").
 * Nunca es obligatorio: el flujo de recepción no depende de la foto.
 */
export const ImagePicker: React.FC<{
    file: File | null;
    onChange: (file: File | null) => void;
    label?: string;
    disabled?: boolean;
    className?: string;
}> = ({ file, onChange, label = 'Foto (opcional)', disabled = false, className }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(null);

    // Revoca el object URL anterior al cambiar y al desmontar (evita fugas).
    useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

    const handlePick = (f: File | null) => {
        onChange(f);
        setPreview(f ? URL.createObjectURL(f) : null);
    };

    return (
        <div className={cn('space-y-2', className)}>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => handlePick(e.target.files?.[0] || null)}
            />
            {file && preview ? (
                <div className="flex items-center gap-3">
                    <img src={preview} alt="Foto seleccionada" className="h-16 w-16 rounded-lg object-cover border border-border" />
                    <div className="min-w-0 flex-1">
                        <p className="text-label font-bold text-brand-dark truncate">{file.name}</p>
                        <p className="text-micro text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <IconButton
                        icon={<X className="h-4 w-4" />}
                        variant="danger"
                        onClick={() => handlePick(null)}
                        disabled={disabled}
                        className="shrink-0"
                        aria-label="Quitar foto"
                    />
                </div>
            ) : (
                <Button
                    variant="outline"
                    onClick={() => inputRef.current?.click()}
                    disabled={disabled}
                    leftIcon={<Camera className="h-4 w-4" />}
                    className="w-full h-auto py-3 rounded-xl border-dashed border-border text-label font-bold text-muted-foreground hover:border-brand-primary/40 hover:text-brand-dark hover:bg-transparent"
                >
                    {label}
                </Button>
            )}
        </div>
    );
};
