import { formIguales, type FormObra } from './reglas';

/**
 * Lo escrito y sin guardar de una obra del Sitio web, en `sessionStorage` (por pestaña del navegador). Es la red de
 * TODAS las salidas que la pantalla no puede frenar: el botón Atrás, el gesto de volver del teléfono (la app
 * instalada), un enlace o una recarga. Al volver a la obra se ofrece «Recuperar lo que escribiste».
 * Comodidad de quien escribe, nunca la fuente de verdad: si el almacenamiento falla (ventana privada, sin espacio),
 * todo sigue funcionando sin él. Sin JSX ni `import.meta` (test en node).
 */

export interface Almacen {
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
    removeItem(k: string): void;
}

export interface BorradorObra {
    /** La versión de la obra sobre la que se escribió (null = obra nueva). */
    updated_at: string | null;
    form: FormObra;
    /** Cuándo se escribió por última vez (ISO). */
    guardado_at: string;
}

export const claveBorrador = (id: number | null): string => `sitio-web:borrador:${id ?? 'nueva'}`;

const sesion = (): Almacen | null => {
    try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
};

export function guardarBorrador(id: number | null, datos: { updated_at: string | null; form: FormObra }, almacen: Almacen | null = sesion(), ahora = new Date()): void {
    try {
        almacen?.setItem(claveBorrador(id), JSON.stringify({ updated_at: datos.updated_at, form: datos.form, guardado_at: ahora.toISOString() }));
    } catch { /* sin espacio o bloqueado: solo se pierde la red */ }
}

export function leerBorrador(id: number | null, almacen: Almacen | null = sesion()): BorradorObra | null {
    try {
        const crudo = almacen?.getItem(claveBorrador(id));
        if (!crudo) return null;
        const b = JSON.parse(crudo) as Partial<BorradorObra>;
        const f = b && b.form;
        // Solo un formulario con la forma de hoy (una versión vieja de la pantalla pudo dejar otra cosa).
        if (!f || typeof f !== 'object' || typeof f.nombre !== 'string' || !Array.isArray(f.servicios)) return null;
        return { updated_at: typeof b.updated_at === 'string' ? b.updated_at : null, form: f as FormObra, guardado_at: String(b.guardado_at || '') };
    } catch {
        return null;
    }
}

export function borrarBorrador(id: number | null, almacen: Almacen | null = sesion()): void {
    try { almacen?.removeItem(claveBorrador(id)); } catch { /* nada */ }
}

/** ¿Vale la pena ofrecerlo? Solo si lo escrito es distinto de lo que se acaba de cargar. */
export const ofrecerBorrador = (b: BorradorObra | null, cargado: FormObra): b is BorradorObra => !!b && !formIguales(b.form, cargado);
