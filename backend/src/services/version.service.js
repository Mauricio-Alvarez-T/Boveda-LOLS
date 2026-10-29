const db = require('../config/db');
const logger = require('../utils/logger-structured');

/**
 * Servicio para gestionar en memoria cuándo deja de valer una sesión, sin consultar la BD en cada petición:
 *   - por ROL: `roles.version` (mig 047). Cambiar los permisos de un rol la sube → todos los tokens de ese rol
 *     (con `rv` viejo) se rechazan.
 *   - por PERSONA: `usuarios.permisos_cambiados_en` (mig 146). Cambiar los permisos propios, el rol o la bodega de
 *     UNA persona guarda ese segundo → solo SUS tokens emitidos hasta ese segundo (`iat` <=) se rechazan.
 * Ambos mapas son por proceso (se cargan en init() y se actualizan al escribir).
 *
 * `permisos_cambiados_en` es DATETIME en **UTC**, escrito y leído con aritmética pura respecto de EPOCA (DATE_ADD /
 * TIMESTAMPDIFF), NO con FROM_UNIXTIME / UNIX_TIMESTAMP: esas dos usan la zona horaria de la sesión (config/db.js no
 * la fija) y en el cambio de hora (verano↔invierno) la hora repetida es ambigua → al recargar en init() el cierre se
 * correría ±3600 s. Con la aritmética el segundo vuelve exacto en cualquier zona del servidor.
 */
const EPOCA = "'1970-01-01 00:00:00'";
const SQL_CARGAR_CIERRES = `SELECT id, TIMESTAMPDIFF(SECOND, ${EPOCA}, permisos_cambiados_en) AS t `
    + 'FROM usuarios WHERE permisos_cambiados_en IS NOT NULL';
const SQL_CERRAR_SESION = `UPDATE usuarios SET permisos_cambiados_en = DATE_ADD(${EPOCA}, INTERVAL ? SECOND) WHERE id = ?`;

/** errno de MySQL/MariaDB «Unknown column» (ER_BAD_FIELD_ERROR): la mig 146 aún no corrió. */
const ERRNO_COLUMNA_INEXISTENTE = 1054;

/**
 * true si a `usuarioId` se le cerró la sesión en el mismo segundo o después de `iatRaw` (el `iat` del token).
 * Sin `iat` (o uno que no es número) no se puede saber cuándo se emitió → cuenta como cerrado.
 */
function cerradaParaIat(cerradasEn, usuarioId, iatRaw) {
    if (usuarioId === undefined || usuarioId === null) return false;
    const t = cerradasEn.get(Number(usuarioId));
    if (t === undefined) return false;
    const iat = Number(iatRaw);
    if (iatRaw === undefined || iatRaw === null || !Number.isFinite(iat)) return true;
    return iat <= t;
}

class VersionService {
    constructor() {
        this.versions = new Map();
        this.cerradasEn = new Map(); // usuarioId -> segundos epoch (permisos_cambiados_en, UTC)
        this.initialized = false;
        this.initPromise = null;
    }

    async init() {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;
        this.initPromise = (async () => {
            try {
                const [rows] = await db.query('SELECT id, version FROM roles');
                rows.forEach(r => {
                    this.versions.set(Number(r.id), Number(r.version));
                });
                logger.info(`[VersionService] Cargadas versiones para ${this.versions.size} roles.`);
            } catch (err) {
                logger.error('[VersionService] Error inicializando versiones', { err: err.message });
                this.initPromise = null; // allow retry
                throw err;
            }
            try {
                await this.cargarSesionesCerradas();
            } catch (err) {
                // Igual que con los roles: sin este mapa, un token viejo de quien cambió de rol/permisos volvería a
                // valer (el cierre por persona ya NO sube roles.version) → no se arranca a medias; se reintenta.
                logger.error('[VersionService] Error cargando los cierres de sesión por persona', {
                    err: err.message, errno: err.errno,
                });
                this.initPromise = null; // allow retry
                throw err;
            }
            this.initialized = true;
        })();
        return this.initPromise;
    }

    /**
     * Carga `usuarios.permisos_cambiados_en` al mapa. Tolera SOLO que la columna aún no exista (errno 1054, ventana
     * deploy→migrate de la mig 146): sin la columna nadie tiene fecha guardada todavía (cerrarSesionDe falla y el
     * llamador sube la versión del rol), así que no se pierde ningún cierre. Cualquier otro fallo (conexión cortada,
     * timeout, bloqueo) LANZA: arrancar con el mapa vacío volvería a aceptar sesiones ya cerradas.
     */
    async cargarSesionesCerradas() {
        let rows;
        try {
            [rows] = await db.query(SQL_CARGAR_CIERRES);
        } catch (err) {
            if (err && err.errno === ERRNO_COLUMNA_INEXISTENTE) {
                logger.warn('[VersionService] Aún no existe usuarios.permisos_cambiados_en (falta la mig 146): sin cierres de sesión por persona', {
                    err: err.message, errno: err.errno,
                });
                return;
            }
            throw err;
        }
        (rows || []).forEach(r => {
            const t = Number(r.t);
            if (Number.isFinite(t)) this.cerradasEn.set(Number(r.id), Math.floor(t));
        });
        logger.info(`[VersionService] Cargados ${this.cerradasEn.size} cierres de sesión por persona.`);
    }

    // Sync — asume que init() ya completó antes de servir requests (ver index.js).
    // Si un rol no está en el Map, devuelve 1 como fallback compatible con el
    // comportamiento previo; increment() lo hidratará en caliente cuando ocurra.
    get(rolId) {
        return this.versions.get(Number(rolId)) || 1;
    }

    async increment(rolId) {
        const id = Number(rolId);
        const current = this.get(id);
        const next = current + 1;

        try {
            await db.query('UPDATE roles SET version = ? WHERE id = ?', [next, id]);
            this.versions.set(id, next);
            logger.info(`[VersionService] Rol #${id} incrementado a versión ${next}. Sesiones previas liquidadas.`);
            return next;
        } catch (err) {
            logger.error(`[VersionService] Error incrementando versión rol #${id}`, { err: err.message });
            throw err;
        }
    }

    /**
     * Cierra la sesión de UNA persona: sus tokens emitidos hasta este segundo dejan de valer (mig 146).
     * Si falla (p. ej. la columna aún no existe), LANZA: el llamador decide el respaldo (subir la versión del rol).
     */
    async cerrarSesionDe(usuarioId) {
        const id = Number(usuarioId);
        const t = Math.floor(Date.now() / 1000);
        try {
            await db.query(SQL_CERRAR_SESION, [t, id]);
            this.cerradasEn.set(id, t);
            logger.info(`[VersionService] Sesión de la persona #${id} cerrada (tokens hasta ${t} dejan de valer).`);
            return t;
        } catch (err) {
            logger.error(`[VersionService] Error cerrando la sesión de la persona #${id}`, { err: err.message, errno: err.errno });
            throw err;
        }
    }

    /**
     * Sync y pura: true si el token (`decoded`) es de una persona a la que se le cerró la sesión DESPUÉS (o en el mismo
     * segundo) de emitirlo. `<=` a propósito: un token del mismo segundo muere — mejor que dejar vivo uno viejo.
     * Sin `iat` (o uno que no es número) no se puede saber cuándo se emitió → cuenta como cerrado.
     * En «ver como» cuentan LAS DOS personas: la mirada (`id`) y quien mira (`imp`, el Super Administrador): si a quien
     * mira le cambian el rol o los permisos, su token prestado también muere.
     */
    sesionCerradaPara(decoded) {
        if (!decoded) return false;
        return cerradaParaIat(this.cerradasEn, decoded.id, decoded.iat)
            || cerradaParaIat(this.cerradasEn, decoded.imp, decoded.iat);
    }
}

const versionService = new VersionService();
module.exports = versionService;
