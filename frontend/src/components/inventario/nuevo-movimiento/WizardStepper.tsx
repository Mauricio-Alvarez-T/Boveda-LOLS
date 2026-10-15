import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../../utils/cn';

/**
 * Indicador de pasos 1→2→3 del wizard "Nuevo movimiento" (Fase 4). También lo usa el
 * tutorial de Ayuda (`JourneyRunner`) para su recorrido Crear → Aprobar → Recibir.
 */
export const WizardStepper: React.FC<{ pasos: string[]; actual: number }> = ({ pasos, actual }) => (
    <div className="flex items-center justify-center gap-1 sm:gap-2 px-2">
        {pasos.map((label, idx) => {
            const completado = idx < actual;
            const activo = idx === actual;
            return (
                <React.Fragment key={label}>
                    {/* Idea: Stepper de React Bits (reactbits.dev, MIT + Commons Clause). Reescrito; sin código copiado.
                        Conector que se llena (diseno.md §9.7): `scale-x` desde `origin-left`, nunca `width`.
                        Al avanzar se llena hacia la derecha; al volver se vacía hacia la izquierda (§8.11).
                        Con reduce-motion cambia en seco. */}
                    {idx > 0 && (
                        <div className="relative h-0.5 w-6 sm:w-10 overflow-hidden rounded-full bg-muted">
                            <div className={cn(
                                'absolute inset-0 origin-left bg-brand-primary transition-transform duration-200 ease-apple motion-reduce:transition-none',
                                idx <= actual ? 'scale-x-100' : 'scale-x-0',
                            )} />
                        </div>
                    )}
                    <div className="flex items-center gap-1.5">
                        <div className={cn(
                            'h-6 w-6 rounded-full flex items-center justify-center text-caption font-black border-2 transition-all',
                            completado ? 'bg-brand-primary border-brand-primary text-white'
                                : activo ? 'border-brand-primary text-brand-primary ring-4 ring-brand-primary/15'
                                    : 'border-border text-muted-foreground/50'
                        )}>
                            {completado ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                        </div>
                        <span className={cn('text-label font-bold whitespace-nowrap hidden sm:block', activo ? 'text-brand-dark' : 'text-muted-foreground/60')}>{label}</span>
                    </div>
                </React.Fragment>
            );
        })}
    </div>
);
