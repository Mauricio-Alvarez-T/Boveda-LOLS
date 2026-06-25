import { lazy, type ComponentType } from 'react';

/**
 * Auto-recuperación del clásico "chunk viejo tras deploy":
 * Vite hashea cada chunk por contenido; tras un deploy los hashes rotan y una
 * pestaña abierta desde antes pide un chunk que ya no está (o lo pide durante la
 * ventana del deploy). El import dinámico falla con "Failed to fetch dynamically
 * imported module". Acá lo manejamos: reintentar una vez (cubre el instante
 * transitorio) y, si persiste, recargar la página UNA sola vez por sesión para
 * traer el index + chunks nuevos. Guard en sessionStorage para evitar loops.
 */

export const CHUNK_RELOAD_FLAG = 'chunk_reload_done';

const CHUNK_ERR_RE =
    /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk \d+ failed|dynamically imported module/i;

export function isChunkLoadError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    return CHUNK_ERR_RE.test(msg);
}

/**
 * Recarga la página UNA sola vez por sesión (para traer el build nuevo).
 * Devuelve true si disparó la recarga; false si ya se había recargado (evita loop
 * infinito cuando el chunk realmente no existe → deja que aflore el error).
 */
export function reloadOnceForChunkError(): boolean {
    try {
        if (sessionStorage.getItem(CHUNK_RELOAD_FLAG)) return false;
        sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
    } catch { /* sessionStorage no disponible → recargar igual */ }
    window.location.reload();
    return true;
}

/**
 * `React.lazy` con auto-recuperación. Uso idéntico a React.lazy:
 *   const Page = lazyWithRetry(() => import('./pages/Page'));
 */
export function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
    return lazy(async () => {
        try {
            const mod = await factory();
            try { sessionStorage.removeItem(CHUNK_RELOAD_FLAG); } catch { /* noop */ } // carga ok → re-armar para futuros deploys
            return mod;
        } catch {
            // Reintento único tras un respiro (ventana transitoria del deploy).
            await new Promise(r => setTimeout(r, 400));
            try {
                const mod = await factory();
                try { sessionStorage.removeItem(CHUNK_RELOAD_FLAG); } catch { /* noop */ }
                return mod;
            } catch (err2) {
                // Persiste → recargar una vez para traer el index nuevo.
                if (reloadOnceForChunkError()) {
                    return new Promise<{ default: T }>(() => {}); // la página se recarga; nunca resolver
                }
                throw err2; // ya recargamos y sigue fallando → lo muestra el ErrorBoundary
            }
        }
    });
}
