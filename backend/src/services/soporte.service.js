/**
 * «Soporte · usuarios» (Marcos 2026-10-23): para los dos Super Administradores (Marcos y Mauricio). Cuando alguien
 * pregunta «¿por qué no veo X?», en vez de entrar y salir de su cuenta:
 *   1. la FICHA de la persona: rol, obra, bodega y sus permisos efectivos con el origen de cada uno;
 *   2. «Ver como esta persona»: un token de 30 min PARA ESE USUARIO, de solo lectura, con el que la app se ve tal
 *      cual la ve él (mismos permisos, obra y bodega; los montos siguen recortados por SUS permisos).
 *
 * Seguridad (docs/reglas/seguridad-rbac.md § Ver como usuario):
 *   - Las rutas van detrás de `auth` + `middleware/superAdmin` (rol 1 en el token Y en la BD; nunca un token `imp`).
 *   - El token lleva `imp` (id de quien mira) y `ro: true`: `middleware/auth` rechaza todo lo que no sea lectura.
 *   - No se emite para un usuario inactivo ni para otro rol 1.
 *   - El «ver como» queda en el historial a nombre del Super Administrador.
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

/**
 * El último ingreso de cada persona, de una vez (la lista y el Panorama): el mismo dato de `sesionDe` (el LOGIN de
 * «acceso» más reciente del historial). El «ver como» se anota a nombre del Super Administrador (modulo 'soporte'):
 * no cuenta como ingreso de la persona. Si algo falla, Map vacío (se muestra «sin ingresos»), nunca rompe la lista.
 */
async function ingresosPorUsuario() {
    try {
        const [rows] = await db.query(
            `SELECT usuario_id, MAX(created_at) AS t
               FROM logs_actividad
              WHERE accion = 'LOGIN' AND modulo = 'acceso' AND usuario_id IS NOT NULL
              GROUP BY usuario_id`
        );
        return new Map((rows || []).map(r => [Number(r.usuario_id), r.t || null]));
    } catch {
        return new Map();
    }
}

/** Los usuarios ACTIVOS, por nombre (la lista y el Panorama: las mismas personas). */
const SQL_USUARIOS_ACTIVOS =
    `SELECT u.id, u.nombre, u.email, u.rol_id, r.nombre AS rol_nombre,
            u.obra_id, o.nombre AS obra_nombre, u.bodega_id, b.nombre AS bodega_nombre
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       LEFT JOIN obras o ON o.id = u.obra_id
       LEFT JOIN bodegas b ON b.id = u.bodega_id
      WHERE u.activo = 1
      ORDER BY u.nombre ASC`;

/** Agrupa filas por una columna numérica: Map<id, filas[]> (conserva el orden en que llegaron). */
function agrupar(filas, campo) {
    const m = new Map();
    for (const f of filas || []) {
        const k = Number(f[campo]);
        const lista = m.get(k);
        if (lista) lista.push(f);
        else m.set(k, [f]);
    }
    return m;
}

const soporteService = {
    MINUTOS_VER_COMO,

    /** Usuarios ACTIVOS, por nombre: lo que lista el buscador de la página, con su último ingreso. */
    async listarUsuarios() {
        const [rows] = await db.query(SQL_USUARIOS_ACTIVOS);
        if (!rows.length) return [];
        const ingresos = await ingresosPorUsuario();
        return rows.map(r => ({ ...filaUsuario(r), ultimo_ingreso: ingresos.get(Number(r.id)) ?? null }));
    },

    /**
     * El PANORAMA (Marcos 2026-10-26): las mismas personas de la lista, cada una con sus permisos efectivos (lo que
     * llevaría su token), para que el frontend dibuje qué secciones del menú ve cada una (`menuVisible`, la regla del
     * Sidebar). Todo en lote, con un número FIJO de consultas (no una por persona):
     *   1. los usuarios activos;  2. los permisos de los roles presentes (menos el 1);
     *   3. los overrides de todos;  4. las claves del catálogo (solo si hay algún rol 1: su base es todo el catálogo);
     *   5. el último ingreso de cada uno (`ingresosPorUsuario`).
     * El cálculo es `permisosService.componerPermisos`, el mismo de `detallePermisos` (login y ficha).
     */
    async panorama() {
        const [rows] = await db.query(SQL_USUARIOS_ACTIVOS);
        const usuarios = rows.map(filaUsuario);
        if (!usuarios.length) return [];
        const ingresos = await ingresosPorUsuario();

        const roles = [...new Set(usuarios.map(u => u.rol_id).filter(r => r !== ROL_SUPER_ADMIN))];
        const [permisosRol] = roles.length
            ? await db.query('SELECT rol_id, permiso_clave FROM permisos_rol_v2 WHERE rol_id IN (?)', [roles])
            : [[]];
        const [overrides] = await db.query(
            'SELECT usuario_id, permiso_clave, tipo FROM permisos_usuario_override WHERE usuario_id IN (?)',
            [usuarios.map(u => u.id)]
        );
        const [catalogo] = usuarios.some(u => u.rol_id === ROL_SUPER_ADMIN)
            ? await db.query('SELECT clave FROM permisos_catalogo')
            : [[]];

        const clavesCatalogo = (catalogo || []).map(c => c.clave);
        const porRol = agrupar(permisosRol, 'rol_id');
        const porUsuario = agrupar(overrides, 'usuario_id');
        return usuarios.map(u => {
            const base = u.rol_id === ROL_SUPER_ADMIN
                ? clavesCatalogo
                : (porRol.get(u.rol_id) || []).map(r => r.permiso_clave);
            const { efectivos } = permisosService.componerPermisos(u.rol_id, base, porUsuario.get(u.id) || []);
            return { ...u, ultimo_ingreso: ingresos.get(u.id) ?? null, efectivos };
        });
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
};

module.exports = soporteService;
