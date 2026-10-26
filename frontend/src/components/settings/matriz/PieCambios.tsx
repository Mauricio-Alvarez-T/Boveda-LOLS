import React from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { Button } from '../../ui/Button';

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
    // Sin cambios no hay nada que decir: el pie solo aparece cuando hay algo por guardar.
    if (totalCambios === 0 && !saving) return null;
    return (
        <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card px-4 py-3 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                <div className="min-w-0" aria-live="polite">
                    <p className="text-ui font-semibold text-brand-dark">
                        {`${totalCambios} ${totalCambios === 1 ? 'cambio' : 'cambios'} sin guardar en ${unirConY(roles)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {personas === 0
                            ? 'Nadie tiene hoy este rol.'
                            : `${personas === 1 ? 'Afecta a 1 persona' : `Afecta a ${personas} personas`}: al guardar se le${personas === 1 ? '' : 's'} cierra la sesión y ve${personas === 1 ? '' : 'n'} los cambios al volver a entrar.`}
                    </p>
                    {cambiaMiRol && (
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Cambia tu propio rol: también se te cerrará la sesión.</p>
                    )}
                </div>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={onDeshacer} disabled={saving} leftIcon={<RotateCcw className="h-4 w-4" />}>
                    Deshacer
                </Button>
                <Button onClick={onGuardar} isLoading={saving} leftIcon={<Save className="h-4 w-4" />}>
                    Guardar
                </Button>
            </div>
        </div>
    );
};
