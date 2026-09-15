const db = require('../config/db');
const { has } = require('../utils/sanitizeFinancialFields');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const emailService = require('./email.service');

class FiscalizacionService {
    /**
     * Búsqueda avanzada de trabajadores con múltiples filtros y cálculo de completitud en una sola query.
     */
    /**
     * Búsqueda avanzada de la grilla de Trabajadores (Gestiones).
     *
     * `perms` = permisos efectivos del usuario (req.user.p). El endpoint solo exige `documentos.ver`,
     * que es MÁS amplio que `trabajadores.ver`: sin este parámetro la consulta devolvía `SELECT t.*`
     * crudo — domicilio, AFP, salud, banco, número de cuenta, causal de baja — a cualquiera que
     * pudiera ver documentos. La ruta ahora sanitiza la respuesta con `sanitizeTrabajadorPersonal`
     * (la misma allow-list que el quick-view) y acá se IGNORAN los filtros sobre columnas personales
     * cuando falta `trabajadores.ver`: sin eso, filtrar sería un oráculo para adivinar el dato que
     * la respuesta oculta (pedir `falta_dato=pago` y deducir quién tiene cuenta bancaria).
     */
    async searchTrabajadores(filters, perms) {
        const {
            q,
            obra_id,
            empresa_id,
            cargo_id,
            categoria_reporte,
            activo,
            completitud // '100', 'faltantes', 'todos'
        } = filters;

        // Los filtros que preguntan por columnas personales solo aplican si el usuario puede
        // VERLAS (misma llave que el sanitizer de la ruta). Sin esto, filtrar sería un oráculo:
        // pedir `falta_dato=pago` y deducir de los resultados quién tiene cuenta bancaria.
        const verPersonal = has(perms, 'trabajadores.ver');

        // 1. Get total mandatory docs (required to calculate percentage in DB)
        const [totalRows] = await db.query(
            'SELECT COUNT(*) as total FROM tipos_documento WHERE obligatorio = TRUE AND activo = TRUE'
        );
        const totalObligatorios = totalRows[0].total;

        let query = `
            SELECT 
                t.*,
                e.razon_social as empresa_nombre,
                o.nombre as obra_nombre,
                c.nombre as cargo_nombre,
                COALESCE(docs.uploaded, 0) as docs_subidos,
                ? as docs_totales
            FROM trabajadores t
            LEFT JOIN empresas e ON t.empresa_id = e.id
            LEFT JOIN obras o ON t.obra_id = o.id
            LEFT JOIN cargos c ON t.cargo_id = c.id
            LEFT JOIN (
                SELECT d.trabajador_id, COUNT(DISTINCT d.tipo_documento_id) as uploaded
                FROM documentos d
                JOIN tipos_documento td ON d.tipo_documento_id = td.id
                WHERE d.activo = TRUE
                  AND td.obligatorio = TRUE
                  AND td.activo = TRUE
                  -- Un documento vencido no cuenta como cumplido. Mismo predicado que la ficha
                  -- (trabajadores.routes.js). Hoy es inerte porque ningún tipo obligatorio tiene
                  -- dias_vigencia configurado — se alinea ahora para que el % de la grilla y el
                  -- de la ficha no empiecen a discrepar el día que alguien configure uno.
                  AND (td.dias_vigencia IS NULL OR d.fecha_vencimiento IS NULL OR d.fecha_vencimiento >= CURDATE())
                GROUP BY d.trabajador_id
            ) docs ON t.id = docs.trabajador_id
            WHERE 1=1
        `;

        const params = [totalObligatorios];

        // Aislamiento de prueba: por defecto se excluyen los trabajadores marcados.
        // Gestiones pasa incluir_prueba=true para verlos (con badge).
        if (filters.incluir_prueba !== 'true' && filters.incluir_prueba !== true) {
            query += ` AND t.es_prueba = 0`;
        }

        // Obras finalizadas: SIEMPRE fuera de Gestiones (no es concepto de prueba;
        // las obras concluidas viven solo en la sección "Obras Finalizadas").
        query += ` AND (t.obra_id IS NULL OR t.obra_id NOT IN (SELECT id FROM obras WHERE finalizada = 1))`;

        if (activo !== undefined && activo !== '') {
            query += ` AND t.activo = ?`;
            params.push(activo === 'true' || activo === true ? 1 : 0);
        }

        if (obra_id) {
            query += ` AND t.obra_id = ?`;
            params.push(obra_id);
        }

        if (empresa_id) {
            query += ` AND t.empresa_id = ?`;
            params.push(empresa_id);
        }

        if (cargo_id) {
            query += ` AND t.cargo_id = ?`;
            params.push(cargo_id);
        }

        if (categoria_reporte) {
            query += ` AND t.categoria_reporte = ?`;
            params.push(categoria_reporte);
        }

        if (q) {
            const words = q.trim().split(/\s+/).filter(w => w.length > 0);
            if (words.length > 0) {
                const blockConditions = [];
                words.forEach(word => {
                    blockConditions.push(`(t.rut LIKE ? OR t.nombres LIKE ? OR t.apellido_paterno LIKE ? OR t.apellido_materno LIKE ?)`);
                    const searchTerm = `%${word}%`;
                    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
                });
                query += ` AND (${blockConditions.join(' AND ')})`;
            }
        }

        if (completitud) {
            if (completitud === '100') {
                query += ` AND COALESCE(docs.uploaded, 0) >= ?`;
                params.push(totalObligatorios);
            } else if (completitud === 'faltantes') {
                query += ` AND COALESCE(docs.uploaded, 0) < ?`;
                params.push(totalObligatorios);
            }
        }

        // "Ausentes hoy". Dos arreglos (2026-09-15):
        //  · La fecha salía de `new Date().toISOString()` = UTC. Chile va 3-4 horas atrás, así que
        //    entre las 21:00 y medianoche la consulta preguntaba por MAÑANA y devolvía vacío.
        //    CURDATE() usa la hora del servidor MySQL, igual que las otras ~40 consultas del backend.
        //  · No aplicaba la regla de FILA VIGENTE (docs/reglas/asistencia.md): un trabajador
        //    trasladado queda marcado en dos obras el mismo día y la fila que manda es la más nueva.
        //    Sin el desempate, alguien marcado Ausente en la obra de origen y Presente en la de
        //    destino aparecía como ausente. Mismo criterio que usa la ficha rápida.
        if (filters.ausentes === 'true') {
            query += ` AND t.id IN (
                SELECT a.trabajador_id
                FROM asistencias a
                JOIN (
                    SELECT trabajador_id, MAX(id) AS mid
                    FROM asistencias
                    WHERE fecha = CURDATE()
                    GROUP BY trabajador_id
                ) v ON v.mid = a.id
                JOIN estados_asistencia ea ON a.estado_id = ea.id
                WHERE ea.es_presente = FALSE
            )`;
        }

        // Filtro "cumplen 10 meses de contrato" en un mes objetivo (formato YYYY-MM).
        // Mismo cálculo que la alerta del dashboard (dashboard.service § 5 "ALERTA 10
        // MESES DE CONTRATO"): fecha_ingreso + 10 meses cae en ese mes/año. Lo usa el
        // botón "Ver detalle" de esa alerta para abrir Gestiones ya filtrado.
        if (filters.aniversario10m) {
            const m = /^(\d{4})-(\d{1,2})$/.exec(String(filters.aniversario10m));
            if (m) {
                const year = parseInt(m[1], 10);
                const month = parseInt(m[2], 10);
                // Sargable: "cumple 10m en (year, month)" ⟺ "fecha_ingreso en el mes
                // (month - 10)". Rango sobre la columna en vez de MONTH(DATE_ADD(...))
                // → usa índice; idéntico (DATE_ADD conserva el mes destino).
                let m0 = month - 1 - 10, y0 = year;
                while (m0 < 0) { m0 += 12; y0 -= 1; }
                let m1 = m0 + 1, y1 = y0;
                if (m1 > 11) { m1 = 0; y1 += 1; }
                const ingresoDesde = `${y0}-${String(m0 + 1).padStart(2, '0')}-01`;
                const ingresoHasta = `${y1}-${String(m1 + 1).padStart(2, '0')}-01`;
                query += ` AND t.fecha_ingreso IS NOT NULL
                           AND t.fecha_ingreso >= ?
                           AND t.fecha_ingreso < ?`;
                params.push(ingresoDesde, ingresoHasta);
            }
        }

        // Filtro por rango de FECHA DE INGRESO (Gestiones: "ingresos del período",
        // p.ej. contrataciones del último mes). Ambos extremos opcionales e
        // inclusivos; rango directo sobre la columna (sargable, como aniversario10m).
        // Formato inválido se ignora (el filtro simplemente no aplica).
        const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
        if (filters.fecha_ingreso_desde && RE_FECHA.test(String(filters.fecha_ingreso_desde))) {
            query += ` AND t.fecha_ingreso >= ?`;
            params.push(filters.fecha_ingreso_desde);
        }
        if (filters.fecha_ingreso_hasta && RE_FECHA.test(String(filters.fecha_ingreso_hasta))) {
            query += ` AND t.fecha_ingreso <= ?`;
            params.push(filters.fecha_ingreso_hasta);
        }

        // ─────────────────────────────────────────────────────────────────────────
        //  Filtros de la tanda 2026-09-15. Dos reglas que no se pueden romper:
        //   1. Van ACÁ, entre el rango de fecha de ingreso y el ORDER BY. Un bloque después del
        //      ORDER BY produce SQL inválido; uno antes de los de fecha de ingreso rompe los
        //      cuatro tests de fiscalizacion_filtros.test.js, que comparan `params` con toEqual.
        //   2. Toda lista blanca va en un Map. Con un objeto literal, `FALTA_DATO['constructor']`
        //      devuelve una función que se interpolaría en la query — y `req.query` llega crudo
        //      al service (la ruta no tiene validateBody).
        // ─────────────────────────────────────────────────────────────────────────

        // "Falta en la ficha": el dato que bloquea una gestión concreta, no un campo cualquiera.
        //  · contrato → los 5 datos personales que imprime el contrato (contrato.plantilla.js).
        //    OJO: el contrato exige además representante de la empresa y sueldo del cargo, que no
        //    se pueden mirar desde acá sin romper el gate de cargos.sueldo.ver. Por eso la etiqueta
        //    dice "faltan datos personales", nunca "listo para emitir".
        //  · pago → sin cuenta RUT y sin banco/número no hay transferencia el día 5.
        //  · tallas → sin talla no se compra el EPP.
        const FALTA_DATO = new Map([
            ['contrato', `(t.nacionalidad IS NULL OR t.nacionalidad = ''
                        OR t.estado_civil IS NULL OR t.estado_civil = ''
                        OR t.fecha_nacimiento IS NULL
                        OR t.direccion IS NULL OR t.direccion = ''
                        OR t.comuna IS NULL OR t.comuna = '')`],
            ['pago', `(COALESCE(t.cuenta_rut, 0) = 0
                    AND (COALESCE(t.banco, '') = '' OR COALESCE(t.numero_cuenta, '') = ''))`],
            ['tallas', `(t.talla_calzado IS NULL OR t.talla_pantalon IS NULL
                      OR COALESCE(t.talla_polera, '') = '')`],
        ]);
        // 'tallas' es el único que no exige `trabajadores.ver`: las tallas están en la allow-list
        // operativa (compra de EPP). Los otros dos preguntan por columnas que la respuesta oculta,
        // y sin este gate filtrar sería un oráculo para deducirlas.
        if (FALTA_DATO.has(filters.falta_dato) && (verPersonal || filters.falta_dato === 'tallas')) {
            query += ` AND ${FALTA_DATO.get(filters.falta_dato)}`;
        }

        // "Le falta este documento": convierte "con pendientes" en una tarea concreta.
        // Por tipo_documento_id y NUNCA por td.codigo: los seis tipos obligatorios de producción
        // son de legado y tienen codigo NULL, así que un filtro por código sería ciego al histórico.
        // Usa idx_doc_trab_activo_tipo (trabajador_id, activo, tipo_documento_id).
        const tipoFalta = Number.parseInt(filters.doc_tipo_falta, 10);
        if (Number.isInteger(tipoFalta) && tipoFalta > 0) {
            query += ` AND NOT EXISTS (
                SELECT 1 FROM documentos d
                WHERE d.trabajador_id = t.id AND d.activo = TRUE AND d.tipo_documento_id = ?
            )`;
            params.push(tipoFalta);
        }

        // Vigencia de papeles: "¿está el papel?" (completitud) y "¿sirve el papel?" son preguntas
        // distintas. Cubre CUALQUIER tipo con vigencia configurada, igual que las alertas del Inicio
        // (dashboard.service.js), que hasta ahora contaban vencidos sin tener a dónde llevarte.
        // Usa idx_docs_activo_venc (activo, fecha_vencimiento).
        const DIAS_VIGENCIA = new Map([['30', 30], ['60', 60], ['90', 90]]);
        if (filters.doc_vigencia === 'vencido') {
            query += ` AND EXISTS (
                SELECT 1 FROM documentos d
                WHERE d.trabajador_id = t.id AND d.activo = TRUE
                  AND d.fecha_vencimiento IS NOT NULL AND d.fecha_vencimiento < CURDATE()
            )`;
        } else if (DIAS_VIGENCIA.has(filters.doc_vigencia)) {
            query += ` AND EXISTS (
                SELECT 1 FROM documentos d
                WHERE d.trabajador_id = t.id AND d.activo = TRUE
                  AND d.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
            )`;
            params.push(DIAS_VIGENCIA.get(filters.doc_vigencia));
        }

        // Rango de FECHA DE DESVINCULACIÓN ("salió entre"): bajas del período, y la cota que hace
        // usable el filtro de finiquito. Mismo patrón y misma validación que el rango de ingreso.
        if (filters.fecha_desvinc_desde && RE_FECHA.test(String(filters.fecha_desvinc_desde))) {
            query += ` AND t.fecha_desvinculacion >= ?`;
            params.push(filters.fecha_desvinc_desde);
        }
        if (filters.fecha_desvinc_hasta && RE_FECHA.test(String(filters.fecha_desvinc_hasta))) {
            query += ` AND t.fecha_desvinculacion <= ?`;
            params.push(filters.fecha_desvinc_hasta);
        }

        // "No recontratar": la grilla ya pinta el badge y era lo único visible que no se podía
        // preguntar. Columna NOT NULL DEFAULT 0, sin JOIN. Es un juicio sobre una persona, así que
        // exige `trabajadores.ver` igual que el sanitizer.
        if (verPersonal && (filters.no_recontratar === 'true' || filters.no_recontratar === '1')) {
            query += ` AND t.no_recontratar = 1`;
        }

        // "Finiquito pendiente": desvinculado sin finiquito emitido. El tipo FINIQUITO sí tiene
        // `codigo` (lo siembra la mig 110), a diferencia de los obligatorios de legado.
        if (filters.finiquito === 'pendiente') {
            query += ` AND t.activo = 0 AND NOT EXISTS (
                SELECT 1 FROM documentos d
                JOIN tipos_documento td2 ON td2.id = d.tipo_documento_id
                WHERE d.trabajador_id = t.id AND d.activo = TRUE AND td2.codigo = 'FINIQUITO'
            )`;
        }

        // "Fichas de prueba": Gestiones manda incluir_prueba=true fijo y la grilla pinta el badge,
        // pero no había forma de aislarlas ni de sacarlas de una lista.
        if (filters.solo_prueba === 'true' || filters.solo_prueba === '1') {
            query += ` AND t.es_prueba = 1`;
        }

        query += ` ORDER BY t.apellido_paterno ASC, t.apellido_materno ASC, t.nombres ASC`;

        const [rows] = await db.query(query, params);

        // Map percentage
        return rows.map(row => {
            const percentage = totalObligatorios === 0 ? 100 : Math.round((row.docs_subidos / totalObligatorios) * 100);
            return {
                ...row,
                docs_porcentaje: percentage
            };
        });
    }

    /**
     * Genera un reporte Excel de fiscalización - DEPRECADO (Usar asistenciaService)
     */
}

module.exports = new FiscalizacionService();
