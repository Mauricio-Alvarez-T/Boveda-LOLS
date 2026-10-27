/**
 * Avisos programados al celular (lo corre el cron de deploy en CADA tick, cada 5 minutos:
 * bloque `avisos-programados` de scripts/cpanel-deploy-staging.sh; docs/reglas/seguridad-rbac.md § Avisos al celular).
 * Decide si a esta hora toca mandar algo. Así no depende de que el backend esté despierto (Passenger lo duerme sin uso).
 *
 * Programado:
 *   · Los recordatorios de pendientes de cada persona (avisosPendientes.service.js: lunes a viernes, sin feriados, a
 *     las horas de cada uno; solo si tiene algo pendiente; una vez por persona, día y hora).
 *   · La prueba de las 10:00 del 27-10-2026 en test (Marcos), ya hecha: un error inventado en Soporte → Errores y el
 *     aviso «Nueva falla en Soporte (prueba)». Una sola vez (si el error de prueba ya está en la BD, no hace nada).
 *
 * Siempre imprime una línea «RESUMEN · …» (el cron la publica en avisos-status.txt).
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../src/config/db');
const avisos = require('../src/services/avisosCelular.service');
const pendientes = require('../src/services/avisosPendientes.service');

const PRUEBA = {
    fecha: '2026-10-27',
    desdeMin: 10 * 60,
    hastaMin: 10 * 60 + 30,
    mensaje: 'Error de prueba de las 10:00 (inventado para probar los avisos al celular)',
};

/** Fecha y minuto del día en Chile (el servidor puede estar en otra zona horaria). */
function ahoraChile(d = new Date()) {
    const p = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d);
    const g = (t) => p.find(x => x.type === t).value;
    return { fecha: `${g('year')}-${g('month')}-${g('day')}`, minutos: (Number(g('hour')) % 24) * 60 + Number(g('minute')) };
}

async function pruebaDeLasDiez() {
    const esStaging = /test|staging|dev/i.test(process.env.DB_NAME || '');
    const { fecha, minutos } = ahoraChile();
    if (!esStaging || fecha !== PRUEBA.fecha || minutos < PRUEBA.desdeMin || minutos > PRUEBA.hastaMin) return null;

    const [[ya]] = await db.query('SELECT COUNT(*) AS n FROM soporte_errores WHERE mensaje = ?', [PRUEBA.mensaje]);
    if (Number(ya.n)) return 'prueba de las 10:00 ya enviada';

    const [admins] = await db.query('SELECT id FROM usuarios WHERE rol_id = 1 AND activo = 1 ORDER BY id');
    if (!admins.length) return 'prueba de las 10:00: no hay Super Administradores activos';
    await db.query(
        `INSERT INTO soporte_errores
            (usuario_id, categoria, firma, mensaje, accion, codigo, pantalla, pantalla_nombre, dispositivo, detalle_tecnico)
         VALUES (?, 'falla', SHA1(?), ?, 'POST /api/prueba/avisos', 500, '/inventario', 'Inventario', 'movil',
                 'Error inventado por el cron de avisos programados para probar el aviso al celular. No es real.')`,
        [admins[0].id, PRUEBA.mensaje, PRUEBA.mensaje]
    );
    const r = await avisos.enviarA(admins.map(a => a.id), {
        titulo: 'Nueva falla en Soporte (prueba)',
        cuerpo: 'Prueba de las 10:00: así les llega un aviso de falla. Esta no es real. Toca para verla.',
        url: '/soporte?vista=errores',
        etiqueta: 'soporte-errores',
    });
    return `prueba de las 10:00: ${r.enviados} aviso(s) enviado(s), ${r.fallidos} fallido(s)`;
}

/** Los recordatorios de pendientes por persona (lunes a viernes, sin feriados, a la hora de cada uno). */
async function recordatorios() {
    const ahora = pendientes.ahoraChile();
    const hora = await pendientes.horaDeRonda(ahora);
    if (hora == null) return null;
    return pendientes.enviarRonda(hora, ahora.fecha);
}

async function main() {
    const hechos = [await pruebaDeLasDiez(), await recordatorios()].filter(Boolean);
    console.log(`RESUMEN · ${hechos.join(' | ') || 'nada programado ahora'}`);
}

if (require.main === module) {
    main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { ahoraChile, PRUEBA };
