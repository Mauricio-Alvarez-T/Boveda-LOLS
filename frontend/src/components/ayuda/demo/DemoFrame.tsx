import React, { useState } from 'react';
import { Sparkles, RotateCcw } from 'lucide-react';
import { Button } from '../../ui/Button';

/**
 * Contenedor "sandbox" de las demos interactivas del Centro de ayuda. Muestra un
 * aviso de que es una demostración (no afecta datos reales) y un botón Reiniciar
 * que REMONTA el demo (vía `key`) para volver al estado inicial. El demo se pasa
 * como render-prop para poder remontarlo al reiniciar.
 */
export const DemoFrame: React.FC<{ render: () => React.ReactNode }> = ({ render }) => {
    const [nonce, setNonce] = useState(0);
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-info/30 bg-info/5 px-3 py-2.5">
                <p className="flex items-center gap-2 text-caption text-brand-dark">
                    <Sparkles className="h-4 w-4 shrink-0 text-info" />
                    <span><span className="font-bold">Demostración interactiva.</span> Practica con datos de ejemplo — no afecta la información real de la app.</span>
                </p>
                <Button variant="ghost" size="sm" onClick={() => setNonce(n => n + 1)} leftIcon={<RotateCcw className="h-3.5 w-3.5" />} className="shrink-0">
                    Reiniciar
                </Button>
            </div>
            <div key={nonce}>{render()}</div>
        </div>
    );
};
