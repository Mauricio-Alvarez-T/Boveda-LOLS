import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { anchoNatural, repartirPaginas, SIN_PAGINAS, type Paginas } from '../../utils/paginasBarra';

/** Lo que `BarraPaginada` le pasa a su `PestanasElasticas` hija. */
export interface PaginadoPestanas {
    estiloOpcion: (indice: number) => React.CSSProperties | undefined;
    revelar: false;
}

interface BarraPaginadaProps {
    /** La fila de opciones: un `PestanasElasticas` que recibe `estiloOpcion` y `revelar`. */
    children: (paginado: PaginadoPestanas) => React.ReactNode;
    /** Color de la barra: las flechas toman el contrario para verse. */
    fondo?: 'card' | 'muted';
    /**
     * Qué elementos son las opciones. Por defecto las pestañas de un `PestanasElasticas`; para una fila de
     * botones sueltos (atajos, «Crear») se marca cada botón con un `data-*` y se pasa ese selector. Las opciones
     * deben ser hermanas, en una fila con `gap`, y recibir `style={estiloOpcion(i)}`.
     */
    selector?: string;
    className?: string;
}

const igual = (a: Paginas, b: Paginas) => a.desborda === b.desborda && a.base === b.base && a.extras.length === b.extras.length
    && a.extras.every((e, i) => Math.abs(e - b.extras[i]) < 0.5) && a.inicios.every((v, i) => v === b.inicios[i]);

/**
 * Barra de pestañas que no cabe en el celular, sin palabras cortadas (Marcos 2026-10-21: «los títulos quedan
 * por la mitad»). En vez de deslizar a cualquier punto, la barra va de a PÁGINAS: cada página muestra solo
 * opciones enteras y reparte el espacio que sobra entre ellas; las flechas, cada una en su propio espacio a
 * los costados (no encima del texto), pasan de página, y el dedo también (imán del scroll en cada página).
 * Si todo cabe no hay flechas ni páginas: se ve igual que antes. Ver diseno.md §9.6.
 *
 * Uso: `<BarraPaginada>{p => <PestanasElasticas … estiloOpcion={p.estiloOpcion} revelar={p.revelar} />}</BarraPaginada>`
 * La pestaña elegida siempre queda a la vista: la barra pasa sola a su página.
 */
export const BarraPaginada: React.FC<BarraPaginadaProps> = ({ children, fondo = 'card', selector = '[role="tablist"] > [role="tab"]', className }) => {
    const cajaRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [paginas, setPaginas] = useState<Paginas>(SIN_PAGINAS);
    // Copia para los callbacks del observador (que no se recrean en cada render).
    const paginasRef = useRef(paginas);
    useLayoutEffect(() => { paginasRef.current = paginas; }, [paginas]);
    /** Página a la vista. La fija la flecha al tocarla (sin esperar al scroll) y el scroll del dedo. */
    const [pagina, setPagina] = useState(0);
    /**
     * Ancho de todas las opciones juntas (sin flechas ni relleno de página), fijado como `width` de la caja: es el ancho
     * que la barra PIDE, pagine o no. Sin esto, al paginar su ancho preferido pasaba a «páginas × ancho visible +
     * flechas», que depende del espacio que le tocó; con dos barras que se encogen en la misma fila (Ideas: estado y
     * tipo) cada reparto de una le movía el espacio a la otra y las dos temblaban sin parar (video del dueño 22-oct).
     */
    const [natural, setNatural] = useState(0);
    const totalPaginas = paginas.desborda ? paginas.inicios.filter(Boolean).length : 1;

    const pestanas = useCallback(() => Array.from(scrollRef.current?.querySelectorAll<HTMLElement>(selector) ?? []), [selector]);

    // Medir y repartir: al montar, al cambiar de ancho la barra o una opción (un conteo que aparece, la letra
    // web que llega tarde, el teléfono que gira). El ancho natural de cada opción es el que mide hoy menos el
    // extra que ya le pusimos, así que repartir no vuelve a disparar otro reparto.
    useLayoutEffect(() => {
        const sc = scrollRef.current;
        const caja = cajaRef.current;
        if (!sc || !caja) return;
        let vivo = true;
        // Sin requestAnimationFrame: en una pestaña de fondo no corre y la barra quedaría sin repartir. El
        // ResizeObserver ya junta los cambios de un cuadro en una sola llamada.
        const medir = () => {
            if (!vivo) return;
            const tabs = pestanas();
            if (!tabs.length) return;
            const previo = paginasRef.current;
            // El relleno propio se lee mientras todavía no le pusimos nada encima.
            const base = previo.desborda ? previo.base : parseFloat(getComputedStyle(tabs[0]).paddingLeft) || 0;
            const gap = parseFloat(getComputedStyle(tabs[0].parentElement!).columnGap) || 0;
            const anchos = tabs.map((t, i) => t.getBoundingClientRect().width - (previo.extras[i] ?? 0));
            // ¿Cabe todo sin flechas? Se compara con el ancho de la caja entera, no con el que dejan las flechas.
            const nuevo = repartirPaginas(anchos, gap, sc.clientWidth, caja.clientWidth, base);
            if (!igual(nuevo, previo)) setPaginas(nuevo);
            // Sin redondear: si todo cabe, la caja mide al subpíxel lo mismo que antes (con Math.ceil crecía 1–2 px).
            const nat = anchoNatural(anchos, gap);
            setNatural(prev => (Math.abs(prev - nat) < 0.5 ? prev : nat));
        };
        const ro = new ResizeObserver(medir);
        ro.observe(sc);
        ro.observe(caja);
        // La fila de opciones: con el ancho de la caja fijo, una opción que llega tarde (las empresas de Vehículos)
        // ya no agranda la caja ni el scroll; solo la fila crece, y es lo que avisa que hay que medir de nuevo.
        let fila = sc.firstElementChild;
        if (fila) ro.observe(fila);
        // Opciones que entran o salen (o una fila nueva): se observa la fila vigente y se mide.
        const mo = new MutationObserver(() => {
            if (sc.firstElementChild !== fila) {
                if (fila) ro.unobserve(fila);
                fila = sc.firstElementChild;
                if (fila) ro.observe(fila);
            }
            medir();
        });
        mo.observe(sc, { childList: true, subtree: true });
        pestanas().forEach(t => ro.observe(t));
        document.fonts?.ready.then(medir);
        medir();
        return () => { vivo = false; ro.disconnect(); mo.disconnect(); };
    }, [pestanas]);

    /** Comienzo (scrollLeft) de cada página. */
    const comienzos = useCallback(() => {
        const sc = scrollRef.current;
        if (!sc) return [0];
        const x0 = sc.getBoundingClientRect().left - sc.scrollLeft;
        return pestanas().filter((_, i) => paginasRef.current.inicios[i]).map(t => t.getBoundingClientRect().left - x0);
    }, [pestanas]);

    const irA = useCallback((x: number, suave: boolean) => {
        const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        scrollRef.current?.scrollTo({ left: x, behavior: suave && !reducir ? 'smooth' : 'auto' });
    }, []);

    /** Página más cercana a la posición del scroll. */
    const paginaVisible = useCallback(() => {
        const sc = scrollRef.current;
        const xs = comienzos();
        if (!sc || !xs.length) return 0;
        return xs.reduce((mejor, x, i) => (Math.abs(x - sc.scrollLeft) < Math.abs(xs[mejor] - sc.scrollLeft) ? i : mejor), 0);
    }, [comienzos]);

    // El dedo desliza la barra: la página a la vista se lee del scroll (el imán la deja en una página entera).
    useEffect(() => {
        const sc = scrollRef.current;
        if (!sc) return;
        const leer = () => setPagina(paginaVisible());
        // La lectura inicial la hace el ResizeObserver (dispara al observar): sin setState síncrono en el efecto.
        const ro = new ResizeObserver(leer);
        ro.observe(sc);
        sc.addEventListener('scroll', leer, { passive: true });
        return () => { ro.disconnect(); sc.removeEventListener('scroll', leer); };
    }, [paginas, paginaVisible]);

    const pasar = (dir: 1 | -1) => {
        const xs = comienzos();
        const destino = Math.min(xs.length - 1, Math.max(0, pagina + dir));
        if (xs[destino] === undefined) return;
        setPagina(destino);
        irA(xs[destino], true);
    };

    // La pestaña elegida, siempre a la vista: si quedó en otra página (se entró directo, o se cambió desde
    // afuera), la barra pasa a esa página. Solo cuando cambia la elegida o el reparto: si no, al tocar una
    // flecha (que re-renderiza con cada scroll) la barra volvería sola a la página de la elegida.
    // Sin animar la primera vez.
    const revelado = useRef<{ i: number; paginas: Paginas | null }>({ i: -1, paginas: null });
    useEffect(() => {
        const sc = scrollRef.current;
        if (!sc || !paginas.desborda) return;
        const tabs = pestanas();
        const i = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
        if (i < 0 || (revelado.current.i === i && revelado.current.paginas === paginas)) return;
        const primera = revelado.current.paginas === null;
        revelado.current = { i, paginas };
        const r = tabs[i].getBoundingClientRect();
        const c = sc.getBoundingClientRect();
        if (r.left >= c.left - 1 && r.right <= c.right + 1) return;
        let inicio = i;
        while (inicio > 0 && !paginas.inicios[inicio]) inicio--;
        irA(tabs[inicio].getBoundingClientRect().left - c.left + sc.scrollLeft, !primera);
    });

    const estiloOpcion = (i: number): React.CSSProperties | undefined => {
        if (!paginas.desborda) return undefined;
        const lado = paginas.base + (paginas.extras[i] ?? 0) / 2;
        return {
            paddingLeft: lado,
            paddingRight: lado,
            // Un `Button` trae `transition-all`: el relleno no debe animarse, o la medición lo ve a medio camino.
            transitionProperty: 'color, background-color, border-color, box-shadow, opacity',
            scrollSnapAlign: paginas.inicios[i] ? 'start' : undefined,
        };
    };

    const flecha = (lado: 'inicio' | 'fin') => {
        const Icono = lado === 'fin' ? ChevronRight : ChevronLeft;
        const activa = lado === 'fin' ? pagina < totalPaginas - 1 : pagina > 0;
        return (
            // eslint-disable-next-line no-restricted-syntax -- flecha de página (32 px) junto a la barra; las pestañas se recorren con el teclado en el tablist
            <button type="button" aria-hidden tabIndex={-1} disabled={!activa} onClick={() => pasar(lado === 'fin' ? 1 : -1)}
                className={cn('flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full text-foreground shadow-sm transition-opacity duration-200 motion-reduce:transition-none disabled:opacity-30 disabled:shadow-none',
                    fondo === 'card' ? 'bg-muted' : 'bg-card')}>
                <Icono className="h-4 w-4" />
            </button>
        );
    };

    return (
        <div ref={cajaRef} className={cn('flex min-w-0 items-stretch gap-1', className)} style={natural ? { width: natural } : undefined}>
            {paginas.desborda && flecha('inicio')}
            {/* `flex`: la fila de pestañas (shrink-0) toma su ancho real; en un bloque quedaría del ancho visible y
                el indicador verde (copia con inset-0) se recortaría fuera de la vista. */}
            <div ref={scrollRef} className={cn('flex min-w-0 flex-1 items-center overflow-x-auto scrollbar-none', paginas.desborda && 'snap-x snap-mandatory')}>
                {children({ estiloOpcion, revelar: false })}
            </div>
            {paginas.desborda && flecha('fin')}
        </div>
    );
};

export default BarraPaginada;
