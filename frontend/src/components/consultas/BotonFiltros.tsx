/**
 * Botón que abre el panel de filtros de la grilla de Trabajadores (2026-09-16).
 *
 * Vive en el extremo IZQUIERDO de la barra de la grilla, que es el borde por el que aparece el panel:
 * antes estaba en el header global, a casi mil píxeles del sitio donde ocurría el efecto. Con el rail
 * abierto en modo `inline` la grilla se corre a la derecha y el botón viaja con ella, así que el propio
 * movimiento cuenta de dónde salió el panel.
 *
 * El icono es la señal principal, no el color: `PanelLeftOpen` → `PanelLeftClose` cuando hay panel
 * lateral, y `SlidersHorizontal` → `X` en teléfono, donde el panel NO entra por la izquierda sino desde
 * abajo y prometer otra cosa sería mentir. Nada de relleno verde persistente: `docs/reglas/diseno.md`
 * pide que el estado activo se lea por el panel abierto, el badge o el cambio de icono.
 *
 * ⚠️ La etiqueta y el `title` NO deben contener "trabajador" ni "crear": el spotlight de los tutoriales
 * de Ayuda busca botones por substring (`useTutorialSpotlight.ts:44-49`) y le robaría el pulso al botón
 * que esos flujos resaltan.
 */
import React from 'react';
import { PanelLeftOpen, PanelLeftClose, SlidersHorizontal, X } from 'lucide-react';

import { Button } from '../ui/Button';
import { cn } from '../../utils/cn';

interface Props {
    abierto: boolean;
    onToggle: () => void;
    /** Filtros puestos (incluye búsqueda y atajos): pinta el badge. */
    activos: number;
    /** true = el panel se despliega al costado izquierdo; false = hoja inferior (teléfono). */
    lateral: boolean;
}

export const BotonFiltros: React.FC<Props> = ({ abierto, onToggle, activos, lateral }) => {
    const Icono = lateral
        ? (abierto ? PanelLeftClose : PanelLeftOpen)
        : (abierto ? X : SlidersHorizontal);

    return (
        <Button
            variant="glass"
            size="sm"
            aria-expanded={abierto}
            title={abierto ? 'Cerrar filtros' : lateral ? 'Abrir filtros (panel lateral)' : 'Abrir filtros'}
            onClick={onToggle}
            leftIcon={
                <Icono
                    key={`${lateral}-${abierto}`}
                    className={cn(
                        'h-4 w-4 animate-in fade-in zoom-in duration-300',
                        // Al pasar el mouse el icono se asoma hacia el lado por el que va a salir el panel.
                        lateral && !abierto && 'transition-transform duration-200 ease-apple group-hover:-translate-x-0.5',
                    )}
                />
            }
            rightIcon={activos > 0 ? (
                <span className={cn(
                    'flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-micro font-bold transition-colors',
                    abierto ? 'bg-brand-primary text-white' : 'bg-muted text-brand-dark',
                )}>
                    {activos}
                </span>
            ) : undefined}
            className={cn(
                'group h-9 shrink-0 rounded-xl border px-3 font-semibold shadow-sm transition-colors',
                abierto
                    // Esquinas izquierdas cuadradas: se lee como una pestaña pegada al panel que acaba de abrir.
                    ? 'border-brand-primary text-brand-primary bg-brand-primary/[0.04] rounded-l-none'
                    : 'border-border text-brand-dark hover:border-brand-primary/40 hover:bg-background',
            )}
        >
            <span className="hidden sm:inline">Filtros</span>
        </Button>
    );
};
