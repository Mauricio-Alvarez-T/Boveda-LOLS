import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeMode } from '../../context/ThemeContext';

const OPTIONS: { mode: ThemeMode; label: string; hint: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { mode: 'light', label: 'Claro', hint: 'Tema claro', Icon: Sun },
    { mode: 'dark', label: 'Oscuro', hint: 'Tema oscuro', Icon: Moon },
    { mode: 'system', label: 'Sistema', hint: 'Sistema — usa el tema configurado en tu equipo', Icon: Monitor },
];

/**
 * Segmented control (estilo Apple) para alternar entre tema claro, oscuro
 * y "seguir sistema". Usa tokens del design system, por lo que se adapta
 * solo a ambos modos.
 */
export const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
    const { theme, setTheme } = useTheme();

    return (
        <div
            role="radiogroup"
            aria-label="Tema de la interfaz"
            className={cn(
                'inline-flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border',
                className
            )}
        >
            {OPTIONS.map(({ mode, label, hint, Icon }) => {
                const active = theme === mode;
                return (
                    <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={label}
                        title={hint}
                        onClick={() => setTheme(mode)}
                        className={cn(
                            'flex items-center justify-center h-8 w-8 rounded-lg transition-all duration-200',
                            active
                                ? 'bg-card text-brand-primary shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        <Icon className="h-4 w-4" />
                    </button>
                );
            })}
        </div>
    );
};
