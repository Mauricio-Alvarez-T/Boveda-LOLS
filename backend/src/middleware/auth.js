const jwt = require('jsonwebtoken');
const versionService = require('../services/version.service');
const { registrarCambioVerComo } = require('./logger');
const { motivoModoCambiosInvalido } = require('./verComoLectura');

/**
 * «Ver como» de Soporte (soporte.service.emitirVerComo): el Super Administrador recibe un token de 30 min
 * DEL USUARIO mirado, con `imp` (id de quien mira) y `ro: true`. Con ese token solo se lee: todo lo que no
 * sea GET/HEAD/OPTIONS se rechaza aquí, antes de llegar a la ruta. Cualquier token con `imp` cuenta como
 * de solo lectura aunque le faltara `ro` (defensa en profundidad), SALVO el del modo cambios.
 *
 * Modo cambios (Marcos 2026-10-26, soporte.service.activarCambios): token de la misma persona con `imp`,
 * `rw: true` y `ro: false`, que vence a la misma hora que el de solo lectura. Con él se escribe como esa persona,
 * EXCEPTO lo de `BLOQUEADAS_EN_CAMBIOS` (contraseña, usuarios/roles/permisos, Soporte, correo desde su casilla).
 * Cada escritura queda en el historial a nombre del Super Administrador (`registrarCambioVerComo`).
 * Docs: docs/reglas/seguridad-rbac.md § Ver como usuario (soporte).
 */
const MENSAJE_SOLO_LECTURA = 'Modo «ver como»: solo lectura';
const CODIGO_SOLO_LECTURA = 'VER_COMO_SOLO_LECTURA';
const CODIGO_CAMBIOS_BLOQUEADO = 'VER_COMO_CAMBIOS_BLOQUEADO';
// El token de cambios ya no vale: quien mira dejó de ser Super Administrador activo, o la persona quedó inactiva / rol 1.
const CODIGO_CAMBIOS_INVALIDO = 'VER_COMO_CAMBIOS_INVALIDO';
const METODOS_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);
// POST que SOLO leen (mandan una lista de ids que no cabe en la URL) y que la app pide para mostrar una
// pantalla: sin ellos, «ver como» no vería el stock del Maestro ni el del detalle de una solicitud.
// Agregar uno = revisar antes que su handler no escriba NADA (ni logs a nombre del usuario).
const POST_SOLO_LECTURA = [
    /^\/api\/inventario\/stock-por-items$/,
];
// POST que se aceptan con el token de SOLO LECTURA aunque no sean lecturas: pasar del modo lectura al modo cambios.
// Es la única puerta de salida del solo lectura y la cuida su propia guarda (middleware/verComoLectura: exige `imp`
// + `ro`, y re-verifica en la BD al Super Administrador y a la persona). No escribe datos: firma un token y deja
// UNA fila en el historial a nombre del Super Administrador. Lista exacta: nada más de /api/soporte entra aquí.
const POST_CAMBIO_DE_MODO = [
    /^\/api\/soporte\/ver-como\/escritura$/,
];

/**
 * Lo que NO se puede hacer en modo cambios aunque el token deje escribir (403 `VER_COMO_CAMBIOS_BLOQUEADO`).
 * Se compara contra la ruta normalizada (minúsculas, decodificada, sin `//`): Express enruta sin distinguir
 * mayúsculas, así que `/API/Usuarios` no puede colarse. El orden importa: gana la primera que calce.
 */
const BLOQUEADAS_EN_CAMBIOS = [
    // Su contraseña (y cualquier escritura de /api/auth): nunca desde la cuenta de otra persona.
    { re: /^\/api\/auth(\/|$)/, error: 'En modo cambios no se puede cambiar la contraseña desde la cuenta de otra persona.' },
    // Su correo y sus plantillas guardadas (la clave de su casilla vive ahí).
    { re: /^\/api\/usuarios\/me(\/|$)/, error: 'En modo cambios no se puede cambiar la configuración de correo de otra persona desde su cuenta.' },
    // Usuarios, roles, permisos de rol y permisos propios (overrides): todo /api/usuarios.
    { re: /^\/api\/usuarios(\/|$)/, error: 'En modo cambios no se pueden tocar usuarios, roles ni permisos desde la cuenta de otra persona: hazlo desde tu cuenta, en Usuarios.' },
    // Soporte (salvo el cambio de modo, que su guarda rechaza con `rw`): no se encadena.
    { re: /^\/api\/soporte(\/|$)/, excepto: POST_CAMBIO_DE_MODO, error: 'En modo cambios no se usa Soporte desde la cuenta de otra persona: vuelve a tu cuenta.' },
    // Enviar el Excel de asistencia usa la casilla de correo guardada de ESA persona: sería un correo a su nombre.
    { re: /^\/api\/fiscalizacion\/enviar-excel$/, error: 'En modo cambios no se envían correos desde la casilla de otra persona desde su cuenta.' },
];

const rutaDe = (req) => String(req.originalUrl || '').split('?')[0];

/** Ruta para comparar contra las listas bloqueadas: decodificada, sin barras dobles ni final, en minúsculas. */
const rutaNormalizada = (req) => {
    let p = rutaDe(req);
    try { p = decodeURIComponent(p); } catch { /* mal codificada: se compara tal cual */ }
    p = p.replace(/\/{2,}/g, '/').toLowerCase();
    return p.length > 1 ? p.replace(/\/+$/, '') : p;
};

const tieneImp = (decoded) => decoded.imp !== undefined && decoded.imp !== null;
/** Modo cambios: `imp` + `rw === true` y NUNCA `ro`. */
const esTokenCambios = (decoded) => tieneImp(decoded) && decoded.rw === true && decoded.ro !== true;
const esTokenSoloLectura = (decoded) => decoded.ro === true || (tieneImp(decoded) && !esTokenCambios(decoded));

const permitidoEnSoloLectura = (req) => {
    if (METODOS_LECTURA.has(req.method)) return true;
    const ruta = rutaDe(req);
    return req.method === 'POST' && (POST_SOLO_LECTURA.some(re => re.test(ruta)) || POST_CAMBIO_DE_MODO.some(re => re.test(ruta)));
};

/** La regla de `BLOQUEADAS_EN_CAMBIOS` que corta esta escritura, o null. */
const bloqueoEnCambios = (req) => {
    if (METODOS_LECTURA.has(req.method)) return null;
    const ruta = rutaNormalizada(req);
    return BLOQUEADAS_EN_CAMBIOS.find(b => b.re.test(ruta) && !(b.excepto || []).some(re => re.test(rutaDe(req)))) || null;
};

const auth = (req, res, next) => {
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = header.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // SEGURIDAD (token confusion): rechazar cualquier token con un `typ` que
        // no sea de sesión. Los tokens de descarga pública (`typ: 'public-report'`,
        // asistencia.service.generatePublicReportToken) se firman con el MISMO
        // JWT_SECRET; sin este guard podrían usarse como Bearer y escalar
        // privilegios. Los tokens de sesión legados no traen `typ` → se aceptan.
        if (decoded.typ && decoded.typ !== 'session') {
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }

        // Validar versión del rol (RV) para deslogueo por cambio de permisos.
        // Nota: index.js hace `await versionService.init()` antes de app.listen(),
        // por lo que el Map está poblado cuando llega el primer request.
        const currentVersion = versionService.get(decoded.rol_id);
        if (!decoded.rv || decoded.rv !== currentVersion) {
            return res.status(401).json({
                error: 'Tu sesión ha expirado debido a una actualización de permisos. Por favor, ingresa de nuevo.',
                expired_by_version: true
            });
        }

        // «Ver como» (soporte): solo lectura, antes de cualquier ruta.
        if (esTokenSoloLectura(decoded) && !permitidoEnSoloLectura(req)) {
            return res.status(403).json({ error: MENSAJE_SOLO_LECTURA, code: CODIGO_SOLO_LECTURA });
        }

        req.user = decoded; // { id, email, rol_id, obra_id, permisos, rv } (+ imp, ro / rw en «ver como»)

        // «Ver como» en modo cambios: toda escritura (también la que se corta aquí) queda en el historial a nombre
        // del Super Administrador, lo bloqueado no llega a la ruta, y antes de escribir se re-verifica en la BD que
        // quien mira siga siendo Super Administrador activo y la persona siga activa (el token dura hasta 30 min).
        if (esTokenCambios(decoded) && !METODOS_LECTURA.has(req.method)) {
            registrarCambioVerComo(req, res);
            const bloqueo = bloqueoEnCambios(req);
            if (bloqueo) return res.status(403).json({ error: bloqueo.error, code: CODIGO_CAMBIOS_BLOQUEADO });
            return motivoModoCambiosInvalido(decoded.imp, decoded.id).then(
                (motivo) => (motivo ? res.status(403).json({ error: motivo, code: CODIGO_CAMBIOS_INVALIDO }) : next()),
                () => res.status(503).json({ error: 'No se pudo verificar el modo cambios. Intenta de nuevo.', code: CODIGO_CAMBIOS_INVALIDO }),
            ).catch(next);
        }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

module.exports = auth;
module.exports.MENSAJE_SOLO_LECTURA = MENSAJE_SOLO_LECTURA;
module.exports.CODIGO_SOLO_LECTURA = CODIGO_SOLO_LECTURA;
module.exports.esTokenSoloLectura = esTokenSoloLectura;
module.exports.esTokenCambios = esTokenCambios;
module.exports.CODIGO_CAMBIOS_BLOQUEADO = CODIGO_CAMBIOS_BLOQUEADO;
module.exports.CODIGO_CAMBIOS_INVALIDO = CODIGO_CAMBIOS_INVALIDO;
module.exports.BLOQUEADAS_EN_CAMBIOS = BLOQUEADAS_EN_CAMBIOS;
