/**
 * Validador de variables de entorno obligatorias.
 * Se ejecuta al arranque del servidor para garantizar que todas
 * las configuraciones críticas estén presentes ANTES de aceptar tráfico.
 */
const logger = require('../utils/logger-structured');

const REQUIRED_ENV_VARS = [
    { key: 'JWT_SECRET',   hint: 'Clave secreta para firmar tokens JWT' },
    { key: 'DB_HOST',      hint: 'Host de la base de datos MySQL' },
    { key: 'DB_USER',      hint: 'Usuario de la base de datos' },
    { key: 'DB_NAME',      hint: 'Nombre de la base de datos' },
];

function validateEnv() {
    const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v.key]);

    if (missing.length > 0) {
        logger.fatal('Variables de entorno faltantes — revisa tu .env o las variables del sistema', {
            missing: missing.map(v => `${v.key} (${v.hint})`)
        });
        if (process.env.NODE_ENV === 'test') {
            throw new Error(`Variables de entorno faltantes: ${missing.map(v => v.key).join(', ')}`);
        }
        process.exit(1);
    }
}

module.exports = validateEnv;
