import type { TonoTarjeta } from './tarjetaActiva';

/**
 * Piezas sin dibujo de las fichas del detalle del Inicio para Inventario y Vehículos (2026-10-22, Marcos eligió
 * las opciones «Fichas por solicitud» y «Fichas por vehículo»). Copian las clases de las fichas de Mauricio
 * (`FichasReiterados.tsx`) para que los cuatro detalles se vean de la misma familia; no las reemplazan.
 * Los componentes viven en `FichaInicio.tsx`.
 */

/** Rótulo de sección («REQUIERE ACCIÓN · …»), igual que en DetalleAsistencia. */
export const ROTULO_FICHAS = 'text-label font-bold uppercase tracking-[0.08em] text-muted-foreground';

/** Píldora y círculo de la ficha (mismos colores que FichasReiterados: rojo y neutro idénticos). */
export const PILDORA: Record<TonoTarjeta, string> = {
    rojo: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
    ambar: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    azul: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    verde: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
    neutro: 'bg-muted text-zinc-700 dark:text-zinc-300',
};

/** Cifra grande de la ficha. */
export const CIFRA: Record<TonoTarjeta, string> = {
    rojo: 'text-red-700 dark:text-red-300',
    ambar: 'text-amber-700 dark:text-amber-300',
    azul: 'text-blue-700 dark:text-blue-300',
    verde: 'text-green-700 dark:text-green-300',
    neutro: 'text-foreground',
};

/** Cuadrito de un mini gráfico (semáforo de papeles): rojo y neutro = celdas de FichasReiterados. */
export const CUADRO: Record<TonoTarjeta, string> = {
    rojo: 'bg-red-600 dark:bg-red-500',
    ambar: 'bg-amber-400',
    azul: 'bg-blue-500',
    verde: 'bg-green-600',
    neutro: 'bg-muted',
};

/** 1 → singular; 0 y varios → plural («0 días esperando»). */
export const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Iniciales de las dos primeras palabras, en mayúscula («Luis Fuentes» → «LF»). */
export const iniciales = (nombre: string) =>
    nombre.trim().split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();

/** Primer nombre («Óscar Núñez» → «Óscar»). */
export const nombreCorto = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? '';
