import React, { forwardRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '../../ui/Button';
import { ID_DETALLE_INICIO } from './BotonVerMas';

interface Props {
    icon: React.ElementType;
    /** «Asistencia». */
    titulo: string;
    /** Qué se ve aquí, en una línea. */
    descripcion: string;
    /** Enlace al módulo completo. */
    accion: { texto: string; onClick: () => void };
    children: React.ReactNode;
}

/**
 * Sección de detalle bajo las cuatro tarjetas del Inicio (dueño 2026-10-20): cada tarjeta es la puerta
 * («Ver más») y aquí se despliega su módulo con más información —listas completas, gráficos— que iremos
 * sumando. Una sola sección a la vez; al entrar no hay ninguna abierta.
 */
export const DetalleModulo = forwardRef<HTMLElement, Props>(({ icon: Icon, titulo, descripcion, accion, children }, ref) => (
    <section ref={ref} id={ID_DETALLE_INICIO} aria-label={`Detalle de ${titulo}`} className="scroll-mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 sm:items-end">
            <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                    <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                    <h2 className="text-lg font-bold tracking-tight text-foreground">{titulo}</h2>
                    {/* En el celular se omite para ganar alto (dueño 2026-10-20). */}
                    <p className="hidden text-sm text-muted-foreground sm:block">{descripcion}</p>
                </div>
            </div>
            <Button variant="link" size="sm" onClick={accion.onClick} rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />}
                className="text-green-700 dark:text-green-300">
                {accion.texto}
            </Button>
        </div>
        {children}
    </section>
));
DetalleModulo.displayName = 'DetalleModulo';
