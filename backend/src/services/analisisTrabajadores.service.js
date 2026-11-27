/**
 * Análisis de trabajadores — Gestiones → «Análisis» (pedido RR.HH. 2026-11-27, mig 163).
 * Reglas: docs/reglas/rrhh-trabajadores.md § Análisis de trabajadores.
 *
 * Un endpoint por pestaña (dotación, rotación, asistencia, perfil y papeles, costos). Todas:
 *  · excluyen trabajadores y obras de prueba (es_prueba = 1);
 *  · aceptan empresa_id, obra_id, cargo_id, categoria y el rango desde/hasta ('YYYY-MM', 12 meses por
 *    defecto, máx. 24);
 *  · corren las consultas UNA TRAS OTRA (pool de 10 conexiones, igual que inicioGerencia);
 *  · devuelven `filtros` (lo que se aplicó) y `generado_en` para el título del Excel.
 *
 * Privacidad: el perfil SOLO devuelve conteos (nunca nombres ni RUT) y el `detalle` interno de las bajas
 * no se lee nunca. Los montos (`costos`) y las horas extra exigen además su permiso (lo revisa la ruta).
 *
 * Filtros de empresa, obra y cargo:
 *  · dotación, perfil y costos → la ficha ACTUAL del trabajador;
 *  · salidas (rotación) → la foto que guardó la baja (mig 152), si no hay, la ficha;
 *  · asistencia → la obra del registro (a.obra_id) y la empresa/cargo de la ficha.
 */
const pool = require('../config/db');
const { hoyChile, sumarDias } = require('../utils/fechaChile');
const { sqlCerrados, toYmd } = require('../utils/periodosLaborales');
const { labelCausal } = require('../config/causalesDesvinculacion');
const C = require('../utils/analisisCalculos');

const CATEGORIAS = ['obra', 'operaciones', 'rotativo'];
const DIAS_POR_VENCER = 30;

// Fila vigente de asistencia (docs/reglas/asistencia.md): si el mismo trabajador y día tiene filas en
// dos obras, vale la de id mayor.
const VIGENTE = `AND NOT EXISTS (
    SELECT 1 FROM asistencias a2
     WHERE a2.trabajador_id = a.trabajador_id AND a2.fecha = a.fecha
       AND a2.obra_id <> a.obra_id AND a2.id > a.id)`;

const idValido = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
};

/** Filtros normalizados desde la query. Lo inválido se ignora (no 400: es un tablero de lectura). */
function construirFiltros(query = {}, hoy = hoyChile()) {
    const rango = C.rangoMeses(query, hoy);
    const categoria = CATEGORIAS.includes(String(query.categoria || '')) ? String(query.categoria) : null;
    return {
        hoy,
        ...rango,
        empresa_id: idValido(query.empresa_id),
        obra_id: idValido(query.obra_id),
        cargo_id: idValido(query.cargo_id),
        categoria,
    };
}

/** Lo que se devuelve como «filtros aplicados». */
const filtrosPublicos = (f) => ({
    desde: f.meses[0], hasta: f.meses[f.meses.length - 1], fecha_desde: f.fechaDesde, fecha_hasta: f.fechaHasta,
    empresa_id: f.empresa_id, obra_id: f.obra_id, cargo_id: f.cargo_id, categoria: f.categoria,
});

/**
 * WHERE sobre la ficha del trabajador (alias `t`). `cols` permite apuntar empresa/obra/cargo a otra
 * expresión (la foto de la baja en rotación, la obra del registro en asistencia).
 */
function condFicha(f, cols = {}) {
    const c = { empresa: 't.empresa_id', obra: 't.obra_id', cargo: 't.cargo_id', ...cols };
    const where = ['t.es_prueba = 0'];
    const params = [];
    if (f.empresa_id) { where.push(`${c.empresa} = ?`); params.push(f.empresa_id); }
    if (f.obra_id) { where.push(`${c.obra} = ?`); params.push(f.obra_id); }
    if (f.cargo_id) { where.push(`${c.cargo} = ?`); params.push(f.cargo_id); }
    if (f.categoria) { where.push('t.categoria_reporte = ?'); params.push(f.categoria); }
    return { sql: where.join(' AND '), params };
}

const respuesta = (f, datos) => ({ filtros: filtrosPublicos(f), generado_en: new Date().toISOString(), ...datos });

/** Trabajadores (no prueba, según filtros de ficha) con sus períodos, para las series mensuales. */
async function trabajadoresConPeriodos(f) {
    const w = condFicha(f);
    const [filas] = await pool.query(
        `SELECT t.fecha_ingreso, t.fecha_desvinculacion, ${sqlCerrados('t')}
           FROM trabajadores t
          WHERE ${w.sql}`,
        w.params
    );
    return filas;
}

// ─── Dotación ───────────────────────────────────────────────────────────────────────────────────

async function dotacion(query) {
    const f = construirFiltros(query);
    const w = condFicha(f);
    const [activos] = await pool.query(
        `SELECT t.obra_id, o.nombre AS obra, COALESCE(o.finalizada, 0) AS finalizada,
                t.empresa_id, e.razon_social AS empresa, t.cargo_id, c.nombre AS cargo, t.categoria_reporte AS categoria,
                COUNT(*) AS n
           FROM trabajadores t
           LEFT JOIN obras o ON o.id = t.obra_id
           LEFT JOIN empresas e ON e.id = t.empresa_id
           LEFT JOIN cargos c ON c.id = t.cargo_id
          WHERE t.activo = 1 AND ${w.sql} AND (o.id IS NULL OR o.es_prueba = 0)
          GROUP BY t.obra_id, o.nombre, o.finalizada, t.empresa_id, e.razon_social, t.cargo_id, c.nombre, t.categoria_reporte`,
        w.params
    );
    const total = activos.reduce((s, x) => s + Number(x.n), 0);

    // Serie: un mes antes del rango para tener la variación del primero.
    const previo = C.sumarMeses(f.meses[0], -1);
    const serie = C.serieDotacion(await trabajadoresConPeriodos(f), [previo, ...f.meses], f.hoy);
    const inicio = serie[0].dotacion;
    const meses = serie.slice(1);

    // Obra finalizada = el trabajador sigue activo pero su obra ya cerró: se muestra aparte.
    const porObra = C.agrupar(activos, 'obra_id', 'obra', (x) => ({ finalizada: Number(x.finalizada) === 1 }));
    return respuesta(f, {
        activos: total,
        variacion: { desde: inicio, hasta: meses[meses.length - 1].dotacion },
        serie: meses,
        por_obra: porObra,
        en_obra_finalizada: porObra.filter(o => o.finalizada).reduce((s, o) => s + o.n, 0),
        por_empresa: C.agrupar(activos, 'empresa_id', 'empresa'),
        por_cargo: C.agrupar(activos, 'cargo_id', 'cargo'),
        por_categoria: C.agrupar(activos.map(x => ({ ...x, cat_id: x.categoria, cat: x.categoria })), 'cat_id', 'cat'),
    });
}

// ─── Rotación ───────────────────────────────────────────────────────────────────────────────────

async function rotacion(query) {
    const f = construirFiltros(query);
    // Salidas con la foto de la baja (mig 152): la obra/cargo/empresa donde estaba al irse.
    const w = condFicha(f, {
        empresa: 'COALESCE(d.empresa_id, t.empresa_id)',
        obra: 'COALESCE(d.obra_id, t.obra_id)',
        cargo: 'COALESCE(d.cargo_id, t.cargo_id)',
    });
    const [salidas] = await pool.query(
        `SELECT d.fecha_desvinculacion, d.fecha_ingreso_periodo, d.causal_codigo, d.no_recontratar,
                (d.reactivado_en IS NOT NULL) AS volvio,
                COALESCE(d.obra_id, t.obra_id) AS obra_id, o.nombre AS obra,
                COALESCE(d.cargo_id, t.cargo_id) AS cargo_id, c.nombre AS cargo,
                COALESCE(d.empresa_id, t.empresa_id) AS empresa_id, e.razon_social AS empresa
           FROM trabajador_desvinculaciones d
           JOIN trabajadores t ON t.id = d.trabajador_id
           LEFT JOIN obras o ON o.id = COALESCE(d.obra_id, t.obra_id)
           LEFT JOIN cargos c ON c.id = COALESCE(d.cargo_id, t.cargo_id)
           LEFT JOIN empresas e ON e.id = COALESCE(d.empresa_id, t.empresa_id)
          WHERE d.fecha_desvinculacion BETWEEN ? AND ? AND ${w.sql} AND (o.id IS NULL OR o.es_prueba = 0)`,
        [f.fechaDesde, f.fechaHasta, ...w.params]
    );

    const previo = C.sumarMeses(f.meses[0], -1);
    const serie = C.serieDotacion(await trabajadoresConPeriodos(f), [previo, ...f.meses], f.hoy);

    const salidasPorMes = new Map();
    for (const s of salidas) {
        const mes = C.mesDe(toYmd(s.fecha_desvinculacion));
        salidasPorMes.set(mes, (salidasPorMes.get(mes) || 0) + 1);
    }
    const meses = serie.slice(1).map((m, i) => {
        const sal = salidasPorMes.get(m.mes) || 0;
        const promedio = (serie[i].dotacion + m.dotacion) / 2; // dotación al cierre del mes anterior y de este
        return { mes: m.mes, ingresos: m.ingresos, reingresos: m.reingresos, salidas: sal,
            dotacion: m.dotacion, tasa: C.porcentaje(sal, promedio), parcial: m.parcial };
    });

    const dias = salidas
        .map(s => (s.fecha_ingreso_periodo ? C.diasEntre(toYmd(s.fecha_ingreso_periodo), toYmd(s.fecha_desvinculacion)) : null))
        .filter(d => d != null && d >= 0);
    const ingresos = meses.reduce((s, m) => s + m.ingresos, 0);
    const dotProm = meses.reduce((s, m) => s + m.dotacion, 0) / (meses.length || 1);
    return respuesta(f, {
        ingresos,
        reingresos: meses.reduce((s, m) => s + m.reingresos, 0),
        salidas: salidas.length,
        tasa_rango: C.porcentaje(salidas.length, dotProm),
        serie: meses,
        permanencia: {
            promedio_dias: dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : null,
            mediana_dias: C.mediana(dias),
            con_dato: dias.length,
        },
        salidas_antes_30: dias.filter(d => d < 30).length,
        salidas_antes_90: dias.filter(d => d < 90).length,
        no_recontratar: salidas.filter(s => Number(s.no_recontratar) === 1).length,
        volvieron: salidas.filter(s => Number(s.volvio) === 1).length,
        causales: C.contar(salidas, s => labelCausal(s.causal_codigo) || s.causal_codigo),
        por_obra: C.agrupar(salidas, 'obra_id', 'obra'),
        por_cargo: C.agrupar(salidas, 'cargo_id', 'cargo'),
        por_empresa: C.agrupar(salidas, 'empresa_id', 'empresa'),
    });
}

// ─── Asistencia ─────────────────────────────────────────────────────────────────────────────────

/**
 * Días hábiles registrados (lun–vie, fila vigente). Ausentismo = días no presentes salvo vacaciones (V)
 * sobre los registrados, el mismo criterio del Inicio.
 */
async function asistencia(query, { verHorasExtra = false } = {}) {
    const f = construirFiltros(query);
    const w = condFicha(f, { obra: 'a.obra_id' });
    const base = `FROM asistencias a
           JOIN estados_asistencia ea ON ea.id = a.estado_id
           JOIN trabajadores t ON t.id = a.trabajador_id
           JOIN obras o ON o.id = a.obra_id
          WHERE a.fecha BETWEEN ? AND ? AND WEEKDAY(a.fecha) < 5 AND o.es_prueba = 0 AND ${w.sql} ${VIGENTE}`;
    const params = [f.fechaDesde, f.fechaHasta, ...w.params];
    const AUS = `(ea.es_presente = 0 AND ea.codigo <> 'V')`;

    const [porMesEstado] = await pool.query(
        `SELECT DATE_FORMAT(a.fecha, '%Y-%m') AS mes, ea.codigo, ea.nombre, ea.es_presente, COUNT(*) AS n
         ${base}
          GROUP BY mes, ea.codigo, ea.nombre, ea.es_presente`,
        params
    );
    const [porObra] = await pool.query(
        `SELECT a.obra_id, o.nombre AS obra, COUNT(*) AS registros,
                SUM(${AUS}) AS ausencias, SUM(ea.codigo = 'F') AS faltas
         ${base}
          GROUP BY a.obra_id, o.nombre`,
        params
    );
    const [porCargo] = await pool.query(
        `SELECT t.cargo_id, c.nombre AS cargo, COUNT(*) AS registros,
                SUM(${AUS}) AS ausencias, SUM(ea.codigo = 'F') AS faltas
         ${base.replace('JOIN obras o ON o.id = a.obra_id', 'JOIN obras o ON o.id = a.obra_id\n           LEFT JOIN cargos c ON c.id = t.cargo_id')}
          GROUP BY t.cargo_id, c.nombre`,
        params
    );
    const [topFaltas] = await pool.query(
        `SELECT t.id AS trabajador_id, t.nombres, t.apellido_paterno, COUNT(*) AS faltas
         ${base} AND ea.codigo = 'F'
          GROUP BY t.id, t.nombres, t.apellido_paterno
          ORDER BY faltas DESC, t.apellido_paterno ASC
          LIMIT 10`,
        params
    );

    let horasExtra = null;
    if (verHorasExtra) {
        const [hx] = await pool.query(
            `SELECT DATE_FORMAT(a.fecha, '%Y-%m') AS mes, a.obra_id, o.nombre AS obra, SUM(a.horas_extra) AS horas
               FROM asistencias a
               JOIN trabajadores t ON t.id = a.trabajador_id
               JOIN obras o ON o.id = a.obra_id
              WHERE a.fecha BETWEEN ? AND ? AND a.horas_extra > 0 AND o.es_prueba = 0 AND ${w.sql} ${VIGENTE}
              GROUP BY mes, a.obra_id, o.nombre`,
            params
        );
        const porMes = new Map(f.meses.map(m => [m, 0]));
        const obras = new Map();
        for (const x of hx) {
            const h = Number(x.horas) || 0;
            if (porMes.has(x.mes)) porMes.set(x.mes, porMes.get(x.mes) + h);
            const o = obras.get(x.obra_id) || { id: x.obra_id, etiqueta: x.obra, n: 0 };
            o.n += h;
            obras.set(x.obra_id, o);
        }
        const redondo = (n) => Math.round(n * 10) / 10;
        horasExtra = {
            total: redondo([...porMes.values()].reduce((a, b) => a + b, 0)),
            serie: [...porMes.entries()].map(([mes, horas]) => ({ mes, horas: redondo(horas) })),
            por_obra: [...obras.values()].map(o => ({ ...o, n: redondo(o.n) })).sort((a, b) => b.n - a.n),
        };
    }

    // Serie mensual: registros, ausencias y % por mes + totales por estado.
    const meses = new Map(f.meses.map(m => [m, { mes: m, registros: 0, ausencias: 0, faltas: 0 }]));
    const estados = new Map();
    for (const x of porMesEstado) {
        const n = Number(x.n) || 0;
        const m = meses.get(x.mes);
        if (m) {
            m.registros += n;
            if (Number(x.es_presente) === 0 && x.codigo !== 'V') m.ausencias += n;
            if (x.codigo === 'F') m.faltas += n;
            m[x.codigo] = (m[x.codigo] || 0) + n;
        }
        const e = estados.get(x.codigo) || { codigo: x.codigo, nombre: x.nombre, presente: Number(x.es_presente) === 1, n: 0 };
        e.n += n;
        estados.set(x.codigo, e);
    }
    const serie = [...meses.values()].map(m => ({ ...m, ausentismo: C.porcentaje(m.ausencias, m.registros) }));
    const registros = serie.reduce((s, m) => s + m.registros, 0);
    const ausencias = serie.reduce((s, m) => s + m.ausencias, 0);
    const ranking = (filas, idKey, labelKey) => filas.map(x => ({
        id: x[idKey] ?? null, etiqueta: x[labelKey] || 'Sin dato',
        registros: Number(x.registros) || 0, ausencias: Number(x.ausencias) || 0, faltas: Number(x.faltas) || 0,
        ausentismo: C.porcentaje(Number(x.ausencias) || 0, Number(x.registros) || 0),
    })).sort((a, b) => (b.ausentismo ?? 0) - (a.ausentismo ?? 0) || b.registros - a.registros);

    return respuesta(f, {
        registros,
        ausencias,
        faltas: serie.reduce((s, m) => s + m.faltas, 0),
        ausentismo: C.porcentaje(ausencias, registros),
        serie,
        estados: [...estados.values()].sort((a, b) => b.n - a.n),
        por_obra: ranking(porObra, 'obra_id', 'obra'),
        por_cargo: ranking(porCargo, 'cargo_id', 'cargo'),
        top_faltas: topFaltas.map(x => ({
            trabajador_id: x.trabajador_id,
            nombre: [x.nombres, x.apellido_paterno].filter(Boolean).join(' '),
            faltas: Number(x.faltas) || 0,
        })),
        horas_extra: horasExtra,
    });
}

// ─── Perfil y papeles ───────────────────────────────────────────────────────────────────────────

// Mismo criterio que FALTA_DATO de fiscalizacion.service.js (filtro «Falta en la ficha» de la grilla).
const FALTA_CONTRATO = `(t.nacionalidad IS NULL OR t.nacionalidad = '' OR t.estado_civil IS NULL OR t.estado_civil = ''
    OR t.fecha_nacimiento IS NULL OR t.direccion IS NULL OR t.direccion = '' OR t.comuna IS NULL OR t.comuna = '')`;
const FALTA_PAGO = `(COALESCE(t.cuenta_rut, 0) = 0 AND (COALESCE(t.banco, '') = '' OR COALESCE(t.numero_cuenta, '') = ''))`;
const FALTA_TALLAS = `(t.talla_calzado IS NULL OR t.talla_pantalon IS NULL OR COALESCE(t.talla_polera, '') = '')`;

const capitalizar = (v) => {
    const s = String(v ?? '').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
};

async function perfil(query) {
    const f = construirFiltros(query);
    const w = condFicha(f);
    const porVencer = sumarDias(f.hoy, DIAS_POR_VENCER);
    // SOLO columnas para contar: ni nombre, ni RUT, ni dirección, ni cuenta.
    const [activos] = await pool.query(
        `SELECT t.fecha_nacimiento, t.fecha_ingreso, t.nacionalidad, t.comuna, t.afp, t.salud, t.estado_civil,
                t.cargas_familiares, t.fecha_termino_contrato,
                ${FALTA_CONTRATO} AS falta_contrato, ${FALTA_PAGO} AS falta_pago, ${FALTA_TALLAS} AS falta_tallas
           FROM trabajadores t
           LEFT JOIN obras o ON o.id = t.obra_id
          WHERE t.activo = 1 AND ${w.sql} AND (o.id IS NULL OR o.es_prueba = 0)`,
        w.params
    );

    const [[docs]] = await pool.query(
        `SELECT SUM(d.fecha_vencimiento < ?) AS vencidos,
                SUM(d.fecha_vencimiento BETWEEN ? AND ?) AS por_vencer
           FROM documentos d
           JOIN trabajadores t ON t.id = d.trabajador_id
           LEFT JOIN obras o ON o.id = t.obra_id
          WHERE d.activo = 1 AND t.activo = 1 AND ${w.sql} AND (o.id IS NULL OR o.es_prueba = 0)`,
        [f.hoy, f.hoy, porVencer, ...w.params]
    );

    // Documentos obligatorios completos por obra: trabajadores con TODOS los tipos obligatorios activos.
    const [[obl]] = await pool.query(
        'SELECT COUNT(*) AS obligatorios FROM tipos_documento WHERE obligatorio = 1 AND activo = 1'
    );
    const obligatorios = Number(obl?.obligatorios) || 0;
    const [docsObra] = await pool.query(
        `SELECT t.obra_id, o.nombre AS obra, COUNT(*) AS trabajadores,
                SUM((SELECT COUNT(DISTINCT d.tipo_documento_id)
                       FROM documentos d
                       JOIN tipos_documento td ON td.id = d.tipo_documento_id AND td.obligatorio = 1 AND td.activo = 1
                      WHERE d.trabajador_id = t.id AND d.activo = 1) >= ?) AS completos
           FROM trabajadores t
           LEFT JOIN obras o ON o.id = t.obra_id
          WHERE t.activo = 1 AND ${w.sql} AND (o.id IS NULL OR o.es_prueba = 0)
          GROUP BY t.obra_id, o.nombre`,
        [obligatorios, ...w.params]
    );

    // Solicitudes de ingreso del rango (la obra/cargo/empresa de la solicitud).
    const ws = ['DATE(s.fecha_solicitud) BETWEEN ? AND ?', '(o.id IS NULL OR o.es_prueba = 0)'];
    const ps = [f.fechaDesde, f.fechaHasta];
    if (f.empresa_id) { ws.push('s.empresa_id = ?'); ps.push(f.empresa_id); }
    if (f.obra_id) { ws.push('s.obra_id = ?'); ps.push(f.obra_id); }
    if (f.cargo_id) { ws.push('s.cargo_id = ?'); ps.push(f.cargo_id); }
    const [solicitudes] = await pool.query(
        `SELECT s.estado, s.tipo, COUNT(*) AS n,
                AVG(CASE WHEN s.estado = 'aprobada' AND s.fecha_resolucion IS NOT NULL
                         THEN TIMESTAMPDIFF(HOUR, s.fecha_solicitud, s.fecha_resolucion) END) AS horas_aprobacion
           FROM solicitudes_ingreso s
           LEFT JOIN obras o ON o.id = s.obra_id
          WHERE ${ws.join(' AND ')}
          GROUP BY s.estado, s.tipo`,
        ps
    );

    const hoy = f.hoy;
    const cargas = (x) => {
        if (x.cargas_familiares == null) return 'Sin dato';
        const n = Number(x.cargas_familiares);
        return n >= 3 ? '3 o más' : String(n);
    };
    const contratosVencen = activos.filter(x => {
        const t = toYmd(x.fecha_termino_contrato);
        return t && t >= hoy && t <= porVencer;
    }).length;
    const solTotales = { pendiente: 0, aprobada: 0, rechazada: 0, reingreso: 0 };
    let horas = 0; let conHoras = 0;
    for (const s of solicitudes) {
        const n = Number(s.n) || 0;
        if (s.estado in solTotales) solTotales[s.estado] += n;
        if (s.tipo === 'reingreso') solTotales.reingreso += n;
        if (s.horas_aprobacion != null && s.estado === 'aprobada') { horas += Number(s.horas_aprobacion) * n; conHoras += n; }
    }

    return respuesta(f, {
        activos: activos.length,
        edad: C.contar(activos, x => C.tramoEdad(x.fecha_nacimiento, hoy), { orden: C.TRAMOS_EDAD }),
        antiguedad: C.contar(activos, x => C.tramoAntiguedad(x.fecha_ingreso, hoy), { orden: C.TRAMOS_ANTIGUEDAD }),
        nacionalidad: C.contar(activos, x => capitalizar(x.nacionalidad), { top: 8 }),
        comunas: C.contar(activos, x => capitalizar(x.comuna), { top: 10 }),
        afp: C.contar(activos, x => capitalizar(x.afp), { top: 10 }),
        salud: C.contar(activos, x => capitalizar(x.salud), { top: 10 }),
        estado_civil: C.contar(activos, x => capitalizar(x.estado_civil)),
        cargas: C.contar(activos, cargas, { orden: ['0', '1', '2', '3 o más'] }),
        fichas_incompletas: {
            contrato: activos.filter(x => Number(x.falta_contrato) === 1).length,
            pago: activos.filter(x => Number(x.falta_pago) === 1).length,
            tallas: activos.filter(x => Number(x.falta_tallas) === 1).length,
        },
        documentos: {
            vencidos: Number(docs?.vencidos) || 0,
            por_vencer: Number(docs?.por_vencer) || 0,
            dias_por_vencer: DIAS_POR_VENCER,
            obligatorios,
            por_obra: docsObra.map(x => ({
                id: x.obra_id ?? null, etiqueta: x.obra || 'Sin obra',
                trabajadores: Number(x.trabajadores) || 0, completos: Number(x.completos) || 0,
                porcentaje: C.porcentaje(Number(x.completos) || 0, Number(x.trabajadores) || 0),
            })).sort((a, b) => (a.porcentaje ?? 0) - (b.porcentaje ?? 0)),
        },
        contratos_vencen: contratosVencen,
        solicitudes: {
            ...solTotales,
            total: solTotales.pendiente + solTotales.aprobada + solTotales.rechazada,
            horas_aprobacion: conHoras ? Math.round(horas / conHoras) : null,
        },
    });
}

// ─── Costos (estimado) ──────────────────────────────────────────────────────────────────────────

/**
 * Costo mensual ESTIMADO de la dotación actual: (sueldo base + colación + movilización del cargo) ×
 * activos. Es el sueldo del cargo (cargo_sueldos), no la liquidación real: sin horas extra, bonos
 * personales ni leyes sociales. Los cargos sin sueldo cargado se cuentan aparte («sin dato»).
 */
async function costos(query) {
    const f = construirFiltros(query);
    const w = condFicha(f);
    const [filas] = await pool.query(
        `SELECT t.cargo_id, c.nombre AS cargo, t.obra_id, o.nombre AS obra, t.empresa_id, e.razon_social AS empresa,
                s.sueldo_base, s.bono_colacion, s.bono_movilizacion, COUNT(*) AS n
           FROM trabajadores t
           LEFT JOIN obras o ON o.id = t.obra_id
           LEFT JOIN empresas e ON e.id = t.empresa_id
           LEFT JOIN cargos c ON c.id = t.cargo_id
           LEFT JOIN cargo_sueldos s ON s.cargo_id = t.cargo_id
          WHERE t.activo = 1 AND ${w.sql} AND (o.id IS NULL OR o.es_prueba = 0)
          GROUP BY t.cargo_id, c.nombre, t.obra_id, o.nombre, t.empresa_id, e.razon_social,
                   s.sueldo_base, s.bono_colacion, s.bono_movilizacion`,
        w.params
    );
    const conSueldo = [];
    let sinDato = 0;
    const cargosSinDato = new Map();
    for (const x of filas) {
        const n = Number(x.n) || 0;
        const mensual = (Number(x.sueldo_base) || 0) + (Number(x.bono_colacion) || 0) + (Number(x.bono_movilizacion) || 0);
        if (x.sueldo_base == null || mensual === 0) {
            sinDato += n;
            const k = x.cargo_id ?? 'null';
            const g = cargosSinDato.get(k) || { id: x.cargo_id ?? null, etiqueta: x.cargo || 'Sin cargo', n: 0 };
            g.n += n;
            cargosSinDato.set(k, g);
            continue;
        }
        conSueldo.push({ ...x, n, monto: mensual * n, base: (Number(x.sueldo_base) || 0) * n });
    }
    const sumarPor = (idKey, labelKey) => {
        const m = new Map();
        for (const x of conSueldo) {
            const k = x[idKey] ?? 'null';
            const g = m.get(k) || { id: x[idKey] ?? null, etiqueta: x[labelKey] || 'Sin dato', trabajadores: 0, monto: 0 };
            g.trabajadores += x.n;
            g.monto += x.monto;
            m.set(k, g);
        }
        return [...m.values()].sort((a, b) => b.monto - a.monto);
    };
    const total = conSueldo.reduce((s, x) => s + x.monto, 0);
    const trabajadores = conSueldo.reduce((s, x) => s + x.n, 0);
    return respuesta(f, {
        estimado: true,
        total_mensual: total,
        sueldo_base_total: conSueldo.reduce((s, x) => s + x.base, 0),
        trabajadores_con_sueldo: trabajadores,
        promedio_por_trabajador: trabajadores ? Math.round(total / trabajadores) : null,
        sin_dato: sinDato,
        cargos_sin_dato: [...cargosSinDato.values()].sort((a, b) => b.n - a.n),
        por_cargo: sumarPor('cargo_id', 'cargo'),
        por_obra: sumarPor('obra_id', 'obra'),
        por_empresa: sumarPor('empresa_id', 'empresa'),
    });
}

module.exports = { dotacion, rotacion, asistencia, perfil, costos, construirFiltros, condFicha };
