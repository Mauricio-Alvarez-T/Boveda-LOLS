/**
 * Buscar un trabajador por texto: qué significa «coincide» (2026-09-17).
 *
 * Existía ya, escondido y sin test, dentro de `hooks/attendance/useAttendanceData.ts`, que documenta el
 * bug que lo motivó: «con 183 trabajadores, cada keystroke recompute filteredWorkers + re-render de
 * filas […] el render bloquea el input y se pierden chars ("mauricio" → "murico")». Gestiones nunca
 * recibió ese arreglo y volvió a caer en lo mismo, así que la lógica sale acá para que las dos pantallas
 * respondan igual y —esto es lo que no se podía antes— quede cubierta por tests: el jest del front corre
 * `testEnvironment: 'node'` sobre `*.test.ts`, sin DOM ni JSX.
 *
 * La idea de rendimiento es una sola: **el trabajo por tecla tiene que ser `indexOf` y nada más**.
 * Normalizar (minúsculas + quitar tildes) cuesta una asignación de string por campo y por registro; si
 * se hace dentro del `filter`, se paga N veces por pulsación. Por eso `indexar()` corre UNA vez cuando
 * llega la lista y deja un «blob» ya normalizado, y `coincide()` solo busca dentro de él.
 */

/** Lo mínimo que necesita el índice. Sirve para `Trabajador` y para `TrabajadorAvanzado`. */
export interface TrabajadorBuscable {
    nombres?: string | null;
    apellido_paterno?: string | null;
    apellido_materno?: string | null;
    rut?: string | null;
    cargo_nombre?: string | null;
    empresa_nombre?: string | null;
    obra_nombre?: string | null;
}

export interface TrabajadorIndexado {
    /** Todos los campos buscables concatenados, ya normalizados. */
    blob: string;
    /** RUT sin puntos, guiones ni espacios: teclear «19742932» encuentra «19.742.932-1». */
    rutColapsado: string;
    /** Aliases distintivos de la razón social; se matchean por PREFIJO, nunca por substring. */
    aliases: string[];
    /** «apellidos nombres» normalizado — solo para ordenar los resultados. */
    nombreNorm: string;
    /** Palabras sueltas del nombre, para puntuar coincidencias por prefijo de apellido. */
    palabras: string[];
}

/** Marcas diacríticas combinantes (U+0300–U+036F): lo que deja `NFD` al separar la tilde de la letra. */
const DIACRITICOS = /[̀-ͯ]/g;

/**
 * Minúsculas + sin tildes. `NFD` es imprescindible y no cosmético: «ñ» puede venir precompuesta (1 code
 * point) o descompuesta (n + tilde, 2 code points) y con `===` esas dos NO son iguales. Al descomponer y
 * borrar las marcas, las dos escrituras colapsan en la misma.
 */
export const normalizar = (s: string | null | undefined): string =>
    (s ?? '').normalize('NFD').replace(DIACRITICOS, '').toLowerCase().trim();

/** Quita puntos, guiones y espacios. */
export const colapsarRut = (s: string | null | undefined): string =>
    (s ?? '').replace(/[\s.-]/g, '');

/**
 * Palabras genéricas que NO aportan al alias de una razón social. Filtrar acá evita que «TRANSPORTES
 * DEDALIUS LIMITADA» genere el alias 'transportes' o que «LOLS EMPRESAS DE INGENIERIA LTDA» genere
 * 'empresas'.
 */
const EMPRESA_STOP_WORDS = new Set([
    'empresas', 'empresa', 'de', 'del', 'la', 'el', 'los', 'las',
    'ingenieria', 'ltda', 'limitada', 'sa', 's.a.', 'spa',
    'transportes', 'transporte', 'sociedad', 'cia', 'compania', 'compañia',
    'y', 'e',
]);

/**
 * Aliases buscables de una empresa.
 *
 *   'LOLS EMPRESAS DE INGENIERIA LTDA' → ['lols']       (única palabra tras stopwords)
 *   'Provisorio'                       → ['provisorio']
 *   'TRANSPORTES DEDALIUS LIMITADA'    → ['dedalius']
 *   'MIGUEL ANGEL URRUTIA AGUILERA'    → ['maua']       (acrónimo de iniciales)
 *
 * Cuando la razón social es un nombre de persona, sus palabras sueltas NO entran como alias: si
 * entraran, teclear «miguel angel» traería a TODA esa empresa. Ese falso positivo es el motivo de que
 * la empresa se busque por alias y no por substring como el resto.
 */
export const aliasEmpresa = (nombre: string | null | undefined): string[] => {
    if (!nombre) return [];
    // Limpiar puntuación para que 'LIMITADA.' o 'S.A.' caigan en la lista de stopwords.
    const norm = normalizar(nombre).replace(/[.,;:!?()"']/g, ' ');
    const palabras = norm.split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return [];

    // Se descartan los tokens de 1 carácter (iniciales sueltas, conectores) para que
    // 'Algo S.A.' dé ['algo'] y no ['asa'].
    const utiles = palabras.filter(w => w.length >= 2 && !EMPRESA_STOP_WORDS.has(w));

    const aliases = new Set<string>();
    if (utiles.length === 1) {
        aliases.add(utiles[0]);
    } else if (utiles.length >= 2) {
        const iniciales = utiles.map(w => w[0]).filter(Boolean).join('');
        if (iniciales.length >= 2) aliases.add(iniciales);
    }
    return [...aliases];
};

/**
 * El RUT en todas las formas en que alguien puede teclearlo: como está guardado («19.742.932-1»), sin
 * separadores («197429321») y sin dígito verificador («19742932»), que es como se lo sabe de memoria
 * quien lo dicta. Va todo al blob para que un solo `indexOf` las cubra.
 *
 * A propósito NO se valida el módulo 11: quien lleva tecleados tres dígitos no tiene un RUT inválido,
 * tiene un RUT a medio escribir. Validar es cosa del formulario de alta, no del buscador.
 */
export const variantesRut = (rut: string | null | undefined): string => {
    const colapsado = colapsarRut(rut);
    if (!colapsado) return '';
    const cuerpo = colapsado.slice(0, -1);
    return `${rut ?? ''} ${colapsado} ${cuerpo}`;
};

export interface OpcionesIndice {
    /**
     * Meter el nombre de la obra en el corpus. Por defecto NO, y la razón importa: en una pantalla que ya
     * está acotada a una obra —Asistencia pide `/trabajadores?obra_id=…`— ese nombre es el MISMO para
     * todos, así que cualquier token contenido en él («jose» dentro de «PLANTA SAN JOSE») coincide con la
     * lista entera y el buscador deja de filtrar. Solo lo enciende quien muestra varias obras a la vez,
     * como Gestiones.
     */
    incluirObra?: boolean;
}

/** Corre UNA vez por trabajador cuando llega la lista, nunca por tecla. */
export const indexar = (w: TrabajadorBuscable, opciones: OpcionesIndice = {}): TrabajadorIndexado => {
    const nombreNorm = normalizar(`${w.apellido_paterno ?? ''} ${w.apellido_materno ?? ''} ${w.nombres ?? ''}`);
    return {
        blob: normalizar([
            w.apellido_paterno, w.apellido_materno, w.nombres,
            variantesRut(w.rut),
            w.cargo_nombre,
            opciones.incluirObra ? w.obra_nombre : null,
        ].filter(Boolean).join(' ')),
        rutColapsado: colapsarRut(w.rut),
        aliases: aliasEmpresa(w.empresa_nombre),
        nombreNorm,
        palabras: nombreNorm.split(/\s+/).filter(Boolean),
    };
};

/** El texto tecleado, partido en tokens ya normalizados. */
export const tokenizar = (q: string | null | undefined): string[] =>
    normalizar(q).split(/\s+/).filter(Boolean);

/**
 * Multi-token con AND: «perez juan» y «juan perez» traen lo mismo, y se pueden mezclar campos
 * («perez jornal»). Cada token tiene que encajar en al menos uno de:
 *   1. el blob (substring) — apellidos, nombres, RUT en sus tres formas, cargo, obra;
 *   2. un alias de empresa (exacto o por prefijo, para que 'lol' encuentre 'lols');
 *   3. el RUT colapsado, solo si el token colapsado llega a 3 caracteres — con menos, cualquier número
 *      suelto traería media lista.
 */
export const coincide = (idx: TrabajadorIndexado, tokens: string[]): boolean =>
    tokens.every(t => {
        if (idx.blob.includes(t)) return true;
        if (idx.aliases.some(a => a === t || a.startsWith(t))) return true;
        const colapsado = colapsarRut(t);
        return colapsado.length >= 3 && idx.rutColapsado.includes(colapsado);
    });

/**
 * Cuánto «merece» estar arriba un resultado ya filtrado: menor es mejor. Se filtra por substring —que
 * encuentra todo— y se ORDENA por prefijo, que es lo que refleja la intención: quien teclea «per»
 * espera «Pérez» primero, no a alguien cuyo cargo contiene «per».
 *
 * Solo se calcula sobre los resultados que ya pasaron el filtro, que son pocos.
 */
export const ranking = (idx: TrabajadorIndexado, q: string | null | undefined): number => {
    const n = normalizar(q);
    if (!n) return 0;
    if (idx.nombreNorm === n) return 0;                            // nombre completo exacto
    if (idx.nombreNorm.startsWith(n)) return 1;                    // empieza el nombre completo
    if (idx.palabras.some(p => p.startsWith(n))) return 2;         // empieza un apellido o nombre
    if (idx.rutColapsado.startsWith(colapsarRut(n))) return 3;     // empieza el RUT
    return 4;                                                      // substring en cualquier campo
};
