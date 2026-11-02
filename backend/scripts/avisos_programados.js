/**
 * Avisos programados al celular (lo corre el cron de deploy en CADA tick, cada 5 minutos:
 * bloque `avisos-programados` de scripts/cpanel-deploy-staging.sh; docs/reglas/seguridad-rbac.md § Avisos al celular).
 * Decide si a esta hora toca mandar algo. Así no depende de que el backend esté despierto (Passenger lo duerme sin uso).
 *
 * Programado:
 *   · Los recordatorios de pendientes de cada persona (avisosPendientes.service.js: lunes a viernes, sin feriados, una
 *     vez al día a la hora guardada en Bóveda, 8:00 al partir; solo si tiene algo pendiente; una vez por persona y día).
 *   · Una prueba en test a una hora fija (Marcos), una sola vez (si el error de prueba ya está en la BD, no hace nada):
 *     un error inventado por el camino real (`soporteErrores.reportar`): queda en Soporte → Errores y les llega a los
 *     programadores como un aviso formal, al celular y al correo. Ya hechas: 27-10 10:00 (solo celular) y 02-11 13:00.
 *
 * Siempre imprime una línea «RESUMEN · …» (el cron la publica en avisos-status.txt).
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../src/config/db');
const soporteErrores = require('../src/services/soporteErrores.service');
const pendientes = require('../src/services/avisosPendientes.service');

const PRUEBA = {
    fecha: '2026-11-02',
    desdeMin: 13 * 60,
    hastaMin: 13 * 60 + 30,
    mensaje: 'No se pudo guardar la asistencia de hoy (prueba programada de las 13:00)',
};

/** Fecha y minuto del día en Chile (el servidor puede estar en otra zona horaria). */
function ahoraChile(d = new Date()) {
    const p = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d);
    const g = (t) => p.find(x => x.type === t).value;
    return { fecha: `${g('year')}-${g('month')}-${g('day')}`, minutos: (Number(g('hour')) % 24) * 60 + Number(g('minute')) };
}

async function pruebaProgramada() {
    const esStaging = /test|staging|dev/i.test(process.env.DB_NAME || '');
    const { fecha, minutos } = ahoraChile();
    if (!esStaging || fecha !== PRUEBA.fecha || minutos < PRUEBA.desdeMin || minutos > PRUEBA.hastaMin) return null;

    const [[ya]] = await db.query('SELECT COUNT(*) AS n FROM soporte_errores WHERE mensaje = ?', [PRUEBA.mensaje]);
    if (Number(ya.n)) return 'prueba de las 13:00 ya enviada';

    // A nombre de alguien que no es programador, como pasaría de verdad (el aviso dice «A <nombre> le falló …»).
    const [[quien]] = await db.query('SELECT id, nombre FROM usuarios WHERE activo = 1 AND rol_id <> 1 ORDER BY id LIMIT 1');
    if (!quien) return 'prueba de las 13:00: no hay a nombre de quién inventar el error';
    const r = await soporteErrores.reportar(quien, {
        categoria: 'falla',
        mensaje: PRUEBA.mensaje,
        accion: 'POST /api/asistencias/bulk/:obraId',
        codigo: 500,
        pantalla: '/asistencia',
        pantalla_nombre: 'Asistencia diaria',
        dispositivo: 'movil',
        detalle_tecnico: 'Error inventado por el cron de avisos programados para probar el aviso a los programadores (celular y correo). No es real.',
    }, null, { esperarAviso: true });
    return `prueba de las 13:00 (a nombre de ${quien.nombre}): ${r.aviso || 'sin aviso'}`;
}

/** Los recordatorios de pendientes por persona (lunes a viernes, sin feriados, a la hora de cada uno). */
async function recordatorios() {
    const ahora = pendientes.ahoraChile();
    const hora = await pendientes.horaDeRonda(ahora);
    if (hora == null) return null;
    return pendientes.enviarRonda(hora, ahora.fecha);
}

async function main() {
    const hechos = [await pruebaProgramada(), await recordatorios()].filter(Boolean);
    console.log(`RESUMEN · ${hechos.join(' | ') || 'nada programado ahora'}`);
}

if (require.main === module) {
    main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { ahoraChile, PRUEBA };
