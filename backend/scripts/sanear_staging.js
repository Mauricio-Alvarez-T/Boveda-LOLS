/**
 * ============================================================
 *  SANEAR STAGING — quita datos de personas reales de test.boveda.lols.cl
 * ============================================================
 *
 *  ¿Por qué existe?
 *    Staging tenía trabajadores REALES (RUT, domicilio, salud, cuenta bancaria, cédula escaneada)
 *    porque el único procedimiento para poblarlo era importar tablas de producción. Producción es
 *    el lugar legítimo para esos datos; un entorno de pruebas público no.
 *
 *  ¿Cómo se usa?  (no hay SSH: se corre desde un Cron Job de cPanel)
 *    Ver qué haría, sin escribir nada:
 *      cd ~/test-boveda && <NODE> scripts/sanear_staging.js >> ~/saneo.log 2>&1
 *    Aplicar de verdad (purga + siembra):
 *      cd ~/test-boveda && SANEO_STAGING=1 <NODE> scripts/sanear_staging.js --aplicar --sembrar >> ~/saneo.log 2>&1
 *    <NODE> sale de cPanel → Setup Node.js App, p. ej. /home/lolscl/nodevenv/test-boveda/20/bin/node
 *
 *  Flags:
 *    (sin flags)  dry-run: informa y NO escribe. Es el default a propósito.
 *    --aplicar    purga los trabajadores foráneos y sus rastros. Exige SANEO_STAGING=1.
 *    --sembrar    además siembra el set ficticio (empresas, obras, cargos, trabajadores,
 *                 asistencia y documentos con su archivo marcador).
 *    --auto       modo desatendido para el cron de deploy: sin foráneos termina en silencio (rc 0).
 *    --gracia=N   horas de gracia sobre created_at (default 48).
 *
 *  GUARDAS (las tres, siempre):
 *    1. DB_NAME no puede ser la base de producción.
 *    2. DB_NAME debe contener test/staging/dev.
 *    3. Escribir exige --aplicar Y la variable SANEO_STAGING=1.
 *  Si alguna falla: sale con rc 1 SIN tocar la base.
 * ============================================================
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const db = require('../src/config/db');
const saneo = require('../src/services/saneoStaging.service');
const siembra = require('../src/services/saneoSiembra.service');
const archivos = require('../src/services/saneoArchivos.service');

const args = process.argv.slice(2);
const tiene = f => args.includes(f);
const valorDe = (f, def) => {
    const a = args.find(x => x.startsWith(`${f}=`));
    return a ? Number(a.split('=')[1]) : def;
};

const APLICAR = tiene('--aplicar');
const SEMBRAR = tiene('--sembrar');
const AUTO = tiene('--auto');
const GRACIA = valorDe('--gracia', saneo.GRACIA_HORAS);

const log = {
    info: m => console.log(`ℹ️  ${m}`),
    ok: m => console.log(`✅ ${m}`),
    warn: m => console.log(`⚠️  ${m}`),
    err: m => console.error(`❌ ${m}`),
};

/** Conteos → "tabla: n · tabla: n" (omite las que no existen en el esquema). */
const resumir = obj => Object.entries(obj)
    .filter(([, v]) => v !== null && v !== 0)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ') || 'nada';

async function main() {
    const bd = process.env.DB_NAME;

    // ── Guardas 1 y 2: contra qué base estamos ──
    const guarda = saneo.esBaseDeTest(bd);
    if (!guarda.ok) {
        log.err(guarda.motivo);
        log.err('No se tocó ninguna tabla.');
        process.exit(1);
    }
    log.info(guarda.motivo);

    // ── Qué hay ──
    const det = await saneo.detectar(db, { graciaHoras: GRACIA });
    log.info(`Trabajadores: ${det.ficticios} ficticios · ${det.total} foráneos (fuera del bloque ${saneo.RUT_FICTICIO_DESDE}-${saneo.RUT_FICTICIO_HASTA}) · ${det.enGracia} dentro de la gracia de ${GRACIA} h`);
    if (det.total) {
        det.foraneos.slice(0, 10).forEach(f => log.info(`   · #${f.id} ${f.rut} ${f.apellido_paterno} ${f.nombres}`));
        if (det.total > 10) log.info(`   · … y ${det.total - 10} más`);
    }

    const haySiembraPendiente = SEMBRAR && det.ficticios < siembra.N_TRABAJADORES;

    if (AUTO && !det.total && !haySiembraPendiente) {
        log.ok(`Sin datos foráneos (${det.ficticios} trabajadores ficticios). Nada que hacer.`);
        console.log(`RESUMEN · OK · 0 foráneos · ${det.ficticios} ficticios`);
        return;
    }

    // ── Guarda 3: escribir exige confirmación explícita ──
    if (!APLICAR) {
        log.warn('DRY-RUN: no se escribió nada. Para aplicar: SANEO_STAGING=1 … --aplicar --sembrar');
        console.log(`RESUMEN · DRY · ${det.total} foráneos · ${det.ficticios} ficticios`);
        return;
    }
    if (process.env.SANEO_STAGING !== '1') {
        log.err('--aplicar exige la variable de entorno SANEO_STAGING=1 (confirmación explícita). No se tocó ninguna tabla.');
        process.exit(1);
    }

    // ── Purga ──
    let purgados = 0;
    if (det.total) {
        const { borrados, rutas } = await saneo.purgar(db, { ids: det.ids });
        purgados = det.total;
        log.ok(`Purgados ${purgados} trabajadores → ${resumir(borrados)}`);

        // Los nombres de archivo llevan el RUT: se borra la carpeta entera del trabajador, no solo
        // las rutas que la BD conocía.
        const carpetas = archivos.borrarCarpetasDeTrabajadores(det.ids);
        log.ok(`Archivos: ${carpetas} carpeta(s) de uploads borradas (${rutas.length} documentos referenciados)`);
    }

    const rastros = await saneo.limpiarRastros(db);
    log.ok(`Rastros de PII: ${resumir(rastros)}`);

    const correo = await saneo.neutralizarCorreo(db);
    log.ok(`Correo saliente neutralizado: ${resumir(correo)}`);

    // Carpetas de uploads sin trabajador (restos de purgas anteriores o de importaciones).
    const [vigentes] = await db.query('SELECT id FROM trabajadores');
    const huerfanas = archivos.carpetasHuerfanas(vigentes.map(v => v.id));
    if (huerfanas.length) {
        archivos.borrarCarpetasDeTrabajadores(huerfanas);
        log.ok(`Archivos huérfanos: ${huerfanas.length} carpeta(s) sin trabajador borradas`);
    }

    // ── Siembra ──
    let sembrados = 0;
    if (SEMBRAR) {
        const { resumen, archivos: rutas } = await siembra.sembrar(db, {});
        sembrados = resumen.trabajadores;
        rutas.forEach(r => archivos.escribirMarcador(r));
        log.ok(`Sembrado: ${resumir(resumen)} · ${rutas.length} archivo(s) marcador escritos`);
    }

    const final = await saneo.detectar(db, { graciaHoras: GRACIA });
    log.ok(`Estado final: ${final.ficticios} trabajadores ficticios · ${final.total} foráneos`);
    console.log(`RESUMEN · ${purgados ? 'LIMPIEZA' : 'OK'} · ${purgados} purgados · ${sembrados} sembrados · ${final.total} foráneos`);
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        log.err(`Falló el saneo: ${err.message}`);
        if (err.stack) console.error(err.stack);
        console.log('RESUMEN · FALLO · revisar el log');
        process.exit(1);
    });
