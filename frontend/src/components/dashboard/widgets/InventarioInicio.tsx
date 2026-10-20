import React from 'react';
import { Package } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { EncabezadoTarjeta, CifraTarjeta } from './EncabezadoTarjeta';
import { BotonVerMas } from './BotonVerMas';
import type { FilaInventario, ModeloInventarioInicio, TonoInventario } from './resumenInventarioInicio';

const NUMERO: Record<TonoInventario, string> = {
    rojo: 'text-red-700 dark:text-red-300',
    ambar: 'text-amber-700 dark:text-amber-300',
    verde: 'text-green-700 dark:text-green-300',
    neutro: 'text-foreground',
};

/** Fila de un grupo de solicitudes (por aprobar, diferencias, …): abre la pestaña Solicitudes filtrada. */
export const FilaInventarioInicio: React.FC<{ f: FilaInventario; onClick: () => void }> = ({ f, onClick }) => (
    // eslint-disable-next-line no-restricted-syntax -- fila de lista (toda la fila navega)
    <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 border-t border-border py-2.5 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 -mx-2 px-2 rounded-lg"
    >
        <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{f.texto}</p>
            {f.detalle && <p className="text-xs text-muted-foreground truncate">{f.detalle}</p>}
        </div>
        <span className={cn('shrink-0 text-xl font-bold tabular-nums', NUMERO[f.tono])}>{f.total}</span>
    </button>
);

interface Props {
    modelo: ModeloInventarioInicio;
    onFila: (f: FilaInventario) => void;
    activo: boolean;
    onVerMas: () => void;
}

/** Grupos en la tarjeta; el detalle de abajo los muestra todos. */
const MAX_FILAS = 3;

/**
 * Tarjeta «Inventario» del Inicio (dueño 2026-10-20): lo que le toca a quien mira según su perfil —por
 * aprobar y diferencias por resolver (aprobador), por despachar o por recibir (bodega), y sus propias
 * solicitudes en curso—. Rojo si hay diferencias, ámbar si hay algo por hacer. «Ver más» abre el detalle.
 */
const InventarioInicio: React.FC<Props> = ({ modelo: m, onFila, activo, onVerMas }) => {
    // Primero lo que tiene algo; a igualdad se respeta el orden del flujo.
    const filas = [...m.filas].sort((a, b) => Number(b.total > 0) - Number(a.total > 0)).slice(0, MAX_FILAS);
    return (
        <div className="flex h-full flex-col">
            <EncabezadoTarjeta icon={Package} tono={m.tono} titulo="Inventario" subtitulo="Solicitudes: lo que te toca" />
            <CifraTarjeta valor={m.cifra} etiqueta={m.etiqueta} tono={m.tono} />
            {m.cifra === 0 && m.filas.every(f => f.total === 0) ? (
                <p className="text-sm text-muted-foreground">Nada pendiente en solicitudes.</p>
            ) : (
                <div>
                    {filas.map(f => <FilaInventarioInicio key={f.clave} f={f} onClick={() => onFila(f)} />)}
                </div>
            )}
            <div className="mt-auto flex justify-end pt-3">
                <BotonVerMas activo={activo} onClick={onVerMas} modulo="Inventario" />
            </div>
        </div>
    );
};

export default InventarioInicio;
