import { useState } from 'react';

type Fase = 'sin' | 'esperando' | 'llego';

/**
 * Clase para el contenedor de datos de una sección: `datos-aparecen` (fundido de 160 ms, index.css) SOLO si antes
 * se vio el contorno de carga, o sea si los datos llegaron después de entrar. Dueño 2026-10-22: en Chrome se veía
 * «un ligero parpadeo» porque todo se desvanecía al entrar, también con los datos ya en caché. Así:
 * - con datos al montar (`cargando` falso) → nada: aparecen en seco;
 * - contorno y después datos → el contenedor aparece con el fundido, una sola vez;
 * - una recarga posterior (cargando otra vez con datos a la vista) no lo repite: la clase queda fija.
 * `cargando` debe ser verdadero desde el primer render mientras no hay datos (si el `loading` de la pantalla parte
 * en false, pasar también «todavía no llegan», como Vehículos).
 */
export function useAparecer(cargando: boolean): string {
    const [fase, setFase] = useState<Fase>(cargando ? 'esperando' : 'sin');
    // Ajuste de estado durante el render (diseno.md §9.9): sin efecto ni un frame de más.
    if (fase === 'esperando' && !cargando) setFase('llego');
    return fase === 'llego' ? 'datos-aparecen' : '';
}
