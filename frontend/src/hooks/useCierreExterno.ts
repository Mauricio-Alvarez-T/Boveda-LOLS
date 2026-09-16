import { useEffect, useEffectEvent, useRef } from 'react';
import type { RefObject } from 'react';
import { estaDentro } from './cierreExterno';

export interface OpcionesCierreExterno {
    /** Con el menú cerrado no se registra NADA. */
    abierto: boolean;
    /** Qué hacer al cerrar. Callback libre: la campana también baja `expanded10m`. */
    alCerrar: () => void;
    /** Zonas que también cuentan como «dentro»: un popover en portal no cuelga del ancla. */
    extras?: readonly RefObject<HTMLElement | null>[];
    /** Escuchar `touchstart` además de `mousedown`. */
    tactil?: boolean;
    /** Cerrar con Escape. Apagado por defecto: se activa donde la regla §8.5 lo pide. */
    escape?: boolean;
}

/**
 * Cerrar un menú flotante al tocar fuera (2026-09-16).
 *
 * Existe porque el patrón estaba copiado en ocho componentes y en tres de ellos MAL: `ObraSelector`,
 * `NotificationBell` y el overflow del header de asistencia registraban el listener con deps `[]` y sin
 * mirar si el menú estaba abierto, así que cada clic de la app —en cualquier pantalla, con todo cerrado—
 * entraba al handler y disparaba un `setOpen(false)` inútil. El precedente bueno ya estaba en
 * `TransferenciaActionsMenu`: `if (!open) return`.
 *
 * `useEffectEvent` en vez de meter `alCerrar`/`extras` en las deps: así el consumidor escribe
 * `alCerrar: () => setOpen(false)` y `extras: [popoverRef]` EN LÍNEA, sin `useCallback` ni `useMemo`, y
 * el efecto no se resuscribe en cada render. Las deps quedan en lo que de verdad cambia el cableado.
 *
 * Devuelve el ref del ancla: va en el contenedor que envuelve al disparador.
 */
export function useCierreExterno<T extends HTMLElement = HTMLDivElement>({
    abierto, alCerrar, extras, tactil = true, escape = false,
}: OpcionesCierreExterno): RefObject<T | null> {
    const anclaRef = useRef<T>(null);

    const cerrar = useEffectEvent(() => { alCerrar(); });
    const estaFuera = useEffectEvent((destino: Node) =>
        !estaDentro(destino, [anclaRef.current, ...(extras ?? []).map(r => r.current)]));

    useEffect(() => {
        if (!abierto) return;

        const alApuntar = (e: MouseEvent | TouchEvent) => {
            const destino = e.target as Node | null;
            if (destino && estaFuera(destino)) cerrar();
        };
        // Sin `stopPropagation` a propósito: `ui/Modal.tsx` escucha en `window`, que recibe DESPUÉS que
        // `document`, así que un flotante dentro de un modal cierra los dos con una tecla. Es el
        // comportamiento que ya tenía `FilterSelect`; cambiarlo es otra conversación.
        const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };

        document.addEventListener('mousedown', alApuntar);
        if (tactil) document.addEventListener('touchstart', alApuntar);
        if (escape) document.addEventListener('keydown', alTeclear);
        return () => {
            document.removeEventListener('mousedown', alApuntar);
            if (tactil) document.removeEventListener('touchstart', alApuntar);
            if (escape) document.removeEventListener('keydown', alTeclear);
        };
    }, [abierto, tactil, escape]);

    return anclaRef;
}
