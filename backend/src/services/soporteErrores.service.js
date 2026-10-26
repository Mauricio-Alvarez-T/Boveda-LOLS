const crypto = require('crypto');
const db = require('../config/db');
const logger = require('../utils/logger-structured');

/**
 * «Errores» de Soporte (mig 141, Marcos 2026-10-26; docs/reglas/seguridad-rbac.md § Errores).
 *
 * La app de la persona clasifica el error por el CÓDIGO de la respuesta (frontend `services/reporteErrores.ts`) y lo
 * manda acá. Este service:
 *   · agrupa los repetidos: misma persona + misma `firma` en 10 minutos → suma `veces` en la misma fila;
 *   · decide si pide la foto: SOLO para `falla` y `app`, una por fila, y con topes (por persona y día, por día en total
 *     y bytes guardados en total) para que nunca se llene la base;
 *   · borra las fotos a los 30 días, y las filas que solo cuentan (lento, sin señal, datos) también.
 * Revisar (lista, foto, marcar revisado) es solo del Super Administrador (las rutas pasan por `soloSuperAdmin`).
 */

const CATEGORIAS = ['falla', 'app', 'permiso', 'lento', 'sin_senal', 'dato'];
/** Las que piden revisión (cuentan en el número de Soporte). Las otras solo se cuentan. */
const PARA_REVISAR = ['falla', 'app', 'permiso'];
/** Las únicas con foto: fallas reales del servidor o de la pantalla. */
const CON_FOTO = ['falla', 'app'];

const MINUTOS_REPETIDO = 10;
const MAX_FOTO_BYTES = 200 * 1024;
const FOTOS_POR_PERSONA_DIA = 5;
const FOTOS_POR_DIA = 40;
const FOTOS_TOTAL_BYTES = 40 * 1024 * 1024;
const DIAS_FOTO = 30;
const DIAS_CONTEO = 30;
const DIAS_REVISADOS = 180;
/** Tope de avisos por persona (en memoria): una pantalla en bucle no puede inundar la tabla. */
const AVISOS_POR_PERSONA = 40;
const VENTANA_AVISOS_MS = 10 * 60 * 1000;
const LIMPIEZA_CADA_MS = 60 * 60 * 1000;

const httpError = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });
const texto = (v, max) => {
    const s = v === undefined || v === null ? '' : String(v).trim();
    return s ? s.slice(0, max) : null;
};

function idValido(raw) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) throw httpError('Aviso inválido', 400, 'ID_INVALIDO');
    return id;
}

/** La pantalla sin la consulta (`?u=7`): así el mismo error en la misma pantalla se agrupa. */
const sinConsulta = (p) => String(p || '').split('?')[0];

function firmaDe(categoria, mensaje, accion, pantalla) {
    return crypto.createHash('sha1').update([categoria, mensaje, accion || '', sinConsulta(pantalla)].join('|')).digest('hex');
}

// ───────────── Tope de avisos por persona (memoria del proceso) ─────────────
const avisosRecientes = new Map();
function pasaElTope(usuarioId, ahora = Date.now()) {
    const lista = (avisosRecientes.get(usuarioId) || []).filter(t => ahora - t < VENTANA_AVISOS_MS);
    if (lista.length >= AVISOS_POR_PERSONA) {
        avisosRecientes.set(usuarioId, lista);
        return false;
    }
    lista.push(ahora);
    avisosRecientes.set(usuarioId, lista);
    return true;
}

// ───────────── Limpieza (a lo más una vez por hora, sin cron) ─────────────
let ultimaLimpieza = 0;
async function limpiar(ahora = Date.now()) {
    if (ahora - ultimaLimpieza < LIMPIEZA_CADA_MS) return;
    ultimaLimpieza = ahora;
    try {
        await db.query(
            `UPDATE soporte_errores
                SET foto = NULL, foto_mime = NULL, foto_bytes = NULL, foto_borrada_en = NOW()
              WHERE foto IS NOT NULL AND created_at < NOW() - INTERVAL ${DIAS_FOTO} DAY`
        );
        await db.query(
            `DELETE FROM soporte_errores
              WHERE categoria IN ('lento', 'sin_senal', 'dato') AND ultima_vez < NOW() - INTERVAL ${DIAS_CONTEO} DAY`
        );
        await db.query(
            `DELETE FROM soporte_errores
              WHERE estado = 'revisado' AND ultima_vez < NOW() - INTERVAL ${DIAS_REVISADOS} DAY`
        );
    } catch (e) {
        logger.warn('[soporteErrores] limpieza falló', { err: e.message });
    }
}

/** Foto: data URL de una imagen que de verdad es lo que dice (como las de Ideas, mig 121). */
const FOTO_RE = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/;
function leerFoto(dataUrl) {
    const m = FOTO_RE.exec(String(dataUrl || ''));
    if (!m) throw httpError('La foto tiene que ser una imagen (WEBP, JPG o PNG).', 400, 'ERROR_FOTO_FORMATO');
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length) throw httpError('La foto llegó vacía.', 400, 'ERROR_FOTO_FORMATO');
    if (buf.length > MAX_FOTO_BYTES) {
        throw httpError(`La foto pesa ${Math.ceil(buf.length / 1024)} KB y el máximo es ${MAX_FOTO_BYTES / 1024} KB.`, 400, 'ERROR_FOTO_PESADA');
    }
    const esJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
    const esPng = buf[0] === 0x89 && buf.slice(1, 4).toString('latin1') === 'PNG';
    const esWebp = buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP';
    const coincide = (m[1] === 'image/jpeg' && esJpeg) || (m[1] === 'image/png' && esPng) || (m[1] === 'image/webp' && esWebp);
    if (!coincide) throw httpError('El archivo no es la imagen que dice ser.', 400, 'ERROR_FOTO_FORMATO');
    return { buf, mime: m[1] };
}

/** ¿Se puede pedir una foto más? Una sola consulta con los tres topes. */
async function hayCupoDeFoto(usuarioId) {
    const [[t]] = await db.query(
        `SELECT
            COALESCE(SUM(foto_pedida = 1 AND created_at >= CURDATE() AND usuario_id = ?), 0) AS persona_hoy,
            COALESCE(SUM(foto_pedida = 1 AND created_at >= CURDATE()), 0) AS hoy,
            COALESCE(SUM(CASE WHEN foto IS NOT NULL THEN foto_bytes ELSE 0 END), 0) AS bytes
           FROM soporte_errores
          WHERE created_at >= NOW() - INTERVAL ${DIAS_FOTO + 1} DAY`,
        [usuarioId]
    );
    return Number(t.persona_hoy) < FOTOS_POR_PERSONA_DIA
        && Number(t.hoy) < FOTOS_POR_DIA
        && Number(t.bytes) < FOTOS_TOTAL_BYTES;
}

const VISTAS = {
    revisar: `e.categoria IN ('falla', 'app', 'permiso') AND e.estado = 'pendiente'`,
    revisados: `e.categoria IN ('falla', 'app', 'permiso') AND e.estado = 'revisado'`,
    senal: `e.categoria IN ('lento', 'sin_senal')`,
    datos: `e.categoria = 'dato'`,
    todos: '1 = 1',
};

const soporteErroresService = {
    CATEGORIAS,
    PARA_REVISAR,
    CON_FOTO,
    MAX_FOTO_BYTES,
    FOTOS_POR_PERSONA_DIA,
    FOTOS_POR_DIA,
    FOTOS_TOTAL_BYTES,
    VISTAS: Object.keys(VISTAS),

    /**
     * Un aviso de la app de la persona. Devuelve `{ id, repetido, pedir_foto }` (`ignorado: true` si pasó el tope de
     * avisos; la app no insiste). La categoría la decide la app por el código; acá se valida y se agrupa.
     */
    async reportar(usuario, body, req) {
        const usuarioId = Number(usuario?.id);
        if (!usuarioId) throw httpError('Sin sesión', 401, 'SIN_SESION');
        const categoria = String(body.categoria || '');
        if (!CATEGORIAS.includes(categoria)) throw httpError('Categoría inválida', 400, 'ERROR_CATEGORIA');
        if (!pasaElTope(usuarioId)) return { ignorado: true, pedir_foto: false };
        limpiar().catch(() => {});

        const mensaje = texto(body.mensaje, 300) || 'Error sin mensaje';
        const accion = texto(body.accion, 255);
        const pantalla = texto(body.pantalla, 255);
        const firma = firmaDe(categoria, mensaje, accion, pantalla);
        const duracion = Number.isFinite(Number(body.duracion_ms)) && Number(body.duracion_ms) >= 0
            ? Math.min(Math.round(Number(body.duracion_ms)), 4294967295) : null;

        // ¿Ya está (misma persona, mismo error, hace menos de 10 min)? → suma una vez más.
        const [repetidos] = await db.query(
            `SELECT id FROM soporte_errores
              WHERE usuario_id = ? AND firma = ? AND ultima_vez >= NOW() - INTERVAL ${MINUTOS_REPETIDO} MINUTE
              ORDER BY id DESC LIMIT 1`,
            [usuarioId, firma]
        );
        if (repetidos.length) {
            const id = Number(repetidos[0].id);
            await db.query(
                'UPDATE soporte_errores SET veces = veces + 1, ultima_vez = NOW(), duracion_ms = COALESCE(?, duracion_ms) WHERE id = ?',
                [duracion, id]
            );
            return { id, repetido: true, pedir_foto: false };
        }

        const pedirFoto = CON_FOTO.includes(categoria) && await hayCupoDeFoto(usuarioId);
        const permisos = Array.isArray(body.permisos_faltantes)
            ? body.permisos_faltantes.map(p => String(p).trim()).filter(Boolean).slice(0, 10).join(',').slice(0, 500) || null
            : null;
        const codigo = Number.isInteger(Number(body.codigo)) && body.codigo !== null && body.codigo !== undefined && body.codigo !== ''
            ? Number(body.codigo) : null;
        const obraId = Number.isInteger(Number(body.obra_id)) && Number(body.obra_id) > 0 ? Number(body.obra_id) : null;
        const navegador = String(req?.headers?.['user-agent'] || '').slice(0, 255) || null;

        const [r] = await db.query(
            `INSERT INTO soporte_errores
                (usuario_id, categoria, firma, mensaje, accion, codigo, permisos_faltantes, detalle_tecnico,
                 pantalla, pantalla_nombre, obra_id, dispositivo, navegador, duracion_ms, foto_pedida)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT o.id FROM obras o WHERE o.id = ?), ?, ?, ?, ?)`,
            [
                usuarioId, categoria, firma, mensaje, accion, codigo, permisos, texto(body.detalle_tecnico, 4000),
                pantalla, texto(body.pantalla_nombre, 120), obraId,
                ['movil', 'escritorio'].includes(body.dispositivo) ? body.dispositivo : null,
                navegador, duracion, pedirFoto ? 1 : 0,
            ]
        );
        return { id: Number(r.insertId), repetido: false, pedir_foto: pedirFoto };
    },

    /** La foto que pidió el servidor: solo la persona dueña, una vez, y dentro de la hora. */
    async subirFoto(usuario, rawId, dataUrl) {
        const id = idValido(rawId);
        const { buf, mime } = leerFoto(dataUrl);
        const [r] = await db.query(
            `UPDATE soporte_errores SET foto = ?, foto_mime = ?, foto_bytes = ?
              WHERE id = ? AND usuario_id = ? AND foto_pedida = 1 AND foto IS NULL AND foto_borrada_en IS NULL
                AND created_at >= NOW() - INTERVAL 1 HOUR`,
            [buf, mime, buf.length, id, Number(usuario?.id)]
        );
        if (!r.affectedRows) throw httpError('Esa foto ya no se puede subir.', 409, 'ERROR_FOTO_NO_PEDIDA');
        return { id, foto_bytes: buf.length };
    },

    /** «Quitar»: la persona borra la foto de su aviso (el aviso queda). */
    async quitarFoto(usuario, rawId) {
        const id = idValido(rawId);
        const [r] = await db.query(
            `UPDATE soporte_errores SET foto = NULL, foto_mime = NULL, foto_bytes = NULL, foto_borrada_en = NOW()
              WHERE id = ? AND usuario_id = ?`,
            [id, Number(usuario?.id)]
        );
        if (!r.affectedRows) throw httpError('Aviso no encontrado', 404, 'ERROR_NO_EXISTE');
        return { id };
    },

    /** «Contar qué pasó»: el texto de la persona, dentro del día. */
    async describir(usuario, rawId, descripcion) {
        const id = idValido(rawId);
        const t = texto(descripcion, 1000);
        const [r] = await db.query(
            `UPDATE soporte_errores SET descripcion = ?
              WHERE id = ? AND usuario_id = ? AND created_at >= NOW() - INTERVAL 1 DAY`,
            [t, id, Number(usuario?.id)]
        );
        if (!r.affectedRows) throw httpError('Aviso no encontrado', 404, 'ERROR_NO_EXISTE');
        return { id };
    },

    /** La bandeja (Super Administrador). `vista`: revisar (por defecto) | revisados | senal | datos | todos. */
    async listar(vista) {
        await limpiar();
        const donde = VISTAS[vista] || VISTAS.revisar;
        const [filas] = await db.query(
            `SELECT e.id, e.usuario_id, u.nombre AS usuario_nombre, u.email AS usuario_email, r.nombre AS rol_nombre,
                    e.categoria, e.mensaje, e.accion, e.codigo, e.permisos_faltantes, e.detalle_tecnico,
                    e.pantalla, e.pantalla_nombre, e.obra_id, o.nombre AS obra_nombre, e.dispositivo, e.navegador,
                    e.duracion_ms, e.veces, e.primera_vez, e.ultima_vez, e.foto_bytes, (e.foto IS NOT NULL) AS tiene_foto,
                    e.foto_pedida, e.foto_borrada_en, e.descripcion, e.estado, e.nota, e.revisado_en,
                    rv.nombre AS revisado_por_nombre
               FROM soporte_errores e
               JOIN usuarios u ON u.id = e.usuario_id
               LEFT JOIN roles r ON r.id = u.rol_id
               LEFT JOIN obras o ON o.id = e.obra_id
               LEFT JOIN usuarios rv ON rv.id = e.revisado_por
              WHERE ${donde}
              ORDER BY e.ultima_vez DESC
              LIMIT 200`
        );
        // Los permisos que faltaban, con su nombre del catálogo («Editar Trabajadores»).
        const claves = [...new Set(filas.flatMap(f => String(f.permisos_faltantes || '').split(',').filter(Boolean)))];
        const nombres = new Map();
        if (claves.length) {
            const [cat] = await db.query('SELECT clave, nombre FROM permisos_catalogo WHERE clave IN (?)', [claves]);
            for (const c of cat) nombres.set(c.clave, c.nombre);
        }
        return filas.map(f => {
            const faltan = String(f.permisos_faltantes || '').split(',').filter(Boolean);
            return {
                ...f,
                id: Number(f.id),
                usuario_id: Number(f.usuario_id),
                veces: Number(f.veces),
                tiene_foto: !!Number(f.tiene_foto),
                foto_pedida: !!Number(f.foto_pedida),
                permisos_faltantes: faltan.map(clave => ({ clave, nombre: nombres.get(clave) || clave })),
            };
        });
    },

    /** El número de Soporte y el aviso de lentitud: cuántas personas tuvieron respuestas lentas en la última hora. */
    async resumen() {
        const [[p]] = await db.query(
            `SELECT COUNT(*) AS n FROM soporte_errores
              WHERE categoria IN ('falla', 'app', 'permiso') AND estado = 'pendiente'`
        );
        const [[l]] = await db.query(
            `SELECT COUNT(DISTINCT usuario_id) AS personas, COALESCE(SUM(veces), 0) AS veces,
                    MIN(primera_vez) AS desde, MAX(ultima_vez) AS hasta
               FROM soporte_errores
              WHERE categoria = 'lento' AND ultima_vez >= NOW() - INTERVAL 1 HOUR`
        );
        return {
            pendientes: Number(p.n) || 0,
            lentos: { personas: Number(l.personas) || 0, veces: Number(l.veces) || 0, desde: l.desde || null, hasta: l.hasta || null },
        };
    },

    /** La foto de un aviso (Super Administrador). */
    async foto(rawId) {
        const id = idValido(rawId);
        const [[f]] = await db.query('SELECT foto, foto_mime FROM soporte_errores WHERE id = ?', [id]);
        if (!f || !f.foto) throw httpError('Ese aviso no tiene foto', 404, 'ERROR_SIN_FOTO');
        return { buf: f.foto, mime: f.foto_mime || 'image/jpeg' };
    },

    /** Marcar revisado (con nota) o volver a «pendiente». */
    async revisar(superAdmin, rawId, { estado, nota }) {
        const id = idValido(rawId);
        if (!['pendiente', 'revisado'].includes(estado)) throw httpError('Estado inválido', 400, 'ERROR_ESTADO');
        const revisado = estado === 'revisado';
        const [r] = await db.query(
            `UPDATE soporte_errores
                SET estado = ?, nota = COALESCE(?, nota), revisado_por = ?, revisado_en = ${revisado ? 'NOW()' : 'NULL'}
              WHERE id = ?`,
            [estado, nota === undefined ? null : texto(nota, 1000), revisado ? Number(superAdmin.id) : null, id]
        );
        if (!r.affectedRows) throw httpError('Aviso no encontrado', 404, 'ERROR_NO_EXISTE');
        return { id, estado };
    },

    // Para las pruebas.
    _reiniciar() { avisosRecientes.clear(); ultimaLimpieza = 0; },
    _firmaDe: firmaDe,
};

module.exports = soporteErroresService;
