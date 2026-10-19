const db = require('../config/db');
const { _h } = require('./costos.service');

const { err, num, texto, fechaISO, ymd, hoy, registrar, diferencias, obraOFalla, presupuestoDe, noCerrada, totalCobro } = _h;

/**
 * Cobros al mandante y flujo de caja (mig 123, docs/reglas/costos.md).
 *
 * Un COBRO es lo que se espera que entre: un estado de pago, una factura de venta, el anticipo o la
 * devolución de retenciones. Lo que entra es neto + IVA − retención. Es mínimo a propósito: los
 * estados de pago completos se definen con Rodrigo y, cuando existan, generarán estos cobros.
 *
 * El FLUJO DE CAJA cruza, semana a semana, lo que entra (cobros por cobrar, por fecha esperada) con
 * lo que sale (gastos por pagar, por fecha de vencimiento, con IVA: es plata que sale del banco).
 * Lo vencido sin pagar y lo que se debía cobrar y no llegó van a «Atrasado», al principio. Lo que no
 * tiene fecha va aparte, avisado: no se puede ubicar en ninguna semana.
 */

const ESTADOS_COBRO = ['por_cobrar', 'cobrado'];
const SEMANAS_MIN = 4;
const SEMANAS_MAX = 26;

const pesos = n => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Valida y normaliza un cobro. `parcial` = edición. */
function leerCobro(data, { parcial = false } = {}) {
    const c = {};
    if (!parcial || data.fecha !== undefined) {
        c.fecha = fechaISO(data.fecha);
        if (!c.fecha) throw err(400, 'El cobro necesita la fecha en que se espera recibir (AAAA-MM-DD).', { code: 'COSTO_COBRO_FECHA' });
    }
    if (!parcial || data.glosa !== undefined) {
        c.glosa = texto(data.glosa, 200);
        if (!c.glosa) throw err(400, 'Falta qué se cobra (ej.: «EP 8» o «Anticipo»).', { code: 'COSTO_COBRO_GLOSA' });
    }
    if (!parcial || data.monto_neto !== undefined) {
        const n = num(data.monto_neto);
        if (n === null || Number.isNaN(n) || n <= 0) throw err(400, 'El monto neto tiene que ser un número mayor que cero.', { code: 'COSTO_COBRO_MONTO' });
        c.monto_neto = n;
    }
    for (const campo of ['iva', 'retencion']) {
        if (data[campo] === undefined) { if (!parcial) c[campo] = 0; continue; }
        const n = num(data[campo], 0);
        if (Number.isNaN(n) || n < 0) throw err(400, `"${campo === 'iva' ? 'IVA' : 'Retención'}" tiene que ser un número.`, { code: 'COSTO_NUMERO' });
        c[campo] = n;
    }
    if (!parcial || data.estado !== undefined) c.estado = ESTADOS_COBRO.includes(data.estado) ? data.estado : 'por_cobrar';
    if (data.fecha_cobro !== undefined) c.fecha_cobro = fechaISO(data.fecha_cobro);
    if (data.observacion !== undefined) c.observacion = texto(data.observacion, 500);
    return c;
}

/** La retención no puede comerse todo el cobro. */
function validarTotal(c) {
    if (totalCobro(c) < 0) throw err(400, 'La retención no puede ser mayor que el neto más el IVA.', { code: 'COSTO_COBRO_RETENCION' });
}

async function cobroConObra(id) {
    const [[actual]] = await db.query(
        'SELECT c.*, pr.cerrado_at FROM costo_cobros c LEFT JOIN costo_presupuestos pr ON pr.obra_id = c.obra_id WHERE c.id = ?', [id]);
    if (!actual) throw err(404, 'Cobro no encontrado');
    return actual;
}

/** Lunes (AAAA-MM-DD) de la semana de una fecha AAAA-MM-DD, en hora local. */
function lunesDe(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    const f = new Date(a, m - 1, d);
    f.setDate(f.getDate() - ((f.getDay() + 6) % 7));
    return ymd(f);
}
function masDias(iso, dias) {
    const [a, m, d] = iso.split('-').map(Number);
    return ymd(new Date(a, m - 1, d + dias));
}

/**
 * Agrupa movimientos en semanas (lunes a domingo) desde la semana de `hoyISO`. Función pura.
 * Cada movimiento: { tipo: 'cobro' | 'pago', fecha: 'AAAA-MM-DD' | null, monto, ... }.
 */
function armarFlujo(movimientos, hoyISO, semanas) {
    const balde = (clave, desde = null, hasta = null) => ({ clave, desde, hasta, entradas: 0, salidas: 0, neto: 0, items: [] });
    const lunes = lunesDe(hoyISO);
    const lista = Array.from({ length: semanas }, (_, i) => balde(`s${i + 1}`, masDias(lunes, 7 * i), masDias(lunes, 7 * i + 6)));
    const atrasado = balde('atrasado', null, masDias(hoyISO, -1));
    const masAdelante = balde('mas_adelante', masDias(lunes, 7 * semanas), null);
    const sinFecha = balde('sin_fecha');

    for (const m of movimientos) {
        let b;
        if (!m.fecha) b = sinFecha;
        else if (m.fecha < hoyISO) b = atrasado;
        else if (m.fecha > lista[lista.length - 1].hasta) b = masAdelante;
        else b = lista[Math.floor((Date.parse(m.fecha) - Date.parse(lunes)) / (7 * 864e5))];
        b.items.push(m);
        if (m.tipo === 'cobro') b.entradas += m.monto; else b.salidas += m.monto;
    }
    for (const b of [atrasado, ...lista, masAdelante, sinFecha]) {
        b.neto = b.entradas - b.salidas;
        b.items.sort((x, y) => String(x.fecha || '').localeCompare(String(y.fecha || '')) || (x.tipo === 'cobro' ? -1 : 1));
    }
    const enHorizonte = [atrasado, ...lista];
    return {
        hoy: hoyISO,
        semanas: lista,
        atrasado,
        mas_adelante: masAdelante,
        sin_fecha: sinFecha,
        totales: {
            entradas: enHorizonte.reduce((s, b) => s + b.entradas, 0),
            salidas: enHorizonte.reduce((s, b) => s + b.salidas, 0),
        },
    };
}

module.exports = {
    ESTADOS_COBRO, leerCobro, armarFlujo, lunesDe,

    async crearCobro(obraId, data, userId) {
        await obraOFalla(obraId);
        const c = leerCobro(data);
        validarTotal(c);
        if (c.estado === 'cobrado' && !c.fecha_cobro) c.fecha_cobro = hoy();
        noCerrada(await presupuestoDe(obraId, { crear: true, userId }));
        const fila = { obra_id: obraId, ...c, creado_por: userId };
        const cols = Object.keys(fila);
        const [r] = await db.query(`INSERT INTO costo_cobros (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, Object.values(fila));
        await registrar(null, { obra_id: obraId, entidad: 'cobro', entidad_id: r.insertId, accion: 'crear',
            resumen: `Agregó el cobro «${c.glosa}» por ${pesos(totalCobro(c))} (${c.estado === 'cobrado' ? 'cobrado' : `se espera el ${c.fecha}`})`,
            detalle: c, usuario_id: userId });
        return { id: r.insertId };
    },

    async editarCobro(id, data, userId) {
        const actual = await cobroConObra(id);
        noCerrada(actual);
        const c = leerCobro(data, { parcial: true });
        validarTotal({ ...actual, ...c });
        if (c.estado === 'cobrado' && !c.fecha_cobro && !(c.fecha_cobro === undefined && actual.fecha_cobro)) c.fecha_cobro = hoy();
        const cambios = diferencias(actual, c, Object.keys(c));
        if (!Object.keys(cambios).length) return { id, sin_cambios: true };
        const sets = Object.keys(c).map(k => `${k} = ?`).join(', ');
        await db.query(`UPDATE costo_cobros SET ${sets}, actualizado_por = ? WHERE id = ?`, [...Object.values(c), userId, id]);
        await registrar(null, { obra_id: actual.obra_id, entidad: 'cobro', entidad_id: id, accion: 'editar',
            resumen: `${c.estado === 'cobrado' && actual.estado !== 'cobrado' ? 'Marcó como cobrado' : 'Editó'} el cobro «${c.glosa || actual.glosa}»`,
            detalle: cambios, usuario_id: userId });
        return { id };
    },

    async borrarCobro(id, userId) {
        const actual = await cobroConObra(id);
        noCerrada(actual);
        await db.query('DELETE FROM costo_cobros WHERE id = ?', [id]);
        await registrar(null, { obra_id: actual.obra_id, entidad: 'cobro', entidad_id: id, accion: 'borrar',
            resumen: `Borró el cobro «${actual.glosa}» por ${pesos(totalCobro(actual))}`,
            detalle: { glosa: actual.glosa, fecha: ymd(actual.fecha), monto_neto: actual.monto_neto, iva: actual.iva, retencion: actual.retencion, estado: actual.estado },
            usuario_id: userId });
        return { id };
    },

    /** Flujo de caja de las próximas `semanas` (todas las obras, o una). */
    async flujoCaja({ semanas = 8, obraId = null } = {}) {
        const n = Math.min(SEMANAS_MAX, Math.max(SEMANAS_MIN, Math.trunc(Number(semanas)) || 8));
        const filtro = obraId ? ' AND o.id = ?' : '';
        const params = obraId ? [obraId] : [];
        const [pagos] = await db.query(
            `SELECT g.id, g.obra_id, o.nombre AS obra_nombre, g.fecha, g.fecha_vencimiento, g.proveedor, g.folio, g.tipo_documento, g.monto_total
               FROM costo_gastos g JOIN obras o ON o.id = g.obra_id
              WHERE g.estado_pago = 'por_pagar'${filtro}`, params);
        const [cobros] = await db.query(
            `SELECT c.id, c.obra_id, o.nombre AS obra_nombre, c.fecha, c.glosa, c.monto_neto, c.iva, c.retencion
               FROM costo_cobros c JOIN obras o ON o.id = c.obra_id
              WHERE c.estado = 'por_cobrar'${filtro}`, params);
        const movimientos = [
            ...pagos.map(g => ({
                tipo: 'pago', id: g.id, obra_id: g.obra_id, obra_nombre: g.obra_nombre,
                fecha: ymd(g.fecha_vencimiento), fecha_documento: ymd(g.fecha),
                detalle: `${g.proveedor || 'Sin proveedor'}${g.folio ? ` · N° ${g.folio}` : ''}`,
                monto: Math.round(Number(g.monto_total) || 0),
            })),
            ...cobros.map(c => ({
                tipo: 'cobro', id: c.id, obra_id: c.obra_id, obra_nombre: c.obra_nombre,
                fecha: ymd(c.fecha), detalle: c.glosa, monto: totalCobro(c),
            })),
        ];
        return armarFlujo(movimientos, hoy(), n);
    },
};
