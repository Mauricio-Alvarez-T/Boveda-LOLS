/**
 * Bóveda LOLS — Passenger Startup File
 * 
 * cPanel's Phusion Passenger requires a specific entry point.
 * This file wraps the main Express app for production deployment.
 */
const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, 'startup_app.log');

try {
    fs.appendFileSync(logFile, `\n\n[START] ${new Date().toISOString()} Iniciando app.js\n`);
} catch (e) { }

process.on('uncaughtException', (err) => {
    try { fs.appendFileSync(logFile, `[UNCAUGHT EXCEPTION] ${err.stack}\n`); } catch (e) { }
});
process.on('unhandledRejection', (reason, promise) => {
    try { fs.appendFileSync(logFile, `[UNHANDLED REJECTION] ${reason}\n`); } catch (e) { }
});

try {
    require('dotenv').config();
    fs.appendFileSync(logFile, `[OK] dotenv cargado correctamente\n`);

    const app = require('./index');
    fs.appendFileSync(logFile, `[OK] index.js cargado exitosamente. Servidor Express listo para recibir a Passenger.\n`);

    module.exports = app;
} catch (error) {
    fs.appendFileSync(logFile, `[FATAL ERROR] Fallo al cargar index.js: ${error.stack}\n`);
}
