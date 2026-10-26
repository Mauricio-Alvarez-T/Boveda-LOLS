/**
 * Franja de «ver como» (Soporte · usuarios, 2026-10-23): mientras el Super Administrador mira la app como otra persona,
 * una franja fija arriba de TODA la app (sobre el menú y el contenido) lo dice siempre: con quién, que es solo lectura,
 * cuánto le queda y cómo volver. Ámbar sólido = aviso (diseno-lols: color con significado), texto casi negro: el
 * contraste pasa de 10:1 en claro y en oscuro (la franja no cambia con el tema, como la de entorno).
 * Al vencer, vuelve sola a la cuenta propia (el servidor ya no aceptaría el token).
 */
import React, { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AVISOS_VER_COMO, textoVence } from '../../context/verComoSesion';
import { Button } from '../ui/Button';

export const FranjaVerComo: React.FC = () => {
    const { verComo, salirVerComo } = useAuth();
    const [ahora, setAhora] = useState(() => Date.now());

    // Reloj: cada 15 s para el «vence en N min», y uno exacto para el final.
    useEffect(() => {
        if (!verComo) return;
        const tic = window.setInterval(() => setAhora(Date.now()), 15_000);
        const fin = window.setTimeout(() => salirVerComo?.(AVISOS_VER_COMO.vencio), Math.max(0, verComo.vence - Date.now()));
        return () => { window.clearInterval(tic); window.clearTimeout(fin); };
    }, [verComo, salirVerComo]);

    if (!verComo) return null;
    const { user } = verComo;

    return (
        <div role="status" aria-live="polite"
            className="shrink-0 z-[70] flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 bg-amber-400 px-4 py-2 text-xs sm:text-sm text-neutral-950">
            <p className="min-w-0 text-center leading-snug">
                <Eye aria-hidden className="mr-1.5 inline h-4 w-4 -translate-y-px align-middle" />
                <span className="font-semibold">Viendo como {user.nombre}</span>
                {user.rol ? <> ({user.rol})</> : null}
                <span aria-hidden> · </span>
                <span className="font-semibold">solo lectura</span>
                <span aria-hidden> · </span>
                <span className="tabular-nums">{textoVence(verComo.vence, ahora)}</span>
            </p>
            <Button
                variant="secondary"
                size="sm"
                onClick={() => salirVerComo?.()}
                className="h-8 bg-neutral-950 px-3.5 text-sm font-semibold text-white hover:bg-neutral-800 active:bg-neutral-700 focus-visible:ring-neutral-950/40 focus-visible:ring-offset-amber-400"
            >
                Volver a mi cuenta
            </Button>
        </div>
    );
};
