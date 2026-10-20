import React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '../../ui/Button';
import { useTarjetaActiva } from './tarjetaActiva';

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
 * se abre debajo de las cuatro. Activo = ese detalle está abierto, y el botón lo cierra («Ocultar ↑»).
 */
export const BotonVerMas: React.FC<Props> = ({ activo, onClick, modulo }) => {
    const sobreVerde = useTarjetaActiva();
    return (
    <Button
        variant="link"
        size="sm"
        onClick={onClick}
        aria-expanded={activo}
        aria-controls={ID_DETALLE_INICIO}
        aria-label={activo ? `Ocultar el detalle de ${modulo}` : `Ver más de ${modulo}`}
        rightIcon={activo ? <ArrowUp className="h-4 w-4" aria-hidden /> : <ArrowDown className="h-4 w-4" aria-hidden />}
        className={sobreVerde ? 'text-white' : 'text-green-700 dark:text-green-300'}
    >
        {activo ? 'Ocultar' : 'Ver más'}
    </Button>
    );
};
