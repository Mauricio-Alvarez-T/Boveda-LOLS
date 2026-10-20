const db = require('../config/db');
const costos = require('./costos.service');

const { err, num, texto, hoy, registrar, netoDeGasto } = costos._h;

/**
 * Cierre de obra y comparación entre obras (mig 123, docs/reglas/costos.md).
 *
 * CERRAR una obra guarda sus números finales (presupuestado, gastado, vendido y margen, por capítulo
 * y por categoría) y congela los montos: partidas, gastos, cobros y porcentajes ya no se pueden
 * cambiar hasta reabrirla con un motivo. La superficie y lo aprendido sí se pueden corregir.
 *
 * COMPARAR pone lado a lado las obras del módulo con su costo por m². Las cerradas usan sus números
 * finales; las en curso, los de hoy, marcados como PARCIALES (su costo real sigue subiendo).
 *
 * La venta de una obra es lo cobrado al mandante (neto de todos sus cobros). Si no se cargó ningún
 * cobro, se usa el neto del presupuesto (costo + utilidad) y se avisa: el margen sale del papel.
 */

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

/** Números finales de una obra a partir de su detalle (costos.detalleObra). Función pura. */
function resumenCierre(detalle) {
    const r = detalle.resumen;
    const porCategoria = {};
    for (const g of detalle.gastos) {
        const k = g.categoria || 'sin_categoria';
        porCategoria[k] = (porCategoria[k] || 0) + netoDeGasto(g).neto;
    }
    const cobrosNeto = (r.cobros?.cobrado.neto || 0) + (r.cobros?.por_cobrar.neto || 0);
    const hayCobros = (detalle.cobros || []).length > 0;
    const venta = hayCobros ? cobrosNeto : r.neto;
    const gastado = r.gastado_neto;
    return {
        presupuesto: {
            costo_directo: r.costo_directo, gastos_generales: r.gastos_generales, imprevistos: r.imprevistos,
            costo_presupuestado: r.costo_presupuestado, utilidad: r.utilidad, neto: r.neto,
        },
        real: {
            gastado_neto: gastado, gastado_estimado: r.gastado_estimado, por_categoria: porCategoria,
            gastos_generales_gastado: r.gastos_generales_gastado, mano_obra_sin_partida: r.mano_obra_sin_partida || 0, sin_asignar: r.sin_asignar,
        },
        venta: {
            neto: venta, fuente: hayCobros ? 'cobros' : 'presupuesto',
            cobrado_neto: r.cobros?.cobrado.neto || 0, por_cobrar_neto: r.cobros?.por_cobrar.neto || 0, retenido: r.cobros?.retenido || 0,
        },
        margen: {
            presupuestado: r.neto - r.costo_presupuestado, pct_presupuestado: pct(r.neto - r.costo_presupuestado, r.neto),
            real: venta - gastado, pct_real: pct(venta - gastado, venta),
        },
        desviacion_costo: gastado - r.costo_presupuestado,
        desviacion_pct: pct(gastado - r.costo_presupuestado, r.costo_presupuestado),
        capitulos: r.capitulos.map(c => ({ capitulo: c.capitulo, presupuestado: c.presupuestado, gastado: c.gastado })),
        excedidas: r.partidas_excedidas,
        pendientes: {
            por_pagar: r.por_pagar, por_completar: r.por_completar,
            por_cobrar: { n: r.cobros?.por_cobrar.n || 0, total: r.cobros?.por_cobrar.total || 0 },
        },
    };
}

/** Costo por m² (null si no hay superficie): se redondea al peso. */
const porM2 = (monto, m2) => (m2 > 0 ? Math.round(monto / m2) : null);

module.exports = {
    resumenCierre, porM2,

    async cerrarObra(obraId, data, userId) {
        const detalle = await costos.detalleObra(obraId);
        const pres = detalle.presupuesto;
        if (!pres) throw err(400, 'La obra no tiene presupuesto en el módulo: no hay nada que cerrar.', { code: 'COSTO_SIN_PRESUPUESTO' });
        if (pres.cerrado_at) throw err(409, 'La obra ya está cerrada.', { code: 'COSTO_OBRA_CERRADA' });

        let m2 = pres.superficie_m2 !== null && pres.superficie_m2 !== undefined ? Number(pres.superficie_m2) : null;
        if (data.superficie_m2 !== undefined && data.superficie_m2 !== '') {
            m2 = num(data.superficie_m2);
            if (m2 === null || Number.isNaN(m2) || m2 <= 0) throw err(400, 'La superficie tiene que ser un número mayor que cero (m²).', { code: 'COSTO_SUPERFICIE' });
        }
        const lecciones = texto(data.lecciones, 3000);
        const resumen = { fecha: hoy(), superficie_m2: m2, ...resumenCierre(detalle) };

        await db.query(
            `UPDATE costo_presupuestos SET cerrado_at = NOW(), cerrado_por = ?, cierre_resumen = ?, cierre_lecciones = ?, superficie_m2 = ?, actualizado_por = ?
              WHERE id = ?`,
            [userId, JSON.stringify(resumen), lecciones, m2, userId, pres.id]);
        const m = resumen.margen;
        await registrar(null, { obra_id: obraId, entidad: 'presupuesto', entidad_id: pres.id, accion: 'cerrar',
            resumen: `Cerró la obra: margen real ${m.pct_real ?? '—'} % (presupuestado ${m.pct_presupuestado ?? '—'} %)`,
            detalle: { margen: m, desviacion_costo: resumen.desviacion_costo, venta: resumen.venta.neto, fuente_venta: resumen.venta.fuente },
            usuario_id: userId });
        return costos.detalleObra(obraId);
    },

    async reabrirObra(obraId, data, userId) {
        const motivo = texto(data.motivo, 300);
        if (!motivo) throw err(400, 'Para reabrir una obra cerrada hay que decir por qué (queda en el historial).', { code: 'COSTO_REABRIR_MOTIVO' });
        const [[pres]] = await db.query('SELECT id, cerrado_at, cierre_resumen FROM costo_presupuestos WHERE obra_id = ?', [obraId]);
        if (!pres || !pres.cerrado_at) throw err(409, 'La obra no está cerrada.', { code: 'COSTO_OBRA_ABIERTA' });
        let anterior = null;
        try { anterior = pres.cierre_resumen ? JSON.parse(pres.cierre_resumen) : null; } catch { anterior = null; }
        await db.query(
            'UPDATE costo_presupuestos SET cerrado_at = NULL, cerrado_por = NULL, cierre_resumen = NULL, actualizado_por = ? WHERE id = ?',
            [userId, pres.id]);
        await registrar(null, { obra_id: obraId, entidad: 'presupuesto', entidad_id: pres.id, accion: 'reabrir',
            resumen: `Reabrió la obra: ${motivo}`, detalle: { motivo, cierre_anterior: anterior }, usuario_id: userId });
        return costos.detalleObra(obraId);
    },

    /** Obras del módulo lado a lado, con costo por m². */
    async comparacion() {
        const [obras] = await db.query(
            `SELECT o.id FROM costo_presupuestos p JOIN obras o ON o.id = p.obra_id
              WHERE o.es_prueba = 0 ORDER BY (p.cerrado_at IS NULL) ASC, o.nombre ASC`);
        const filas = [];
        for (const { id } of obras) {
            const d = await costos.detalleObra(id);
            const m2 = d.presupuesto?.superficie_m2 !== null && d.presupuesto?.superficie_m2 !== undefined ? Number(d.presupuesto.superficie_m2) : null;
            const cerrada = !!d.cierre;
            const n = cerrada && d.cierre.resumen ? d.cierre.resumen : resumenCierre(d);
            const cat = n.real.por_categoria || {};
            filas.push({
                obra_id: id, nombre: d.obra.nombre, finalizada: d.obra.finalizada, cerrada,
                cerrado_at: cerrada ? d.cierre.cerrado_at : null,
                superficie_m2: m2,
                partidas: d.partidas.length,
                costo_presupuestado: n.presupuesto.costo_presupuestado,
                gastado_neto: n.real.gastado_neto,
                gastado_estimado: n.real.gastado_estimado,
                venta_neto: n.venta.neto, venta_fuente: n.venta.fuente,
                margen_pct_presupuestado: n.margen.pct_presupuestado,
                margen_pct_real: n.margen.pct_real,
                desviacion_pct: n.desviacion_pct,
                por_m2: {
                    presupuestado: porM2(n.presupuesto.costo_presupuestado, m2),
                    real: porM2(n.real.gastado_neto, m2),
                    venta: porM2(n.venta.neto, m2),
                },
                por_categoria: cat,
            });
        }
        // Promedio de las CERRADAS con superficie: la base para cotizar (las en curso no están terminadas).
        const base = filas.filter(f => f.cerrada && f.superficie_m2 > 0);
        const m2Total = base.reduce((s, f) => s + f.superficie_m2, 0);
        const promedio = base.length ? {
            obras: base.length,
            costo_real_m2: porM2(base.reduce((s, f) => s + f.gastado_neto, 0), m2Total),
            costo_presupuestado_m2: porM2(base.reduce((s, f) => s + f.costo_presupuestado, 0), m2Total),
            margen_pct_real: pct(base.reduce((s, f) => s + f.venta_neto - f.gastado_neto, 0), base.reduce((s, f) => s + f.venta_neto, 0)),
        } : null;
        return { obras: filas, promedio_cerradas: promedio };
    },
};
