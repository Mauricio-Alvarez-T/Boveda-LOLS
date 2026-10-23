const pool = require('../config/db');
const logger = require('../utils/logger-structured');
const { hoyChile } = require('../utils/fechaChile');
const asistenciaService = require('./asistencia.service');
const vehiculosService = require('./vehiculos.service');
const documentosAlertasService = require('./documentosAlertas.service');

/**
 * «Inicio de gerencia» (don Luis Lazcano, opción B «Tablero por tema» del lienzo, 2026-10-23): los seis temas que
 * esperan una decisión de gerencia, en UNA respuesta. Gate de la ruta: `inicio.gerencia` (mig 134). Cada bloque pide
 * además el permiso de su módulo y llega `null` sin él o si su consulta falla (no tumba a los otros):
 *
 *   faltas      (asistencia.ver)  Reiterados del Art. 160 N°3 del mes: los mismos de la tarjeta «Asistencia»
 *                                 (asistenciaService.getAlertasFaltas: 2 días seguidos, 2 lunes, 3+ F).
 *   vehiculos   (vehiculos.ver)   Papeles vencidos o por vencer en 30 días: lo mismo que GET /vehiculos/papeles
 *                                 (vehiculosService.getPapeles), sin el teléfono del conductor.
 *   perdidas    (inventario.ver + transferencias.ver_todas)  Diferencias PENDIENTES con faltante (diferencia > 0)
 *                                 valorizadas en pesos = faltan × valor_compra del ítem. Los $ salen SOLO con
 *                                 `inventario.costos.ver` o `inventario.resumen.ver_valores`; sin ellos, solo
 *                                 cantidades (los campos de $ no viajan: doble defensa, seguridad-rbac.md).
 *   documentos  (documentos.ver)  Documentos de trabajadores activos vencidos o que vencen en 7 días (el mismo
 *                                 plazo de «por vencer» del Inicio), sin los ya renovados.
 *   papeles     (documentos.ver)  Papeles laborales fuera de plazo (Gestiones → Documentos físicos): lo mismo que
 *                                 GET /documentos-alertas/pendientes (documentosAlertasService.pendientes). Solo se lee.
 *   solicitudes (inventario.ver + transferencias.ver_todas)  Solicitudes PENDIENTES estancadas: la regla del
 *                                 Resumen Ejecutivo (10 días desde la solicitud, o su prórroga).
 *   aprobadores Quién aprueba hoy (permiso efectivo de `inventario.transferencias.aprobar`, sin el rol 1), para
 *               «Pedir a Leonardo» / «Apurar a Leonardo». Solo si va algún bloque de Inventario.
 *
 * Número FIJO de consultas (sin N+1) y en secuencia (el hosting tiene 10 conexiones). Excluye trabajadores de
 * prueba y obras de prueba o finalizadas, como el resto del Inicio. Listas con tope (TOPE); los totales son reales.
 */

const TOPE = 50;
const DIAS_VEHICULOS = 30;
const DIAS_DOCUMENTOS = 7;
const DIAS_ESTANCADA = 10;

const tiene = (permisos, clave) => Array.isArray(permisos) && permisos.includes(clave);
const num = (v) => Number(v) || 0;
const nombreDe = (r) => [r.nombres, r.apellido_paterno, r.apellido_materno].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

// Igual que transferencia.service (EXCLUIR_OBRAS_PRUEBA): ni origen ni destino en una obra de prueba o finalizada.
const EXCLUIR_OBRAS_PRUEBA =
    ' AND (t.origen_obra_id IS NULL OR t.origen_obra_id NOT IN (SELECT id FROM obras WHERE es_prueba = 1 OR finalizada = 1))' +
    ' AND (t.destino_obra_id IS NULL OR t.destino_obra_id NOT IN (SELECT id FROM obras WHERE es_prueba = 1 OR finalizada = 1))';

const JOIN_LUGARES = `LEFT JOIN obras oo ON oo.id = t.origen_obra_id
        LEFT JOIN bodegas ob ON ob.id = t.origen_bodega_id
        LEFT JOIN obras do2 ON do2.id = t.destino_obra_id
        LEFT JOIN bodegas db2 ON db2.id = t.destino_bodega_id`;

// ─────────────────────────── 1. Faltas reiteradas ───────────────────────────

const CAUSAL = { consecutivas: 'seguidos', lunes: 'lunes', acumuladas: 'tres' };

async function faltas(hoy) {
    const [anio, mes] = hoy.split('-').map(Number);
    const reiterados = await asistenciaService.getAlertasFaltas('ALL', mes, anio);
    const lista = reiterados.map(t => ({
        trabajador_id: t.trabajador_id,
        rut: t.rut ?? null,
        nombre: nombreDe(t),
        apellido_paterno: t.apellido_paterno ?? '',
        obra: t.obra_nombre ?? null,
        fechas: Array.isArray(t.fechas) ? t.fechas : [],
        causales: (t.alertas || []).map(a => CAUSAL[a.tipo]).filter(Boolean),
    }))
        // Más causales arriba; luego más faltas; luego por apellido.
        .sort((x, y) => y.causales.length - x.causales.length || y.fechas.length - x.fechas.length
            || String(x.apellido_paterno).localeCompare(String(y.apellido_paterno), 'es'))
        .map(({ apellido_paterno, ...r }) => r);
    return {
        anio, mes,
        total: lista.length,
        tres_causales: lista.filter(r => r.causales.length >= 3).length,
        lista: lista.slice(0, TOPE),
    };
}

// ─────────────────────────── 2. Papeles de vehículos ───────────────────────────

async function vehiculos() {
    const data = await vehiculosService.getPapeles(DIAS_VEHICULOS);
    // El teléfono del conductor no hace falta aquí (gerencia no le escribe al conductor desde el tablero).
    const lista = (data.vehiculos || []).map(({ conductor_telefono, ...v }) => v);
    return { dias: data.dias, total_vehiculos: data.total_vehiculos, vehiculos: lista };
}

// ─────────────────────────── 3. Pérdidas en Inventario ───────────────────────────

// Diferencias pendientes con FALTANTE: `diferencia` = enviada − recibida (columna generada), positiva = faltó.
const DESDE_PERDIDA = `FROM transferencia_discrepancias d
        JOIN transferencias t ON t.id = d.transferencia_id
        JOIN items_inventario i ON i.id = d.item_id
        WHERE t.activo = 1${EXCLUIR_OBRAS_PRUEBA} AND d.estado = 'pendiente' AND d.diferencia > 0`;
const FECHA_PERDIDA = 'COALESCE(t.fecha_recepcion, d.created_at)';
const INICIO_MES = 'DATE_SUB(CURDATE(), INTERVAL DAYOFMONTH(CURDATE()) - 1 DAY)';

async function perdidas(conValores) {
    const [[tot]] = await pool.query(`
        SELECT COUNT(*) AS n, COUNT(DISTINCT d.transferencia_id) AS envios,
               SUM(${FECHA_PERDIDA} >= ${INICIO_MES}) AS n_mes,
               COALESCE(SUM(d.diferencia * i.valor_compra), 0) AS total,
               COALESCE(SUM(CASE WHEN ${FECHA_PERDIDA} >= ${INICIO_MES} THEN d.diferencia * i.valor_compra END), 0) AS total_mes,
               SUM(i.valor_compra IS NULL OR i.valor_compra <= 0) AS sin_valor
        ${DESDE_PERDIDA}`);
    // Con permiso de valores, las de más plata arriba; sin él, las más antiguas (el orden no deja deducir montos).
    const orden = conValores
        ? 'ORDER BY (d.diferencia * COALESCE(i.valor_compra, 0)) DESC, dias DESC, d.id ASC'
        : 'ORDER BY dias DESC, d.id ASC';
    const [filas] = await pool.query(`
        SELECT d.id, d.transferencia_id, t.codigo, i.descripcion, i.unidad, d.diferencia, i.valor_compra,
               COALESCE(oo.nombre, ob.nombre) AS origen, COALESCE(do2.nombre, db2.nombre) AS destino,
               ur.nombre AS recibio,
               DATE_FORMAT(${FECHA_PERDIDA}, '%Y-%m-%d') AS fecha,
               DATEDIFF(CURDATE(), ${FECHA_PERDIDA}) AS dias,
               CASE WHEN ${FECHA_PERDIDA} >= ${INICIO_MES} THEN 1 ELSE 0 END AS del_mes
        FROM transferencia_discrepancias d
        JOIN transferencias t ON t.id = d.transferencia_id
        JOIN items_inventario i ON i.id = d.item_id
        ${JOIN_LUGARES}
        LEFT JOIN usuarios ur ON ur.id = COALESCE(d.reportado_por, t.receptor_id, t.recibido_por)
        WHERE t.activo = 1${EXCLUIR_OBRAS_PRUEBA} AND d.estado = 'pendiente' AND d.diferencia > 0
        ${orden}
        LIMIT ?`, [TOPE]);

    const lista = filas.map(f => {
        const faltan = Math.round(num(f.diferencia) * 10000) / 10000;
        const fila = {
            id: f.id, transferencia_id: f.transferencia_id, codigo: f.codigo,
            descripcion: f.descripcion ?? null, unidad: f.unidad ?? null, faltan,
            origen: f.origen ?? null, destino: f.destino ?? null, recibio: f.recibio ?? null,
            fecha: f.fecha ?? null, dias: Math.max(0, Math.trunc(num(f.dias))), del_mes: num(f.del_mes) === 1,
        };
        if (!conValores) return fila;
        const unitario = num(f.valor_compra);
        return { ...fila, valor_unitario: unitario > 0 ? unitario : null, valor: unitario > 0 ? Math.round(faltan * unitario) : null };
    });
    const base = { con_valores: conValores, n: num(tot?.n), envios: num(tot?.envios), n_mes: num(tot?.n_mes), lista };
    if (!conValores) return base;
    return { ...base, total: Math.round(num(tot?.total)), total_mes: Math.round(num(tot?.total_mes)), sin_valor: num(tot?.sin_valor) };
}

/** Saca todo campo de $ de un bloque de pérdidas (cinturón: el servicio ya no los arma sin permiso). */
function sinValores(bloque) {
    if (!bloque) return bloque;
    const { total, total_mes, sin_valor, ...resto } = bloque;
    return {
        ...resto,
        con_valores: false,
        lista: (resto.lista || []).map(({ valor, valor_unitario, valor_compra, ...f }) => f),
    };
}

// ─────────────────────────── 4. Documentos de trabajadores ───────────────────────────

// Activos, de trabajadores activos que no son de prueba, fuera de obras de prueba o finalizadas; vencidos o por
// vencer en DIAS_DOCUMENTOS. Si el trabajador ya subió uno nuevo del mismo tipo que vence después (o sin fecha), el
// viejo no cuenta: ya se renovó.
const DESDE_DOCUMENTOS = `FROM documentos d
        JOIN tipos_documento td ON td.id = d.tipo_documento_id
        JOIN trabajadores t ON t.id = d.trabajador_id
        LEFT JOIN obras o ON o.id = t.obra_id
        WHERE d.activo = 1 AND t.activo = 1 AND t.es_prueba = 0
          AND (o.id IS NULL OR (o.es_prueba = 0 AND o.finalizada = 0))
          AND d.fecha_vencimiento IS NOT NULL
          AND d.fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
          AND NOT EXISTS (
              SELECT 1 FROM documentos d2
              WHERE d2.trabajador_id = d.trabajador_id AND d2.tipo_documento_id = d.tipo_documento_id
                AND d2.activo = 1 AND d2.id <> d.id
                AND (d2.fecha_vencimiento IS NULL OR d2.fecha_vencimiento > d.fecha_vencimiento))`;

async function documentos() {
    const [[tot]] = await pool.query(`
        SELECT SUM(d.fecha_vencimiento < CURDATE()) AS vencidos, SUM(d.fecha_vencimiento >= CURDATE()) AS por_vencer
        ${DESDE_DOCUMENTOS}`, [DIAS_DOCUMENTOS]);
    const [filas] = await pool.query(`
        SELECT d.id, td.nombre AS tipo, t.id AS trabajador_id, t.rut, t.nombres, t.apellido_paterno, t.apellido_materno,
               o.nombre AS obra, DATE_FORMAT(d.fecha_vencimiento, '%Y-%m-%d') AS fecha,
               DATEDIFF(d.fecha_vencimiento, CURDATE()) AS dias
        ${DESDE_DOCUMENTOS}
        ORDER BY d.fecha_vencimiento ASC, d.id ASC
        LIMIT ?`, [DIAS_DOCUMENTOS, TOPE]);
    return {
        dias: DIAS_DOCUMENTOS,
        vencidos: num(tot?.vencidos),
        por_vencer: num(tot?.por_vencer),
        lista: filas.map(f => ({
            documento_id: f.id, tipo: f.tipo ?? null, trabajador_id: f.trabajador_id, rut: f.rut ?? null,
            nombre: nombreDe(f), obra: f.obra ?? null, fecha: f.fecha, dias: Math.trunc(num(f.dias)),
        })),
    };
}

// ─────────────────────────── 5. Papeles laborales atrasados ───────────────────────────

async function papeles() {
    const a = await documentosAlertasService.pendientes();
    const items = Array.isArray(a?.items) ? a.items : [];
    // Los pasados del plazo máximo arriba; luego los de más días.
    const lista = [...items].sort((x, y) => Number(y.critical) - Number(x.critical) || y.dias - x.dias)
        .map(i => ({
            documento_id: i.documento_id, tipo_codigo: i.tipo_codigo, tipo_nombre: i.tipo_nombre,
            etapa: i.etapa, dias: i.dias, critical: !!i.critical, dias_aviso: i.dias_aviso, dias_critico: i.dias_critico,
            trabajador: i.trabajador, obra_nombre: i.obra_nombre ?? null, portador_nombre: i.portador_nombre ?? null,
        }));
    return { total: lista.length, criticos: lista.filter(i => i.critical).length, lista: lista.slice(0, TOPE) };
}

// ─────────────────────────── 6. Solicitudes trabadas ───────────────────────────

// La regla «estancada» del Resumen Ejecutivo (inventario.service, alertas): pendiente y ya pasó su límite (10 días
// desde la solicitud, o la prórroga que se le dio).
const ESTANCADA = `DATEDIFF(COALESCE(t.prorroga_hasta, DATE_ADD(DATE(t.fecha_solicitud), INTERVAL ${DIAS_ESTANCADA} DAY)), CURDATE()) <= 0`;
const DESDE_SOLICITUDES = `FROM transferencias t
        WHERE t.activo = 1${EXCLUIR_OBRAS_PRUEBA} AND t.estado = 'pendiente' AND ${ESTANCADA}`;

async function solicitudes() {
    const [[tot]] = await pool.query(`SELECT COUNT(*) AS n ${DESDE_SOLICITUDES}`);
    const [filas] = await pool.query(`
        SELECT t.id, t.codigo, t.solicitante_id, us.nombre AS solicitante, rs.nombre AS cargo,
               COALESCE(do2.nombre, db2.nombre) AS destino, COALESCE(oo.nombre, ob.nombre) AS origen,
               DATE_FORMAT(t.fecha_solicitud, '%Y-%m-%d') AS fecha,
               DATEDIFF(CURDATE(), t.fecha_solicitud) AS dias
        FROM transferencias t
        ${JOIN_LUGARES}
        LEFT JOIN usuarios us ON us.id = t.solicitante_id
        LEFT JOIN roles rs ON rs.id = us.rol_id
        WHERE t.activo = 1${EXCLUIR_OBRAS_PRUEBA} AND t.estado = 'pendiente' AND ${ESTANCADA}
        ORDER BY t.fecha_solicitud ASC, t.id ASC
        LIMIT ?`, [TOPE]);

    // Qué se pidió: catálogo y personalizados, en lote (sin N+1). Personalizados quitados al aprobar no van.
    const ids = filas.map(f => f.id);
    const porTrf = new Map(ids.map(id => [id, []]));
    if (ids.length) {
        const [items] = await pool.query(`
            SELECT ti.transferencia_id, i.descripcion, i.unidad, ti.cantidad_solicitada AS pedida
            FROM transferencia_items ti
            JOIN items_inventario i ON i.id = ti.item_id
            WHERE ti.transferencia_id IN (?)
            ORDER BY ti.transferencia_id, ti.id`, [ids]);
        const [custom] = await pool.query(`
            SELECT tic.transferencia_id, tic.descripcion, tic.unidad, tic.cantidad AS pedida
            FROM transferencia_items_custom tic
            WHERE tic.transferencia_id IN (?) AND tic.aprobado = 1
            ORDER BY tic.transferencia_id, tic.id`, [ids]);
        for (const r of [...items, ...custom]) {
            porTrf.get(r.transferencia_id)?.push({ descripcion: r.descripcion ?? null, unidad: r.unidad ?? null, pedida: num(r.pedida) });
        }
    }
    return {
        dias_limite: DIAS_ESTANCADA,
        total: num(tot?.n),
        lista: filas.map(f => ({
            id: f.id, codigo: f.codigo, solicitante_id: f.solicitante_id ?? null, solicitante: f.solicitante ?? null,
            cargo: f.cargo ?? null, destino: f.destino ?? null, origen: f.origen ?? null, fecha: f.fecha,
            dias: Math.max(0, Math.trunc(num(f.dias))), items: porTrf.get(f.id) || [],
        })),
    };
}

// ─────────────────────────── Quién aprueba ───────────────────────────

// Permiso efectivo (rol + grant − deny, como permisosService y transferencia.service inicioPerfil), sin el rol 1.
async function aprobadores() {
    const clave = 'inventario.transferencias.aprobar';
    const [filas] = await pool.query(`
        SELECT u.id, u.nombre FROM usuarios u
        WHERE u.activo = 1 AND u.rol_id <> 1
          AND NOT EXISTS (SELECT 1 FROM permisos_usuario_override o
                          WHERE o.usuario_id = u.id AND o.permiso_clave = ? AND o.tipo = 'deny')
          AND (EXISTS (SELECT 1 FROM permisos_rol_v2 pr WHERE pr.rol_id = u.rol_id AND pr.permiso_clave = ?)
               OR EXISTS (SELECT 1 FROM permisos_usuario_override o
                          WHERE o.usuario_id = u.id AND o.permiso_clave = ? AND o.tipo = 'grant'))
        ORDER BY u.nombre ASC
        LIMIT 10`, [clave, clave, clave]);
    return filas.map(u => ({ id: Number(u.id), nombre: u.nombre ?? null }));
}

// ─────────────────────────── Todo junto ───────────────────────────

async function getGerencia(permisos = []) {
    const hoy = hoyChile();
    const seguro = async (bloque, fn) => {
        try { return await fn(); } catch (err) {
            logger.error('[Inicio de gerencia] Error en un bloque', { bloque, err: err.message });
            return null;
        }
    };
    const verInventario = tiene(permisos, 'inventario.ver') && tiene(permisos, 'inventario.transferencias.ver_todas');
    const conValores = tiene(permisos, 'inventario.costos.ver') || tiene(permisos, 'inventario.resumen.ver_valores');

    // En secuencia, a propósito (10 conexiones en el hosting): cada bloque espera al anterior.
    const out = { hoy };
    out.faltas = tiene(permisos, 'asistencia.ver') ? await seguro('faltas', () => faltas(hoy)) : null;
    out.vehiculos = tiene(permisos, 'vehiculos.ver') ? await seguro('vehiculos', vehiculos) : null;
    const p = verInventario ? await seguro('perdidas', () => perdidas(conValores)) : null;
    out.perdidas = conValores ? p : sinValores(p);
    out.documentos = tiene(permisos, 'documentos.ver') ? await seguro('documentos', documentos) : null;
    out.papeles = tiene(permisos, 'documentos.ver') ? await seguro('papeles', papeles) : null;
    out.solicitudes = verInventario ? await seguro('solicitudes', solicitudes) : null;
    out.aprobadores = verInventario ? (await seguro('aprobadores', aprobadores)) ?? [] : [];
    return out;
}

module.exports = {
    getGerencia,
    _internal: { faltas, vehiculos, perdidas, documentos, papeles, solicitudes, aprobadores, sinValores, TOPE, DIAS_DOCUMENTOS },
};
