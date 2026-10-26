/**
 * Franja de «ver como» (Soporte · usuarios, 2026-10-23): mientras el Super Administrador mira la app como otra persona,
 * una franja fija arriba de TODA la app (sobre el menú y el contenido) lo dice siempre: con quién, en qué modo, cuánto
 * le queda y cómo volver. La franja no cambia con el tema (como la de entorno); el color dice el modo
 * (diseno-lols: color con significado):
 *   - Solo lectura: ámbar sólido = aviso, texto casi negro (más de 10:1). Botón «Solo lectura · Activar cambios»
 *     (Marcos 2026-10-26): abre la advertencia (`ActivarCambiosVerComo`) antes de dejar escribir.
 *   - Modo cambios: rojo sólido = atención, texto blanco (6,4:1, AA): «MODO CAMBIOS · todo queda registrado», con
 *     «Volver a solo lectura» y «Volver a mi cuenta».
 * Botones de 44 px en el teléfono. Al vencer, vuelve sola a la cuenta propia (el servidor ya no aceptaría el token).
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Eye, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AVISOS_VER_COMO, enModoCambios, textoVence } from '../../context/verComoSesion';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { ActivarCambiosVerComo } from './ActivarCambiosVerComo';

const BOTON = 'h-11 px-3.5 text-sm font-semibold sm:h-8';

export const FranjaVerComo: React.FC = () => {
    const { verComo, salirVerComo, activarCambiosVerComo, volverASoloLecturaVerComo } = useAuth();
    const [ahora, setAhora] = useState(() => Date.now());
    const [advertencia, setAdvertencia] = useState(false);

    // Reloj: cada 15 s para el «vence en N min», y uno exacto para el final.
    useEffect(() => {
        if (!verComo) return;
        const tic = window.setInterval(() => setAhora(Date.now()), 15_000);
        const fin = window.setTimeout(() => salirVerComo?.(AVISOS_VER_COMO.vencio), Math.max(0, verComo.vence - Date.now()));
        return () => { window.clearInterval(tic); window.clearTimeout(fin); };
    }, [verComo, salirVerComo]);

    if (!verComo) return null;
    const { user } = verComo;
    const cambios = enModoCambios(verComo);

    return (
        <div role="status" aria-live="polite"
            className={cn(
                'shrink-0 z-[70] flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-2 text-xs sm:text-sm',
                cambios ? 'bg-red-700 text-white' : 'bg-amber-400 text-neutral-950',
            )}>
            <p className="min-w-0 text-center leading-snug">
                {cambios
                    ? <AlertTriangle aria-hidden className="mr-1.5 inline h-4 w-4 -translate-y-px align-middle" />
                    : <Eye aria-hidden className="mr-1.5 inline h-4 w-4 -translate-y-px align-middle" />}
                <span className="font-semibold">Viendo como {user.nombre}</span>
                {user.rol ? <> ({user.rol})</> : null}
                <span aria-hidden> · </span>
                {/* Cada tramo sin cortar por dentro: en el teléfono la línea se parte en los « · ». */}
                {cambios ? (
                    <>
                        <span className="whitespace-nowrap font-bold tracking-wide">MODO CAMBIOS</span>
                        <span aria-hidden> · </span>
                        <span className="whitespace-nowrap">todo queda registrado</span>
                    </>
                ) : (
                    <span className="whitespace-nowrap font-semibold">solo lectura</span>
                )}
                <span aria-hidden> · </span>
                <span className="whitespace-nowrap tabular-nums">{textoVence(verComo.vence, ahora)}</span>
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
                {cambios ? (
                    volverASoloLecturaVerComo && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => volverASoloLecturaVerComo()}
                            className={cn(BOTON, 'border border-white bg-transparent text-white hover:bg-white/15 active:bg-white/25 focus-visible:ring-white/50 focus-visible:ring-offset-red-700')}
                        >
                            Volver a solo lectura
                        </Button>
                    )
                ) : (
                    activarCambiosVerComo && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setAdvertencia(true)}
                            leftIcon={<Lock className="h-4 w-4" aria-hidden />}
                            className={cn(BOTON, 'border border-neutral-950 bg-transparent text-neutral-950 hover:bg-neutral-950/10 active:bg-neutral-950/20 focus-visible:ring-neutral-950/40 focus-visible:ring-offset-amber-400')}
                        >
                            Solo lectura · Activar cambios
                        </Button>
                    )
                )}
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => salirVerComo?.()}
                    className={cn(BOTON, cambios
                        ? 'bg-white text-red-800 hover:bg-red-50 active:bg-red-100 focus-visible:ring-white/50 focus-visible:ring-offset-red-700'
                        : 'bg-neutral-950 text-white hover:bg-neutral-800 active:bg-neutral-700 focus-visible:ring-neutral-950/40 focus-visible:ring-offset-amber-400')}
                >
                    Volver a mi cuenta
                </Button>
            </div>
            {activarCambiosVerComo && (
                <ActivarCambiosVerComo isOpen={advertencia && !cambios} onClose={() => setAdvertencia(false)} verComo={verComo} />
            )}
        </div>
    );
};
