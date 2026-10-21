import { LayoutGrid, ImagePlus, Save, type LucideIcon } from 'lucide-react';

/**
 * Novedades de Bóveda (2026-10-20): lo nuevo de cada entrega, explicado en tarjetas que se deslizan
 * (`NovedadesModal`). Se muestran UNA vez por persona y por entrega, al entrar al Inicio. Para una entrega
 * nueva: agregar arriba un bloque con `id` nuevo (la fecha), y en cada tarjeta lo que cambia para quien
 * usa Bóveda —qué hace y dónde está—, no cómo se programó. `permiso`: la tarjeta solo la ve quien lo tiene.
 *
 * OJO: solo lo que YA está en el ambiente donde se muestra (si algo no se subió, su tarjeta no va).
 */
export interface TarjetaNovedad {
    icon: LucideIcon;
    titulo: string;
    texto: string;
    permiso?: string;
}

export interface EntregaNovedades {
    /** Fecha de la entrega (AAAA-MM-DD): es la llave de «ya la vi». */
    id: string;
    tarjetas: TarjetaNovedad[];
}

export const NOVEDADES: EntregaNovedades[] = [
    {
        id: '2026-10-20',
        tarjetas: [
            {
                icon: LayoutGrid,
                titulo: 'El Inicio, por tarjetas',
                texto: 'Toca una tarjeta y abajo aparece todo su detalle; la elegida queda en verde. Tócala de nuevo para cerrarla.',
            },
            {
                icon: ImagePlus,
                titulo: 'Buzón de ideas, más fácil',
                texto: 'Elige a la izquierda si es una idea, algo que te cuesta o algo que no funciona, y arrastra o pega tu pantallazo.',
            },
            {
                icon: Save,
                titulo: 'Guardar te avisa cuando falta',
                texto: 'Si el día todavía no está guardado o cambiaste algo, el botón Guardar se ilumina y queda un punto ámbar.',
                permiso: 'asistencia.guardar',
            },
        ],
    },
];

export const ULTIMAS_NOVEDADES = NOVEDADES[0];
