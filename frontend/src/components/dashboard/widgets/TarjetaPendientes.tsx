import React from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { EncabezadoTarjeta, CifraTarjeta, type TonoTarjeta } from './EncabezadoTarjeta';
import { BotonVerMas } from './BotonVerMas';
import type { BandejaItem } from './BandejaDelDia';

interface Props {
    icon: React.ElementType;
    titulo: string;
    subtitulo?: string;
    /** Filas ya ordenadas por gravedad (las críticas primero). */
    items: BandejaItem[];
    /** Total a mostrar en la cifra (puede ser mayor que `items` si hay filas resumidas). */
    total: number;
    onNavigate: (ruta: string) => void;
    activo: boolean;
    onVerMas: () => void;
    modulo: string;
}

const MAX_FILAS = 3;

const ICONO = { critical: AlertCircle, warning: AlertTriangle, info: Info } as const;
const COLOR = {
    critical: 'text-red-700 dark:text-red-300',
    warning: 'text-amber-700 dark:text-amber-300',
    info: 'text-blue-700 dark:text-blue-300',
} as const;

/**
 * Tarjeta de pendientes genérica del Inicio (dueño 2026-10-20): cifra + las 3 filas más graves + «Ver
 * más». La usa la tarjeta «Gestiones» para quien no registra entregas de documentos (solicitudes de
 * ingreso, documentos por vencer, contratos, trabajadores sin documentos, lotes del portador).
 */
const TarjetaPendientes: React.FC<Props> = ({ icon, titulo, subtitulo, items, total, onNavigate, activo, onVerMas, modulo }) => {
    const criticas = items.filter(i => i.severity === 'critical').length;
    const tono: TonoTarjeta = criticas > 0 ? 'rojo' : total > 0 ? 'ambar' : 'verde';
    const visibles = items.slice(0, MAX_FILAS);
    return (
        <div className="flex h-full flex-col">
            <EncabezadoTarjeta icon={icon} tono={tono} titulo={titulo} subtitulo={subtitulo} />
            <CifraTarjeta valor={total} etiqueta={total === 1 ? 'pendiente' : 'pendientes'} tono={tono} />
            {visibles.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nada pendiente por ahora.</p>
            ) : (
                <div>
                    {visibles.map((it, i) => {
                        const Icono = ICONO[it.severity];
                        return (
                            // eslint-disable-next-line no-restricted-syntax -- fila de lista (toda la fila navega)
                            <button
                                key={`${it.title}-${i}`}
                                type="button"
                                onClick={() => it.ruta && onNavigate(it.ruta)}
                                className="flex w-full items-start gap-3 border-t border-border py-2.5 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 -mx-2 px-2 rounded-lg"
                            >
                                <Icono className={cn('mt-0.5 h-4 w-4 shrink-0', COLOR[it.severity])} aria-hidden />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-foreground truncate">{it.title}</p>
                                    {it.description && <p className="text-xs text-muted-foreground truncate">{it.description}</p>}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
            <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                <span className="text-xs text-muted-foreground">{total > visibles.length ? `y ${total - visibles.length} más` : ''}</span>
                <BotonVerMas activo={activo} onClick={onVerMas} modulo={modulo} />
            </div>
        </div>
    );
};

export default TarjetaPendientes;
