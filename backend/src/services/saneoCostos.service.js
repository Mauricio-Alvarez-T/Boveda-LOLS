/**
 * Obras de ejemplo para Presupuestos en STAGING (2026-10-16, Marcos): «Obra demo 1», «Obra demo 2»
 * y «Obra demo 3», cada una con su presupuesto y gastos, para probar el módulo sin cargar todo a
 * mano. Solo lo llama `scripts/sanear_staging.js --sembrar` (las guardas de base de test viven ahí);
 * el deploy de producción nunca lo corre.
 *
 * Se siembra UNA vez por obra: si la obra ya existe no se toca, así lo que se edite o borre
 * mientras se prueba no reaparece en el tick siguiente. Si las tablas de costos aún no existen
 * (la mig 122 no corrió), no hace nada. Lo mismo vale para el complemento de superficie y cobros
 * (EXTRAS, mig 123): una vez por obra, con su marca en el historial.
 *
 * `db` se inyecta como parámetro → testeable sin base real.
 */

const OBRAS_DEMO = [
    {
        nombre: 'Obra demo 1',
        direccion: 'Av. Ficticia 1500',
        nota: 'En ejecución: dos partidas pasadas, una factura vencida y un gasto por completar',
        pct: { gg: 15, imp: 3, util: 10 },
        partidas: [
            ['Obras preliminares', '1.1', 'Instalación de faenas', 'gl', 1, 1500000],
            ['Obras preliminares', '1.2', 'Trazado y niveles', 'm2', 320, 850],
            ['Obra gruesa', '2.1', 'Excavación de fundaciones', 'm3', 60, 9500],
            ['Obra gruesa', '2.2', 'Hormigón H-25 fundaciones', 'm3', 42, 138000],
            ['Obra gruesa', '2.3', 'Enfierradura A630', 'kg', 3800, 1450],
            ['Obra gruesa', '2.4', 'Moldaje de muros', 'm2', 280, 12500],
            ['Terminaciones', '3.1', 'Cerámica de piso 60×60', 'm2', 210, 15390],
            ['Terminaciones', '3.2', 'Pintura interior látex', 'm2', 640, 3200],
            ['Obra gruesa', '2.5', 'Muro de contención adicional', 'm3', 8.5, 152000, 'Pedido del mandante por el talud'],
        ],
        // [días atrás, tipo, proveedor, folio, neto, total, ítem de partida | null, categoría, pagada, vence en (días, negativo = vencida), observación]
        gastos: [
            [40, 'factura', 'Constructora Sur', '3301', 1420000, 1689800, '1.1', 'subcontrato', true, null, null],
            [38, 'factura', 'Excavaciones Ltda', '777', 610000, 725900, '2.1', 'arriendo_equipos', true, null, null],
            [25, 'factura', 'Arriendos Faena SpA', '1022', 850000, 1011500, null, 'gastos_generales', false, -10, null],
            [6, 'factura', 'Gerdau Aza', '55120', null, 3689000, '2.3', 'materiales', true, null, 'Cargada solo con el total: el neto se estima'],
            [4, 'boleta', 'Copec', null, null, 185000, null, 'combustible', true, null, null],
            [3, 'boleta', null, null, null, 89900, null, null, true, null, 'Foto sin completar (falta proveedor y a qué va)'],
            [1, 'factura', 'Melón Hormigones', '884512', 6350000, 7556500, '2.2', 'materiales', false, 30, 'Subió $4.000 el m3 respecto a la cotización'],
        ],
    },
    {
        nombre: 'Obra demo 2',
        direccion: 'Calle Ejemplo 920',
        nota: 'Casi terminada: cerca del límite, con una obra extra',
        pct: { gg: 12, imp: 2, util: 12 },
        partidas: [
            ['Obra gruesa', '1.1', 'Radier e=10 cm', 'm2', 120, 18500],
            ['Obra gruesa', '1.2', 'Albañilería de ladrillo', 'm2', 260, 24000],
            ['Techumbre', '2.1', 'Estructura de techumbre', 'm2', 140, 21000],
            ['Techumbre', '2.2', 'Cubierta zinc-alum', 'm2', 140, 14500],
            ['Terminaciones', '3.1', 'Revestimiento interior', 'm2', 300, 9800],
            ['Terminaciones', '3.2', 'Pintura', 'm2', 300, 3100],
            ['Terminaciones', '3.3', 'Ampliación de terraza', 'm2', 18, 38000, 'Obra extra aprobada por el cliente'],
        ],
        gastos: [
            [60, 'factura', 'Hormigones del Sur', '4410', 2150000, 2558500, '1.1', 'materiales', true, null, null],
            [45, 'factura', 'Ladrillos Princesa', '9921', 6400000, 7616000, '1.2', 'materiales', true, null, null],
            [30, 'factura', 'Maderas Arauco', '7710', 2900000, 3451000, '2.1', 'materiales', true, null, null],
            [20, 'factura', 'Cintac', '3302', 2100000, 2499000, '2.2', 'materiales', true, null, null],
            [5, 'factura', 'Yeso Volcán', '1180', 2700000, 3213000, '3.1', 'materiales', false, 5, null],
        ],
    },
    {
        nombre: 'Obra demo 3',
        direccion: 'Pasaje Prueba 77',
        nota: 'Recién cargada: presupuesto sin gastos todavía',
        pct: { gg: 15, imp: 5, util: 10 },
        partidas: [
            ['Obras preliminares', '1.1', 'Cierre perimetral', 'ml', 85, 18000],
            ['Obras preliminares', '1.2', 'Instalación de faenas', 'gl', 1, 2200000],
            ['Movimiento de tierra', '2.1', 'Escarpe', 'm2', 450, 1800],
            ['Movimiento de tierra', '2.2', 'Excavación masiva', 'm3', 380, 8900],
        ],
        gastos: [],
    },
];

const NOMBRES_DEMO = OBRAS_DEMO.map(o => o.nombre);

/**
 * Complemento del 2026-10-19 (mig 123): superficie y cobros al mandante, para que el flujo de caja
 * y la comparación por m² tengan algo que mostrar. Se aplica UNA vez por obra (marca en el
 * historial), también a las obras demo que ya existían.
 * Cobro: [días desde hoy (negativo = ya pasó), qué se cobra, neto, lleva IVA, % de retención, cobrado]
 */
const MARCA_EXTRAS = 'Datos de ejemplo de test: cobros y superficie';
const EXTRAS = {
    'Obra demo 1': {
        m2: 210,
        cobros: [
            [-45, 'Anticipo (10 %)', 3000000, true, 0, true],
            [-20, 'EP 1', 8000000, true, 5, true],
            [10, 'EP 2', 6500000, true, 5, false],
        ],
    },
    'Obra demo 2': {
        m2: 120,
        cobros: [
            [-40, 'EP 1', 7000000, true, 5, true],
            [-12, 'EP 2', 8000000, true, 5, true],
            [3, 'EP 3', 5500000, true, 5, false],
            [45, 'Devolución de retenciones', 1025000, false, 0, false],
        ],
    },
    'Obra demo 3': {
        m2: 450,
        cobros: [[7, 'Anticipo (10 %)', 1000000, true, 0, false]],
    },
};

/**
 * Complemento del 19-10 tarde (mig 124): gastos de varios meses con las categorías detalladas, para
 * que «Gastos mes a mes» muestre algo. Una vez por obra (marca en el historial).
 * Gasto: [meses atrás (0 = este mes), día, tipo, proveedor, folio, neto | null, total, categoría, pagada, detalle]
 */
const MARCA_MES = 'Datos de ejemplo de test: gastos mes a mes';
const MIG_CATEGORIAS = '124_costos_categorias_detalladas.sql';
const GASTOS_MES = {
    'Obra demo 1': [
        [2, 5, 'factura', 'Baños Químicos Norte', '2201', 180000, 214200, 'servicios_basicos', true, null],
        [2, 10, 'boleta', 'Copec', null, null, 210000, 'combustible', true, null],
        [2, 12, 'factura', 'Andamios del Sur', '9011', 650000, 773500, 'arriendo_equipos', true, 'Andamios y alzaprimas, mensual'],
        [2, 15, 'planilla', null, null, null, 1000000, 'anticipos', true, 'Anticipo de quincena'],
        [2, 28, 'planilla', null, null, null, 2400000, 'sueldos_administracion', true, 'Administrador, jefe de obra y prevencionista'],
        [2, 28, 'planilla', null, null, null, 4200000, 'sueldos', true, 'Planilla de trabajadores'],
        [1, 5, 'factura', 'Baños Químicos Norte', '2264', 180000, 214200, 'servicios_basicos', true, null],
        [1, 8, 'factura', 'Tolvas y Escombros', '512', 320000, 380800, 'logistica_seguridad', true, 'Retiro de escombros (2 tolvas)'],
        [1, 10, 'boleta', 'Copec', null, null, 230000, 'combustible', true, null],
        [1, 12, 'factura', 'Andamios del Sur', '9087', 650000, 773500, 'arriendo_equipos', true, 'Andamios y alzaprimas, mensual'],
        [1, 15, 'planilla', null, null, null, 1100000, 'anticipos', true, 'Anticipo de quincena'],
        [1, 18, 'factura', 'Ferretería Central', '5402', 145000, 172550, 'herramientas', true, 'Esmeril y discos'],
        [1, 28, 'planilla', null, null, null, 2400000, 'sueldos_administracion', true, 'Administrador, jefe de obra y prevencionista'],
        [1, 28, 'planilla', null, null, null, 4600000, 'sueldos', true, 'Planilla de trabajadores'],
        [0, 3, 'factura', 'Baños Químicos Norte', '2330', 180000, 214200, 'servicios_basicos', false, null],
        [0, 6, 'factura', 'Andamios del Sur', '9150', 650000, 773500, 'arriendo_equipos', false, 'Andamios y alzaprimas, mensual'],
        [0, 15, 'planilla', null, null, null, 1050000, 'anticipos', true, 'Anticipo de quincena'],
    ],
    'Obra demo 2': [
        [2, 10, 'boleta', 'Copec', null, null, 120000, 'combustible', true, null],
        [2, 28, 'planilla', null, null, null, 2800000, 'sueldos', true, 'Planilla de trabajadores'],
        [1, 10, 'boleta', 'Copec', null, null, 135000, 'combustible', true, null],
        [1, 14, 'factura', 'Hormigones del Sur', '4502', 980000, 1166200, 'hormigon', true, 'Hormigón H-20 radier terraza'],
        [1, 15, 'planilla', null, null, null, 600000, 'anticipos', true, 'Anticipo de quincena'],
        [1, 28, 'planilla', null, null, null, 2950000, 'sueldos', true, 'Planilla de trabajadores'],
        [0, 15, 'planilla', null, null, null, 650000, 'anticipos', true, 'Anticipo de quincena'],
    ],
};

/** AAAA-MM-DD local, `dias` desde hoy (negativo = atrás). */
function fecha(dias, hoy = new Date()) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias);
    const dos = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

const sinTablas = e => e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146);

async function existeTabla(db, tabla) {
    try {
        await db.query(`SELECT 1 FROM ${tabla} LIMIT 1`);
        return true;
    } catch (e) {
        if (sinTablas(e)) return false;
        throw e;
    }
}

/** ¿Falta alguna de las 3 obras de ejemplo? */
async function faltanObras(db) {
    const [rows] = await db.query('SELECT nombre FROM obras WHERE nombre IN (?)', [NOMBRES_DEMO]);
    const hay = new Set(rows.map(r => r.nombre));
    return NOMBRES_DEMO.some(n => !hay.has(n));
}

/** Obras demo ya creadas a las que todavía no se les agregó superficie y cobros (sin la marca). */
async function obrasSinExtras(db) {
    if (!(await existeTabla(db, 'costo_cobros'))) return [];
    const [obras] = await db.query(
        `SELECT o.id AS obra_id, o.nombre, p.id AS presupuesto_id
           FROM obras o JOIN costo_presupuestos p ON p.obra_id = o.id
          WHERE o.nombre IN (?)`, [NOMBRES_DEMO]);
    if (!obras.length) return [];
    const [marcas] = await db.query(
        'SELECT DISTINCT obra_id FROM costo_historial WHERE obra_id IN (?) AND resumen LIKE ?',
        [obras.map(o => o.obra_id), `${MARCA_EXTRAS}%`]);
    const con = new Set(marcas.map(m => m.obra_id));
    return obras.filter(o => !con.has(o.obra_id) && EXTRAS[o.nombre]);
}

/** ¿Ya corrió la mig 124? (sin ella, la columna categoría no acepta las categorías nuevas). */
async function hayCategoriasDetalladas(db) {
    try {
        const [r] = await db.query('SELECT 1 FROM schema_migrations WHERE name = ?', [MIG_CATEGORIAS]);
        return r.length > 0;
    } catch (e) {
        if (sinTablas(e)) return false;
        throw e;
    }
}

/** Obras demo ya creadas a las que todavía no se les agregaron los gastos mes a mes. */
async function obrasSinMes(db) {
    if (!(await hayCategoriasDetalladas(db))) return [];
    const [obras] = await db.query(
        `SELECT o.id AS obra_id, o.nombre, p.id AS presupuesto_id
           FROM obras o JOIN costo_presupuestos p ON p.obra_id = o.id
          WHERE o.nombre IN (?)`, [NOMBRES_DEMO]);
    if (!obras.length) return [];
    const [marcas] = await db.query(
        'SELECT DISTINCT obra_id FROM costo_historial WHERE obra_id IN (?) AND resumen LIKE ?',
        [obras.map(o => o.obra_id), `${MARCA_MES}%`]);
    const con = new Set(marcas.map(m => m.obra_id));
    return obras.filter(o => !con.has(o.obra_id) && GASTOS_MES[o.nombre]);
}

/** ¿Hay algo que sembrar? false también si las tablas de costos no existen (mig 122 sin correr). */
async function pendiente(db) {
    if (!(await existeTabla(db, 'costo_presupuestos'))) return false;
    if (await faltanObras(db)) return true;
    if ((await obrasSinExtras(db)).length > 0) return true;
    return (await obrasSinMes(db)).length > 0;
}

/** AAAA-MM-DD del día `dia` de hace `mesesAtras` meses (el día se acota al último del mes). */
function fechaMes(mesesAtras, dia, hoy) {
    const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() - mesesAtras + 1, 0).getDate();
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - mesesAtras, Math.min(dia, ultimo));
    const dos = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** Gastos mes a mes de una obra demo, con su marca (en la transacción de `q`). Lo de días futuros se salta. */
async function sembrarMes(q, obra, usuarioId, hoy) {
    const hoyISO = fecha(0, hoy);
    let n = 0;
    for (const [atras, dia, tipo, proveedor, folio, neto, total, categoria, pagada, detalle] of GASTOS_MES[obra.nombre]) {
        const f = fechaMes(atras, dia, hoy);
        if (f > hoyISO) continue;
        const vence = pagada ? null : fechaMes(atras, Math.min(28, dia + 20), hoy);
        await q.query(
            `INSERT INTO costo_gastos (obra_id, fecha, tipo_documento, proveedor, folio, monto_neto, iva, monto_total,
                                       categoria, partida_id, estado_pago, fecha_vencimiento, fecha_pago, observacion, creado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
            [obra.obra_id, f, tipo, proveedor, folio, neto, neto !== null ? total - neto : null, total,
                categoria, pagada ? 'pagada' : 'por_pagar', vence, pagada ? f : null, detalle, usuarioId]);
        n++;
    }
    await q.query(
        `INSERT INTO costo_historial (obra_id, entidad, entidad_id, accion, resumen, usuario_id)
         VALUES (?, 'presupuesto', ?, 'importar', ?, NULL)`,
        [obra.obra_id, obra.presupuesto_id, `${MARCA_MES}: ${n} gastos de los últimos 3 meses`]);
    return n;
}

/** Superficie y cobros de una obra demo, con su marca en el historial (en la transacción de `q`). */
async function sembrarExtras(q, obra, usuarioId, hoy) {
    const ex = EXTRAS[obra.nombre];
    await q.query('UPDATE costo_presupuestos SET superficie_m2 = ? WHERE id = ? AND superficie_m2 IS NULL', [ex.m2, obra.presupuesto_id]);
    for (const [dias, glosa, neto, conIva, retPct, cobrado] of ex.cobros) {
        const f = fecha(dias, hoy);
        const iva = conIva ? Math.round(neto * 0.19) : 0;
        await q.query(
            `INSERT INTO costo_cobros (obra_id, fecha, glosa, monto_neto, iva, retencion, estado, fecha_cobro, creado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [obra.obra_id, f, glosa, neto, iva, Math.round(neto * retPct / 100), cobrado ? 'cobrado' : 'por_cobrar', cobrado ? f : null, usuarioId]);
    }
    await q.query(
        `INSERT INTO costo_historial (obra_id, entidad, entidad_id, accion, resumen, usuario_id)
         VALUES (?, 'presupuesto', ?, 'importar', ?, NULL)`,
        [obra.obra_id, obra.presupuesto_id, `${MARCA_EXTRAS}: ${ex.cobros.length} cobros y ${ex.m2} m²`]);
    return ex.cobros.length;
}

/** Corre `fn(q)` en una transacción propia si el pool la ofrece (en los tests, directo). */
async function enTransaccion(db, fn) {
    const conn = typeof db.getConnection === 'function' ? await db.getConnection() : null;
    const q = conn || db;
    try {
        if (conn) await conn.beginTransaction();
        const r = await fn(q);
        if (conn) await conn.commit();
        return r;
    } catch (e) {
        if (conn) { try { await conn.rollback(); } catch { /* nada que deshacer */ } }
        throw e;
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Crea las obras de ejemplo que falten, con presupuesto, partidas, gastos e historial.
 * Devuelve cuántas obras, partidas y gastos sembró.
 */
async function sembrar(db, { hoy = new Date() } = {}) {
    const resumen = { obras: 0, partidas: 0, gastos: 0, cobros: 0, gastos_mes: 0 };
    if (!(await pendiente(db))) return resumen;

    const [existentes] = await db.query('SELECT nombre FROM obras WHERE nombre IN (?)', [NOMBRES_DEMO]);
    const hay = new Set(existentes.map(r => r.nombre));

    // Empresa ficticia del sembrado general (o la primera que haya) y un usuario para "creado por".
    const [[empresa]] = await db.query(
        "SELECT id FROM empresas ORDER BY (rut = '44.000.900-K') DESC, id ASC LIMIT 1");
    const [[usuario]] = await db.query('SELECT id FROM usuarios ORDER BY (rol_id = 1) DESC, id ASC LIMIT 1');
    if (!usuario) return resumen;

    for (const o of OBRAS_DEMO) {
        if (hay.has(o.nombre) || !empresa) continue;
        // Una transacción por obra: si algo falla a medias no queda una obra demo sin presupuesto
        // (y como se siembra solo lo que falta, una obra a medias no se volvería a completar).
        const conn = typeof db.getConnection === 'function' ? await db.getConnection() : null;
        const q = conn || db;
        try {
            if (conn) await conn.beginTransaction();
            const [ro] = await q.query(
                'INSERT INTO obras (nombre, direccion, empresa_id, activa, es_prueba) VALUES (?, ?, ?, 1, 0)',
                [o.nombre, o.direccion, empresa.id]);
            const obraId = ro.insertId;
            resumen.obras++;

            const [rp] = await q.query(
                `INSERT INTO costo_presupuestos (obra_id, gg_pct, imprevistos_pct, utilidad_pct, iva_pct, observacion, creado_por)
                 VALUES (?, ?, ?, ?, 19, ?, ?)`,
                [obraId, o.pct.gg, o.pct.imp, o.pct.util, `Datos de ejemplo (test): ${o.nota}`, usuario.id]);
            const presId = rp.insertId;

            const filas = o.partidas.map((p, i) => [presId, p[0], p[1], p[2], p[3], p[4], p[5],
                p[6] ? 'modificacion' : 'original', p[6] || null, i + 1, usuario.id]);
            await q.query(
                `INSERT INTO costo_partidas (presupuesto_id, capitulo, codigo, descripcion, unidad, cantidad, precio_unitario, origen, motivo, orden, creado_por)
                 VALUES ?`, [filas]);
            resumen.partidas += filas.length;

            const [ps] = await q.query('SELECT id, codigo FROM costo_partidas WHERE presupuesto_id = ?', [presId]);
            const idDe = new Map(ps.map(p => [p.codigo, p.id]));

            for (const g of o.gastos) {
                const [diasAtras, tipo, proveedor, folio, neto, total, item, categoria, pagada, vence, obs] = g;
                const f = fecha(-diasAtras, hoy);
                await q.query(
                    `INSERT INTO costo_gastos (obra_id, fecha, tipo_documento, proveedor, folio, monto_neto, iva, monto_total,
                                               categoria, partida_id, estado_pago, fecha_vencimiento, fecha_pago, observacion, creado_por)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [obraId, f, tipo, proveedor, folio, neto, neto !== null ? total - neto : null, total,
                        categoria, item ? idDe.get(item) || null : null, pagada ? 'pagada' : 'por_pagar',
                        vence !== null ? fecha(vence, hoy) : null, pagada ? f : null, obs, usuario.id]);
                resumen.gastos++;
            }

            await q.query(
                `INSERT INTO costo_historial (obra_id, entidad, entidad_id, accion, resumen, usuario_id)
                 VALUES (?, 'presupuesto', ?, 'importar', ?, NULL)`,
                [obraId, presId, `Datos de ejemplo de test: ${filas.length} partidas y ${o.gastos.length} gastos`]);
            if (conn) await conn.commit();
        } catch (e) {
            if (conn) { try { await conn.rollback(); } catch { /* nada que deshacer */ } }
            throw e;
        } finally {
            if (conn) conn.release();
        }
    }

    // Superficie y cobros (las recién creadas y las que ya existían sin la marca).
    for (const obra of await obrasSinExtras(db)) {
        resumen.cobros += await enTransaccion(db, q => sembrarExtras(q, obra, usuario.id, hoy));
    }
    // Gastos mes a mes con las categorías detalladas (mig 124).
    for (const obra of await obrasSinMes(db)) {
        resumen.gastos_mes += await enTransaccion(db, q => sembrarMes(q, obra, usuario.id, hoy));
    }
    return resumen;
}

module.exports = { OBRAS_DEMO, NOMBRES_DEMO, EXTRAS, MARCA_EXTRAS, GASTOS_MES, MARCA_MES, pendiente, sembrar, _interno: { fecha, fechaMes } };
