/**
 * Formatos de placa patente chilena.
 *
 * Fuente: Decreto 53 de 1984 del MTT ("Dicta normas para la placa patente única"),
 * arts. 1, 2 y 2º bis, texto vigente. El formato lo determina el NÚMERO DE RUEDAS,
 * no el tipo de vehículo:
 *   · 4 o más ruedas (autos, camionetas, camiones, buses, maquinaria) y los
 *     remolques/semirremolques del Registro Especial (ley 19.872) → 4 letras + 2 dígitos.
 *   · 2 o 3 ruedas (motos) → la norma base dice 2 letras + 3 dígitos, y el art. 2º bis
 *     manda sustituirlas por 3 letras + 2 dígitos al agotarse. Hoy se emiten 3L+2D.
 *
 * Y las antiguas SIGUEN VIGENTES: no existe norma de recambio obligatorio, y el
 * duplicado de placa reemite la MISMA combinación. Antes de 2007 los vehículos de
 * 4+ ruedas usaban 2 letras + 4 dígitos. En una flota con camiones y maquinaria
 * viejos eso es probable, no excepcional.
 *
 * Por eso la validación NO bloquea: reconocer un formato sirve para avisar de un
 * posible error de tipeo, pero una regla estricta que se equivoca impide trabajar
 * (caso real 2026-08-31: no se podía cargar una moto). Se avisa, no se prohíbe.
 */

/** Deja solo A-Z y 0-9: "abcd·12", "ABCD-12" y "ABCD 12" quedan igual. */
export function normalizarPatente(patente: string): string {
    return (patente || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

type FormatoPatente = {
    re: RegExp;
    /** Qué vehículos usan este formato, para el mensaje de ayuda. */
    usa: string;
    /** true si el formato ya no se emite (pero sigue siendo válido). */
    antiguo?: boolean;
};

const FORMATOS: FormatoPatente[] = [
    { re: /^[A-Z]{4}\d{2}$/, usa: 'autos, camionetas, camiones, buses, maquinaria y remolques' },
    { re: /^[A-Z]{3}\d{2}$/, usa: 'motos (formato actual)' },
    { re: /^[A-Z]{2}\d{3}$/, usa: 'motos antiguas', antiguo: true },
    { re: /^[A-Z]{2}\d{4}$/, usa: 'vehículos anteriores a 2007', antiguo: true },
    // Carros de arrastre livianos (PBV < 3.860 kg): no van al Registro Civil sino
    // al registro municipal REMUCAR. El trámite y la placa están confirmados en
    // sitios municipales; el formato 3L+3D proviene de fuentes secundarias, así que
    // se acepta sin afirmarlo como norma.
    { re: /^[A-Z]{3}\d{3}$/, usa: 'carros de arrastre municipales (REMUCAR)' },
];

/** true si la patente calza con algún formato chileno conocido. */
export function esPatenteConocida(patente: string): boolean {
    const s = normalizarPatente(patente);
    return FORMATOS.some(f => f.re.test(s));
}

/**
 * Advertencia para mostrar bajo el campo, o null si no hay nada que decir.
 * Devuelve null con el campo vacío o a medio escribir: avisar mientras la
 * persona todavía tipea es ruido, no ayuda.
 */
export function advertenciaPatente(patente: string): string | null {
    const s = normalizarPatente(patente);
    if (s.length < 5) return null;          // ningún formato válido tiene menos de 5
    if (esPatenteConocida(s)) return null;
    return 'Esta patente no calza con los formatos chilenos habituales (autos ABCD·12, motos ABC·12). Revisa que esté bien escrita — si es correcta, puedes guardar igual.';
}
