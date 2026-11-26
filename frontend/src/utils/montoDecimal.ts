import { fmtMoneyExacto } from './format';

/**
 * Montos en pesos CON decimales (máx. 2), escritos como en Chile: «$1.500,50».
 * Para el valor de compra de los ítems de inventario (Marcos 26-11-2026: hay
 * artículos que se compran a $1.250,75 y el campo botaba la coma → $125.075).
 *
 * Regla de lectura: en lo que muestra el campo el PUNTO separa miles y la COMA
 * los decimales. Excepciones para quien escribe con punto decimal:
 *   · la tecla «.» del teclado numérico se toma como coma (si aún no hay coma);
 *   · un número pegado con un solo punto y 1-2 dígitos al final («1500.5»,
 *     como sale de una planilla) se toma como decimal. Con 3 dígitos («1.500»)
 *     sigue siendo miles.
 * La columna es DECIMAL(12,2) → máx. 10 dígitos enteros y 2 decimales.
 */
const MAX_ENTEROS = 10;
const MAX_DECIMALES = 2;

function partes(texto: string): { entero: string; dec: string | null } {
    const limpio = texto.replace(/[^\d,]/g, '');
    const i = limpio.indexOf(',');
    const entero = (i < 0 ? limpio : limpio.slice(0, i)).replace(/^0+(?=\d)/, '').slice(0, MAX_ENTEROS);
    const dec = i < 0 ? null : limpio.slice(i + 1).replace(/,/g, '').slice(0, MAX_DECIMALES);
    return { entero, dec };
}

/** Valor de un texto ya en formato chileno («$1.500,5» → 1500.5; vacío → 0). */
export function valorMontoDecimal(texto: string): number {
    const { entero, dec } = partes(texto);
    const n = Number(`${entero || '0'}.${dec || '0'}`);
    return Number.isFinite(n) ? n : 0;
}

/** Lo que muestra el campo para un valor guardado: 1500.5 → «$1.500,5»; 0 → «». */
export function textoMontoDecimal(valor: number | null | undefined): string {
    return valor ? fmtMoneyExacto(valor) : '';
}

/**
 * Procesa lo que la persona acaba de escribir. `antes` = lo que mostraba el
 * campo; `ahora` = lo que hay tras la tecla (o el pegado). Devuelve el número y
 * el texto a mostrar, que conserva la coma y los ceros que se están escribiendo
 * («1.500,» y «1.500,50» no se pierden a medio camino).
 */
export function escribirMontoDecimal(antes: string, ahora: string): { valor: number; texto: string } {
    let t = ahora;
    if (!t.includes(',')) {
        // ¿Qué cambió? Prefijo y sufijo comunes → lo insertado al medio.
        const min = Math.min(antes.length, t.length);
        let p = 0;
        while (p < min && antes[p] === t[p]) p++;
        let s = 0;
        while (s < min - p && antes[antes.length - 1 - s] === t[t.length - 1 - s]) s++;
        const insertado = t.slice(p, t.length - s);
        const borro = t.length < antes.length && insertado === '';
        if (!borro) {
            if (insertado === '.') t = `${t.slice(0, p)},${t.slice(p + 1)}`;
            else if (/^\$?\s*\d+\.\d{1,2}$/.test(t.trim())) t = t.replace('.', ',');
        }
    }
    const { entero, dec } = partes(t);
    if (entero === '' && dec === null) return { valor: 0, texto: '' };
    const valor = Number(`${entero || '0'}.${dec || '0'}`);
    const texto = `$${Number(entero || '0').toLocaleString('es-CL')}${dec !== null ? `,${dec}` : ''}`;
    return { valor, texto };
}
