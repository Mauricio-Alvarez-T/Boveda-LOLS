import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/Button';

interface Props {
    children: React.ReactNode;
    onReset?: () => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Error boundary específico para el tab "Sábados Extra".
 * Evita que un crash de renderizado deje toda la app en pantalla blanca:
 * captura el error y muestra una vista de fallback con botón de reintento.
 *
 * Logs el error a console.error para diagnóstico desde DevTools.
 */
export class SabadosErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        // eslint-disable-next-line no-console
        console.error('[SabadosExtra] error capturado:', error, info);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
        if (this.props.onReset) this.props.onReset();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-900/60 rounded-2xl p-6 m-4 flex flex-col items-center text-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
                        <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-red-900 dark:text-red-300 uppercase">Error en Sábados Extra</h3>
                        <p className="text-xs text-red-800 dark:text-red-300 mt-1 font-medium">
                            {this.state.error?.message || 'Ocurrió un error inesperado.'}
                        </p>
                        <p className="text-caption text-red-700 dark:text-red-400 mt-2">
                            Detalles en la consola del navegador (F12). El resto de la app sigue funcionando.
                        </p>
                    </div>
                    <Button
                        variant="primary"
                        onClick={this.handleReset}
                        leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                        className="text-xs font-bold"
                    >
                        Reintentar
                    </Button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default SabadosErrorBoundary;
