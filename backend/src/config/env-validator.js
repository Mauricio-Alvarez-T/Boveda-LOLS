/**
 * Validador de variables de entorno obligatorias.
 * Se ejecuta al arranque del servidor para garantizar que todas
 * las configuraciones críticas estén presentes ANTES de aceptar tráfico.
 */
const REQUIRED_ENV_VARS = [
    { key: 'JWT_SECRET',   hint: 'Clave secreta para firmar tokens JWT' },
    { key: 'DB_HOST',      hint: 'Host de la base de datos MySQL' },
    { key: 'DB_USER',      hint: 'Usuario de la base de datos' },
    { key: 'DB_NAME',      hint: 'Nombre de la base de datos' },
];

function validateEnv() {
    const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v.key]);

    if (missing.length > 0) {
        console.error('\n⛔ ══════════════════════════════════════════════════');
        console.error('   VARIABLES DE ENTORNO FALTANTES');
        console.error('══════════════════════════════════════════════════\n');
        missing.forEach(v => {
            console.error(`   ❌ ${v.key} — ${v.hint}`);
        });
        console.error('\n   Revisa tu archivo .env o las variables del sistema.');
        console.error('══════════════════════════════════════════════════\n');
        process.exit(1);
    }
}

module.exports = validateEnv;
