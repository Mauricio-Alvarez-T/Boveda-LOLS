/**
 * Resumen diario de Novedades — reporte por email de lo cargado el día anterior,
 * con aviso de lo que quedó PENDIENTE/faltante (para no llevarse sorpresas).
 *
 * Audiencia: operación/admin (no worker-facing). Compartido por el cron
 * (`scripts/avisos_diarios.js`) y el endpoint "enviar prueba".
 *
 * Fuente de datos:
 *   · Categorías con chequeo de completitud (trabajadores/vehiculos/obras): se
 *     consultan las TABLAS de cada entidad por `created_at` (da la fila para
 *     revisar lo que falta y la etiqueta real). Nota: logs_actividad no sirve
 *     para esto porque en los CREATE el item_id queda NULL.
 *   · Categorías sin chequeo (inventario, roles/permisos): se cuentan desde
 *     `logs_actividad` (igual que antes).
 *
 * Los chequeos "de lo que falta" se apoyan en lo que el sistema YA define como
 * obligatorio (tipos_documento.obligatorio) y en columnas existentes — no se
 * inventan criterios ni se crean estructuras nuevas. Mismo SQL/lógica que
 * documento.service.getFaltantes y vehiculos.service.getDocumentos, pero sobre
 * el `db` inyectado (para respetar el contrato y la testeabilidad de este service).
 *
 * NO crea ni cierra conexiones: recibe `db` inyectado. Reutiliza
 * `emailService.sendSystemEmail` (mismo canal que el reporte semanal).
 */
const emailService = require('./email.service');
const logger = require('../utils/logger-structured');

const MUESTRAS_MAX = 12; // máximo de items a listar por categoría en el correo
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Documentos esperados de un vehículo (categorías de vehiculo_documentos). El
// sistema no los marca "obligatorios", así que esta lista es el criterio elegido
// por el usuario para el aviso (editable acá).
const VEH_DOCS = [
    { key: 'permiso_circulacion', label: 'permiso de circulación' },
    { key: 'seguro_terceros', label: 'seguro contra terceros' },
    { key: 'primera_inscripcion', label: 'padrón / primera inscripción' },
    { key: 'poliza', label: 'póliza' },
];

// Categorías que se cuentan desde logs_actividad (sin chequeo de completitud).
const LOG_QUERY = {
    inventario: { modulos: ['items-inventario'], accion: 'CREATE' },
    roles_permisos: { modulos: ['roles'], accion: null },
};

// Categorías por defecto para el reporte COMPLETO (modo histórico), que no
// depende de la tabla de configuración `avisos_reglas`.
const DEFAULT_CATEGORIAS = [
    { categoria: 'trabajadores', etiqueta: 'Trabajadores', umbral: 1 },
    { categoria: 'vehiculos', etiqueta: 'Vehículos', umbral: 1 },
    { categoria: 'obras', etiqueta: 'Obras', umbral: 1 },
    { categoria: 'inventario', etiqueta: 'Inventario', umbral: 1 },
    { categoria: 'roles_permisos', etiqueta: 'Roles y permisos', umbral: 1 },
];

function pad2(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

/**
 * Ventana del resumen = el DÍA PREVIO completo respecto de `ref` (o de hoy).
 * Devuelve { desde, hasta, label } con `desde` inclusive y `hasta` exclusivo.
 * @param {string} [ref] 'YYYY-MM-DD' usado como "hoy" (la ventana será su día anterior).
 */
function getDiaPrevio(ref) {
    const hoy = ref ? new Date(`${ref}T00:00:00`) : new Date();
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const inicioAyer = new Date(inicioHoy);
    inicioAyer.setDate(inicioAyer.getDate() - 1);
    const d = inicioAyer;
    return {
        desde: `${ymd(inicioAyer)} 00:00:00`,
        hasta: `${ymd(inicioHoy)} 00:00:00`,
        label: `${pad2(d.getDate())} ${MESES[d.getMonth()]} ${d.getFullYear()}`,
    };
}

/**
 * Ventana del reporte COMPLETO = todo lo cargado HASTA HOY (inclusive).
 * Devuelve { desde (muy antiguo), hasta (inicio de mañana), label = hoy }.
 */
function getRangoHistorico(ref) {
    const hoy = ref ? new Date(`${ref}T00:00:00`) : new Date();
    const inicioManana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
    return {
        desde: '2000-01-01 00:00:00',
        hasta: `${ymd(inicioManana)} 00:00:00`,
        label: `${pad2(hoy.getDate())} ${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`,
    };
}

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Colectores por categoría ────────────────────────────────────────────────
// Cada uno devuelve { count, items:[{label, sub?, faltantes:[texto]}] }.

/** Trabajadores creados ayer: campos clave vacíos + documentos obligatorios faltantes. */
async function collectTrabajadores(db, rango) {
    const [rows] = await db.query(
        `SELECT id, nombres, apellido_paterno, apellido_materno, rut, cargo_id, obra_id, empresa_id
         FROM trabajadores
         WHERE created_at >= ? AND created_at < ? AND es_prueba = 0
         ORDER BY created_at ASC`,
        [rango.desde, rango.hasta]
    );
    if (rows.length === 0) return { count: 0, items: [] };

    // Documentos obligatorios faltantes de estos trabajadores (misma lógica que
    // documento.service.getFaltantes, acotada a los ids nuevos).
    const ids = rows.map(r => r.id);
    const faltanDocs = {}; // { trabajador_id: nº de documentos obligatorios pendientes }
    try {
        const ph = ids.map(() => '?').join(',');
        const [docRows] = await db.query(
            `SELECT t.id AS trabajador_id, COUNT(*) AS faltan
             FROM trabajadores t
             CROSS JOIN tipos_documento td
             LEFT JOIN documentos d ON d.trabajador_id = t.id AND d.tipo_documento_id = td.id AND d.activo = 1
             WHERE t.id IN (${ph}) AND td.obligatorio = 1 AND td.activo = 1 AND d.id IS NULL
             GROUP BY t.id`,
            ids
        );
        for (const r of docRows) faltanDocs[r.trabajador_id] = Number(r.faltan);
    } catch (err) {
        logger.warn('No se pudo calcular documentos obligatorios faltantes', { err: err.message });
    }

    const items = rows.map(t => {
        const faltantes = [];
        if (t.cargo_id == null) faltantes.push('sin cargo');
        if (t.obra_id == null) faltantes.push('sin obra');
        if (t.empresa_id == null) faltantes.push('sin empresa');
        const n = faltanDocs[t.id] || 0;
        if (n > 0) faltantes.push(`${n} documento(s) obligatorio(s) pendiente(s)`);
        return {
            label: [t.nombres, t.apellido_paterno, t.apellido_materno].filter(Boolean).join(' '),
            sub: t.rut || null,
            faltantes,
        };
    });
    return { count: rows.length, items };
}

/** Vehículos creados ayer: documentos esperados que no se cargaron. */
async function collectVehiculos(db, rango) {
    const [rows] = await db.query(
        `SELECT id, patente, marca, modelo
         FROM vehiculos
         WHERE created_at >= ? AND created_at < ?
         ORDER BY created_at ASC`,
        [rango.desde, rango.hasta]
    );
    if (rows.length === 0) return { count: 0, items: [] };

    const ids = rows.map(r => r.id);
    const docsPorVeh = {}; // { vehiculo_id: Set(categorias presentes) }
    try {
        const ph = ids.map(() => '?').join(',');
        const [docRows] = await db.query(
            `SELECT vehiculo_id, categoria FROM vehiculo_documentos
             WHERE vehiculo_id IN (${ph}) AND activo = 1`,
            ids
        );
        for (const r of docRows) (docsPorVeh[r.vehiculo_id] ||= new Set()).add(r.categoria);
    } catch (err) {
        logger.warn('No se pudieron leer documentos de vehículos', { err: err.message });
    }

    const items = rows.map(v => {
        const presentes = docsPorVeh[v.id] || new Set();
        const faltantes = VEH_DOCS.filter(d => !presentes.has(d.key)).map(d => `falta ${d.label}`);
        return {
            label: `${v.patente} · ${v.marca} ${v.modelo}`.trim(),
            sub: null,
            faltantes,
        };
    });
    return { count: rows.length, items };
}

/** Obras creadas ayer: datos importantes vacíos. */
async function collectObras(db, rango) {
    const [rows] = await db.query(
        `SELECT id, nombre, direccion, encargado_nombre, fecha_inicio
         FROM obras
         WHERE created_at >= ? AND created_at < ? AND es_prueba = 0
         ORDER BY created_at ASC`,
        [rango.desde, rango.hasta]
    );
    const items = rows.map(o => {
        const faltantes = [];
        if (o.direccion == null || o.direccion === '') faltantes.push('sin dirección');
        if (o.encargado_nombre == null || o.encargado_nombre === '') faltantes.push('sin encargado');
        if (o.fecha_inicio == null) faltantes.push('sin fecha de inicio');
        return { label: o.nombre, sub: null, faltantes };
    });
    return { count: rows.length, items };
}

/** Categorías sin chequeo: se cuentan desde logs_actividad (label + usuario). */
async function collectFromLogs(db, rango, { modulos, accion }) {
    const where = ['l.created_at >= ?', 'l.created_at < ?', `l.modulo IN (${modulos.map(() => '?').join(',')})`];
    const params = [rango.desde, rango.hasta, ...modulos];
    if (accion) { where.push('l.accion = ?'); params.push(accion); }
    const [rows] = await db.query(
        `SELECT l.entidad_label, u.nombre AS usuario
         FROM logs_actividad l
         LEFT JOIN usuarios u ON u.id = l.usuario_id
         WHERE ${where.join(' AND ')}
         ORDER BY l.created_at ASC`,
        params
    );
    return {
        count: rows.length,
        items: rows.map(r => ({ label: r.entidad_label || '—', sub: r.usuario || 'Sistema', faltantes: [] })),
    };
}

const COLLECTORS = {
    trabajadores: collectTrabajadores,
    vehiculos: collectVehiculos,
    obras: collectObras,
};

/**
 * Construye el resumen del día previo. Por cada categoría activa (avisos_reglas)
 * consulta sus registros nuevos y arma los faltantes. Una categoría se incluye si
 * count >= umbral  O  hay al menos un registro con pendientes (para que lo
 * pendiente siempre aflore aunque sea poco volumen).
 * @returns {Promise<{rango, categorias: Array<{key,etiqueta,count,conFaltantes,items}>, total}>}
 */
async function construirResumen(db, rango, { reglas = null, modo = 'diario' } = {}) {
    if (!reglas) {
        try {
            const [rows] = await db.query('SELECT categoria, etiqueta, umbral FROM avisos_reglas WHERE activo = 1 ORDER BY orden ASC, id ASC');
            reglas = rows;
        } catch (err) {
            if (err && err.errno === 1146) { // tabla aún no existe
                if (modo === 'historico') {
                    reglas = DEFAULT_CATEGORIAS; // el reporte completo no depende de la config
                } else {
                    logger.warn('Tabla avisos_reglas no existe todavía — resumen vacío.');
                    return { rango, categorias: [], total: 0, modo };
                }
            } else throw err;
        }
    }

    const categorias = [];
    let total = 0;

    for (const regla of reglas) {
        const collector = COLLECTORS[regla.categoria];
        const logCfg = LOG_QUERY[regla.categoria];
        if (!collector && !logCfg) continue; // categoría sin lógica definida

        const { count, items } = collector
            ? await collector(db, rango)
            : await collectFromLogs(db, rango, logCfg);

        if (count === 0) continue;

        const conFaltantes = items.filter(it => it.faltantes.length > 0).length;
        const umbral = regla.umbral || 1;
        if (count < umbral && conFaltantes === 0) continue; // no cruza umbral y nada pendiente

        categorias.push({
            key: regla.categoria,
            etiqueta: regla.etiqueta,
            count,
            conFaltantes,
            items: items.slice(0, MUESTRAS_MAX),
        });
        total += count;
    }

    return { rango, categorias, total, modo };
}

// ── Render ──────────────────────────────────────────────────────────────────

function renderHtml({ rango, categorias, total, modo = 'diario' }) {
    const historico = modo === 'historico';
    const unidad = historico ? 'registros' : 'novedades';
    const fechaLabel = historico ? `al ${rango.label}` : rango.label;
    const pie = historico
        ? 'Reporte de los datos cargados hasta hoy. ⚠ marca lo que quedó pendiente por cargar.'
        : 'Reporte automático del día anterior. ⚠ marca lo que quedó pendiente por cargar. Se configura en Configuración → Sistema → Avisos.';
    const secciones = categorias.map(c => {
        const filas = c.items.map(it => {
            const pend = it.faltantes.length
                ? `<div style="margin-top:3px;font-size:12px;color:#b91c1c">⚠ ${esc(it.faltantes.join(' · '))}</div>` : '';
            return `
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;vertical-align:top">
                <span style="font-size:13px;font-weight:700;color:#111827">${esc(it.label)}</span>
                ${it.sub ? `<span style="font-size:11px;color:#9ca3af"> · ${esc(it.sub)}</span>` : ''}
                ${pend}
              </td>
            </tr>`;
        }).join('');
        const extra = c.count > c.items.length
            ? `<div style="padding:6px 12px;font-size:11px;color:#9ca3af">…y ${c.count - c.items.length} más</div>` : '';
        const badge = c.conFaltantes > 0
            ? `<span style="float:right;font-size:12px;font-weight:800;color:#b91c1c">${c.conFaltantes} con pendientes · ${c.count}</span>`
            : `<span style="float:right;font-size:13px;font-weight:800;color:#065f46">${c.count}</span>`;
        return `
        <tr><td style="padding:16px 28px 0">
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
            <div style="padding:10px 12px;background:#ecfdf5;border-bottom:1px solid #e5e7eb">
              <span style="font-size:14px;font-weight:800;color:#065f46">${esc(c.etiqueta)}</span>
              ${badge}
            </div>
            <table width="100%" cellpadding="0" cellspacing="0">${filas}</table>
            ${extra}
          </div>
        </td></tr>`;
    }).join('');

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:24px 16px"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.10)">
      <tr><td style="background:#1a7a3f;padding:24px 28px;text-align:center">
        <p style="margin:0 0 6px;font-size:11px;color:#bbf7d0;letter-spacing:2px;text-transform:uppercase;font-weight:700">Bóveda LOLS — Resumen de Novedades</p>
        <p style="margin:0;font-size:22px;color:#ffffff;font-weight:900">${total} ${unidad} · ${esc(fechaLabel)}</p>
      </td></tr>
      ${secciones}
      <tr><td style="padding:18px 28px 24px;border-top:1px solid #f3f4f6">
        <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">${pie}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function renderText({ rango, categorias, total, modo = 'diario' }) {
    const historico = modo === 'historico';
    const lines = [`${historico ? 'Reporte de datos al' : 'Resumen de Novedades —'} ${rango.label} (${total} ${historico ? 'registros' : 'novedades'})`, ''];
    for (const c of categorias) {
        lines.push(`• ${c.etiqueta}: ${c.count}${c.conFaltantes ? ` (${c.conFaltantes} con pendientes)` : ''}`);
        for (const it of c.items) {
            const pend = it.faltantes.length ? ` — ⚠ ${it.faltantes.join(' · ')}` : '';
            lines.push(`   - ${it.label}${it.sub ? ` (${it.sub})` : ''}${pend}`);
        }
        if (c.count > c.items.length) lines.push(`   …y ${c.count - c.items.length} más`);
    }
    return lines.join('\n');
}

/** Destinatarios: `to` explícito > tabla avisos_suscriptores (activo=1) > env AVISOS_TO/REPORTE_TO. */
async function resolveRecipients(db, cliTo) {
    if (cliTo) {
        const arr = Array.isArray(cliTo) ? cliTo : String(cliTo).split(',');
        return arr.map(s => String(s).trim()).filter(Boolean);
    }
    try {
        const [rows] = await db.query('SELECT email FROM avisos_suscriptores WHERE activo = 1 ORDER BY email');
        const emails = rows.map(r => r.email).filter(Boolean);
        if (emails.length) return emails;
    } catch (err) {
        if (err && err.errno !== 1146) throw err;
        logger.warn('Tabla avisos_suscriptores no existe todavía — usando env.');
    }
    return (process.env.AVISOS_TO || process.env.REPORTE_TO || '').split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Orquesta el resumen diario. Si no hay novedades, NO envía (evita correos vacíos),
 * salvo dry (preview) o forzar (prueba).
 */
async function enviarResumen({ db, to = null, fecha = null, dry = false, forzar = false, historico = false } = {}) {
    const rango = historico ? getRangoHistorico(fecha || undefined) : getDiaPrevio(fecha || undefined);
    const resumen = await construirResumen(db, rango, { modo: historico ? 'historico' : 'diario' });
    const subject = historico ? `Reporte de datos — al ${rango.label}` : `Resumen de Novedades — ${rango.label}`;
    const html = renderHtml(resumen);
    const text = renderText(resumen);

    if (dry) return { dry: true, html, text, subject, resumen };

    // Un reporte completo solicitado se envía aunque esté vacío (igual que forzar).
    if (resumen.total === 0 && !forzar && !historico) {
        return { sent: false, reason: 'sin-novedades', resumen };
    }

    const recipients = await resolveRecipients(db, to);
    if (!recipients.length) {
        throw Object.assign(new Error('Sin destinatarios: define suscriptores activos, AVISOS_TO/REPORTE_TO, o pasa "to".'), { statusCode: 400 });
    }

    const res = await emailService.sendSystemEmail({ to: recipients, subject, html, text, fromName: 'Bóveda LOLS — Novedades' });
    return {
        sent: true,
        subject,
        recipients,
        total: resumen.total,
        messageId: res.messageId,
        accepted: res.accepted || [],
        rejected: res.rejected || [],
    };
}

module.exports = {
    getDiaPrevio,
    getRangoHistorico,
    construirResumen,
    resolveRecipients,
    enviarResumen,
    renderHtml,
    renderText,
    _internals: { COLLECTORS, VEH_DOCS, LOG_QUERY, DEFAULT_CATEGORIAS, esc, ymd },
};
