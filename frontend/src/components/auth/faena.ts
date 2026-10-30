/**
 * Lógica pura del fondo «Faena de madrugada» del inicio de sesión (diseno.md §9.19).
 *
 * La escena avanza de 0 (05:30, de noche, dos pisos) a 1 (07:15, amanece, diez pisos). Sola tarda
 * 40 s; cada tecla en el formulario la empuja un poco; al entrar corre al amanecer. Ya amanecida,
 * espera unos segundos y la faena vuelve a empezar (salvo que se esté entrando).
 */

/** Cada cuánto avanza la escena. */
export const TIC_MS = 100;
/** Avance por tic sin tocar nada: 0,0025 × 10 tics/s → 40 s de la noche al amanecer. */
export const PASO_SOLO = 0.0025;
/** Avance por tecla escrita en el formulario. */
export const PASO_TECLA = 0.035;
/** Avance por tic mientras se entra: del todo de noche al amanecer en 0,8 s. */
export const PASO_ENTRANDO = 0.125;
/** Tics que se queda amanecido antes de volver a empezar (4 s). */
export const TICS_AMANECIDO = 40;

/** Alto de cada piso del edificio en obra, en unidades de la escena. */
export const ALTO_PISO = 26;
/** Altura del suelo de la escena (los edificios se paran aquí). */
export const SUELO_Y = 652;

export interface EstadoFaena {
    /** 0 = 05:30 de noche · 1 = 07:15 amaneció. */
    avance: number;
    /** Tics que lleva amanecido. */
    espera: number;
    /** Teclas escritas: cada una saca una chispa de soldadura en el piso de arriba. */
    chispas: number;
}

export const FAENA_INICIAL: EstadoFaena = { avance: 0, espera: 0, chispas: 0 };

/** Suma un paso sin pasarse de 1 y redondeando: 10 × 0,1 en coma flotante da 0,999…, y el amanecer es `>= 1`. */
const sumar = (avance: number, paso: number): number => Math.min(1, Math.round((avance + paso) * 1e6) / 1e6);

/** Un tic del reloj. Devuelve el MISMO objeto si nada cambia (React no vuelve a pintar). */
export const avanzarFaena = (e: EstadoFaena, entrando: boolean): EstadoFaena => {
    if (e.avance < 1) {
        return { ...e, avance: sumar(e.avance, entrando ? PASO_ENTRANDO : PASO_SOLO), espera: 0 };
    }
    if (entrando) return e;
    if (e.espera + 1 >= TICS_AMANECIDO) return { ...e, avance: 0, espera: 0 };
    return { ...e, espera: e.espera + 1 };
};

/** Una tecla en el formulario: la obra sube un poco y salta una chispa. */
export const teclaFaena = (e: EstadoFaena): EstadoFaena => ({
    ...e,
    avance: sumar(e.avance, PASO_TECLA),
    chispas: e.chispas + 1,
});

/** Pisos del edificio en obra: 2 de noche, 10 al amanecer. */
export const pisosObra = (avance: number): number => 2 + Math.floor(Math.min(1, Math.max(0, avance)) * 8.99);

/** Hora de la faena: 05:30 → 07:15. */
export const horaFaena = (avance: number): string => {
    const minutos = Math.round(330 + Math.min(1, Math.max(0, avance)) * 105);
    return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
};

/** El rótulo de abajo a la derecha. */
export const rotuloFaena = (avance: number): string =>
    `${horaFaena(avance)} · ${avance >= 1 ? 'AMANECE EN LA OBRA' : 'FAENA DE MADRUGADA'}`;

/** Dónde salta la chispa: sobre el piso de arriba, corriéndose un poco con cada tecla. */
export const posicionChispa = (chispas: number, pisos: number): { x: number; y: number } => ({
    x: 230 + ((chispas * 37) % 80),
    y: SUELO_Y - pisos * ALTO_PISO + 4,
});
