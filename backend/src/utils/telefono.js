/**
 * Celular chileno del conductor (mig 132): se guarda SIEMPRE como '+569XXXXXXXX'.
 *
 * Acepta lo que la gente escribe o pega: espacios, guiones, puntos, paréntesis, caracteres invisibles
 * del copiar/pegar y el código de país
 * (+56, 56 o 0056). Lo que queda tiene que ser un celular: 9 dígitos que empiezan con 9.
 * Vacío o null → null (sin teléfono). Cualquier otra cosa (fijo, otro país, letras, dígitos de
 * más o de menos) es inválida: el backend responde 400 con un mensaje en español.
 *
 * El frontend tiene la misma regla en `frontend/src/utils/celular.ts` (validación en el
 * formulario); la que manda es esta.
 */

const MENSAJE_CELULAR_INVALIDO = 'debe ser un celular chileno de 9 dígitos que empiece con 9 (ej.: 9 1234 5678)';

/**
 * @param {unknown} valor
 * @returns {{ ok: true, valor: string|null } | { ok: false }}
 */
function normalizarCelular(valor) {
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

/**
 * Normaliza o lanza el 400 que entiende el errorHandler.
 * @param {unknown} valor
 * @param {string} [sujeto] cómo se nombra el campo en el mensaje («El teléfono del conductor»).
 * @returns {string|null}
 */
function celularOError(valor, sujeto = 'El teléfono') {
    const r = normalizarCelular(valor);
    if (r.ok) return r.valor;
    throw Object.assign(new Error(`${sujeto} ${MENSAJE_CELULAR_INVALIDO}.`), {
        statusCode: 400, code: 'TELEFONO_INVALIDO',
    });
}

module.exports = { normalizarCelular, celularOError, MENSAJE_CELULAR_INVALIDO };
