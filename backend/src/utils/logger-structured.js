const fs = require('fs');
const path = require('path');

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
        return JSON.stringify({
            ts: new Date().toISOString(),
            level,
            msg: message,
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

        // File output
        try {
            // Simple rotation: if file > MAX_LOG_SIZE, rename to .old
            if (fs.existsSync(logFile)) {
                const stats = fs.statSync(logFile);
                if (stats.size > MAX_LOG_SIZE) {
                    fs.renameSync(logFile, logFile + '.old');
                }
            }
            fs.appendFileSync(logFile, line + '\n');
        } catch (e) { /* silently fail file write */ }
    },

    debug(msg, meta) { if (currentLevel <= LEVELS.DEBUG) this._write('DEBUG', msg, meta); },
    info(msg, meta)  { if (currentLevel <= LEVELS.INFO)  this._write('INFO', msg, meta); },
    warn(msg, meta)  { if (currentLevel <= LEVELS.WARN)  this._write('WARN', msg, meta); },
    error(msg, meta) { if (currentLevel <= LEVELS.ERROR) this._write('ERROR', msg, meta); },
    fatal(msg, meta) { this._write('FATAL', msg, meta); },

    /**
     * Express middleware that logs every request with timing.
     */
    requestLogger(req, res, next) {
        const start = Date.now();
        const originalEnd = res.end;
        
        res.end = function (...args) {
            const duration = Date.now() - start;
            const meta = {
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
