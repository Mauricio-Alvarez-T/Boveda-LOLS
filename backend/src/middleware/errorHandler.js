const errorHandler = (err, req, res, next) => {
    console.error(`[${new Date().toISOString()}] ERROR:`, err.message);
    console.error(err.stack);

    // Multer file size error
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'El archivo excede el tamaño máximo de 10 MB' });
    }

    // Multer other errors
    if (err.name === 'MulterError') {
        return res.status(400).json({ error: err.message });
    }

    // MySQL duplicate entry
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'El registro ya existe (dato duplicado)' });
    }

    // MySQL foreign key constraint
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(400).json({ error: 'Referencia a un registro que no existe' });
    }

    // Default
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        error: statusCode === 500 ? 'Error interno del servidor' : err.message
    });
};

module.exports = errorHandler;
