import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from './Button';

interface Props {
    children: React.ReactNode;
    /** Al cambiar (y estando en error) resetea el boundary → permite recuperar
     *  sin recargar, p. ej. pasando la ruta activa para que navegar reintente. */
    resetKey?: unknown;
    /** Fallback a pantalla completa (raíz de la app) vs. dentro del contenido. */
    fullScreen?: boolean;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * ErrorBoundary genérico. Captura crashes de render para que un throw en una
 * página no deje toda la app en pantalla blanca: muestra un fallback con botón
 * de recarga. Logea a console.error para diagnóstico en DevTools.
 */
export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        // eslint-disable-next-line no-console
        console.error('[ErrorBoundary] crash capturado:', error, info);
    }

    componentDidUpdate(prev: Props) {
        // Si cambió la resetKey (ej. nueva ruta) y estábamos en error, recuperar.
        if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
            this.setState({ hasError: false, error: null });
        }
    }

    handleReload = () => { window.location.reload(); };

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div className={cn(
                "flex items-center justify-center",
                this.props.fullScreen ? "min-h-[100dvh] bg-background p-6" : "flex-1 p-6"
            )}>
                <div className="bg-card border border-border rounded-card shadow-sm p-6 max-w-md w-full flex flex-col items-center text-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                        <AlertTriangle className="h-6 w-6 text-destructive" />
                    </div>
                    <div>
                        <h3 className="text-section font-bold text-brand-dark">Algo salió mal</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                            Ocurrió un error inesperado en esta pantalla. El resto de la app sigue funcionando.
                        </p>
                        {this.state.error?.message && (
                            <p className="text-caption text-muted-foreground/70 mt-2 font-mono break-words">
                                {this.state.error.message}
                            </p>
                        )}
                    </div>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={this.handleReload}
                        leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                        className="text-xs font-bold"
                    >
                        Recargar página
                    </Button>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
