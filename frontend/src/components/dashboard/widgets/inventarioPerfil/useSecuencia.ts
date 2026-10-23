import { useCallback, useMemo, useState } from 'react';
import type { Destino, FiltroSec, Grupo } from './superadmin.modelo';

/**
 * Estado de «Secuencia completa · cada solicitud» (SecuenciaCompleta.tsx): la pestaña elegida, si está desplegada
 * («Ver las N») y cómo se llega a ella desde otra parte de la vista (el circuito y «Quién tiene qué» del Super
 * Administrador bajan a su pestaña). Lo usan VistaSuperAdmin y VistaJefatura (2026-10-23).
 */

/**
 * Los ids de la secuencia de una vista. `base` = «inv-sa» en VistaSuperAdmin (los de siempre: «inv-sa-sec»,
 * «inv-sa-g-aprobar»…) y «inv-jf» en VistaJefatura, para que no se repitan si alguna vez van juntas.
 */
export const idsSecuencia = (base: string) => ({
    seccion: `${base}-sec`,
    rotulo: `${base}-s`,
    lista: `${base}-s-lista`,
    grupo: (g: Grupo) => `${base}-g-${g}`,
});
export type IdsSecuencia = ReturnType<typeof idsSecuencia>;

/**
 * Lleva a un bloque (la secuencia o un paso dentro de ella) y le pasa el foco a su título. Se llama un cuadro después
 * del clic: el paso puede no estar dibujado hasta que cambie la pestaña. Solo se mueve si el bloque no está a la vista
 * y sin animar con «reducir movimiento».
 */
export const irA = (id: string) => window.requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 64 || r.top > window.innerHeight - 200) {
        const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
    }
    el.querySelector<HTMLElement>('h3, h4')?.focus({ preventScroll: true });
});

export interface EstadoSecuencia {
    ids: IdsSecuencia;
    filtro: FiltroSec;
    /** «Ver las N»: desplegada (en «Todas», todas las de cada paso; en una pestaña, también en el celular). */
    todas: boolean;
    /** Elegir una pestaña (se cierra lo desplegado). */
    elegir: (f: FiltroSec) => void;
    alternarTodas: () => void;
    /** Ir a una pestaña (y, dentro de «Todas», a un paso): la elige y lleva la vista hasta ella. */
    ir: (d: Destino) => void;
}

export function useSecuencia(base: string): EstadoSecuencia {
    const ids = useMemo(() => idsSecuencia(base), [base]);
    const [filtro, setFiltro] = useState<FiltroSec>('todas');
    const [todas, setTodas] = useState(false);
    const elegir = useCallback((f: FiltroSec) => { setFiltro(f); setTodas(false); }, []);
    const alternarTodas = useCallback(() => setTodas(v => !v), []);
    const ir = useCallback(({ filtro: f, grupo }: Destino) => {
        setFiltro(f);
        setTodas(false);
        irA(grupo ? ids.grupo(grupo) : ids.seccion);
    }, [ids]);
    return { ids, filtro, todas, elegir, alternarTodas, ir };
}
