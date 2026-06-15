/**
 * Rastreador del último punto de puntero (Design System — apertura de modales).
 *
 * Adjunta un único listener `pointerdown` pasivo en `window` para recordar dónde
 * tocó/cliqueó el usuario por última vez. Los modales lo leen al abrirse para
 * animar la card "emanando" desde el botón que los disparó (origin-aware open),
 * sin que cada call-site tenga que pasar coordenadas.
 *
 * `getPointerOrigin()` devuelve el punto solo si es RECIENTE (< MAX_AGE_MS) y
 * está dentro del viewport; si no, `null` → el modal cae centrado (aperturas
 * programáticas o sin clic reciente).
 */

interface PointerSample { x: number; y: number; t: number; }

const MAX_AGE_MS = 1200;
let last: PointerSample | null = null;
let attached = false;

function ensureListener(): void {
    if (attached || typeof window === 'undefined') return;
    attached = true;
    // capture:true → registramos el punto antes de que cualquier handler que
    // abra el modal (en fase de burbuja) corra. passive → cero coste.
    window.addEventListener(
        'pointerdown',
        (e: PointerEvent) => { last = { x: e.clientX, y: e.clientY, t: e.timeStamp }; },
        { passive: true, capture: true },
    );
}

// Se engancha al importar el módulo (lado cliente).
ensureListener();

/** Punto del último pointer-down si es reciente y on-screen; si no, `null`. */
export function getPointerOrigin(): { x: number; y: number } | null {
    if (typeof window === 'undefined' || !last) return null;
    // e.timeStamp y performance.now() comparten time-origin → diferencia = edad en ms.
    if (performance.now() - last.t > MAX_AGE_MS) return null;
    const { x, y } = last;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return null;
    return { x, y };
}
