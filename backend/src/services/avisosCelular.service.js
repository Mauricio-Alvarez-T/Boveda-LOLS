const crypto = require('crypto');
const db = require('../config/db');
const logger = require('../utils/logger-structured');

/**
 * Avisos al celular (mig 143, Marcos 2026-10-27; docs/reglas/seguridad-rbac.md § Avisos al celular).
 *
 * Usa las notificaciones del navegador (Web Push, estándar VAPID): cada celular que activa los avisos deja su
 * suscripción (no el número de teléfono) y el servidor le manda avisos firmados con su par de claves. No hay nada
 * corriendo todo el tiempo: se manda en el momento en que pasa algo.
 *
 *   · `web-push` se carga recién al usarlo: si el servidor aún no lo instaló (heal-deps del deploy), el backend arranca
 *     igual y el aviso no sale (queda en el log).
 *   · Las claves: del entorno (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) o, si no hay, se crean una vez y se guardan en
 *     `avisos_celular_claves` (id = 1).
 *   · Un celular que ya no existe (el servicio responde 404/410) se borra solo.
 *   · Lo que se muestra en la pantalla bloqueada es corto y sin datos delicados (nunca sueldos ni RUT).
 */

const CONTACTO = 'mailto:soporte@lols.cl';
const TTL_SEGUNDOS = 6 * 60 * 60;
const MAX_TITULO = 80;
const MAX_CUERPO = 180;

const httpError = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });
const hash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');

let webpushCache = null;
function webpush() {
    if (!webpushCache) webpushCache = require('web-push');
    return webpushCache;
}

let clavesCache = null;
async function claves() {
    if (clavesCache) return clavesCache;
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        clavesCache = { publica: process.env.VAPID_PUBLIC_KEY, privada: process.env.VAPID_PRIVATE_KEY };
        return clavesCache;
    }
    const leer = async () => {
        const [[fila]] = await db.query('SELECT publica, privada FROM avisos_celular_claves WHERE id = 1');
        return fila || null;
    };
    let fila = await leer();
    if (!fila) {
        const nuevas = webpush().generateVAPIDKeys();
        // INSERT IGNORE: si dos pedidos llegan a la vez, gana uno y los dos leen el mismo par.
        await db.query('INSERT IGNORE INTO avisos_celular_claves (id, publica, privada) VALUES (1, ?, ?)', [nuevas.publicKey, nuevas.privateKey]);
        fila = await leer();
    }
    clavesCache = { publica: fila.publica, privada: fila.privada };
    return clavesCache;
}

/** Valida lo que manda el navegador (PushSubscription.toJSON()). */
function leerSuscripcion(sub) {
    const endpoint = String(sub?.endpoint || '');
    const p256dh = String(sub?.keys?.p256dh || '');
    const auth = String(sub?.keys?.auth || '');
    let url;
    try { url = new URL(endpoint); } catch { url = null; }
    if (!url || url.protocol !== 'https:' || endpoint.length > 1000) throw httpError('Suscripción inválida', 400, 'AVISO_SUSCRIPCION');
    if (!/^[A-Za-z0-9_-]{20,255}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,100}$/.test(auth)) throw httpError('Suscripción inválida', 400, 'AVISO_SUSCRIPCION');
    return { endpoint, p256dh, auth };
}

const corto = (s, max) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const avisosCelularService = {
    /** La clave pública que el navegador necesita para suscribirse. */
    async clavePublica() {
        return (await claves()).publica;
    },

    /** Guarda (o actualiza) el celular de esta persona. Un mismo celular que cambia de cuenta queda con la nueva. */
    async suscribir(usuario, sub, req) {
        const { endpoint, p256dh, auth } = leerSuscripcion(sub);
        const dispositivo = String(req?.headers?.['user-agent'] || '').slice(0, 255) || null;
        await db.query(
            `INSERT INTO avisos_celular_suscripciones (usuario_id, endpoint, endpoint_hash, p256dh, auth, dispositivo)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id), endpoint = VALUES(endpoint), p256dh = VALUES(p256dh),
                                     auth = VALUES(auth), dispositivo = VALUES(dispositivo), ultimo_error = NULL`,
            [Number(usuario.id), endpoint, hash(endpoint), p256dh, auth, dispositivo]
        );
        return { activo: true };
    },

    /** «Desactivar»: borra ese celular (solo si es de esta persona). */
    async desuscribir(usuario, endpoint) {
        await db.query('DELETE FROM avisos_celular_suscripciones WHERE endpoint_hash = ? AND usuario_id = ?', [hash(endpoint), Number(usuario.id)]);
        return { activo: false };
    },

    /** Cuántos celulares tiene activos esta persona. */
    async estado(usuario) {
        const [filas] = await db.query(
            `SELECT endpoint_hash, dispositivo, ultimo_envio, ultimo_error, created_at
               FROM avisos_celular_suscripciones WHERE usuario_id = ? ORDER BY created_at DESC`,
            [Number(usuario.id)]
        );
        // Para ver dónde se pierde un aviso: cuándo salió el último y si el servicio de avisos lo rechazó.
        return {
            celulares: filas.length,
            lista: filas.map(f => ({
                id: String(f.endpoint_hash).slice(0, 8),
                dispositivo: f.dispositivo || null,
                ultimo_envio: f.ultimo_envio || null,
                ultimo_error: f.ultimo_error || null,
                creado: f.created_at || null,
            })),
        };
    },

    /**
     * Manda un aviso a todos los celulares de esas personas. Nunca lanza: devuelve cuántos salieron y cuántos fallaron.
     * `url` es adónde lleva al tocarlo (ruta de la app).
     */
    async enviarA(usuarioIds, { titulo, cuerpo, url = '/', etiqueta } = {}) {
        const ids = [...new Set((usuarioIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
        if (!ids.length) return { enviados: 0, fallidos: 0 };
        try {
            const [subs] = await db.query(
                'SELECT id, endpoint, p256dh, auth FROM avisos_celular_suscripciones WHERE usuario_id IN (?)', [ids]
            );
            if (!subs.length) return { enviados: 0, fallidos: 0 };
            const { publica, privada } = await claves();
            const wp = webpush();
            const carga = JSON.stringify({
                titulo: corto(titulo || 'Bóveda LOLS', MAX_TITULO),
                cuerpo: corto(cuerpo, MAX_CUERPO),
                url: String(url || '/').startsWith('/') ? String(url) : '/',
                etiqueta: etiqueta ? corto(etiqueta, 60) : undefined,
            });
            let enviados = 0;
            let fallidos = 0;
            await Promise.all(subs.map(async (s) => {
                try {
                    await wp.sendNotification(
                        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                        carga,
                        // urgency 'high': sin ella Android puede retener el aviso con el teléfono quieto y la pantalla
                        // apagada (modo de ahorro). Son avisos para actuar, no boletines.
                        { TTL: TTL_SEGUNDOS, urgency: 'high', vapidDetails: { subject: CONTACTO, publicKey: publica, privateKey: privada } }
                    );
                    enviados++;
                    await db.query('UPDATE avisos_celular_suscripciones SET ultimo_envio = NOW(), ultimo_error = NULL WHERE id = ?', [s.id]);
                } catch (e) {
                    fallidos++;
                    const codigo = Number(e?.statusCode);
                    if (codigo === 404 || codigo === 410) {
                        // El celular desinstaló, borró datos o retiró el permiso: ya no existe.
                        await db.query('DELETE FROM avisos_celular_suscripciones WHERE id = ?', [s.id]).catch(() => {});
                    } else {
                        await db.query('UPDATE avisos_celular_suscripciones SET ultimo_error = ? WHERE id = ?',
                            [String(codigo || e?.message || 'error').slice(0, 255), s.id]).catch(() => {});
                    }
                }
            }));
            return { enviados, fallidos };
        } catch (e) {
            logger.warn('[avisosCelular] no se pudo mandar el aviso', { err: e.message });
            return { enviados: 0, fallidos: 0, error: true };
        }
    },

    /** «Mandarme un aviso de prueba». */
    async probar(usuario) {
        const r = await avisosCelularService.enviarA([usuario.id], {
            titulo: 'Bóveda LOLS',
            cuerpo: 'Listo: así te van a llegar los avisos en este celular.',
            url: '/soporte?vista=errores',
            etiqueta: 'prueba',
        });
        if (!r.enviados) throw httpError('No se pudo mandar el aviso de prueba. Revisa que los avisos estén activados en este celular.', 409, 'AVISO_NO_SALIO');
        return r;
    },

    /** «Nueva falla en Soporte»: a los Super Administradores con avisos activos. No espera ni lanza. */
    avisarFallaSoporte({ usuarioId, pantalla }) {
        (async () => {
            const [admins] = await db.query('SELECT id FROM usuarios WHERE rol_id = 1 AND activo = 1');
            if (!admins.length) return;
            const [[quien]] = await db.query('SELECT nombre FROM usuarios WHERE id = ?', [Number(usuarioId)]);
            await avisosCelularService.enviarA(admins.map(a => a.id), {
                titulo: 'Nueva falla en Soporte',
                cuerpo: `A ${(quien && quien.nombre) || 'alguien'} le falló ${pantalla || 'Bóveda'}. Toca para verla.`,
                url: '/soporte?vista=errores',
                etiqueta: 'soporte-errores',
            });
        })().catch(e => logger.warn('[avisosCelular] aviso de falla no salió', { err: e.message }));
    },

    // Para las pruebas.
    _olvidarClaves() { clavesCache = null; webpushCache = null; },
};

module.exports = avisosCelularService;
