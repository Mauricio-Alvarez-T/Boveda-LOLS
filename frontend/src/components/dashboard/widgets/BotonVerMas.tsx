import React from 'react';
import { ArrowDown } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cn } from '../../../utils/cn';

/** Id de la sección de detalle bajo las tarjetas del Inicio (destino de `aria-controls`). */
export const ID_DETALLE_INICIO = 'inicio-detalle';

interface Props {
    activo: boolean;
    onClick: () => void;
    /** «Asistencia», para el nombre accesible. */
    modulo: string;
}

/**
 * «Ver más ↓» de las tarjetas del Inicio (dueño 2026-10-20): cada tarjeta es la puerta a un detalle que
 * se abre debajo de las cuatro. Activo = ese detalle es el que se está viendo.
 */
export const BotonVerMas: React.FC<Props> = ({ activo, onClick, modulo }) => (
    <Button
        variant="link"
        size="sm"
        onClick={onClick}
        aria-expanded={activo}
        aria-controls={ID_DETALLE_INICIO}
        aria-label={activo ? `Viendo el detalle de ${modulo}` : `Ver más de ${modulo}`}
        rightIcon={<ArrowDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', activo && 'translate-y-0.5')} aria-hidden />}
        className="text-green-700 dark:text-green-300"
    >
        {activo ? 'Viendo detalle' : 'Ver más'}
    </Button>
);
