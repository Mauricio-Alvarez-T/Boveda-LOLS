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

/** ¿Celular o computador? Por el navegador con que se activó (`dispositivo`). Una tablet cuenta como celular. */
function equipoDe(dispositivo) {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(String(dispositivo || '')) ? 'celular' : 'computador';
}

/** Lo que el equipo confirma solo (public/sw-avisos.js) → la columna. «Abierto» también cuenta como que le llegó. */
const ACUSES = {
    mostrado: ['mostrado_en'],
    abierto: ['abierto_en', 'mostrado_en'],
    descartado: ['descartado_en', 'mostrado_en'],
    en_pantalla: ['en_pantalla_en'],
};
/** Días que se guardan los avisos del centro de avisos. */
const DIAS_MENSAJES = 90;

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
        const porEquipo = { celular: 0, computador: 0 };
        for (const f of filas) porEquipo[equipoDe(f.dispositivo)]++;
        return {
            celulares: filas.length,
            por_equipo: porEquipo,
            lista: filas.map(f => ({
                id: String(f.endpoint_hash).slice(0, 8),
                equipo: equipoDe(f.dispositivo),
                dispositivo: f.dispositivo || null,
                ultimo_envio: f.ultimo_envio || null,
                ultimo_error: f.ultimo_error || null,
                creado: f.created_at || null,
            })),
        };
    },

    /**
     * Manda un aviso a todos los equipos (celulares y computadores) de esas personas. Nunca lanza: devuelve cuántos
     * salieron y cuántos fallaron. `url` es adónde lleva al tocarlo (ruta de la app).
     *   · Cada envío queda en `avisos_celular_mensajes` (mig 145, centro de avisos de Soporte) con una clave de un solo
     *     uso que va dentro del aviso: el equipo confirma solo si le apareció, si lo abrió o si lo deslizó (`acuse`).
     *   · `computadorSoloSiNoEsta` (los recordatorios): en un computador con Bóveda abierto y al frente no se muestra,
     *     la persona ya está ahí. Al celular llega siempre.
     *   · `tipo` es para el centro de avisos (por defecto, la etiqueta).
     */
    async enviarA(usuarioIds, { titulo, cuerpo, url = '/', etiqueta, tipo, computadorSoloSiNoEsta = false } = {}) {
        const ids = [...new Set((usuarioIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
        if (!ids.length) return { enviados: 0, fallidos: 0 };
        try {
            const [subs] = await db.query(
                'SELECT id, usuario_id, endpoint, p256dh, auth, dispositivo FROM avisos_celular_suscripciones WHERE usuario_id IN (?)', [ids]
            );
            if (!subs.length) return { enviados: 0, fallidos: 0 };
            const { publica, privada } = await claves();
            const wp = webpush();
            const base = {
                titulo: corto(titulo || 'Bóveda LOLS', MAX_TITULO),
                cuerpo: corto(cuerpo, MAX_CUERPO),
                url: String(url || '/').startsWith('/') ? String(url) : '/',
                etiqueta: etiqueta ? corto(etiqueta, 60) : undefined,
            };
            const tipoAviso = corto(tipo || etiqueta || 'aviso', 40);
            let enviados = 0;
            let fallidos = 0;
            await Promise.all(subs.map(async (s) => {
                const equipo = equipoDe(s.dispositivo);
                const carga = { ...base };
                if (computadorSoloSiNoEsta && equipo === 'computador') carga.siEstaEnBoveda = 'omitir';
                // El registro del centro de avisos no puede frenar el aviso: si falla (p. ej., la tabla aún no
                // existe), el aviso sale igual, sin acuse.
                let mensajeId = null;
                try {
                    const token = crypto.randomBytes(16).toString('hex');
                    const [r] = await db.query(
                        `INSERT INTO avisos_celular_mensajes (usuario_id, suscripcion_id, equipo, tipo, titulo, cuerpo, url, token)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [Number(s.usuario_id), s.id, equipo, tipoAviso, base.titulo, base.cuerpo || null, base.url, token]
                    );
                    if (r && r.insertId) { mensajeId = r.insertId; carga.aviso = { id: r.insertId, t: token }; }
                } catch (e) { mensajeId = null; }
                try {
                    await wp.sendNotification(
                        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                        JSON.stringify(carga),
                        // urgency 'high': sin ella Android puede retener el aviso con el teléfono quieto y la pantalla
                        // apagada (modo de ahorro). Son avisos para actuar, no boletines.
                        { TTL: TTL_SEGUNDOS, urgency: 'high', vapidDetails: { subject: CONTACTO, publicKey: publica, privateKey: privada } }
                    );
                    enviados++;
                    await db.query('UPDATE avisos_celular_suscripciones SET ultimo_envio = NOW(), ultimo_error = NULL WHERE id = ?', [s.id]);
                    if (mensajeId) await db.query("UPDATE avisos_celular_mensajes SET estado_envio = 'entregado' WHERE id = ?", [mensajeId]).catch(() => {});
                } catch (e) {
                    fallidos++;
                    const codigo = Number(e?.statusCode);
                    const motivo = String(codigo || e?.message || 'error').slice(0, 255);
                    if (mensajeId) {
                        await db.query("UPDATE avisos_celular_mensajes SET estado_envio = 'fallo', error = ? WHERE id = ?",
                            [codigo === 404 || codigo === 410 ? 'El equipo ya no tiene los avisos (los desactivó o borró la app)' : motivo, mensajeId]).catch(() => {});
                    }
                    if (codigo === 404 || codigo === 410) {
                        // El celular desinstaló, borró datos o retiró el permiso: ya no existe.
                        await db.query('DELETE FROM avisos_celular_suscripciones WHERE id = ?', [s.id]).catch(() => {});
                    } else {
                        await db.query('UPDATE avisos_celular_suscripciones SET ultimo_error = ? WHERE id = ?',
                            [motivo, s.id]).catch(() => {});
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

    /**
     * El acuse que manda el equipo solo (sin sesión): `{ id, t, evento }`. Solo vale con la clave de ese aviso y cada
     * momento se anota una vez (el primero). Devuelve si anotó algo; nunca dice por qué no (no da pistas).
     */
    async acuse({ id, t, evento } = {}) {
        const n = Number(id);
        const cols = ACUSES[String(evento || '')];
        if (!Number.isInteger(n) || n <= 0 || !cols || !/^[0-9a-f]{32}$/.test(String(t || ''))) return false;
        const set = cols.map(c => `${c} = COALESCE(${c}, NOW())`).join(', ');
        const [r] = await db.query(`UPDATE avisos_celular_mensajes SET ${set} WHERE id = ? AND token = ?`, [n, String(t)]);
        return !!(r && r.affectedRows);
    },

    /**
     * (Centro de avisos, Super Administrador) Los avisos de los últimos `dias` días, del más nuevo al más viejo, con
     * a quién, a qué equipo y qué pasó. Sin la clave ni la dirección del equipo.
     */
    async mensajes({ dias = 7, usuarioId = null, limite = 300 } = {}) {
        const d = Math.min(Math.max(Math.trunc(Number(dias)) || 7, 1), DIAS_MENSAJES);
        const lim = Math.min(Math.max(Math.trunc(Number(limite)) || 300, 1), 1000);
        const params = [d];
        let filtro = '';
        if (Number.isInteger(Number(usuarioId)) && Number(usuarioId) > 0) { filtro = ' AND m.usuario_id = ?'; params.push(Number(usuarioId)); }
        params.push(lim);
        const [filas] = await db.query(
            `SELECT m.id, m.usuario_id, u.nombre, m.equipo, m.tipo, m.titulo, m.cuerpo, m.url, m.estado_envio, m.error,
                    m.enviado_en, m.mostrado_en, m.abierto_en, m.descartado_en, m.en_pantalla_en
               FROM avisos_celular_mensajes m JOIN usuarios u ON u.id = m.usuario_id
              WHERE m.enviado_en >= NOW() - INTERVAL ? DAY${filtro}
              ORDER BY m.enviado_en DESC, m.id DESC LIMIT ?`,
            params
        );
        return filas.map(f => ({ ...f, id: Number(f.id), usuario_id: Number(f.usuario_id) }));
    },

    /** Borra los avisos de más de 90 días del centro de avisos (lo llama el cron con cada ronda). */
    async limpiarMensajes() {
        await db.query('DELETE FROM avisos_celular_mensajes WHERE enviado_en < NOW() - INTERVAL ? DAY', [DIAS_MENSAJES]).catch(() => {});
    },

    equipoDe,

    // Para las pruebas.
    _olvidarClaves() { clavesCache = null; webpushCache = null; },
};

module.exports = avisosCelularService;
