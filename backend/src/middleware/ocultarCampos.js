/**
 * Quita campos de la respuesta JSON a quien no tiene un permiso (deny-by-default de un dato
 * personal sobre rutas que también usan otros permisos).
 *
 * Caso de uso: el teléfono del conductor (mig 132) solo lo ve quien tiene `vehiculos.ver`
 * (es para avisarle por WhatsApp de los papeles del vehículo). El catálogo /api/conductores se
 * abre con `conductores.*` y POST/PUT de /api/vehiculos con `vehiculos.crear/editar`: sin este
 * filtro, alguien con esos permisos y sin `vehiculos.ver` vería los teléfonos.
 *
 * Mismo patrón que `sanitizeItemsMaestroMiddleware`: envuelve `res.json` y lee `req.user` al
 * responder (el `auth` del router ya corrió). Formas que limpia, solo en el primer nivel de cada
 * fila: `{ data: [filas] }`, `{ data: fila }`, `[filas]` y `fila`.
 *
 * @param {string} permiso permiso que deja ver los campos.
 * @param {string[]} campos claves a quitar sin ese permiso.
 */
function ocultarCamposSinPermiso(permiso, campos) {
    const quitar = (fila) => {
        if (!fila || typeof fila !== 'object' || Array.isArray(fila)) return fila;
        if (!campos.some(c => Object.prototype.hasOwnProperty.call(fila, c))) return fila;
        const copia = { ...fila };
        campos.forEach(c => { delete copia[c]; });
        return copia;
    };
    const limpiar = (x) => (Array.isArray(x) ? x.map(quitar) : quitar(x));

    return (req, res, next) => {
        const original = res.json.bind(res);
        res.json = (body) => {
            const perms = req.user?.p;
            if (Array.isArray(perms) && perms.includes(permiso)) return original(body);
            if (body && typeof body === 'object' && !Array.isArray(body)
                && Object.prototype.hasOwnProperty.call(body, 'data')) {
                return original(limpiar({ ...body, data: limpiar(body.data) }));
            }
            return original(limpiar(body));
        };
        next();
    };
}

module.exports = { ocultarCamposSinPermiso };
