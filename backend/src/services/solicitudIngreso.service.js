/**
 * Ficha de ingreso digital — solicitudes de nuevo trabajador con aprobación.
 *
 * Flujo: terreno (`trabajadores.solicitud.crear`) crea una SOLICITUD desde
 * Gestiones → oficina (`trabajadores.solicitud.aprobar`) la revisa, corrige,
 * asigna la EMPRESA y la aprueba (crea el trabajador) o la rechaza con motivo
 * visible al solicitante. Sin SoD solicitante≠aprobador: un administrativo
 * puede crear y aprobar (decisión del dueño 2026-09-07).
 *
 * Anti-duplicados: el RUT bloquea si ya existe en `trabajadores` — ACTIVO o
 * FINIQUITADO (si está finiquitado, la oficina lo reactiva en vez de crear
 * otro) — o si hay otra solicitud PENDIENTE con ese RUT. Comparación por
 * `rut_normalized` (columna GENERATED + índice, mig 053; collation _ci → la
 * K mayúscula/minúscula no importa).
 *
 * Aislamiento de datos de prueba (docs/reglas/obras-bodegas.md): los listados
 * y el contador excluyen solicitudes de obras `es_prueba=1` salvo
 * `?incluir_prueba=true`, igual que el CRUD de trabajadores en Gestiones.
 * check-rut NO filtra: un duplicado es duplicado aunque sea de prueba.
 *
 * Errores: throw Object.assign(new Error(msg), { statusCode }) como el resto
 * del repo (errorHandler los traduce).
 */
const db = require('../config/db');
const { cleanRut, formatRut, validateRut } = require('../utils/rut');
const { logManualActivity } = require('../middleware/logger');
const logger = require('../utils/logger-structured');

const PERMISO_APROBAR = 'trabajadores.solicitud.aprobar';
const ESTADOS = ['pendiente', 'aprobada', 'rechazada'];
const CATEGORIAS_REPORTE = ['obra', 'operaciones', 'rotativo'];
// Ficha completa (mig 109): tallas y cuenta bancaria.
const TALLAS_POLERA = ['S', 'M', 'L', 'XL', 'XXL'];
const TIPOS_CUENTA = ['vista', 'corriente'];
const BANCO_CUENTA_RUT = 'BancoEstado';

// Campos de la ficha que viven tanto en solicitudes_ingreso como en trabajadores.
const CAMPOS_FICHA = [
    'rut', 'nombres', 'apellido_paterno', 'apellido_materno',
    'cargo_id', 'obra_id', 'fecha_ingreso',
    'fecha_nacimiento', 'estado_civil', 'direccion', 'comuna',
    'afp', 'salud', 'nacionalidad', 'telefono', 'cargas_familiares',
    'talla_calzado', 'talla_pantalon', 'talla_polera',
    'cuenta_rut', 'banco', 'tipo_cuenta', 'numero_cuenta',
    'observaciones',
];
// Los que se copian al trabajador al aprobar: `observaciones` es solo de la
// solicitud (trabajadores NO tiene esa columna → ER_BAD_FIELD_ERROR si se incluye).
const CAMPOS_TRABAJADOR = CAMPOS_FICHA.filter(c => c !== 'observaciones');

const httpError = (msg, statusCode) => Object.assign(new Error(msg), { statusCode });

const strOrNull = (v) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s ? s : null;
};

const intOrNull = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) ? n : null;
};

// validateBody ya exige boolean real; acá solo se tolera ausencia.
const boolOrNull = (v) => (v === undefined || v === null || v === '' ? null : v === true);

/** Entero opcional dentro de [min, max] o 400 con el nombre del campo. */
const intEnRango = (v, nombre, min, max) => {
    const n = intOrNull(v);
    if (n !== null && (n < min || n > max)) {
        throw httpError(`${nombre} debe estar entre ${min} y ${max}`, 400);
    }
    return n;
};

/** Texto opcional restringido a una lista, o 400. */
const enLista = (v, nombre, lista) => {
    const s = strOrNull(v);
    if (s !== null && !lista.includes(s)) {
        throw httpError(`${nombre} debe ser uno de: ${lista.join(', ')}`, 400);
    }
    return s;
};

// Solo la parte YYYY-MM-DD (tolera ISO completo si el front manda un Date serializado).
const dateOrNull = (v) => {
    const s = strOrNull(v);
    if (!s) return null;
    return s.length > 10 ? s.slice(0, 10) : s;
};

const nombreCompleto = (t) => [t.apellido_paterno, t.apellido_materno, t.nombres].filter(Boolean).join(' ');

const puedeAprobar = (user) => Array.isArray(user?.p) && user.p.includes(PERMISO_APROBAR);

const parseId = (id) => {
    const n = Number(id);
    if (!Number.isInteger(n) || n < 1) throw httpError('Solicitud no encontrada', 404);
    return n;
};

// NULL-safe: solicitud sin obra (FK ON DELETE SET NULL) sigue visible.
const EXCLUIR_OBRAS_PRUEBA =
    ' AND (s.obra_id IS NULL OR s.obra_id NOT IN (SELECT id FROM obras WHERE es_prueba = 1))';

const SELECT_SOLICITUD = `
    SELECT s.*,
           c.nombre       AS cargo_nombre,
           o.nombre       AS obra_nombre,
           e.razon_social AS empresa_nombre,
           us.nombre      AS solicitante_nombre,
           ur.nombre      AS resuelto_por_nombre
    FROM solicitudes_ingreso s
    LEFT JOIN cargos   c  ON c.id  = s.cargo_id
    LEFT JOIN obras    o  ON o.id  = s.obra_id
    LEFT JOIN empresas e  ON e.id  = s.empresa_id
    LEFT JOIN usuarios us ON us.id = s.solicitante_id
    LEFT JOIN usuarios ur ON ur.id = s.resuelto_por`;

/**
 * Normaliza y valida la ficha (POST crear y PUT aprobar comparten forma).
 * validateBody ya garantizó tipos/largos; acá van las reglas de negocio:
 * DV del RUT, trims, '' → NULL, rangos.
 */
function _normalizarFicha(data = {}) {
    const rutIn = strOrNull(data.rut);
    if (!rutIn || !validateRut(rutIn)) throw httpError('RUT inválido (revisa el dígito verificador)', 400);

    const nombres = strOrNull(data.nombres);
    const apellidoPaterno = strOrNull(data.apellido_paterno);
    if (!nombres) throw httpError('nombres es requerido', 400);
    if (!apellidoPaterno) throw httpError('apellido_paterno es requerido', 400);

    const cargoId = intOrNull(data.cargo_id);
    const obraId = intOrNull(data.obra_id);
    if (!cargoId) throw httpError('cargo_id es requerido', 400);
    if (!obraId) throw httpError('obra_id es requerido', 400);

    const fechaIngreso = dateOrNull(data.fecha_ingreso);
    if (!fechaIngreso) throw httpError('fecha_ingreso es requerida', 400);

    const cargas = intOrNull(data.cargas_familiares);
    if (cargas !== null && (cargas < 0 || cargas > 255)) {
        throw httpError('cargas_familiares debe estar entre 0 y 255', 400);
    }

    const rut = formatRut(rutIn);

    // Pago de remuneraciones (mig 109). Cuenta RUT = SÍ → BancoEstado / vista /
    // número = RUT sin DV, derivados acá (fuente de verdad) ignorando lo que
    // mande el cliente. NO → banco/tipo/número tal como vienen (opcionales).
    const cuentaRut = boolOrNull(data.cuenta_rut);
    let banco = strOrNull(data.banco);
    let tipoCuenta = enLista(data.tipo_cuenta, 'tipo_cuenta', TIPOS_CUENTA);
    let numeroCuenta = strOrNull(data.numero_cuenta);
    if (numeroCuenta !== null && !/^[A-Za-z0-9-]{1,30}$/.test(numeroCuenta)) {
        throw httpError('numero_cuenta solo admite dígitos, letras y guiones (máx. 30)', 400);
    }
    if (cuentaRut === true) {
        banco = BANCO_CUENTA_RUT;
        tipoCuenta = 'vista';
        numeroCuenta = cleanRut(rut).slice(0, -1);   // cuerpo del RUT sin dígito verificador
    }

    return {
        rut,
        nombres,
        apellido_paterno: apellidoPaterno,
        apellido_materno: strOrNull(data.apellido_materno),
        cargo_id: cargoId,
        obra_id: obraId,
        fecha_ingreso: fechaIngreso,
        fecha_nacimiento: dateOrNull(data.fecha_nacimiento),
        estado_civil: strOrNull(data.estado_civil),
        direccion: strOrNull(data.direccion),
        comuna: strOrNull(data.comuna),
        afp: strOrNull(data.afp),
        salud: strOrNull(data.salud),
        nacionalidad: strOrNull(data.nacionalidad),
        telefono: strOrNull(data.telefono),
        cargas_familiares: cargas,
        talla_calzado: intEnRango(data.talla_calzado, 'talla_calzado', 35, 47),
        talla_pantalon: intEnRango(data.talla_pantalon, 'talla_pantalon', 38, 50),
        talla_polera: enLista(strOrNull(data.talla_polera)?.toUpperCase(), 'talla_polera', TALLAS_POLERA),
        cuenta_rut: cuentaRut,
        banco,
        tipo_cuenta: tipoCuenta,
        numero_cuenta: numeroCuenta,
        observaciones: strOrNull(data.observaciones),
    };
}

/** Trabajador (activo O finiquitado) con ese RUT, o null. `conn` = pool o conexión. */
async function _buscarTrabajadorPorRut(conn, cleaned) {
    const [rows] = await conn.query(
        `SELECT id, nombres, apellido_paterno, apellido_materno, activo
         FROM trabajadores
         WHERE rut_normalized = ?
         LIMIT 1`,
        [cleaned]
    );
    return rows.length ? rows[0] : null;
}

/** Solicitud PENDIENTE con ese RUT (opcionalmente excluyendo una), o null. */
async function _buscarPendientePorRut(conn, cleaned, excluirId = null) {
    const params = [cleaned];
    let sql = `SELECT id FROM solicitudes_ingreso
               WHERE estado = 'pendiente'
                 AND REPLACE(REPLACE(UPPER(rut), '.', ''), '-', '') = ?`;
    if (excluirId) { sql += ' AND id <> ?'; params.push(excluirId); }
    sql += ' LIMIT 1';
    const [rows] = await conn.query(sql, params);
    return rows.length ? rows[0] : null;
}

function _errorTrabajadorExiste(t) {
    const nombre = nombreCompleto(t);
    const estado = (t.activo === false || t.activo === 0) ? ', finiquitado' : '';
    return httpError(
        `Ya existe un trabajador con este RUT (${nombre}${estado}). Revisa la digitación; si el RUT es correcto, contacta a administración por WhatsApp.`,
        409
    );
}

async function _getRow(id, conn = db) {
    const [rows] = await conn.query(`${SELECT_SOLICITUD} WHERE s.id = ?`, [id]);
    return rows.length ? rows[0] : null;
}

const solicitudIngresoService = {
    /**
     * GET /check-rut/:rut — validación en vivo del primer campo del formulario.
     * No exige RUT válido: con un RUT incompleto responde "no existe" para que
     * el front no muestre errores mientras se tipea.
     */
    async checkRut(rut) {
        const cleaned = cleanRut(rut);
        const vacio = { existe_trabajador: false, trabajador: null, solicitud_pendiente: null };
        if (!cleaned) return vacio;

        const trabajador = await _buscarTrabajadorPorRut(db, cleaned);
        const pendiente = await _buscarPendientePorRut(db, cleaned);

        return {
            existe_trabajador: !!trabajador,
            trabajador: trabajador
                ? { id: trabajador.id, nombre: nombreCompleto(trabajador), activo: !!trabajador.activo }
                : null,
            solicitud_pendiente: pendiente ? { id: pendiente.id } : null,
        };
    },

    /**
     * POST / — terreno crea la solicitud (estado pendiente).
     * 400 RUT inválido / faltan obligatorios; 409 RUT ya en trabajadores
     * (activo o finiquitado) o con otra solicitud pendiente.
     */
    async crear(data, userId) {
        const ficha = _normalizarFicha(data);
        const cleaned = cleanRut(ficha.rut);

        const existente = await _buscarTrabajadorPorRut(db, cleaned);
        if (existente) throw _errorTrabajadorExiste(existente);

        const pendiente = await _buscarPendientePorRut(db, cleaned);
        if (pendiente) {
            throw httpError(`Ya existe una solicitud de ingreso pendiente para este RUT (#${pendiente.id}).`, 409);
        }

        const cols = [...CAMPOS_FICHA, 'solicitante_id'];
        const values = [...CAMPOS_FICHA.map(c => ficha[c]), userId];
        const [result] = await db.query(
            `INSERT INTO solicitudes_ingreso (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
            values
        );

        logger.info('Solicitud de ingreso creada', { solicitudId: result.insertId, rut: ficha.rut, userId });
        return _getRow(result.insertId);
    },

    /**
     * GET /?estado=pendiente|aprobada|rechazada|todas (default todas).
     * Con `solicitud.aprobar` ve todas; sin él, solo las propias.
     * Excluye obras es_prueba salvo ?incluir_prueba=true.
     */
    async listar(query = {}, user = {}) {
        const estado = query.estado ? String(query.estado) : 'todas';
        if (estado !== 'todas' && !ESTADOS.includes(estado)) {
            throw httpError(`estado debe ser uno de: ${[...ESTADOS, 'todas'].join(', ')}`, 400);
        }

        const where = [];
        const params = [];
        if (estado !== 'todas') { where.push('s.estado = ?'); params.push(estado); }
        if (!puedeAprobar(user)) { where.push('s.solicitante_id = ?'); params.push(user.id); }

        let sql = `${SELECT_SOLICITUD} WHERE ${where.length ? where.join(' AND ') : '1=1'}`;
        const incluirPrueba = query.incluir_prueba === 'true' || query.incluir_prueba === true;
        if (!incluirPrueba) sql += EXCLUIR_OBRAS_PRUEBA;
        // Pendientes primero (son las que hay que atender); luego lo más reciente.
        sql += " ORDER BY (s.estado = 'pendiente') DESC, s.fecha_solicitud DESC, s.id DESC";

        const [rows] = await db.query(sql, params);
        return rows;
    },

    /** GET /:id — 404 si no existe; 403 si es ajena y el usuario no aprueba. */
    async getById(id, user = {}) {
        const sid = parseId(id);
        const row = await _getRow(sid);
        if (!row) throw httpError('Solicitud no encontrada', 404);
        if (!puedeAprobar(user) && row.solicitante_id !== user.id) {
            throw httpError('No tienes permiso para ver esta solicitud', 403);
        }
        return row;
    },

    /**
     * PUT /:id/aprobar — la oficina aprueba con la ficha COMPLETA ya revisada
     * (puede haber corregido cualquier campo) + empresa_id obligatoria.
     * Transacción: FOR UPDATE + guard pendiente (409) + RUT único (409) +
     * INSERT trabajadores (hereda es_prueba de la obra, como el beforeCreate
     * del CRUD) + UPDATE solicitud con la ficha final. Devuelve
     * { solicitud, trabajador_id }.
     */
    async aprobar(id, payload = {}, userId, req = null) {
        const sid = parseId(id);
        const ficha = _normalizarFicha(payload);

        const empresaId = intOrNull(payload.empresa_id);
        if (!empresaId) throw httpError('empresa_id es requerido para crear el trabajador', 400);

        const categoria = strOrNull(payload.categoria_reporte) || 'obra';
        if (!CATEGORIAS_REPORTE.includes(categoria)) {
            throw httpError(`categoria_reporte debe ser uno de: ${CATEGORIAS_REPORTE.join(', ')}`, 400);
        }

        const cleaned = cleanRut(ficha.rut);
        let trabajadorId;

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // Lock pesimista: dos aprobaciones simultáneas de la misma solicitud
            // (o de dos solicitudes con el mismo RUT) se serializan acá.
            const [rows] = await conn.query(
                'SELECT id, estado FROM solicitudes_ingreso WHERE id = ? FOR UPDATE',
                [sid]
            );
            if (!rows.length) throw httpError('Solicitud no encontrada', 404);
            if (rows[0].estado !== 'pendiente') {
                throw httpError(`La solicitud ya fue ${rows[0].estado}`, 409);
            }

            // Re-validar RUT único: pudo crearse el trabajador por otra vía
            // (WorkerForm) entre la solicitud y la aprobación.
            const existente = await _buscarTrabajadorPorRut(conn, cleaned);
            if (existente) throw _errorTrabajadorExiste(existente);

            // Herencia es_prueba desde la obra (réplica del beforeCreate de
            // trabajadores en index.js): booleano real por typeCast, 1 legacy.
            const [obraRows] = await conn.query('SELECT es_prueba FROM obras WHERE id = ?', [ficha.obra_id]);
            const esPrueba = obraRows.length && (obraRows[0].es_prueba === 1 || obraRows[0].es_prueba === true) ? 1 : 0;

            const trabCols = [...CAMPOS_TRABAJADOR, 'empresa_id', 'categoria_reporte', 'activo', 'es_prueba'];
            const trabVals = [...CAMPOS_TRABAJADOR.map(c => ficha[c]), empresaId, categoria, 1, esPrueba];
            let insert;
            try {
                [insert] = await conn.query(
                    `INSERT INTO trabajadores (${trabCols.join(', ')}) VALUES (${trabCols.map(() => '?').join(', ')})`,
                    trabVals
                );
            } catch (err) {
                // Carrera perdida contra la UNIQUE(rut): mensaje del dominio, no el genérico.
                if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
                    throw httpError('Ya existe un trabajador con este RUT. Revisa la digitación o reactívalo desde Trabajadores.', 409);
                }
                throw err;
            }
            trabajadorId = insert.insertId;

            const setFicha = CAMPOS_FICHA.map(c => `${c} = ?`).join(', ');
            await conn.query(
                `UPDATE solicitudes_ingreso
                    SET ${setFicha},
                        empresa_id = ?,
                        estado = 'aprobada',
                        trabajador_id = ?,
                        resuelto_por = ?,
                        fecha_resolucion = NOW()
                  WHERE id = ?`,
                [...CAMPOS_FICHA.map(c => ficha[c]), empresaId, trabajadorId, userId, sid]
            );

            // Cierre de duplicados: `crear` no serializa el check anti-duplicado con
            // su INSERT (rut no es UNIQUE por diseño), así que dos POST simultáneos
            // pueden dejar DOS pendientes del mismo RUT. Al aprobar una, las otras
            // quedan rechazadas con motivo visible para que no inflen el badge.
            await conn.query(
                `UPDATE solicitudes_ingreso
                    SET estado = 'rechazada',
                        motivo_rechazo = CONCAT('Trabajador ya creado desde la solicitud #', ?),
                        resuelto_por = ?,
                        fecha_resolucion = NOW()
                  WHERE estado = 'pendiente'
                    AND id <> ?
                    AND REPLACE(REPLACE(UPPER(rut), '.', ''), '-', '') = ?`,
                [sid, userId, sid, cleaned]
            );

            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        const nombre = `${ficha.nombres} ${ficha.apellido_paterno}`;
        await logManualActivity(
            userId, 'solicitudes_ingreso', 'UPDATE', String(sid),
            JSON.stringify({
                evento: 'solicitud_aprobada',
                trabajador_id: trabajadorId,
                rut: ficha.rut,
                resumen: `Solicitud de ingreso #${sid} aprobada → trabajador #${trabajadorId} ${nombre}`,
            }),
            req
        );
        logger.info('Solicitud de ingreso aprobada', { solicitudId: sid, trabajadorId, userId });

        const solicitud = await _getRow(sid);
        return { solicitud, trabajador_id: trabajadorId };
    },

    /**
     * PUT /:id/rechazar {motivo} — motivo obligatorio (400 si vacío/blank),
     * guard pendiente (409). El motivo queda visible al solicitante.
     */
    async rechazar(id, motivo, userId) {
        const sid = parseId(id);
        const motivoLimpio = strOrNull(motivo);
        if (!motivoLimpio) throw httpError('El motivo de rechazo es obligatorio', 400);

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [rows] = await conn.query(
                'SELECT id, estado FROM solicitudes_ingreso WHERE id = ? FOR UPDATE',
                [sid]
            );
            if (!rows.length) throw httpError('Solicitud no encontrada', 404);
            if (rows[0].estado !== 'pendiente') {
                throw httpError(`La solicitud ya fue ${rows[0].estado}`, 409);
            }

            await conn.query(
                `UPDATE solicitudes_ingreso
                    SET estado = 'rechazada',
                        motivo_rechazo = ?,
                        resuelto_por = ?,
                        fecha_resolucion = NOW()
                  WHERE id = ?`,
                [motivoLimpio, userId, sid]
            );

            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        logger.info('Solicitud de ingreso rechazada', { solicitudId: sid, userId });
        return _getRow(sid);
    },

    /** GET /pendientes/count — badge del sidebar. Excluye obras es_prueba. */
    async contarPendientes(query = {}) {
        const incluirPrueba = query.incluir_prueba === 'true' || query.incluir_prueba === true;
        let sql = "SELECT COUNT(*) AS total FROM solicitudes_ingreso s WHERE s.estado = 'pendiente'";
        if (!incluirPrueba) sql += EXCLUIR_OBRAS_PRUEBA;
        const [rows] = await db.query(sql);
        return { total: Number(rows[0]?.total || 0) };
    },
};

module.exports = solicitudIngresoService;
