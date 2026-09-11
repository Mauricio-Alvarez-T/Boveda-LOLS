const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const db = require('../config/db');
const { cleanRut } = require('../utils/rut');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger-structured');
const validateBody = require('../middleware/validateBody');
const desvinculacionService = require('../services/desvinculacion.service');
const trabajadoresSchema = require('../schemas/trabajadores.schema');
const { sanitizeTrabajadorPersonal, sanitizeTrabajadorFinanciero } = require('../utils/sanitizeFinancialFields');

// Verificar si un RUT ya existe — usado por el formulario de creación para
// avisar en vivo "este trabajador ya existe" sin tener que enviar el form.
// Ruta de 2 segmentos (/check-rut/:rut): NO colisiona con el GET '/:id' del
// CRUD genérico (que matchea solo 1 segmento), igual que /:id/quick-view.
// Normaliza ambos lados (sin puntos/guion, mayúsculas) para tolerar RUTs
// guardados con formato distinto.
router.get('/check-rut/:rut', auth, checkPermission('trabajadores.crear'), async (req, res, next) => {
    try {
        const cleaned = cleanRut(req.params.rut);
        if (!cleaned) return res.json({ exists: false, trabajador: null });

        const [rows] = await db.query(
            `SELECT id, nombres, apellido_paterno, apellido_materno, activo
             FROM trabajadores
             WHERE REPLACE(REPLACE(UPPER(rut), '.', ''), '-', '') = ?
             LIMIT 1`,
            [cleaned]
        );

        if (!rows.length) return res.json({ exists: false, trabajador: null });

        const t = rows[0];
        const nombre = [t.apellido_paterno, t.apellido_materno, t.nombres].filter(Boolean).join(' ');
        // Finiquitado: se agrega la última desvinculación (causal, fecha, marca) para que el aviso
        // de WorkerForm muestre el antecedente. Solo advierte (decisión del dueño 2026-09-10).
        const ultima = t.activo ? null : await desvinculacionService.ultimaDesvinculacion(t.id, { modo: 'resumen' });
        res.json({ exists: true, trabajador: { id: t.id, nombre, activo: !!t.activo }, ...(ultima ? { ultima_desvinculacion: ultima } : {}) });
    } catch (err) { next(err); }
});

// ─── Desvinculación con causal + historial (plan Gestiones B4, mig 112) ───────────────────────
// Catálogo: ruta de 2 segmentos (`/catalogos/...`) para que no la capture el GET /:id del CRUD
// genérico montado antes en index.js. Solo auth: no expone datos de personas.
router.get('/catalogos/causales-desvinculacion', auth, (req, res) => {
    res.json({ data: desvinculacionService.catalogo() });
});

// Desvincular = trabajadores.eliminar ("Finiquitar Trabajador"). Antes el backend aceptaba
// PUT /:id {activo:false} con trabajadores.editar; index.js ahora lo bloquea (guard + allowedFields).
router.put('/:id/desvincular', auth, checkPermission('trabajadores.eliminar'), validateBody(trabajadoresSchema.desvincular, { strip: true }), async (req, res, next) => {
    try {
        res.json({ data: await desvinculacionService.desvincular(req.params.id, req.body, req.user.id, req) });
    } catch (err) { next(err); }
});

// Reactivar = trabajadores.reactivar. La marca "no recontratar" SOLO advierte: nunca 409 por ella.
router.put('/:id/reactivar', auth, checkPermission('trabajadores.reactivar'), validateBody(trabajadoresSchema.reactivar, { strip: true }), async (req, res, next) => {
    try {
        res.json({ data: await desvinculacionService.reactivar(req.params.id, req.body, req.user.id, req) });
    } catch (err) { next(err); }
});

// Historial completo (incluye `detalle`): solo quien puede desvincular o reactivar.
router.get('/:id/desvinculaciones', auth, checkPermission('trabajadores.eliminar', 'trabajadores.reactivar'), async (req, res, next) => {
    try {
        res.json({ data: await desvinculacionService.listar(Number(req.params.id)) });
    } catch (err) { next(err); }
});

// Worker Quick-View (combines worker info + doc completion + recent attendance)
// Gate: `trabajadores.ver` OR `asistencia.ver` (la ficha rápida también se abre desde la
// pantalla diaria de Asistencia). Los datos personales/bancarios de la ficha (migs 108/109)
// solo viajan con `trabajadores.ver`: `sanitizeTrabajadorPersonal` aplica una allow-list de
// columnas operativas (deny-by-default, una columna nueva no se filtra sola). B1 plan Gestiones.
router.get('/:id/quick-view', auth, checkPermission('trabajadores.ver', 'asistencia.ver'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const perms = req.user?.p || [];

        // 1. Worker basic info
        const [workers] = await db.query(
            `SELECT t.*, e.razon_social as empresa_nombre, o.nombre as obra_nombre, c.nombre as cargo_nombre
             FROM trabajadores t
             LEFT JOIN empresas e ON t.empresa_id = e.id
             LEFT JOIN obras o ON t.obra_id = o.id
             LEFT JOIN cargos c ON t.cargo_id = c.id
             WHERE t.id = ?`, [id]
        );
        if (!workers.length) return res.status(404).json({ error: 'Trabajador no encontrado' });

        // 2. Document completion
        const [totalDocs] = await db.query(`SELECT COUNT(*) as total FROM tipos_documento WHERE activo = TRUE AND obligatorio = TRUE`);
        const [completedDocs] = await db.query(
            `SELECT COUNT(DISTINCT d.tipo_documento_id) as completed
             FROM documentos d
             JOIN tipos_documento td ON d.tipo_documento_id = td.id
             WHERE d.trabajador_id = ? AND d.activo = TRUE AND td.obligatorio = TRUE
               AND (td.dias_vigencia IS NULL OR d.fecha_vencimiento IS NULL OR d.fecha_vencimiento >= CURDATE())`,
            [id]
        );

        // 3. Last 5 attendance records — solo la fila VIGENTE por día (con
        // duplicados cross-obra gana la más nueva; regla en docs/reglas/asistencia.md).
        const [attendance] = await db.query(
            `SELECT a.fecha, a.hora_entrada, a.hora_salida, a.horas_extra, a.observacion,
                    ea.nombre as estado_nombre, ea.codigo as estado_codigo, ea.color as estado_color, ea.es_presente,
                    ta.nombre as tipo_ausencia_nombre
             FROM asistencias a
             JOIN (SELECT MAX(id) AS mid FROM asistencias WHERE trabajador_id = ? GROUP BY fecha) v ON v.mid = a.id
             LEFT JOIN estados_asistencia ea ON a.estado_id = ea.id
             LEFT JOIN tipos_ausencia ta ON a.tipo_ausencia_id = ta.id
             ORDER BY a.fecha DESC
             LIMIT 5`, [id]
        );

        res.json({
            worker: sanitizeTrabajadorFinanciero(sanitizeTrabajadorPersonal(workers[0], perms), perms),
            docs: {
                total: totalDocs[0].total,
                completed: completedDocs[0].completed
            },
            recentAttendance: attendance
        });
    } catch (err) { next(err); }
});

// Ficha-resumen del trabajador: datos de contrato + stats de asistencia agregados.
// Solo lectura. "Día trabajado" = estados con cuenta_dia_trabajado=1 (NO es_presente);
// "falta" = código 'F' (ver docs/reglas/asistencia.md). Las asistencias solo existen
// dentro del período laboral, así que se cuentan todas las del trabajador.
router.get('/:id/resumen', auth, checkPermission('trabajadores.ver'), async (req, res, next) => {
    try {
        const { id } = req.params;

        const [contrato] = await db.query(
            `SELECT fecha_ingreso, fecha_desvinculacion, activo FROM trabajadores WHERE id = ?`,
            [id]
        );
        if (!contrato.length) return res.status(404).json({ error: 'Trabajador no encontrado' });

        const [stats] = await db.query(
            `SELECT
                COUNT(DISTINCT CASE WHEN ea.cuenta_dia_trabajado = 1 THEN a.fecha END) AS dias_trabajados,
                COUNT(DISTINCT CASE WHEN ea.codigo = 'F'            THEN a.fecha END) AS faltas,
                COUNT(DISTINCT CASE WHEN ea.es_presente = 1         THEN a.fecha END) AS dias_presente,
                COUNT(DISTINCT CASE WHEN ea.codigo = 'V'            THEN a.fecha END) AS dias_vacaciones,
                COUNT(DISTINCT CASE WHEN ea.codigo = 'LM'           THEN a.fecha END) AS dias_licencia,
                COUNT(DISTINCT a.fecha) AS dias_registrados
             FROM asistencias a
             JOIN estados_asistencia ea ON a.estado_id = ea.id
             WHERE a.trabajador_id = ?`,
            [id]
        );
        const s = stats[0] || {};
        const ultimaDesv = contrato[0].activo ? null : await desvinculacionService.ultimaDesvinculacion(id, { modo: 'resumen' });

        res.json({
            data: {
                fecha_ingreso: contrato[0].fecha_ingreso,
                fecha_desvinculacion: contrato[0].fecha_desvinculacion,
                activo: !!contrato[0].activo,
                dias_trabajados: Number(s.dias_trabajados || 0),
                faltas: Number(s.faltas || 0),
                dias_presente: Number(s.dias_presente || 0),
                dias_vacaciones: Number(s.dias_vacaciones || 0),
                dias_licencia: Number(s.dias_licencia || 0),
                dias_registrados: Number(s.dias_registrados || 0),
                ultima_desvinculacion: ultimaDesv,
            }
        });
    } catch (err) { next(err); }
});

// Depuración permanente (Hard delete en cascada)
router.delete('/:id/depurar', auth, checkPermission('trabajadores.depurar'), async (req, res, next) => {
    let connection;
    try {
        const { id } = req.params;
        connection = await db.getConnection();
        
        await connection.beginTransaction();

        // 1. Verificamos que exista y esté inactivo (finiquitado)
        const [workers] = await connection.query('SELECT activo FROM trabajadores WHERE id = ?', [id]);
        if (!workers.length) {
            await connection.rollback();
            return res.status(404).json({ error: 'Trabajador no encontrado' });
        }
        if (workers[0].activo) {
            await connection.rollback();
            return res.status(400).json({ error: 'Solo se pueden eliminar permanentemente trabajadores inactivos (finiquitados)' });
        }

        // 1b. Evidencia laboral: con finiquito emitido o documentos generados por Bóveda no se depura (409).
        await desvinculacionService.guardDepurar(connection, id);

        // 2. Opcional: Borrar archivos físicos
        const [docs] = await connection.query('SELECT ruta_archivo FROM documentos WHERE trabajador_id = ?', [id]);
        
        // 3. Borrar registros de documentos
        await connection.query('DELETE FROM documentos WHERE trabajador_id = ?', [id]);

        // 4. Borrar registros de asistencia
        await connection.query('DELETE FROM asistencias WHERE trabajador_id = ?', [id]);

        // 5. Borrar el trabajador
        await connection.query('DELETE FROM trabajadores WHERE id = ?', [id]);

        await connection.commit();

        // 6. Eliminar archivos físicos asincrónicamente (best effort)
        try {
            docs.forEach(doc => {
                if (doc.ruta_archivo) {
                    const filePath = path.join(__dirname, '../../uploads', doc.ruta_archivo);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                }
            });
        } catch (fileErr) {
            logger.error('Error al borrar archivos físicos del trabajador depurado', { err: fileErr.message });
        }

        res.json({ success: true, message: 'Registro del trabajador depurado exitosamente' });
    } catch (err) {
        if (connection) await connection.rollback();
        next(err);
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
