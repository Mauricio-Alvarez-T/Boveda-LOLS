import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

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
                <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6 m-4 flex flex-col items-center text-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                        <AlertTriangle className="h-6 w-6 text-red-600" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-red-900 uppercase">Error en Sábados Extra</h3>
                        <p className="text-xs text-red-800 mt-1 font-medium">
                            {this.state.error?.message || 'Ocurrió un error inesperado.'}
                        </p>
                        <p className="text-[10px] text-red-700 mt-2">
                            Detalles en la consola del navegador (F12). El resto de la app sigue funcionando.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={this.handleReset}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors"
                    >
                        <RefreshCw className="h-3.5 w-3.5" /> Reintentar
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default SabadosErrorBoundary;
