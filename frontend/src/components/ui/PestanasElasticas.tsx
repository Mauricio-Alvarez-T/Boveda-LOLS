// Idea: RubberSegment de React Bits (reactbits.dev, MIT + Commons Clause). Reescrito; sin código copiado.
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'framer-motion';
import { clsx } from 'clsx';
import { indicePorTecla, planElastico, type Tramo } from '../../utils/movimiento';

/** Tiempos del indicador (s). Pedido del dueño 2026-10-16: el ritmo de la demo de React Bits. */
const T_ESTIRA = 0.19;
const T_RELEVO = 0.15;
const T_LLEGA = 0.3;
const T_SUELTA = 0.16;
/** Cuánto se pasa el borde de atrás antes de soltarse (px). */
const APLASTE = 3;
const EASE_SALIDA = [0.23, 1, 0.32, 1] as const;

/** Bordes del indicador y el turno de animación vigente (un clic nuevo invalida los anteriores). */
interface Motor {
    l: MotionValue<number>;
    r: MotionValue<number>;
    turno: { current: number };
    relevo: { current: number | undefined };
}

function detener(m: Motor) {
    window.clearTimeout(m.relevo.current);
    m.relevo.current = undefined;
    m.turno.current += 1;
    m.l.stop();
    m.r.stop();
}

function saltar(m: Motor, t: Tramo | undefined) {
    detener(m);
    if (!t) return;
    m.l.jump(t.l);
    m.r.jump(t.r);
}

/**
 * Dos tiempos: primero los bordes se estiran hasta cubrir la posición actual y el destino (el de
 * adelante ya queda en su lugar); después el de atrás lo sigue con un resorte, se pasa unos px
 * (aplaste) y se suelta. El origen es donde está el indicador AHORA, no la pestaña anterior: si
 * un clic interrumpe un viaje, el indicador no sigue estirándose hacia la pestaña que se dejó.
 */
function viajar(m: Motor, hasta: Tramo | undefined) {
    detener(m); // `stop()` deja cada borde donde iba
    if (!hasta) return;
    const turno = m.turno.current;
    const actual = { l: m.l.get(), r: m.r.get() };
    const plan = planElastico(actual, hasta, APLASTE);
    const asentar = () => {
        if (m.turno.current !== turno) return;
        m.relevo.current = undefined;
        const adelanteDer = plan.direccion === 1;
        const [adelante, atras] = adelanteDer ? [m.r, m.l] : [m.l, m.r];
        // El de adelante normalmente ya llegó al estirarse; el resorte corrige el caso en que
        // venía de un viaje interrumpido más ancho que el destino.
        const llega = { type: 'spring' as const, duration: T_LLEGA, bounce: 0 };
        animate(adelante, adelanteDer ? hasta.r : hasta.l, llega);
        animate(atras, adelanteDer ? plan.aplastado.l : plan.aplastado.r, llega).then(() => {
            if (m.turno.current === turno) {
                animate(atras, adelanteDer ? hasta.l : hasta.r, { type: 'spring', duration: T_SUELTA, bounce: 0 });
            }
        });
    };
    // Si el indicador ya cubre el destino (volver a la pestaña de recién, a medio viaje) no hay
    // nada que estirar: se asienta de inmediato, sin la pausa del relevo.
    if (plan.estirado.l === actual.l && plan.estirado.r === actual.r) { asentar(); return; }
    const estira = { duration: T_ESTIRA, ease: EASE_SALIDA };
    animate(m.l, plan.estirado.l, estira);
    animate(m.r, plan.estirado.r, estira);
    m.relevo.current = window.setTimeout(asentar, T_RELEVO * 1000);
}

/** `clip-path` del indicador. Sin medir todavía (o dentro de un `display:none`) no se ve. */
function recorte(l: number, r: number, w: number, radio: number) {
    return w > 0 ? `inset(0 ${Math.max(0, w - r)}px 0 ${Math.max(0, l)}px round ${radio}px)` : 'inset(0 100% 0 0)';
}

/** Indicador escondido (ninguna opción elegida): ancho cero. */
const NADA: Tramo = { l: 0, r: 0 };

/** El indicador se está moviendo o espera el relevo. */
function enViaje(m: Motor) {
    return m.relevo.current !== undefined || m.l.isAnimating() || m.r.isAnimating();
}

/**
 * Trae la opción a la vista dentro de la fila con scroll horizontal (la barra del teléfono). Sin
 * esto, un salto desde otro panel (la tarjeta «Por aprobar» → Solicitudes) movía el indicador a
 * una pestaña fuera de la pantalla. Busca el contenedor con scroll solo entre los 3 ancestros más
 * cercanos, para no mover nada ajeno a la barra.
 */
function mostrarOpcion(fila: HTMLElement, opcion: HTMLElement | undefined, suave: boolean) {
    if (!opcion) return;
    let cont = fila.parentElement;
    for (let i = 0; cont && i < 3; i++, cont = cont.parentElement) {
        if (cont.scrollWidth > cont.clientWidth && /auto|scroll/.test(getComputedStyle(cont).overflowX)) break;
    }
    if (!cont || !(cont.scrollWidth > cont.clientWidth)) return;
    const c = cont.getBoundingClientRect();
    const o = opcion.getBoundingClientRect();
    const margen = 16;
    const delta = o.left < c.left + margen ? o.left - c.left - margen
        : o.right > c.right - margen ? o.right - c.right + margen
        : 0;
    if (delta !== 0) cont.scrollBy({ left: delta, behavior: suave ? 'smooth' : 'auto' });
}

interface PestanasElasticasProps<K extends string, T extends { key: K }> {
    opciones: readonly T[];
    /** Opción elegida; `null` (o una clave que no está) = ninguna, sin indicador (chips de Vehículos al entrar). */
    activa: K | null;
    onCambiar: (key: K) => void;
    'aria-label': string;
    /**
     * Disposición de la fila (`gap-*`, y `w-full` si las opciones son `flex-1`). Va igual en la fila
     * de abajo y en la copia del indicador.
     * Las clases se juntan con `clsx`, sin `cn()`: las dos filas deben llevar exactamente las mismas
     * clases para calzar al píxel, y `cn()` podría resolverlas distinto (nació así cuando tailwind-merge
     * aún borraba los tamaños propios junto a un color `text-*`; hoy `utils/cn.ts` ya los conoce).
     */
    claseFila?: string;
    /** Caja de cada opción (flex, padding, tipografía, `rounded-*`). Idéntica en ambas filas para que calcen al píxel. */
    claseOpcion: string;
    /** Colores de las opciones fuera del indicador (texto apagado, hover). */
    claseInactiva?: string;
    /** Radio del indicador en px; igual al `rounded-*` de `claseOpcion` (`rounded-xl` = 12). */
    radio?: number;
    /**
     * Color del indicador y de su texto. Por defecto el verde de marca; otro solo si el color ES el
     * significado: rojo en «Diferencias» de Inventario.
     */
    claseIndicador?: string;
    /** Color de fondo exacto (hex) cuando sale de los datos: el color de cada empresa en Vehículos. */
    colorIndicador?: string;
    /** Tooltip de cada opción. */
    titulo?: (opcion: T) => string | undefined;
    /** Contenido de una opción. `sobreIndicador` = la copia blanca que se ve dentro del indicador verde. */
    render: (opcion: T, sobreIndicador: boolean) => React.ReactNode;
}

/**
 * Fila de pestañas con indicador elástico (diseno.md §9.12): al cambiar de pestaña el indicador
 * verde se estira hasta la nueva y se asienta con un leve aplaste, así se ve hacia dónde se fue.
 *
 * - El indicador es una copia de la fila en blanco sobre verde, recortada con `clip-path` a los
 *   dos bordes animados: el texto cambia de color justo en el borde, también mientras se estira
 *   sobre pestañas intermedias (sin texto gris sobre verde).
 * - Sirve cualquier cambio de `activa`: clic, teclado o un salto desde otro panel.
 * - Con «reducir movimiento» el indicador salta en seco (`animate()` imperativo no lo cubre
 *   `MotionConfig`, §9.1).
 * - Sin arrastre del indicador: la fila hace scroll horizontal en el teléfono y el gesto quedaría
 *   escondido (§9.11).
 * - Teclado: patrón WAI-ARIA de pestañas (flechas con vuelta, Inicio, Fin; activación inmediata).
 * - Si la fila hace scroll horizontal, la opción nueva se trae a la vista.
 * - Mide en coordenadas propias de la fila: dentro de un `Modal` que abre con `scale`, las cajas de
 *   `getBoundingClientRect` vienen escaladas y se corrigen por `caja.width / offsetWidth`.
 */
export function PestanasElasticas<K extends string, T extends { key: K }>({
    opciones,
    activa,
    onCambiar,
    'aria-label': ariaLabel,
    claseFila,
    claseOpcion,
    claseInactiva,
    radio = 12,
    claseIndicador = 'bg-brand-primary text-white',
    colorIndicador,
    titulo,
    render,
}: PestanasElasticasProps<K, T>) {
    const reducir = useReducedMotion();
    const filaRef = useRef<HTMLDivElement>(null);
    const copiaRef = useRef<HTMLDivElement>(null);
    const tramos = useRef<Tramo[]>([]);
    /** -1 = ninguna elegida. */
    const indice = opciones.findIndex(o => o.key === activa);
    /** Opción donde está (o hacia donde va) el indicador. */
    const confirmado = useRef(indice);
    const turno = useRef(0);
    const relevo = useRef<number | undefined>(undefined);

    const bordeL = useMotionValue(0);
    const bordeR = useMotionValue(0);
    const ancho = useMotionValue(0);
    const clipPath = useTransform([bordeL, bordeR, ancho], ([l, r, w]: number[]) => recorte(l, r, w, radio));
    const motor = useMemo<Motor>(() => ({ l: bordeL, r: bordeR, turno, relevo }), [bordeL, bordeR]);

    // Medir: al montar, al cambiar la lista y cada vez que la fila o una opción cambia de tamaño
    // (la fuente web llega tarde, el teléfono gira, la barra pasa de `hidden` a visible).
    const claveLista = opciones.map(o => o.key).join('|');
    useLayoutEffect(() => {
        const fila = filaRef.current;
        if (!fila) return;
        let vivo = true;
        const opcionesDom = () => Array.from(fila.querySelectorAll<HTMLElement>(':scope > [role="tab"]'));
        const medir = () => {
            if (!vivo) return;
            const caja = fila.getBoundingClientRect();
            // Escala de un ancestro con `transform` (un Modal abriendo); 1 sin transform.
            const escala = fila.offsetWidth > 0 ? caja.width / fila.offsetWidth : 1;
            tramos.current = opcionesDom().map(el => {
                const r = el.getBoundingClientRect();
                return { l: (r.left - caja.left) / escala, r: (r.right - caja.left) / escala };
            });
            ancho.set(fila.offsetWidth);
            // Si algo cambia de ancho a medio viaje (un conteo que aparece al activar la pestaña),
            // el viaje sigue hacia la medida nueva en vez de cortarse en seco.
            const destino = tramos.current[confirmado.current] ?? NADA;
            if (enViaje(motor)) {
                viajar(motor, destino);
            } else {
                saltar(motor, destino);
                // framer pinta el valor nuevo en el próximo frame: escribirlo ya evita un frame sin
                // indicador al montar (p. ej. la fila que se remonta al terminar la primera carga).
                if (copiaRef.current) copiaRef.current.style.clipPath = recorte(bordeL.get(), bordeR.get(), fila.offsetWidth, radio);
            }
        };
        medir();
        const observador = new ResizeObserver(medir);
        observador.observe(fila);
        opcionesDom().forEach(el => observador.observe(el));
        document.fonts?.ready.then(medir);
        return () => {
            vivo = false;
            observador.disconnect();
        };
    }, [claveLista, ancho, motor, bordeL, bordeR, radio]);

    // Viajar cuando cambia la pestaña activa (efecto: `animate()` es imperativo, no va en el render).
    useLayoutEffect(() => {
        const desde = confirmado.current;
        if (desde === indice) return;
        confirmado.current = indice;
        const fila = filaRef.current;
        // Desde o hacia «ninguna» no hay recorrido que mostrar: aparece o se va en seco.
        if (!fila || fila.offsetWidth === 0 || reducir || desde < 0 || indice < 0) saltar(motor, tramos.current[indice] ?? NADA);
        else viajar(motor, tramos.current[indice]);
        if (fila && fila.offsetWidth > 0 && indice >= 0) {
            mostrarOpcion(fila, fila.querySelectorAll<HTMLElement>(':scope > [role="tab"]')[indice], !reducir);
        }
    }, [indice, reducir, motor]);

    useEffect(() => () => detener(motor), [motor]);

    const alTeclear = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
        const siguiente = indicePorTecla(e.key, i, opciones.length);
        if (siguiente === null) return;
        e.preventDefault();
        if (siguiente === i) return;
        onCambiar(opciones[siguiente].key);
        filaRef.current?.querySelectorAll<HTMLElement>(':scope > [role="tab"]')[siguiente]?.focus();
    };

    return (
        <div ref={filaRef} role="tablist" aria-label={ariaLabel} className={clsx('relative flex shrink-0', claseFila)}>
            {opciones.map((opcion, i) => (
                // eslint-disable-next-line no-restricted-syntax -- pestaña (role="tab") con indicador propio
                <button
                    key={opcion.key}
                    type="button"
                    role="tab"
                    aria-selected={i === indice}
                    // Sin ninguna elegida, la primera recibe el foco del Tab.
                    tabIndex={i === Math.max(0, indice) ? 0 : -1}
                    title={titulo?.(opcion)}
                    onClick={() => onCambiar(opcion.key)}
                    onKeyDown={e => alTeclear(e, i)}
                    // `text-center` en ambas filas: el botón lo trae del navegador y el span no.
                    className={clsx(claseOpcion, 'text-center transition-colors', i !== indice && claseInactiva)}
                >
                    {render(opcion, false)}
                </button>
            ))}
            <motion.div
                ref={copiaRef}
                aria-hidden
                className={clsx(
                    'pointer-events-none absolute inset-0 flex',
                    claseIndicador,
                    // Alto contraste de Windows pinta todos los fondos igual: el indicador usa el color de selección del sistema.
                    'forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:[forced-color-adjust:none]',
                    claseFila,
                )}
                style={{ clipPath, backgroundColor: colorIndicador }}
            >
                {opciones.map(opcion => (
                    <span key={opcion.key} className={clsx(claseOpcion, 'text-center')}>
                        {render(opcion, true)}
                    </span>
                ))}
            </motion.div>
        </div>
    );
}
