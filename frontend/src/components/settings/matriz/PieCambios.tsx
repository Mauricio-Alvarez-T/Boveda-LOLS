import React from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cn } from '../../../utils/cn';

/**
 * Pie fijo de la matriz de roles: cuánto cambió, en qué roles y a quién afecta. Guardar cierra la sesión
 * de esas personas (el POST sube `roles.version`), así que se dice antes, no después.
 */

interface Props {
    totalCambios: number;
    roles: string[];
    personas: number;
    cambiaMiRol: boolean;
    saving: boolean;
    onDeshacer: () => void;
    onGuardar: () => void;
}

const unirConY = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

export const PieCambios: React.FC<Props> = ({ totalCambios, roles, personas, cambiaMiRol, saving, onDeshacer, onGuardar }) => {
    const limpio = totalCambios === 0;
    return (
        <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card px-4 py-3 shadow-lg">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', limpio ? 'bg-muted-foreground/40' : 'bg-warning')} aria-hidden="true" />
                <div className="min-w-0" aria-live="polite">
                    <p className="text-ui font-semibold text-brand-dark">
                        {limpio ? 'Sin cambios' : `${totalCambios} ${totalCambios === 1 ? 'cambio' : 'cambios'} sin guardar en ${unirConY(roles)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {limpio
                            ? 'Super Administrador siempre tiene todo.'
                            : `Afecta a ${personas} ${personas === 1 ? 'persona' : 'personas'}: al guardar se les cierra la sesión y ven los cambios al volver a entrar.`}
                    </p>
                    {cambiaMiRol && (
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Cambia tu propio rol: también se te cerrará la sesión.</p>
                    )}
                </div>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={onDeshacer} disabled={limpio || saving} leftIcon={<RotateCcw className="h-4 w-4" />}>
                    Deshacer
                </Button>
                <Button onClick={onGuardar} disabled={limpio} isLoading={saving} leftIcon={<Save className="h-4 w-4" />}>
                    Guardar
                </Button>
            </div>
        </div>
    );
};
