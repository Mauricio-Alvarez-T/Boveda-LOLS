const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { getRequestId, run } = require('./request-context');

const LOG_DIR = path.join(__dirname, '../../logs');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB

// Ensure log directory exists
try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (e) { /* ignore in production if dir creation fails */ }

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, FATAL: 4 };
const currentLevel = LEVELS[process.env.LOG_LEVEL] || LEVELS.INFO;

/**
 * Structured Logger for Bóveda LOLS
 * Writes to both console and rotating log files.
 */
const logger = {
    _format(level, message, meta = {}) {
        const reqId = getRequestId();
        return JSON.stringify({
            ts: new Date().toISOString(),
            level,
            msg: message,
            ...(reqId ? { reqId } : {}),
            ...meta
        });
    },

    _write(level, message, meta) {
        const line = this._format(level, message, meta);
        const logFile = path.join(LOG_DIR, `app_${new Date().toISOString().split('T')[0]}.log`);
        
        // Console output with color
        const colors = { DEBUG: '\x1b[36m', INFO: '\x1b[32m', WARN: '\x1b[33m', ERROR: '\x1b[31m', FATAL: '\x1b[35m' };
        const reset = '\x1b[0m';
        const hasMeta = meta && typeof meta === 'object' && !Array.isArray(meta) && Object.keys(meta).length > 0;
        console.log(`${colors[level] || ''}[${level}]${reset} ${message}`, hasMeta ? meta : '');

        // File output — NO bloqueante (fire-and-forget). Evita bloquear el event
        // loop con I/O síncrono. Rotación simple: si el archivo supera MAX_LOG_SIZE
        // se renombra a .old antes de escribir.
        fs.stat(logFile, (statErr, stats) => {
            const append = () => fs.appendFile(logFile, line + '\n', () => { /* silently fail */ });
            if (!statErr && stats && stats.size > MAX_LOG_SIZE) {
                fs.rename(logFile, logFile + '.old', () => append());
            } else {
                append();
            }
        });
    },

    debug(msg, meta) { if (currentLevel <= LEVELS.DEBUG) this._write('DEBUG', msg, meta); },
    info(msg, meta)  { if (currentLevel <= LEVELS.INFO)  this._write('INFO', msg, meta); },
    warn(msg, meta)  { if (currentLevel <= LEVELS.WARN)  this._write('WARN', msg, meta); },
    error(msg, meta) { if (currentLevel <= LEVELS.ERROR) this._write('ERROR', msg, meta); },
    fatal(msg, meta) { this._write('FATAL', msg, meta); },

    /**
     * Express middleware: establece el contexto AsyncLocalStorage del request.
     * Genera (u honra el header entrante) un reqId, lo expone en req.id y en el
     * header de respuesta X-Request-Id, y envuelve el resto de la cadena para que
     * todo log emitido durante el request incluya el reqId automáticamente.
     * Debe montarse ANTES de cualquier middleware que loguee.
     */
    requestContext(req, res, next) {
        const reqId = req.headers['x-request-id'] || randomUUID();
        req.id = reqId;
        res.setHeader('X-Request-Id', reqId);
        run({ reqId }, () => next());
    },

    /**
     * Express middleware that logs every request with timing.
     */
    requestLogger(req, res, next) {
        const start = Date.now();
        const originalEnd = res.end;
        
        res.end = function (...args) {
            const duration = Date.now() - start;
            const meta = {
                reqId: req.id,
                method: req.method,
                url: req.originalUrl,
                status: res.statusCode,
                duration: `${duration}ms`,
                userId: req.user?.id || 'anon'
            };
            
            if (res.statusCode >= 500) {
                logger.error(`${req.method} ${req.originalUrl} → ${res.statusCode}`, meta);
            } else if (res.statusCode >= 400) {
                logger.warn(`${req.method} ${req.originalUrl} → ${res.statusCode}`, meta);
            } else if (duration > 2000) {
                logger.warn(`SLOW ${req.method} ${req.originalUrl} → ${duration}ms`, meta);
            }
            
            originalEnd.apply(res, args);
        };
        
        next();
    }
};

module.exports = logger;
