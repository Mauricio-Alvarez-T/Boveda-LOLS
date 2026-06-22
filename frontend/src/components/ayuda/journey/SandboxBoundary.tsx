import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Aísla la pantalla REAL montada en un tutorial: si lanza en runtime, muestra un
 * aviso en lugar de tumbar todo el Centro de ayuda. Cada tutorial queda contenido.
 */
export class SandboxBoundary extends React.Component<
    { children: React.ReactNode },
    { error: boolean }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { error: false };
    }

    static getDerivedStateFromError(): { error: boolean } {
        return { error: true };
    }

    componentDidCatch(error: unknown) {
        // eslint-disable-next-line no-console
        console.error('[Tutorial] La pantalla de demostración falló:', error);
    }

    render() {
        if (this.state.error) {
            return (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-10 text-center">
                    <AlertTriangle className="h-6 w-6 text-warning" />
                    <p className="text-sm font-bold text-brand-dark">Esta demostración no está disponible ahora</p>
                    <p className="text-caption text-muted-foreground">Vuelve al listado e intenta con otro tutorial.</p>
                </div>
            );
        }
        return this.props.children;
    }
}
