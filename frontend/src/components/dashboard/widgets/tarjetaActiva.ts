import { createContext, useContext } from 'react';

/** Tono de una tarjeta del Inicio (diseno.md §9.14): rojo, ámbar, azul, verde o neutro. */
export type TonoTarjeta = 'rojo' | 'ambar' | 'azul' | 'verde' | 'neutro';

/**
 * true dentro de la tarjeta elegida del Inicio, que se pinta entera de verde LOLS (dueño 2026-10-20).
 * Sobre verde el rojo y el verde no se leen, así que: círculo BLANCO con el ícono en su color (el
 * significado sigue en el ícono) y cifras en amarillo claro si avisan algo (rojo/ámbar) o en blanco si no.
 */
export const TarjetaActiva = createContext(false);
export const useTarjetaActiva = () => useContext(TarjetaActiva);

/**
 * Color de un número que avisa algo, sobre la tarjeta verde: amarillo claro. Contraste 3,8:1 sobre
 * green-700 (medido 2026-10-20): sirve SOLO para cifras grandes en negrita (≥ 19 px bold, la cifra de
 * 48 px, los totales de 20 px bold). Un texto chico de aviso va en blanco.
 */
export const CIFRA_SOBRE_VERDE: Record<TonoTarjeta, string> = {
    rojo: 'text-yellow-300',
    ambar: 'text-yellow-300',
    azul: 'text-white',
    verde: 'text-white',
    neutro: 'text-white',
};

/** Círculo sobre la tarjeta verde: blanco, con el ícono en su color (el significado sigue ahí). */
export const ICONO_SOBRE_VERDE: Record<TonoTarjeta, string> = {
    rojo: 'bg-white text-red-600',
    ambar: 'bg-white text-amber-600',
    azul: 'bg-white text-blue-600',
    verde: 'bg-white text-green-700',
    neutro: 'bg-white text-green-800',
};

/** Círculo del encabezado: color SÓLIDO con el ícono en blanco. */
export const CIRCULO_TARJETA: Record<TonoTarjeta, string> = {
    rojo: 'bg-red-600 text-white',
    ambar: 'bg-amber-600 text-white',
    azul: 'bg-blue-600 text-white',
    verde: 'bg-green-700 text-white',
    neutro: 'bg-muted text-muted-foreground',
};

/** Color de la cifra grande: rampa 700/300 (texto con color que pasa AA en claro y oscuro). */
export const CIFRA_TARJETA: Record<TonoTarjeta, string> = {
    rojo: 'text-red-700 dark:text-red-300',
    ambar: 'text-amber-700 dark:text-amber-300',
    azul: 'text-blue-700 dark:text-blue-300',
    verde: 'text-green-700 dark:text-green-300',
    neutro: 'text-foreground',
};
