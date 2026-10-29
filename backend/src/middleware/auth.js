const jwt = require('jsonwebtoken');
const versionService = require('../services/version.service');

/**
 * «Ver como» de Soporte (soporte.service.emitirVerComo): el Super Administrador recibe un token de 30 min
 * DEL USUARIO mirado, con `imp` (id de quien mira) y `ro: true`. Con ese token solo se lee: todo lo que no
 * sea GET/HEAD/OPTIONS se rechaza aquí, antes de llegar a la ruta. Cualquier token con `imp` cuenta como
 * de solo lectura aunque le faltara `ro` (defensa en profundidad).
 */
const MENSAJE_SOLO_LECTURA = 'Modo «ver como»: solo lectura';
const CODIGO_SOLO_LECTURA = 'VER_COMO_SOLO_LECTURA';
const METODOS_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);
// POST que SOLO leen (mandan una lista de ids que no cabe en la URL) y que la app pide para mostrar una
// pantalla: sin ellos, «ver como» no vería el stock del Maestro ni el del detalle de una solicitud.
// Agregar uno = revisar antes que su handler no escriba NADA (ni logs a nombre del usuario).
const POST_SOLO_LECTURA = [
    /^\/api\/inventario\/stock-por-items$/,
];

// 401 cuando la sesión dejó de valer por un cambio de permisos (del rol o de la persona). `expired_by_version` es lo
// que mira el frontend para avisar «se actualizaron tus permisos» en el login.
const SESION_EXPIRADA_POR_PERMISOS = Object.freeze({
    error: 'Tu sesión ha expirado debido a una actualización de permisos. Por favor, ingresa de nuevo.',
    expired_by_version: true,
});

const esTokenSoloLectura = (decoded) => decoded.ro === true || (decoded.imp !== undefined && decoded.imp !== null);

const permitidoEnSoloLectura = (req) => {
    if (METODOS_LECTURA.has(req.method)) return true;
    const ruta = String(req.originalUrl || '').split('?')[0];
    return req.method === 'POST' && POST_SOLO_LECTURA.some(re => re.test(ruta));
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
            return res.status(401).json(SESION_EXPIRADA_POR_PERMISOS);
        }

        // Cierre por PERSONA (mig 146): a esta persona se le cambiaron sus permisos propios, su rol o su bodega
        // después de emitir el token (`iat` <= usuarios.permisos_cambiados_en). Mismo cuerpo que el de versión para
        // que el frontend (services/api.ts) lo trate igual. En «ver como» cuentan la persona mirada (`id`) Y quien
        // mira (`imp`): si al Super Administrador que mira le cambian el rol, su token prestado también muere.
        if (versionService.sesionCerradaPara(decoded)) {
            return res.status(401).json(SESION_EXPIRADA_POR_PERMISOS);
        }

        // «Ver como» (soporte): solo lectura, antes de cualquier ruta.
        if (esTokenSoloLectura(decoded) && !permitidoEnSoloLectura(req)) {
            return res.status(403).json({ error: MENSAJE_SOLO_LECTURA, code: CODIGO_SOLO_LECTURA });
        }

        req.user = decoded; // { id, email, rol_id, obra_id, permisos, rv } (+ imp, ro en «ver como»)
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

module.exports = auth;
module.exports.MENSAJE_SOLO_LECTURA = MENSAJE_SOLO_LECTURA;
module.exports.CODIGO_SOLO_LECTURA = CODIGO_SOLO_LECTURA;
module.exports.esTokenSoloLectura = esTokenSoloLectura;
