import React, { Suspense } from 'react';
import { ArrowLeft, Clock, MousePointerClick } from 'lucide-react';
import { Button } from '../ui/Button';
import { DemoFrame } from './demo/DemoFrame';
import { DEMO_REGISTRY } from './demo/registry';
import type { Guia } from './guiasData';

/**
 * Vista de un tutorial con demo INTERACTIVA: cabecera de la guía + la pantalla real
 * de la app (montada con datos de ejemplo) dentro del DemoFrame. El demo se resuelve
 * del registry por `guia.demoId`.
 */
export const DemoTutorial: React.FC<{ guia: Guia; onBack: () => void }> = ({ guia, onBack }) => {
    const Icon = guia.icon;
    const Demo = guia.demoId ? DEMO_REGISTRY[guia.demoId] : undefined;

    return (
        <div className="space-y-5">
            <Button variant="ghost" size="sm" onClick={onBack} leftIcon={<ArrowLeft className="h-4 w-4" />}>
                Volver al centro de ayuda
            </Button>

            {/* Cabecera */}
            <div className="flex items-start gap-4">
                <div className="h-12 w-12 shrink-0 rounded-2xl bg-muted flex items-center justify-center">
                    <Icon className="h-6 w-6 text-brand-primary" />
                </div>
                <div className="min-w-0">
                    <p className="text-caption font-bold uppercase tracking-widest text-muted-foreground">{guia.modulo}</p>
                    <h1 className="text-title font-bold text-brand-dark leading-tight">{guia.titulo}</h1>
                    <p className="text-body text-muted-foreground mt-1">{guia.descripcion}</p>
                    {guia.duracion && (
                        <p className="mt-2 inline-flex items-center gap-1.5 text-caption text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" /> {guia.duracion}
                        </p>
                    )}
                </div>
            </div>

            <p className="flex items-center gap-2 text-caption text-muted-foreground">
                <MousePointerClick className="h-4 w-4 shrink-0 text-brand-primary" />
                Esta es la pantalla real de la app. Pruébala: los botones funcionan con datos de ejemplo.
            </p>

            {Demo ? (
                <DemoFrame render={() => (
                    <Suspense fallback={<div className="py-16 text-center text-caption text-muted-foreground">Cargando demostración…</div>}>
                        <Demo />
                    </Suspense>
                )} />
            ) : (
                <p className="text-caption text-muted-foreground">Demo no disponible.</p>
            )}
        </div>
    );
};
