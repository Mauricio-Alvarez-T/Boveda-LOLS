/**
 * Salir de una pantalla con cambios sin guardar desde el menú lateral (o su número): `BrowserRouter` no tiene
 * `useBlocker` (es de los data routers), así que la pantalla se anota aquí mientras tiene algo sin guardar y el menú
 * le pregunta antes de navegar. Si hay alguien anotado, la pantalla decide (abre su «Salir sin guardar» y navega ella
 * misma a `destino`); si no, el menú navega como siempre. Lo usa la obra del Sitio web (`ObraSitio.tsx`).
 * Sin JSX ni `import.meta` (test en node).
 */

type Pedido = (destino: string) => void;

let actual: Pedido | null = null;

/** Anota a la pantalla que protege su salida. Devuelve cómo soltarla (solo suelta si sigue siendo ella). */
export function protegerSalida(fn: Pedido): () => void {
    actual = fn;
    return () => { if (actual === fn) actual = null; };
}

/** true = la salida quedó en manos de la pantalla (no navegar); false = no hay nada sin guardar, navegar normal. */
export function pedirSalida(destino: string): boolean {
    if (!actual) return false;
    actual(destino);
    return true;
}
