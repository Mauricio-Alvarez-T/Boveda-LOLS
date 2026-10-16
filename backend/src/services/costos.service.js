const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const logger = require('../utils/logger-structured');

/**
 * Costos de obra (mig 122, docs/reglas/costos.md) — ESQUELETO pedido por Rodrigo
 * (número dos de LOLS) para él, don Luis y el arquitecto: presupuesto por partidas,
 * gastos con foto de la factura e historial de cada cambio. Hoy lo llevan a mano o
 * de memoria; el objetivo de esta primera versión es que nada se pierda.
 *
 * Cuentas del presupuesto (formato chileno):
 *   costo directo (CD) = Σ cantidad × precio unitario de las partidas
 *   gastos generales  = CD × gg%        imprevistos = CD × imp%
 *   costo presupuestado = CD + GG + imprevistos   ← contra esto se compara lo gastado
 *   utilidad = costo presupuestado × util%        neto = costo + utilidad
 *   IVA = neto × iva%                             total = neto + IVA
 *
 * Lo gastado se compara en NETO, como el presupuesto: de una factura cuenta el neto
 * (el IVA es crédito fiscal); si solo se cargó el total, se estima total / 1,19 y se
 * avisa. De una boleta, guía u otro documento cuenta el total: ese IVA no se recupera.
 */

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

const TIPOS_DOC = ['factura', 'boleta', 'guia', 'otro'];
const CATEGORIAS = ['materiales', 'mano_obra', 'maquinaria', 'subcontrato', 'combustible', 'gastos_generales', 'otro'];
const ESTADOS_PAGO = ['por_pagar', 'pagada'];
const MAX_IMPORTAR = 3000;

const err = (statusCode, message, extra = {}) => Object.assign(new Error(message), { statusCode, ...extra });

/** Número desde JSON o multipart ("1.234,5" o "1234.5"); '' → valor por defecto; basura → NaN. */
function num(v, porDefecto = null) {
    if (v === undefined || v === null || v === '') return porDefecto;
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    let s = String(v).trim().replace(/\$/g, '').replace(/\s/g, '');
    if (!s) return porDefecto;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');   // formato chileno 1.234,5
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "45.000" / "1.500.000" = miles
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
}
const texto = (v, max) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s ? s.slice(0, max) : null;
};
const fechaISO = v => (v && /^\d{4}-\d{2}-\d{2}$/.test(String(v).slice(0, 10)) ? String(v).slice(0, 10) : null);
/** Fecha local AAAA-MM-DD. mysql2 entrega las columnas DATE como Date a medianoche LOCAL del
 *  servidor, así que se leen con los getters locales (toISOString las corre a UTC y puede
 *  mostrar el día anterior). */
const ymd = (v) => {
    if (!v) return null;
    if (!(v instanceof Date)) return String(v).slice(0, 10);
    const dos = n => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${dos(v.getMonth() + 1)}-${dos(v.getDate())}`;
};
const hoy = () => ymd(new Date());

/** SQL del neto de un gasto (alias g). Mismo criterio que `netoDeGasto`. */
const SQL_NETO = `CASE WHEN g.monto_neto IS NOT NULL THEN g.monto_neto
                       WHEN g.tipo_documento = 'factura' THEN ROUND(g.monto_total / 1.19)
                       ELSE g.monto_total END`;

function netoDeGasto(g) {
    if (g.monto_neto !== null && g.monto_neto !== undefined) return { neto: Number(g.monto_neto), estimado: false };
    const total = Number(g.monto_total) || 0;
    if (g.tipo_documento === 'factura') return { neto: Math.round(total / 1.19), estimado: true };
    return { neto: total, estimado: false };
}

/** Totales del presupuesto a partir de los porcentajes y las partidas. */
function calcularTotales(pres, partidas) {
    const pct = v => (Number(v) || 0) / 100;
    let cd = 0, cdOriginal = 0, cdModif = 0;
    for (const p of partidas) {
        const t = Math.round((Number(p.cantidad) || 0) * (Number(p.precio_unitario) || 0));
        cd += t;
        if (p.origen === 'modificacion') cdModif += t; else cdOriginal += t;
    }
    const gg = Math.round(cd * pct(pres?.gg_pct));
    const imp = Math.round(cd * pct(pres?.imprevistos_pct));
    const costo = cd + gg + imp;
    const util = Math.round(costo * pct(pres?.utilidad_pct));
    const neto = costo + util;
    const iva = Math.round(neto * pct(pres?.iva_pct ?? 19));
    return {
        costo_directo: cd, costo_directo_original: cdOriginal, costo_directo_modificaciones: cdModif,
        gastos_generales: gg, imprevistos: imp, costo_presupuestado: costo,
        utilidad: util, neto, iva, total: neto + iva,
    };
}

async function registrar(conn, { obra_id, entidad, entidad_id = null, accion, resumen, detalle = null, usuario_id = null }) {
    try {
        await (conn || db).query(
            `INSERT INTO costo_historial (obra_id, entidad, entidad_id, accion, resumen, detalle, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [obra_id, entidad, entidad_id, accion, String(resumen).slice(0, 500), detalle ? JSON.stringify(detalle) : null, usuario_id]
        );
    } catch (e) {
        // El historial no puede tumbar una operación ya hecha, pero tiene que quedar a la vista en el log.
        logger.error('No se pudo registrar el historial de costos', { err: e.message, obra_id, entidad, entidad_id });
    }
}

/**
 * Solo los campos que cambiaron, como { campo: [antes, después] }. Lo de la BD llega
 * con otro tipo que lo validado: DECIMAL como texto ("45000.00" vs 45000) y DATE como
 * Date; sin normalizar, cada edición anotaría cambios que no hubo.
 */
function diferencias(antes, despues, campos) {
    const d = {};
    for (const c of campos) {
        if (despues[c] === undefined) continue;
        const a = antes[c] === undefined ? null : antes[c] instanceof Date ? ymd(antes[c]) : antes[c];
        const b = despues[c];
        const iguales = typeof b === 'number' && a !== null && a !== '' && Number.isFinite(Number(a))
            ? Number(a) === b
            : String(a ?? '') === String(b ?? '');
        if (!iguales) d[c] = [a, b];
    }
    return d;
}

const sinRuta = ({ foto_ruta, ...g }) => ({
    ...g, fecha: ymd(g.fecha), fecha_vencimiento: ymd(g.fecha_vencimiento), fecha_pago: ymd(g.fecha_pago),
    tiene_foto: !!foto_ruta,
});

async function obraOFalla(obraId) {
    const [[obra]] = await db.query('SELECT id, nombre, finalizada FROM obras WHERE id = ?', [obraId]);
    if (!obra) throw err(404, 'Obra no encontrada');
    return obra;
}

async function presupuestoDe(obraId, { crear = false, userId = null } = {}) {
    const [[pres]] = await db.query('SELECT * FROM costo_presupuestos WHERE obra_id = ?', [obraId]);
    if (pres || !crear) return pres || null;
    const [r] = await db.query(
        'INSERT INTO costo_presupuestos (obra_id, gg_pct, imprevistos_pct, utilidad_pct, iva_pct, creado_por) VALUES (?, 0, 0, 0, 19, ?)',
        [obraId, userId]
    );
    return { id: r.insertId, obra_id: obraId, gg_pct: 0, imprevistos_pct: 0, utilidad_pct: 0, iva_pct: 19 };
}

/** Valida y normaliza una partida (alta, edición o importación). `parcial` = edición. */
function leerPartida(data, { parcial = false } = {}) {
    const p = {};
    if (!parcial || data.descripcion !== undefined) {
        p.descripcion = texto(data.descripcion, 300);
        if (!p.descripcion) throw err(400, 'La partida necesita una descripción.', { code: 'COSTO_PARTIDA_SIN_DESCRIPCION' });
    }
    if (!parcial || data.capitulo !== undefined) p.capitulo = texto(data.capitulo, 150) || 'General';
    if (!parcial || data.codigo !== undefined) p.codigo = texto(data.codigo, 30);
    if (!parcial || data.unidad !== undefined) p.unidad = texto(data.unidad, 20);
    for (const campo of ['cantidad', 'precio_unitario']) {
        if (parcial && data[campo] === undefined) continue;
        const n = num(data[campo], 0);
        if (Number.isNaN(n)) throw err(400, `"${campo === 'cantidad' ? 'Cantidad' : 'Precio unitario'}" tiene que ser un número.`, { code: 'COSTO_NUMERO' });
        if (campo === 'precio_unitario' && n < 0) throw err(400, 'El precio unitario no puede ser negativo.', { code: 'COSTO_NUMERO' });
        p[campo] = n;
    }
    if (!parcial || data.origen !== undefined) {
        p.origen = data.origen === 'modificacion' ? 'modificacion' : 'original';
    }
    if (!parcial || data.motivo !== undefined) p.motivo = texto(data.motivo, 300);
    return p;
}

/** Valida y normaliza un gasto. Llega por multipart (strings) o JSON. */
function leerGasto(data, { parcial = false } = {}) {
    const g = {};
    if (!parcial || data.monto_total !== undefined) {
        const t = num(data.monto_total);
        if (t === null || Number.isNaN(t) || t <= 0) throw err(400, 'El monto total tiene que ser un número mayor que cero.', { code: 'COSTO_GASTO_MONTO' });
        g.monto_total = t;
    }
    for (const campo of ['monto_neto', 'iva']) {
        if (data[campo] === undefined) continue;
        const n = num(data[campo]);
        if (Number.isNaN(n) || (n !== null && n < 0)) throw err(400, `"${campo === 'iva' ? 'IVA' : 'Neto'}" tiene que ser un número.`, { code: 'COSTO_NUMERO' });
        g[campo] = n;
    }
    if (!parcial || data.fecha !== undefined) {
        g.fecha = fechaISO(data.fecha) || (parcial ? null : hoy());
        if (!g.fecha) throw err(400, 'La fecha tiene que ser AAAA-MM-DD.', { code: 'COSTO_FECHA' });
    }
    if (!parcial || data.tipo_documento !== undefined) {
        g.tipo_documento = TIPOS_DOC.includes(data.tipo_documento) ? data.tipo_documento : 'factura';
    }
    if (data.categoria !== undefined) {
        if (data.categoria && !CATEGORIAS.includes(data.categoria)) throw err(400, 'Categoría no válida.', { code: 'COSTO_CATEGORIA' });
        g.categoria = data.categoria || null;
    }
    if (data.estado_pago !== undefined) {
        g.estado_pago = ESTADOS_PAGO.includes(data.estado_pago) ? data.estado_pago : 'por_pagar';
    }
    if (data.proveedor !== undefined) g.proveedor = texto(data.proveedor, 200);
    if (data.folio !== undefined) g.folio = texto(data.folio, 40);
    if (data.observacion !== undefined) g.observacion = texto(data.observacion, 500);
    if (data.fecha_vencimiento !== undefined) g.fecha_vencimiento = fechaISO(data.fecha_vencimiento);
    if (data.fecha_pago !== undefined) g.fecha_pago = fechaISO(data.fecha_pago);
    if (data.partida_id !== undefined) {
        const id = num(data.partida_id);
        g.partida_id = id && !Number.isNaN(id) ? Math.trunc(id) : null;
    }
    return g;
}

/** La partida tiene que ser del presupuesto de la misma obra. */
async function verificarPartidaDeObra(partidaId, obraId) {
    if (!partidaId) return;
    const [[p]] = await db.query(
        `SELECT cp.id FROM costo_partidas cp JOIN costo_presupuestos pr ON pr.id = cp.presupuesto_id
          WHERE cp.id = ? AND pr.obra_id = ?`, [partidaId, obraId]
    );
    if (!p) throw err(400, 'La partida elegida no es de esta obra.', { code: 'COSTO_PARTIDA_AJENA' });
}

function borrarArchivo(ruta) {
    if (!ruta) return;
    try { fs.unlinkSync(path.join(UPLOADS_DIR, ruta)); } catch { /* ya no estaba */ }
}

module.exports = {
    TIPOS_DOC, CATEGORIAS, ESTADOS_PAGO, MAX_IMPORTAR,
    calcularTotales, netoDeGasto, num,

    /**
     * Obras AGREGADAS al módulo (tienen presupuesto creado o algún gasto), con su resumen corto.
     * No se listan todas las obras: OFICINA, LICENCIA o LOLS GENERAL no son obras con presupuesto
     * (Marcos, 16-10). Se agregan con `agregarObra`.
     */
    async listarObras() {
        const [rows] = await db.query(
            `SELECT o.id AS obra_id, o.nombre AS obra_nombre, o.finalizada,
                    p.id AS presupuesto_id, p.gg_pct, p.imprevistos_pct, p.utilidad_pct, p.iva_pct,
                    COALESCE(pt.costo_directo, 0) AS costo_directo, COALESCE(pt.partidas, 0) AS partidas,
                    COALESCE(gt.gastado_neto, 0) AS gastado_neto, COALESCE(gt.gastos, 0) AS gastos,
                    COALESCE(gt.por_completar, 0) AS por_completar, COALESCE(gt.por_pagar, 0) AS por_pagar
               FROM obras o
               LEFT JOIN costo_presupuestos p ON p.obra_id = o.id
               LEFT JOIN (SELECT presupuesto_id, SUM(ROUND(cantidad * precio_unitario)) AS costo_directo, COUNT(*) AS partidas
                            FROM costo_partidas GROUP BY presupuesto_id) pt ON pt.presupuesto_id = p.id
               LEFT JOIN (SELECT g.obra_id, SUM(${SQL_NETO}) AS gastado_neto, COUNT(*) AS gastos,
                                 SUM(g.proveedor IS NULL OR (g.partida_id IS NULL AND g.categoria IS NULL)) AS por_completar,
                                 SUM(CASE WHEN g.estado_pago = 'por_pagar' THEN g.monto_total ELSE 0 END) AS por_pagar
                            FROM costo_gastos g GROUP BY g.obra_id) gt ON gt.obra_id = o.id
              WHERE o.es_prueba = 0 AND (o.activa = 1 OR o.finalizada = 1)
                AND (p.id IS NOT NULL OR gt.gastos > 0)
              ORDER BY o.finalizada ASC, o.nombre ASC`
        );
        return rows.map(r => {
            const pct = v => (Number(v) || 0) / 100;
            const cd = Number(r.costo_directo) || 0;
            const costo = cd + Math.round(cd * pct(r.gg_pct)) + Math.round(cd * pct(r.imprevistos_pct));
            return {
                obra_id: r.obra_id, obra_nombre: r.obra_nombre, finalizada: !!r.finalizada,
                tiene_presupuesto: !!r.presupuesto_id && Number(r.partidas) > 0,
                partidas: Number(r.partidas) || 0,
                costo_presupuestado: costo,
                gastado_neto: Number(r.gastado_neto) || 0,
                gastos: Number(r.gastos) || 0,
                por_completar: Number(r.por_completar) || 0,
                por_pagar: Number(r.por_pagar) || 0,
            };
        });
    },

    /** Obras que se pueden agregar: vigentes o finalizadas, reales, que aún no están en el módulo. */
    async obrasDisponibles() {
        const [rows] = await db.query(
            `SELECT o.id, o.nombre, o.finalizada
               FROM obras o
               LEFT JOIN costo_presupuestos p ON p.obra_id = o.id
              WHERE o.es_prueba = 0 AND (o.activa = 1 OR o.finalizada = 1) AND p.id IS NULL
                AND NOT EXISTS (SELECT 1 FROM costo_gastos g WHERE g.obra_id = o.id)
              ORDER BY o.finalizada ASC, o.nombre ASC`
        );
        return rows.map(r => ({ id: r.id, nombre: r.nombre, finalizada: !!r.finalizada }));
    },

    /** Agrega una obra al módulo (le crea el presupuesto vacío). Si ya estaba, no hace nada. */
    async agregarObra(obraId, userId) {
        const obra = await obraOFalla(obraId);
        const antes = await presupuestoDe(obraId);
        if (antes) return { obra_id: obraId, ya_estaba: true };
        const pres = await presupuestoDe(obraId, { crear: true, userId });
        await registrar(null, { obra_id: obraId, entidad: 'presupuesto', entidad_id: pres.id, accion: 'crear',
            resumen: `Agregó la obra ${obra.nombre} a Presupuestos`, usuario_id: userId });
        return { obra_id: obraId };
    },

    /**
     * Quita una obra del módulo, solo si está vacía (sin partidas ni gastos): sirve para deshacer
     * un "Agregar" equivocado sin poder borrar información por esta vía.
     */
    async quitarObra(obraId, userId) {
        const obra = await obraOFalla(obraId);
        const pres = await presupuestoDe(obraId);
        const [[c]] = await db.query(
            `SELECT (SELECT COUNT(*) FROM costo_partidas WHERE presupuesto_id = ?) AS partidas,
                    (SELECT COUNT(*) FROM costo_gastos WHERE obra_id = ?) AS gastos`, [pres?.id || 0, obraId]
        );
        if (Number(c?.partidas) || Number(c?.gastos)) {
            throw err(409, `No se puede quitar: la obra tiene ${Number(c.partidas)} partida${Number(c.partidas) === 1 ? '' : 's'} y ${Number(c.gastos)} gasto${Number(c.gastos) === 1 ? '' : 's'}. Bórralos primero si de verdad no van.`, { code: 'COSTO_OBRA_CON_DATOS' });
        }
        if (pres) await db.query('DELETE FROM costo_presupuestos WHERE id = ?', [pres.id]);
        await registrar(null, { obra_id: obraId, entidad: 'presupuesto', entidad_id: pres?.id || null, accion: 'borrar',
            resumen: `Quitó la obra ${obra.nombre} de Presupuestos`, usuario_id: userId });
        return { obra_id: obraId };
    },

    /** Todo lo de una obra: presupuesto, partidas con lo gastado, gastos y el resumen. */
    async detalleObra(obraId) {
        const obra = await obraOFalla(obraId);
        const pres = await presupuestoDe(obraId);
        const [partidas] = pres
            ? await db.query('SELECT * FROM costo_partidas WHERE presupuesto_id = ? ORDER BY orden, id', [pres.id])
            : [[]];
        const [gastos] = await db.query(
            `SELECT g.*, cp.descripcion AS partida_descripcion, cp.capitulo AS partida_capitulo, u.nombre AS creado_por_nombre
               FROM costo_gastos g
               LEFT JOIN costo_partidas cp ON cp.id = g.partida_id
               LEFT JOIN usuarios u ON u.id = g.creado_por
              WHERE g.obra_id = ?
              ORDER BY g.fecha DESC, g.id DESC`, [obraId]
        );

        const totales = calcularTotales(pres, partidas);
        const gastadoPorPartida = new Map();
        let gastado = 0, estimado = false, gg = 0, sinAsignar = 0, porCompletar = 0;
        let porPagarN = 0, porPagarMonto = 0, vencidasN = 0, vencidasMonto = 0;
        const hoyStr = hoy();
        for (const g of gastos) {
            const { neto, estimado: est } = netoDeGasto(g);
            gastado += neto;
            if (est) estimado = true;
            if (g.partida_id) gastadoPorPartida.set(g.partida_id, (gastadoPorPartida.get(g.partida_id) || 0) + neto);
            else if (g.categoria === 'gastos_generales') gg += neto;
            else sinAsignar += neto;
            if (!g.proveedor || (!g.partida_id && !g.categoria)) porCompletar++;
            if (g.estado_pago === 'por_pagar') {
                porPagarN++; porPagarMonto += Number(g.monto_total) || 0;
                const venc = ymd(g.fecha_vencimiento);
                if (venc && venc < hoyStr) { vencidasN++; vencidasMonto += Number(g.monto_total) || 0; }
            }
        }

        const conGasto = partidas.map(p => {
            const presupuestado = Math.round((Number(p.cantidad) || 0) * (Number(p.precio_unitario) || 0));
            const g = gastadoPorPartida.get(p.id) || 0;
            return { ...p, total: presupuestado, gastado: g, diferencia: presupuestado - g };
        });
        const capitulos = [];
        const porCap = new Map();
        for (const p of conGasto) {
            if (!porCap.has(p.capitulo)) { porCap.set(p.capitulo, { capitulo: p.capitulo, presupuestado: 0, gastado: 0, partidas: 0 }); capitulos.push(porCap.get(p.capitulo)); }
            const c = porCap.get(p.capitulo);
            c.presupuestado += p.total; c.gastado += p.gastado; c.partidas++;
        }

        return {
            obra: { id: obra.id, nombre: obra.nombre, finalizada: !!obra.finalizada },
            presupuesto: pres,
            partidas: conGasto,
            gastos: gastos.map(sinRuta),
            resumen: {
                ...totales,
                gastado_neto: gastado,
                gastado_estimado: estimado,
                disponible: totales.costo_presupuestado - gastado,
                pct_gastado: totales.costo_presupuestado > 0 ? Math.round((gastado / totales.costo_presupuestado) * 1000) / 10 : null,
                gastos_generales_gastado: gg,
                sin_asignar: sinAsignar,
                por_completar: porCompletar,
                por_pagar: { n: porPagarN, monto: porPagarMonto },
                vencidas: { n: vencidasN, monto: vencidasMonto },
                capitulos,
                partidas_excedidas: conGasto.filter(p => p.gastado > p.total).sort((a, b) => (b.gastado - b.total) - (a.gastado - a.total)).slice(0, 10)
                    .map(p => ({ id: p.id, capitulo: p.capitulo, descripcion: p.descripcion, presupuestado: p.total, gastado: p.gastado })),
            },
        };
    },

    /** Porcentajes del presupuesto (crea el presupuesto si la obra no tenía). */
    async guardarPresupuesto(obraId, data, userId) {
        await obraOFalla(obraId);
        const pres = await presupuestoDe(obraId, { crear: true, userId });
        const nuevo = {};
        for (const c of ['gg_pct', 'imprevistos_pct', 'utilidad_pct', 'iva_pct']) {
            if (data[c] === undefined) continue;
            const n = num(data[c], 0);
            if (Number.isNaN(n) || n < 0 || n > 100) throw err(400, 'Los porcentajes van de 0 a 100.', { code: 'COSTO_PORCENTAJE' });
            nuevo[c] = n;
        }
        if (data.observacion !== undefined) nuevo.observacion = texto(data.observacion, 500);
        const cambios = diferencias(pres, nuevo, Object.keys(nuevo));
        if (Object.keys(cambios).length) {
            const sets = Object.keys(nuevo).map(c => `${c} = ?`).join(', ');
            await db.query(`UPDATE costo_presupuestos SET ${sets}, actualizado_por = ? WHERE id = ?`, [...Object.values(nuevo), userId, pres.id]);
            await registrar(null, { obra_id: obraId, entidad: 'presupuesto', entidad_id: pres.id, accion: 'editar',
                resumen: 'Cambió los porcentajes del presupuesto', detalle: cambios, usuario_id: userId });
        }
        return this.detalleObra(obraId);
    },

    async crearPartida(obraId, data, userId) {
        await obraOFalla(obraId);
        const p = leerPartida(data);
        const pres = await presupuestoDe(obraId, { crear: true, userId });
        const [[m]] = await db.query('SELECT COALESCE(MAX(orden), 0) AS m FROM costo_partidas WHERE presupuesto_id = ?', [pres.id]);
        const [r] = await db.query(
            `INSERT INTO costo_partidas (presupuesto_id, capitulo, codigo, descripcion, unidad, cantidad, precio_unitario, origen, motivo, orden, creado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [pres.id, p.capitulo, p.codigo, p.descripcion, p.unidad, p.cantidad, p.precio_unitario, p.origen, p.motivo, (Number(m?.m) || 0) + 1, userId]
        );
        await registrar(null, { obra_id: obraId, entidad: 'partida', entidad_id: r.insertId, accion: 'crear',
            resumen: `${p.origen === 'modificacion' ? 'Agregó una modificación' : 'Agregó la partida'}: ${p.descripcion}${p.motivo ? ` (${p.motivo})` : ''}`,
            detalle: { ...p, total: Math.round(p.cantidad * p.precio_unitario) }, usuario_id: userId });
        return { id: r.insertId };
    },

    async editarPartida(id, data, userId) {
        const [[actual]] = await db.query(
            `SELECT cp.*, pr.obra_id FROM costo_partidas cp JOIN costo_presupuestos pr ON pr.id = cp.presupuesto_id WHERE cp.id = ?`, [id]
        );
        if (!actual) throw err(404, 'Partida no encontrada');
        const p = leerPartida(data, { parcial: true });
        const cambios = diferencias(actual, p, Object.keys(p));
        if (!Object.keys(cambios).length) return { id, sin_cambios: true };
        const sets = Object.keys(p).map(c => `${c} = ?`).join(', ');
        await db.query(`UPDATE costo_partidas SET ${sets} WHERE id = ?`, [...Object.values(p), id]);
        await registrar(null, { obra_id: actual.obra_id, entidad: 'partida', entidad_id: id, accion: 'editar',
            resumen: `Editó la partida: ${p.descripcion || actual.descripcion}`, detalle: cambios, usuario_id: userId });
        return { id };
    },

    /** Borra la partida; los gastos que tenía quedan sin partida (no se borran). */
    async borrarPartida(id, userId) {
        const [[actual]] = await db.query(
            `SELECT cp.*, pr.obra_id FROM costo_partidas cp JOIN costo_presupuestos pr ON pr.id = cp.presupuesto_id WHERE cp.id = ?`, [id]
        );
        if (!actual) throw err(404, 'Partida no encontrada');
        const [[c]] = await db.query('SELECT COUNT(*) AS n FROM costo_gastos WHERE partida_id = ?', [id]);
        await db.query('DELETE FROM costo_partidas WHERE id = ?', [id]);
        const huerfanos = Number(c?.n) || 0;
        await registrar(null, { obra_id: actual.obra_id, entidad: 'partida', entidad_id: id, accion: 'borrar',
            resumen: `Borró la partida: ${actual.descripcion}${huerfanos ? ` (${huerfanos} gasto${huerfanos === 1 ? '' : 's'} quedaron sin partida)` : ''}`,
            detalle: { capitulo: actual.capitulo, descripcion: actual.descripcion, cantidad: actual.cantidad, precio_unitario: actual.precio_unitario },
            usuario_id: userId });
        return { id, gastos_sin_partida: huerfanos };
    },

    /**
     * Importa el itemizado (filas ya leídas del Excel en el navegador).
     * `agregar` suma partidas; `reemplazar` borra las actuales, y se niega si alguna
     * tiene gastos asignados (se perdería a qué partida correspondía cada factura).
     */
    async importarPartidas(obraId, { modo, partidas }, userId) {
        await obraOFalla(obraId);
        if (!Array.isArray(partidas) || !partidas.length) throw err(400, 'No llegó ninguna partida para importar.', { code: 'COSTO_IMPORTAR_VACIO' });
        if (partidas.length > MAX_IMPORTAR) throw err(400, `Máximo ${MAX_IMPORTAR} partidas por importación.`, { code: 'COSTO_IMPORTAR_GRANDE' });
        const filas = partidas.map((f, i) => {
            try { return leerPartida({ ...f, origen: f.origen === 'modificacion' ? 'modificacion' : 'original' }); }
            catch (e) { throw err(400, `Fila ${i + 1}: ${e.message}`, { code: e.code }); }
        });
        const pres = await presupuestoDe(obraId, { crear: true, userId });

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            let base = 0;
            if (modo === 'reemplazar') {
                const [[c]] = await conn.query(
                    `SELECT COUNT(*) AS n FROM costo_gastos g JOIN costo_partidas cp ON cp.id = g.partida_id WHERE cp.presupuesto_id = ?`, [pres.id]
                );
                if (Number(c?.n) > 0) {
                    throw err(409, `Hay ${c.n} gasto${Number(c.n) === 1 ? '' : 's'} asignado${Number(c.n) === 1 ? '' : 's'} a partidas de este presupuesto. Usa "Agregar" o reasigna esos gastos antes de reemplazar.`, { code: 'COSTO_REEMPLAZO_CON_GASTOS' });
                }
                await conn.query('DELETE FROM costo_partidas WHERE presupuesto_id = ?', [pres.id]);
            } else {
                const [[m]] = await conn.query('SELECT COALESCE(MAX(orden), 0) AS m FROM costo_partidas WHERE presupuesto_id = ?', [pres.id]);
                base = Number(m?.m) || 0;
            }
            const valores = filas.map((p, i) => [pres.id, p.capitulo, p.codigo, p.descripcion, p.unidad, p.cantidad, p.precio_unitario, p.origen, p.motivo, base + i + 1, userId]);
            await conn.query(
                `INSERT INTO costo_partidas (presupuesto_id, capitulo, codigo, descripcion, unidad, cantidad, precio_unitario, origen, motivo, orden, creado_por)
                 VALUES ?`, [valores]
            );
            const total = filas.reduce((s, p) => s + Math.round(p.cantidad * p.precio_unitario), 0);
            await registrar(conn, { obra_id: obraId, entidad: 'presupuesto', entidad_id: pres.id, accion: 'importar',
                resumen: `${modo === 'reemplazar' ? 'Reemplazó el presupuesto con' : 'Importó'} ${filas.length} partidas desde Excel`,
                detalle: { modo: modo === 'reemplazar' ? 'reemplazar' : 'agregar', partidas: filas.length, costo_directo: total }, usuario_id: userId });
            await conn.commit();
            return { importadas: filas.length, costo_directo: total };
        } catch (e) {
            try { await conn.rollback(); } catch { /* nada que deshacer */ }
            throw e;
        } finally {
            conn.release();
        }
    },

    async crearGasto(obraId, data, file, userId) {
        try {
            await obraOFalla(obraId);
            const g = leerGasto(data);
            if (g.estado_pago === 'pagada' && !g.fecha_pago) g.fecha_pago = hoy();
            await verificarPartidaDeObra(g.partida_id, obraId);
            // Un gasto deja la obra agregada al módulo (aparece en la portada).
            await presupuestoDe(obraId, { crear: true, userId });
            const foto = file ? {
                foto_nombre: file.originalname, foto_ruta: path.relative(UPLOADS_DIR, file.path),
                foto_mime: file.mimetype, foto_tamano: file.size,
            } : {};
            const fila = { obra_id: obraId, ...g, ...foto, creado_por: userId };
            const cols = Object.keys(fila);
            const [r] = await db.query(
                `INSERT INTO costo_gastos (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, Object.values(fila)
            );
            await registrar(null, { obra_id: obraId, entidad: 'gasto', entidad_id: r.insertId, accion: 'crear',
                resumen: `Cargó un gasto de $${Math.round(g.monto_total).toLocaleString('es-CL')}${g.proveedor ? ` · ${g.proveedor}` : ''}${file ? ' con foto' : ''}`,
                detalle: g, usuario_id: userId });
            return { id: r.insertId };
        } catch (e) {
            if (file?.path) { try { fs.unlinkSync(file.path); } catch { /* ya no estaba */ } }
            throw e;
        }
    },

    async editarGasto(id, data, userId) {
        const [[actual]] = await db.query('SELECT * FROM costo_gastos WHERE id = ?', [id]);
        if (!actual) throw err(404, 'Gasto no encontrado');
        const g = leerGasto(data, { parcial: true });
        if (g.partida_id !== undefined) await verificarPartidaDeObra(g.partida_id, actual.obra_id);
        // Pagada sin fecha de pago = pagada hoy (si ya tenía una y no la tocaron, se conserva).
        if (g.estado_pago === 'pagada' && !g.fecha_pago && !(g.fecha_pago === undefined && actual.fecha_pago)) g.fecha_pago = hoy();
        const cambios = diferencias(actual, g, Object.keys(g));
        if (!Object.keys(cambios).length) return { id, sin_cambios: true };
        const sets = Object.keys(g).map(c => `${c} = ?`).join(', ');
        await db.query(`UPDATE costo_gastos SET ${sets}, actualizado_por = ? WHERE id = ?`, [...Object.values(g), userId, id]);
        await registrar(null, { obra_id: actual.obra_id, entidad: 'gasto', entidad_id: id, accion: 'editar',
            resumen: `Editó el gasto de $${Math.round(Number(actual.monto_total)).toLocaleString('es-CL')}${(g.proveedor || actual.proveedor) ? ` · ${g.proveedor || actual.proveedor}` : ''}`,
            detalle: cambios, usuario_id: userId });
        return { id };
    },

    async reemplazarFoto(id, file, userId) {
        if (!file) throw err(400, 'No se recibió la foto', { code: 'COSTO_SIN_FOTO' });
        const [[actual]] = await db.query('SELECT id, obra_id, foto_ruta FROM costo_gastos WHERE id = ?', [id]);
        if (!actual) { try { fs.unlinkSync(file.path); } catch { /* */ } throw err(404, 'Gasto no encontrado'); }
        const ruta = path.relative(UPLOADS_DIR, file.path);
        await db.query('UPDATE costo_gastos SET foto_nombre = ?, foto_ruta = ?, foto_mime = ?, foto_tamano = ?, actualizado_por = ? WHERE id = ?',
            [file.originalname, ruta, file.mimetype, file.size, userId, id]);
        if (actual.foto_ruta && actual.foto_ruta !== ruta) borrarArchivo(actual.foto_ruta);
        await registrar(null, { obra_id: actual.obra_id, entidad: 'gasto', entidad_id: id, accion: 'editar',
            resumen: `${actual.foto_ruta ? 'Cambió' : 'Agregó'} la foto del gasto #${id}`, usuario_id: userId });
        return { id, tiene_foto: true };
    },

    async getFoto(id) {
        const [[g]] = await db.query('SELECT foto_nombre, foto_ruta, foto_mime FROM costo_gastos WHERE id = ?', [id]);
        if (!g) throw err(404, 'Gasto no encontrado');
        if (!g.foto_ruta) throw err(404, 'El gasto no tiene foto');
        return { fullPath: path.join(UPLOADS_DIR, g.foto_ruta), fileName: g.foto_nombre || `gasto-${id}`, mime: g.foto_mime };
    },

    async borrarGasto(id, userId) {
        const [[actual]] = await db.query('SELECT * FROM costo_gastos WHERE id = ?', [id]);
        if (!actual) throw err(404, 'Gasto no encontrado');
        await db.query('DELETE FROM costo_gastos WHERE id = ?', [id]);
        borrarArchivo(actual.foto_ruta);
        await registrar(null, { obra_id: actual.obra_id, entidad: 'gasto', entidad_id: id, accion: 'borrar',
            resumen: `Borró el gasto de $${Math.round(Number(actual.monto_total)).toLocaleString('es-CL')}${actual.proveedor ? ` · ${actual.proveedor}` : ''} del ${ymd(actual.fecha)}`,
            detalle: { proveedor: actual.proveedor, folio: actual.folio, monto_total: actual.monto_total, fecha: ymd(actual.fecha) },
            usuario_id: userId });
        return { id };
    },

    async historialObra(obraId, limite = 300) {
        await obraOFalla(obraId);
        const [rows] = await db.query(
            `SELECT h.*, u.nombre AS usuario_nombre FROM costo_historial h LEFT JOIN usuarios u ON u.id = h.usuario_id
              WHERE h.obra_id = ? ORDER BY h.created_at DESC, h.id DESC LIMIT ?`, [obraId, limite]
        );
        return rows.map(r => {
            let detalle = null;
            try { detalle = r.detalle ? JSON.parse(r.detalle) : null; } catch { detalle = null; }
            return { ...r, detalle };
        });
    },
};
