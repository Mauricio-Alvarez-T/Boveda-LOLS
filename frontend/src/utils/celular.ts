/**
 * Celular chileno del conductor (mig 132): la misma regla que `backend/src/utils/telefono.js`
 * (la del backend manda; esta es para avisar en el formulario antes de guardar).
 *
 * Se acepta lo que la gente escribe o pega —espacios, guiones, puntos, paréntesis, caracteres invisibles
 * del copiar/pegar y +56 / 56 / 0056— y
 * lo que queda tiene que ser un celular: 9 dígitos que empiezan con 9. Se guarda '+569XXXXXXXX'.
 */

export const MENSAJE_CELULAR = 'Escribe un celular de 9 dígitos que empiece con 9 (ej.: 9 1234 5678).';

export type CelularNormalizado = { ok: true; valor: string | null } | { ok: false };

/** '9 1234 5678' → { ok, valor: '+56912345678' }; vacío → { ok, valor: null }; otra cosa → { ok: false }. */
export function normalizarCelular(valor: string | number | null | undefined): CelularNormalizado {
    if (valor == null) return { ok: true, valor: null };
    const texto = String(valor).trim();
    if (!texto) return { ok: true, valor: null };

    // \p{Cf}: marcas invisibles que el teléfono pega al copiar desde Contactos o WhatsApp (U+202A-E,
    // U+200E/F, U+2060…); U+2010-2015 y U+2212: guiones tipográficos.
    let digitos = texto.replace(/[\s\p{Cf}\u2010-\u2015\u2212\-.()]/gu, '');
    if (!digitos) return { ok: true, valor: null };
    let conCodigo = false;
    if (digitos.startsWith('+')) { digitos = digitos.slice(1); conCodigo = true; }
    else if (digitos.startsWith('00')) { digitos = digitos.slice(2); conCodigo = true; }
    if (!/^\d+$/.test(digitos)) return { ok: false };

    // Con «+» o «00» delante, lo que sigue tiene que ser el 56 de Chile.
    if (conCodigo) {
        if (!digitos.startsWith('56')) return { ok: false };
        digitos = digitos.slice(2);
    } else if (digitos.length === 11 && digitos.startsWith('56')) {
        digitos = digitos.slice(2);
    }
    if (!/^9\d{8}$/.test(digitos)) return { ok: false };
    return { ok: true, valor: `+56${digitos}` };
}

/** ¿Se puede guardar? (vacío también: el teléfono es opcional). */
export const celularValido = (valor: string | null | undefined) => normalizarCelular(valor).ok;

/** '+56912345678' → '+56 9 1234 5678' (para leerlo). Lo que no sea un celular válido queda tal cual. */
export function formatoCelular(valor: string | null | undefined): string {
    const r = normalizarCelular(valor);
    if (!r.ok || !r.valor) return (valor ?? '').trim();
    const d = r.valor.slice(3); // 9XXXXXXXX
    return `+56 ${d[0]} ${d.slice(1, 5)} ${d.slice(5)}`;
}

/** Número para el enlace de WhatsApp ('569XXXXXXXX', sin «+»), o null si no hay un celular válido. */
export function numeroWhatsApp(valor: string | null | undefined): string | null {
    const r = normalizarCelular(valor);
    return r.ok && r.valor ? r.valor.slice(1) : null;
}
