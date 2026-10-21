/**
 * Reparto de una barra de pestañas en páginas sin opciones cortadas (`components/ui/BarraPaginada`). Lógica pura,
 * aparte del componente para poder testearla.
 */

export interface Paginas {
    /** Ancho extra (px) que recibe cada opción para que su página llene la barra justo. */
    extras: number[];
    /** La opción abre página (punto de imán del scroll). */
    inicios: boolean[];
    /** Las opciones no caben: hay flechas y páginas. */
    desborda: boolean;
    /** Relleno lateral propio de cada opción (px), medido antes de agregarle nada. */
    base: number;
}

export const SIN_PAGINAS: Paginas = { extras: [], inicios: [], desborda: false, base: 0 };

/**
 * Reparte las opciones en páginas que llenan `ancho` exacto.
 * Cada página toma las opciones que caben enteras; lo que sobra se reparte entre ellas, así nunca queda una a
 * la mitad en el borde. La última página también se estira: si no, el scroll no podría dejarla al comienzo.
 */
export function repartirPaginas(anchos: number[], gap: number, ancho: number, anchoTotal: number, base = 0): Paginas {
    const n = anchos.length;
    const natural = anchos.reduce((a, b) => a + b, 0) + gap * Math.max(0, n - 1);
    if (n === 0 || ancho <= 0 || natural <= anchoTotal + 0.5) return { extras: new Array(n).fill(0), inicios: anchos.map((_, i) => i === 0), desborda: false, base };
    const extras = new Array<number>(n).fill(0);
    const inicios = new Array<boolean>(n).fill(false);
    let pagina: number[] = [];
    let usado = 0;
    const cerrar = () => {
        if (!pagina.length) return;
        const sobra = Math.max(0, ancho - usado);
        pagina.forEach(i => { extras[i] = sobra / pagina.length; });
        inicios[pagina[0]] = true;
    };
    anchos.forEach((w, i) => {
        const suma = pagina.length ? gap + w : w;
        if (pagina.length && usado + suma > ancho + 0.5) {
            cerrar();
            pagina = [i];
            usado = w;
        } else {
            pagina.push(i);
            usado += suma;
        }
    });
    cerrar();
    return { extras, inicios, desborda: true, base };
}

