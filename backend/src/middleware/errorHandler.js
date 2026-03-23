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

    // Also write to legacy error_debug.log for backward compatibility
    try {
        const logContent = `[${new Date().toISOString()}] [${category}] ${req.method} ${req.originalUrl}\nERROR: ${err.message}\nSTACK: ${err.stack}\n\n`;
        fs.appendFileSync(path.join(__dirname, '../../error_debug.log'), logContent);
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

    // Default — include the message so the user gets actionable feedback
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        error: err.message || 'Error interno del servidor'
    });
};

module.exports = errorHandler;

