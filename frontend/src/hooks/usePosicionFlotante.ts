import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import {
    calcularPosicion, estiloFlotante, fueraDeVista, mismaPosicion,
    type PosicionPopover, type VarianteFlotante,
} from '../components/ui/popoverPos';

export interface OpcionesPosicionFlotante {
    abierto: boolean;
    /** Se llama SOLO cuando el disparador se fue de la pantalla. */
    alCerrar: () => void;
    variante?: VarianteFlotante;
    altoMax?: number;
    separacion?: number;
}

export interface ApiPosicionFlotante<D extends HTMLElement, F extends HTMLElement> {
    /** Va en el botón/chip que abre: es lo que se mide. */
    disparadorRef: RefObject<D | null>;
    /** Va en el flotante. Sirve para IGNORAR su scroll propio; ponerlo aunque hoy no scrollee. */
    flotanteRef: RefObject<F | null>;
    pos: PosicionPopover | null;
    /** Listo para `style={estilo}`. `undefined` hasta la primera medición → no renderizar. */
    estilo: CSSProperties | undefined;
    /** Medir AHORA. Va en el mismo handler que abre, ANTES del `setOpen(true)`. */
    medir: () => void;
}

/**
 * Colocar un flotante `position: fixed` y mantenerlo pegado a su disparador (2026-09-16).
 *
 * Es la regla §8.10 de `docs/reglas/diseno.md` hecha código, una sola vez. `scroll` NO burbujea, pero un
 * listener en `window` con `capture: true` SÍ recibe el de la propia lista, y cerrar ahí la vuelve
 * inusable: un tic de rueda y desaparece (pasó con `FilterSelect`). Entonces: (1) el scroll nacido dentro
 * del flotante no es asunto nuestro; (2) el de un ancestro reposiciona, amortiguado con
 * `requestAnimationFrame` como `useTutorialSpotlight`; (3) solo se cierra si el disparador salió de la
 * pantalla. Los menús móviles del header de asistencia y el tooltip de `StockBadge` medían UNA vez al
 * abrir y se quedaban clavados al viewport mientras la página seguía scrolleando debajo: eso arregla.
 *
 * La aritmética no está acá a propósito: vive en `components/ui/popoverPos.ts`, que es puro y con test
 * (el jest del front corre en node, sin DOM). Esto es solo el cableado de eventos.
 *
 * No se mide dentro de un efecto —sería un `setState` en efecto— sino en el handler que abre, en el
 * mismo lote que el `setOpen(true)` y por eso sin parpadeo. Es lo que `FilterSelect` ya hacía. Regla de
 * uso: TODO camino que ponga `abierto = true` llama antes a `medir()`; `pos` no se limpia al cerrar.
 */
export function usePosicionFlotante<
    D extends HTMLElement = HTMLButtonElement,
    F extends HTMLElement = HTMLDivElement,
>({ abierto, alCerrar, variante = 'lista', altoMax, separacion }: OpcionesPosicionFlotante): ApiPosicionFlotante<D, F> {
    const disparadorRef = useRef<D>(null);
    const flotanteRef = useRef<F>(null);
    const [pos, setPos] = useState<PosicionPopover | null>(null);

    const medir = useCallback(() => {
        const el = disparadorRef.current;
        if (!el) return;
        const siguiente = calcularPosicion(el.getBoundingClientRect(), window.innerHeight, altoMax, separacion);
        // Sin esto, cada frame de scroll re-renderiza el menú entero aunque el disparador no se haya movido.
        setPos(previo => (mismaPosicion(previo, siguiente) ? previo : siguiente));
    }, [altoMax, separacion]);

    const cerrar = useEffectEvent(() => { alCerrar(); });
    const remedir = useEffectEvent(() => { medir(); });

    useEffect(() => {
        if (!abierto) return;

        let raf = 0;
        const enScroll = (e: Event) => {
            const destino = e.target as Node | null;
            const propio = flotanteRef.current;
            if (destino && propio && (destino === propio || propio.contains(destino))) return;   // (1)
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                const el = disparadorRef.current;
                if (!el) return;
                if (fueraDeVista(el.getBoundingClientRect(), window.innerHeight)) cerrar();      // (3)
                else remedir();                                                                 // (2)
            });
        };
        const enResize = () => { remedir(); };

        window.addEventListener('scroll', enScroll, true);
        window.addEventListener('resize', enResize);
        return () => {
            if (raf) cancelAnimationFrame(raf);
            window.removeEventListener('scroll', enScroll, true);
            window.removeEventListener('resize', enResize);
        };
    }, [abierto]);

    return { disparadorRef, flotanteRef, pos, estilo: pos ? estiloFlotante(pos, variante) : undefined, medir };
}
