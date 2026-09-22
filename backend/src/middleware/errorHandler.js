const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger-structured');

const errorHandler = (err, req, res, next) => {
    // Categorize the error
    let category = 'UNKNOWN';
    if (err.code && err.code.startsWith('ER_')) category = 'DATABASE';
    else if (err.statusCode === 401 || err.statusCode === 403) category = 'AUTH';
    else if (err.statusCode === 400 || err.name === 'MulterError') category = 'VALIDATION';
    else if (err.statusCode === 404) category = 'NOT_FOUND';
    else category = 'SERVER';

    const meta = {
        category,
        method: req.method,
        url: req.originalUrl,
        userId: req.user?.id || 'anon',
        stack: err.stack
    };

    // Log with appropriate level
    if (category === 'SERVER' || category === 'DATABASE') {
        logger.error(`[${category}] ${err.message}`, meta);
    } else {
        logger.warn(`[${category}] ${err.message}`, meta);
    }

    // Also write to legacy error_debug.log for backward compatibility (async, no bloqueante)
    try {
        const logContent = `[${new Date().toISOString()}] [${category}] ${req.method} ${req.originalUrl}\nERROR: ${err.message}\nSTACK: ${err.stack}\n\n`;
        fs.appendFile(path.join(__dirname, '../../error_debug.log'), logContent, () => { /* silently fail */ });
    } catch (e) { }

    // Multer file size error
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'El archivo excede el tamaño máximo de 10 MB' });
    }

    // Multer file filter error (format not allowed)
    if (err.message && err.message.startsWith('Formato no permitido')) {
        return res.status(400).json({ error: err.message });
    }

    // Multer other errors
    if (err.name === 'MulterError') {
        return res.status(400).json({ error: `Error al procesar archivo: ${err.message}` });
    }

    // MySQL duplicate entry
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'El registro ya existe (dato duplicado)' });
    }

    // MySQL foreign key constraint
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(400).json({ error: 'Referencia a un registro que no existe' });
    }

    // MySQL: la fila tiene hijos con FK RESTRICT (p. ej. reciclar un cargo con sueldos,
    // borrar un trabajador con documentos). Antes salía 500 crudo.
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
        return res.status(409).json({
            error: 'El registro tiene datos asociados y no se puede eliminar ni recrear; desactívalo o reactívalo en su lugar',
            code: err.code
        });
    }

    // Default — include the message so the user gets actionable feedback.
    // Errores de dominio 4xx pueden traer `code` (string propio, no ER_*) y `details` (objeto)
    // para que el cliente reaccione (ej. 409 con `required`). Los 5xx NO exponen nada más.
    const statusCode = err.statusCode || 500;
    const body = { error: err.message || 'Error interno del servidor' };
    if (statusCode < 500) {
        if (typeof err.code === 'string' && err.code && !err.code.startsWith('ER_')) body.code = err.code;
        if (err.details && typeof err.details === 'object' && !Array.isArray(err.details)) {
            const { error: _ignorado, ...detalles } = err.details;
            Object.assign(body, detalles);
        }
    }
    res.status(statusCode).json(body);
};

module.exports = errorHandler;

