/**
 * «Soporte · usuarios» (Marcos 2026-10-23): para los dos Super Administradores (Marcos y Mauricio). Cuando alguien
 * pregunta «¿por qué no veo X?», en vez de entrar y salir de su cuenta:
 *   1. la FICHA de la persona: rol, obra, bodega y sus permisos efectivos con el origen de cada uno;
 *   2. «Ver como esta persona»: un token de 30 min PARA ESE USUARIO, de solo lectura, con el que la app se ve tal
 *      cual la ve él (mismos permisos, obra y bodega; los montos siguen recortados por SUS permisos).
 *   3. Modo cambios (2026-10-26, `activarCambios`): desde ese solo lectura, un token de la misma persona que deja
 *      escribir (`rw`), con lo bloqueado de middleware/auth y cada escritura en el historial a nombre de quien mira.
 *
 * Seguridad (docs/reglas/seguridad-rbac.md § Ver como usuario):
 *   - Las rutas van detrás de `auth` + `middleware/superAdmin` (rol 1 en el token Y en la BD; nunca un token `imp`),
 *     salvo el paso a modo cambios, que va detrás de `middleware/verComoLectura` (SOLO un token de «ver como»).
 *   - El token lleva `imp` (id de quien mira) y `ro: true`: `middleware/auth` rechaza todo lo que no sea lectura.
 *   - No se emite para un usuario inactivo ni para otro rol 1.
 *   - El «ver como» (y el paso a modo cambios) queda en el historial a nombre del Super Administrador.
 * Las columnas se piden una por una: nunca `usuarios.*` (password_hash no sale de aquí).
 */
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const permisosService = require('./permisos.service');
const authService = require('./auth.service');
const { logManualActivity } = require('../middleware/logger');

const MINUTOS_VER_COMO = 30;
const ROL_SUPER_ADMIN = 1;

const httpError = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });
const esActivo = (v) => v === 1 || v === true || v === '1';
const numOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** Id de la URL: entero positivo o 400. */
function idValido(raw) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) throw httpError('Usuario inválido', 400, 'ID_INVALIDO');
    return id;
}

/** Fila de la lista (y cabecera de la ficha): solo datos de identificación, nada sensible. */
function filaUsuario(r) {
    return {
        id: Number(r.id),
        nombre: r.nombre,
        email: r.email,
        rol_id: Number(r.rol_id),
        rol_nombre: r.rol_nombre,
        obra_id: numOrNull(r.obra_id),
        obra_nombre: r.obra_nombre ?? null,
        bodega_id: numOrNull(r.bodega_id),
        bodega_nombre: r.bodega_nombre ?? null,
    };
}

/**
 * Último ingreso y último cambio de sus permisos, desde el historial (logs_actividad). Sirve para el aviso
 * «sus permisos cambiaron después de su último ingreso: debe volver a iniciar sesión» (los permisos viajan en el
 * JWT). Cuenta los cambios hechos desde la app: permisos de su rol, sus permisos propios y su rol/obra/bodega.
 * Lo que cambia una migración no deja log (limitación conocida). Si algo falla, todo null (el aviso no sale).
 */
async function sesionDe(u) {
    try {
        const [[ingreso]] = await db.query(
            "SELECT MAX(created_at) AS t FROM logs_actividad WHERE usuario_id = ? AND accion = 'LOGIN' AND modulo = 'acceso'",
            [u.id]
        );
        const [cambios] = await db.query(
            `SELECT created_at AS t, modulo, entidad_tipo
               FROM logs_actividad
              WHERE accion = 'UPDATE' AND (
                    (modulo = 'roles' AND ((entidad_tipo = 'rol' AND item_id = ?) OR (entidad_tipo = 'usuario' AND item_id = ?)))
                 OR (modulo = 'usuarios' AND item_id = ?
                     AND (detalle LIKE '%"rol_id"%' OR detalle LIKE '%"bodega_id"%' OR detalle LIKE '%"obra_id"%'))
              )
              ORDER BY created_at DESC
              LIMIT 1`,
            [String(u.rol_id), String(u.id), String(u.id)]
        );
        const c = cambios && cambios[0];
        let que = null;
        if (c) que = c.modulo === 'usuarios' ? 'datos' : (c.entidad_tipo === 'rol' ? 'rol' : 'propios');
        return {
            ultimo_ingreso: (ingreso && ingreso.t) || null,
            ultimo_cambio: (c && c.t) || null,
            ultimo_cambio_de: que,
        };
    } catch {
        return { ultimo_ingreso: null, ultimo_cambio: null, ultimo_cambio_de: null };
    }
}

const soporteService = {
    MINUTOS_VER_COMO,

    /** Usuarios ACTIVOS, por nombre: lo que lista el buscador de la página. */
    async listarUsuarios() {
        const [rows] = await db.query(
            `SELECT u.id, u.nombre, u.email, u.rol_id, r.nombre AS rol_nombre,
                    u.obra_id, o.nombre AS obra_nombre, u.bodega_id, b.nombre AS bodega_nombre
               FROM usuarios u
               JOIN roles r ON r.id = u.rol_id
               LEFT JOIN obras o ON o.id = u.obra_id
               LEFT JOIN bodegas b ON b.id = u.bodega_id
              WHERE u.activo = 1
              ORDER BY u.nombre ASC`
        );
        return rows.map(filaUsuario);
    },

    /**
     * La ficha: datos, permisos efectivos con su origen y la sesión. Los permisos salen de
     * `permisosService.detallePermisos` (EL cálculo del login), con nombre y módulo del catálogo:
     *   - origen 'rol'     → lo tiene por su rol;
     *   - origen 'propio'  → permiso propio (override grant), su rol no lo trae;
     *   - origen 'quitado' → su rol lo trae pero a él se lo quitaron (override deny); NO está en `efectivos`.
     * `efectivos` = exactamente lo que llevaría su token (`p`): el frontend calcula con eso qué menús, pestañas e
     * Inicio le tocan, con las mismas funciones que usa la app.
     */
    async ficha(rawId) {
        const id = idValido(rawId);
        const [rows] = await db.query(
            `SELECT u.id, u.nombre, u.email, u.activo, u.rol_id, r.nombre AS rol_nombre,
                    u.obra_id, o.nombre AS obra_nombre, o.activa AS obra_activa, o.finalizada AS obra_finalizada,
                    u.bodega_id, b.nombre AS bodega_nombre
               FROM usuarios u
               JOIN roles r ON r.id = u.rol_id
               LEFT JOIN obras o ON o.id = u.obra_id
               LEFT JOIN bodegas b ON b.id = u.bodega_id
              WHERE u.id = ?`,
            [id]
        );
        if (!rows.length) throw httpError('Usuario no encontrado', 404, 'USUARIO_NO_EXISTE');
        const r = rows[0];
        const usuario = { ...filaUsuario(r), activo: esActivo(r.activo) };

        const det = await permisosService.detallePermisos(usuario.id, usuario.rol_id);
        const [catalogo] = await db.query('SELECT clave, modulo, nombre, descripcion, orden FROM permisos_catalogo');
        const meta = new Map(catalogo.map(c => [c.clave, c]));
        const propios = new Set(det.propios);
        const fila = (clave, origen) => {
            const c = meta.get(clave);
            return {
                clave,
                modulo: c ? c.modulo : 'Otros',
                nombre: c ? c.nombre : clave,
                descripcion: c ? (c.descripcion ?? null) : null,
                orden: c && c.orden != null ? Number(c.orden) : 9999,
                origen,
            };
        };
        const permisos = [
            ...det.efectivos.map(k => fila(k, propios.has(k) ? 'propio' : 'rol')),
            ...det.quitados.map(k => fila(k, 'quitado')),
        ].sort((a, b) => a.modulo.localeCompare(b.modulo, 'es') || a.orden - b.orden || a.clave.localeCompare(b.clave));

        return {
            usuario,
            obra: r.obra_id == null ? null : {
                id: Number(r.obra_id),
                nombre: r.obra_nombre ?? null,
                activa: r.obra_activa == null ? null : esActivo(r.obra_activa),
                finalizada: r.obra_finalizada == null ? null : esActivo(r.obra_finalizada),
            },
            efectivos: det.efectivos,
            permisos,
            sesion: await sesionDe(usuario),
        };
    },

    /**
     * «Ver como esta persona»: token de sesión de 30 min PARA ESE USUARIO (mismos claims que su login: rol, permisos
     * efectivos, obra, bodega y `rv`), más `imp` (= id del Super Administrador) y `ro: true`. `superAdmin` viene de
     * `middleware/superAdmin` (ya verificado contra la BD). Lo deja en el historial a nombre de quien mira.
     */
    async emitirVerComo(superAdmin, rawId, req) {
        const id = idValido(rawId);
        const u = await personaVerComo(superAdmin, id);

        const permisos = await permisosService.getPermisosEfectivos(u.id, u.rol_id);
        const { token, user } = authService.firmarSesion(u, permisos, {
            extra: { imp: Number(superAdmin.id), ro: true },
            expiresIn: `${MINUTOS_VER_COMO}m`,
        });
        const { exp } = jwt.decode(token);

        await logManualActivity(
            Number(superAdmin.id), 'soporte', 'LOGIN', String(u.id),
            JSON.stringify({
                evento: 'ver_como',
                usuario_id: u.id,
                usuario: u.nombre,
                rol: u.rol_nombre,
                minutos: MINUTOS_VER_COMO,
                resumen: `${superAdmin.nombre || 'Super Administrador'} vio como ${u.nombre} (${u.rol_nombre}), solo lectura, ${MINUTOS_VER_COMO} min`,
            }),
            req,
            { entidad_tipo: 'usuario', entidad_label: u.nombre }
        );

        return {
            token,
            user,
            vence: new Date(exp * 1000).toISOString(),
            minutos: MINUTOS_VER_COMO,
            quien: { id: Number(superAdmin.id), nombre: superAdmin.nombre ?? null },
        };
    },

    /**
     * Modo cambios (Marcos 2026-10-26, «conversado con el jefe»): desde «ver como» en solo lectura, un token de la
     * MISMA persona que deja escribir, para arreglar directo lo que le pasa sin entrar y salir de su cuenta.
     *   - `superAdmin` viene de `middleware/verComoLectura` (token de «ver como» en solo lectura + rol 1 activo en BD).
     *   - `verComo` = el token entrante ya verificado (`req.user`): de ahí salen la persona y el `exp`.
     *   - La persona se vuelve a verificar en la BD (activa, no rol 1) y sus permisos efectivos se RE-LEEN (el mismo
     *     cálculo del login): si le quitaron algo en estos minutos, el token nuevo ya no lo trae.
     *   - Mismos claims que su login + `imp`, `ro: false`, `rw: true`. Vence a la MISMA hora que el token de solo
     *     lectura (su `exp`; nunca más de 30 min desde ahora): activar cambios no alarga la sesión.
     *   - Queda en el historial: «<Super Admin> activó cambios como <persona> (<rol>)».
     * Lo que se puede y no se puede hacer con ese token: middleware/auth (`BLOQUEADAS_EN_CAMBIOS`).
     */
    async activarCambios(superAdmin, verComo, req) {
        if (!verComo) throw httpError('Esto solo se usa mientras ves como otra persona (Soporte · usuarios).', 403, 'VER_COMO_REQUERIDO');
        const id = idValido(verComo.id);
        const u = await personaVerComo(superAdmin, id);

        const ahora = Math.floor(Date.now() / 1000);
        const expEntrante = Number(verComo.exp);
        if (!Number.isInteger(expEntrante) || expEntrante <= ahora) {
            throw httpError('El «ver como» ya venció: vuelve a tu cuenta.', 401, 'VER_COMO_VENCIDO');
        }
        const exp = Math.min(expEntrante, ahora + MINUTOS_VER_COMO * 60);

        const permisos = await permisosService.getPermisosEfectivos(u.id, u.rol_id);
        const { token } = authService.firmarSesion(u, permisos, {
            extra: { imp: Number(superAdmin.id), ro: false, rw: true },
            exp,
        });
        const vence = new Date(exp * 1000).toISOString();
        const quien = superAdmin.nombre || 'Super Administrador';

        await logManualActivity(
            Number(superAdmin.id), 'soporte', 'LOGIN', String(u.id),
            JSON.stringify({
                evento: 'ver_como_cambios',
                usuario_id: u.id,
                usuario: u.nombre,
                rol: u.rol_nombre,
                // Ya dice como quién: atribuirVerComo no le agrega su marca (queda igual a nombre de `imp`).
                ver_como_usuario_id: u.id,
                ver_como_modo: 'cambios',
                vence,
                resumen: `${quien} activó cambios como ${u.nombre} (${u.rol_nombre})`,
            }),
            req,
            { entidad_tipo: 'usuario', entidad_label: u.nombre }
        );

        return {
            token,
            vence,
            modo: 'cambios',
            quien: { id: Number(superAdmin.id), nombre: superAdmin.nombre ?? null },
        };
    },
};

/**
 * La persona a mirar, desde la BD (columnas una por una): existe, está activa, no es rol 1 y no es quien mira. La
 * usan «ver como» y el modo cambios (mismas reglas, mismos códigos).
 */
async function personaVerComo(superAdmin, id) {
    if (!superAdmin || superAdmin.id == null) throw httpError('Solo el Super Administrador puede usar Soporte · usuarios.', 403, 'SOLO_SUPER_ADMIN');
    if (id === Number(superAdmin.id)) throw httpError('Esa es tu propia cuenta.', 400, 'VER_COMO_PROPIA');

    const [rows] = await db.query(
        `SELECT u.id, u.nombre, u.email, u.email_corporativo, u.activo, u.rol_id, u.obra_id, u.bodega_id,
                r.nombre AS rol_nombre
           FROM usuarios u
           JOIN roles r ON r.id = u.rol_id
          WHERE u.id = ?`,
        [id]
    );
    if (!rows.length) throw httpError('Usuario no encontrado', 404, 'USUARIO_NO_EXISTE');
    const u = { ...rows[0], id: Number(rows[0].id), rol_id: Number(rows[0].rol_id) };
    if (!esActivo(u.activo)) {
        throw httpError('Esa persona está inactiva: no puede entrar, así que no hay nada que mirar.', 409, 'USUARIO_INACTIVO');
    }
    if (u.rol_id === ROL_SUPER_ADMIN) {
        throw httpError('No se puede ver como otro Super Administrador.', 403, 'VER_COMO_SUPER_ADMIN');
    }
    return u;
}

module.exports = soporteService;
