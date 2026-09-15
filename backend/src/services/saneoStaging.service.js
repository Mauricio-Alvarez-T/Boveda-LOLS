/**
 * ============================================================
 *  SANEO DE DATOS PERSONALES EN STAGING (2026-09-15)
 * ============================================================
 *
 * test.boveda.lols.cl tenía trabajadores REALES (RUT, domicilio, salud, cuenta bancaria, cédula
 * escaneada). Producción es el lugar legítimo para eso; staging no. Este servicio purga lo que no
 * sea ficticio y siembra un set de prueba con el que se pueda hacer QA de verdad.
 *
 * ¿Por qué no `es_prueba`? La mig 066 lo define como aislamiento de PRESENTACIÓN: una fila marcada
 * desaparece de reportes, KPIs, asistencia y selectores. Marcar staging entero dejaría el QA en
 * blanco. Además no existe en solicitudes_ingreso, documentos ni asistencias. El marcador que sí
 * sirve es el RUT: los dummies viven en el bloque 44.000.000-44.000.999 (DV válido por módulo 11;
 * tramo sin asignar — las personas van por ~28 millones y las empresas desde 60).
 *
 *   Un trabajador de staging es legítimo ⟺ su RUT está en el bloque ficticio.
 *
 * `db` se inyecta como parámetro (molde de avisosDiarios.service) → testeable sin base real.
 * Las guardas de entorno viven en el script (scripts/sanear_staging.js): este módulo no decide
 * dónde corre, solo qué hacer.
 */
const { cleanRut, formatRut, dvDeCuerpo } = require('../utils/rut');

/** Bloque reservado para trabajadores ficticios de staging. */
const RUT_FICTICIO_DESDE = 44000000;
const RUT_FICTICIO_HASTA = 44000999;

/** Horas de gracia: lo creado a mano durante un QA reciente no se purga. */
const GRACIA_HORAS = 48;

/** Nombre de la base de PRODUCCIÓN: nunca se sanea. */
const BD_PRODUCCION = 'lolscl_boveda';

/* ──────────────────────── RUT ficticios ──────────────────────── */

/** RUT ficticio n-ésimo (0-999) formateado, con DV válido. */
function rutFicticio(n) {
    const cuerpo = RUT_FICTICIO_DESDE + (Number(n) % (RUT_FICTICIO_HASTA - RUT_FICTICIO_DESDE + 1));
    return formatRut(`${cuerpo}${dvDeCuerpo(cuerpo)}`);
}

/** ¿El RUT pertenece al bloque ficticio? Tolera formato con o sin puntos. */
function esRutFicticio(rut) {
    const limpio = cleanRut(rut);
    if (limpio.length < 2) return false;
    const cuerpo = Number(limpio.slice(0, -1));
    if (!Number.isInteger(cuerpo)) return false;
    return cuerpo >= RUT_FICTICIO_DESDE && cuerpo <= RUT_FICTICIO_HASTA;
}

/** SQL fragment: cuerpo del RUT fuera del bloque ficticio (usa rut_normalized de la mig 053). */
const SQL_RUT_FORANEO = `
    CAST(SUBSTRING(REPLACE(REPLACE(REPLACE(rut, '.', ''), '-', ''), ' ', ''),
         1, CHAR_LENGTH(REPLACE(REPLACE(REPLACE(rut, '.', ''), '-', ''), ' ', '')) - 1) AS UNSIGNED)
    NOT BETWEEN ? AND ?`;

/* ──────────────────────── Guarda de entorno ──────────────────────── */

/**
 * ¿Es seguro sanear esta base? Tres condiciones, todas obligatorias:
 * no ser la base de producción, casar con el patrón de entorno de pruebas, y no venir vacía.
 * Devuelve { ok, motivo }.
 */
function esBaseDeTest(nombre) {
    const bd = String(nombre || '').trim();
    if (!bd) return { ok: false, motivo: 'DB_NAME está vacío: no hay forma de saber contra qué base se correría.' };
    if (bd.toLowerCase() === BD_PRODUCCION) {
        return { ok: false, motivo: `DB_NAME es "${bd}" = la base de PRODUCCIÓN. Abortado.` };
    }
    if (!/test|staging|dev/i.test(bd)) {
        return { ok: false, motivo: `DB_NAME es "${bd}" y no parece un entorno de pruebas (se espera test/staging/dev en el nombre). Abortado por seguridad.` };
    }
    return { ok: true, motivo: `Base "${bd}" reconocida como entorno de pruebas.` };
}

/* ──────────────────────── Detección ──────────────────────── */

/**
 * Trabajadores con RUT fuera del bloque ficticio y creados hace más de `graciaHoras`.
 * La gracia protege lo que el dueño crea a mano mientras hace QA; una importación desde
 * producción llega con created_at antiguo y cae igual.
 */
async function detectar(db, { graciaHoras = GRACIA_HORAS } = {}) {
    const [foraneos] = await db.query(
        `SELECT id, rut, nombres, apellido_paterno, created_at
           FROM trabajadores
          WHERE ${SQL_RUT_FORANEO}
            AND created_at < (NOW() - INTERVAL ? HOUR)
          ORDER BY id`,
        [RUT_FICTICIO_DESDE, RUT_FICTICIO_HASTA, graciaHoras],
    );
    const [[{ ficticios }]] = await db.query(
        `SELECT COUNT(*) AS ficticios FROM trabajadores
          WHERE NOT (${SQL_RUT_FORANEO})`,
        [RUT_FICTICIO_DESDE, RUT_FICTICIO_HASTA],
    );
    const [[{ en_gracia }]] = await db.query(
        `SELECT COUNT(*) AS en_gracia FROM trabajadores
          WHERE ${SQL_RUT_FORANEO} AND created_at >= (NOW() - INTERVAL ? HOUR)`,
        [RUT_FICTICIO_DESDE, RUT_FICTICIO_HASTA, graciaHoras],
    );
    return {
        ids: foraneos.map(f => f.id),
        foraneos,
        total: foraneos.length,
        ficticios: Number(ficticios) || 0,
        enGracia: Number(en_gracia) || 0,
    };
}

/* ──────────────────────── Purga ──────────────────────── */

/** Tablas dependientes de trabajador_id, en orden de borrado (las FK son RESTRICT o SET NULL). */
const DEPENDIENTES = [
    'log_asistencia',
    'asistencias',
    'periodos_ausencia',
    'sabados_extra_trabajadores',
    // SET NULL en la FK ⇒ si no se borran explícitamente, sobreviven con PII:
    // trabajador_desvinculaciones guarda rut_normalized y nombre_snapshot (mig 113, a propósito),
    // y solicitudes_ingreso es una copia íntegra de la ficha, cuenta bancaria incluida.
    'trabajador_desvinculaciones',
    'solicitudes_ingreso',
];

/**
 * Borra los trabajadores indicados y todo lo que cuelga de ellos. Devuelve conteos por tabla y las
 * rutas de archivo que quedaron huérfanas (el llamador las borra del disco).
 * Tolera que una tabla no exista (errno 1146: esquema viejo) y sigue.
 */
async function purgar(db, { ids }) {
    if (!ids || !ids.length) return { borrados: {}, rutas: [] };

    // Rutas primero: después del DELETE ya no se pueden consultar.
    const [docs] = await db.query(
        'SELECT ruta_archivo FROM documentos WHERE trabajador_id IN (?)', [ids],
    );
    const rutas = docs.map(d => d.ruta_archivo).filter(Boolean);

    const borrados = {};
    // Los lotes de custodia referencian documentos (CASCADE en los ítems), pero el lote queda
    // huérfano: se borran los que se quedarían sin ningún ítem.
    await ejecutar(db, borrados, 'documentos_lotes_items',
        'DELETE i FROM documentos_lotes_items i JOIN documentos d ON d.id = i.documento_id WHERE d.trabajador_id IN (?)', [ids]);
    await ejecutar(db, borrados, 'documentos',
        'DELETE FROM documentos WHERE trabajador_id IN (?)', [ids]);
    await ejecutar(db, borrados, 'documentos_lotes',
        'DELETE l FROM documentos_lotes l LEFT JOIN documentos_lotes_items i ON i.lote_id = l.id WHERE i.id IS NULL', []);

    for (const tabla of DEPENDIENTES) {
        await ejecutar(db, borrados, tabla, `DELETE FROM ${tabla} WHERE trabajador_id IN (?)`, [ids]);
    }

    await ejecutar(db, borrados, 'trabajadores',
        'DELETE FROM trabajadores WHERE id IN (?)', [ids]);

    return { borrados, rutas };
}

/** DELETE tolerante: una tabla ausente (1146) o una columna ausente (1054) no aborta el saneo. */
async function ejecutar(db, acc, clave, sql, params) {
    try {
        const [r] = await db.query(sql, params);
        acc[clave] = r.affectedRows || 0;
    } catch (err) {
        if (err && (err.errno === 1146 || err.errno === 1054)) { acc[clave] = null; return; }
        throw err;
    }
}

/**
 * Rastros de PII que no cuelgan de trabajador_id:
 *  - logs_actividad: `entidad_label` lleva nombres y `detalle` el body completo del request
 *    (RUT, domicilio, cuenta bancaria), más ip y user_agent.
 *  - nombres de personas en tablas que SÍ se conservan (la estructura la necesita el QA).
 */
async function limpiarRastros(db) {
    const out = {};
    await ejecutar(db, out, 'logs_actividad', 'DELETE FROM logs_actividad WHERE 1=1', []);
    await ejecutar(db, out, 'obras.encargado_nombre',
        "UPDATE obras SET encargado_nombre = CONCAT('Encargado Demo ', id) WHERE encargado_nombre IS NOT NULL AND encargado_nombre <> ''", []);
    await ejecutar(db, out, 'empresas.representante',
        "UPDATE empresas SET representante_nombre = CONCAT('Representante Demo ', id), representante_rut = '44.000.999-1' WHERE representante_nombre IS NOT NULL AND representante_nombre <> ''", []);
    await ejecutar(db, out, 'bodegas.responsable_nombre',
        "UPDATE bodegas SET responsable_nombre = CONCAT('Responsable Demo ', id) WHERE responsable_nombre IS NOT NULL AND responsable_nombre <> ''", []);
    await ejecutar(db, out, 'conductores.nombre',
        "UPDATE conductores SET nombre = CONCAT('Conductor Demo ', id) WHERE nombre IS NOT NULL AND nombre <> ''", []);
    return out;
}

/**
 * Corta el correo saliente de staging. Los tres cron jobs (reporte semanal, avisos diarios,
 * alertas de vehículos) leen destinatarios de la BD y no tienen allowlist ni gate de entorno: con
 * datos reales le escriben a personas reales. `usuarios.email_password_enc` guarda además la
 * contraseña del correo corporativo cifrada en AES.
 * NO toca usuarios.email ni password_hash → el login sigue funcionando.
 */
async function neutralizarCorreo(db) {
    const out = {};
    await ejecutar(db, out, 'reportes_suscriptores', 'DELETE FROM reportes_suscriptores WHERE 1=1', []);
    await ejecutar(db, out, 'avisos_suscriptores', 'DELETE FROM avisos_suscriptores WHERE 1=1', []);
    for (const t of ['vehiculo_seguros', 'vehiculo_revisiones', 'vehiculo_mantenciones', 'vehiculo_permisos']) {
        await ejecutar(db, out, `${t}.email_alerta`,
            `UPDATE ${t} SET email_alerta = NULL WHERE email_alerta IS NOT NULL`, []);
    }
    await ejecutar(db, out, 'usuarios.email_password_enc',
        'UPDATE usuarios SET email_password_enc = NULL WHERE email_password_enc IS NOT NULL', []);
    return out;
}

module.exports = {
    RUT_FICTICIO_DESDE,
    RUT_FICTICIO_HASTA,
    GRACIA_HORAS,
    BD_PRODUCCION,
    rutFicticio,
    esRutFicticio,
    esBaseDeTest,
    detectar,
    purgar,
    limpiarRastros,
    neutralizarCorreo,
    _interno: { DEPENDIENTES, SQL_RUT_FORANEO },
};
