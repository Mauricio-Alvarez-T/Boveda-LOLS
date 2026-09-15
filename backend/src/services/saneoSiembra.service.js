/**
 * Siembra de datos ficticios para staging (2026-09-15). Complementa saneoStaging.service: aquel
 * purga lo real, este deja un entorno con el que se pueda hacer QA de verdad.
 *
 * Todo es DETERMINISTA por índice: la misma corrida produce el mismo set, así que es idempotente
 * (INSERT IGNORE por RUT / nombre) y se puede repetir sin duplicar.
 *
 * Los trabajadores llevan RUT del bloque ficticio (44.000.xxx) — el marcador que distingue lo
 * sembrado de una importación real — y `es_prueba = 0` A PROPÓSITO: con 1, la mig 066 los
 * escondería de reportes, KPIs, asistencia y selectores, y el QA quedaría en blanco.
 *
 * `db` se inyecta como parámetro → testeable sin base real.
 */
const { rutFicticio } = require('./saneoStaging.service');

const N_TRABAJADORES = 40;

const CARGOS = [
    'Administrador de Obra', 'Jefe de Terreno', 'Prevencionista de Riesgos', 'Capataz',
    'Maestro Mayor', 'Maestro Primera', 'Ayudante', 'Jornal', 'Operador de Grúa', 'Bodeguero',
];

const EMPRESAS = [
    { rut: '44.000.900-K', razon_social: 'Constructora Demo Uno SpA', direccion: 'Av. Ficticia 100, Santiago' },
    { rut: '44.000.901-8', razon_social: 'Ingeniería Demo Dos Ltda.', direccion: 'Calle Ejemplo 250, Maipú' },
    { rut: '44.000.902-6', razon_social: 'Servicios Demo Tres S.A.', direccion: 'Pasaje Prueba 45, Ñuñoa' },
];

const OBRAS = [
    { nombre: 'Obra Demo Norte', direccion: 'Av. Ficticia 1200', empresaIdx: 0 },
    { nombre: 'Obra Demo Centro', direccion: 'Calle Ejemplo 800', empresaIdx: 0 },
    { nombre: 'Obra Demo Sur', direccion: 'Pasaje Prueba 90', empresaIdx: 1 },
    { nombre: 'Obra Demo Poniente', direccion: 'Camino Demo 3400', empresaIdx: 2 },
];

const NOMBRES = ['Ana', 'Luis', 'Carla', 'Diego', 'Marta', 'Iván', 'Sofía', 'Bruno', 'Elena', 'Hugo'];
const APELLIDOS = ['Demo', 'Prueba', 'Ejemplo', 'Ficticio', 'Muestra', 'Testeo', 'Simulado', 'Modelo'];
const COMUNAS = ['Maipú', 'Ñuñoa', 'La Florida', 'Puente Alto', 'Cerrillos', 'Renca'];
const AFPS = ['Capital', 'Cuprum', 'Habitat', 'Modelo', 'PlanVital', 'Provida', 'Uno'];
const SALUDES = ['FONASA', 'Banmédica', 'Colmena', 'Consalud', 'Cruz Blanca'];
const ESTADOS_CIVILES = ['Soltero/a', 'Casado/a', 'Conviviente civil', 'Divorciado/a'];
const CATEGORIAS = ['obra', 'operaciones', 'rotativo'];

/** Ficha completa del trabajador n: sin huecos, para que el contrato y el kit se puedan emitir. */
function fichaFicticia(i) {
    const nombre = NOMBRES[i % NOMBRES.length];
    const ap = APELLIDOS[i % APELLIDOS.length];
    const am = APELLIDOS[(i + 3) % APELLIDOS.length];
    const anio = 1975 + (i % 25);
    const mes = String((i % 12) + 1).padStart(2, '0');
    const dia = String((i % 27) + 1).padStart(2, '0');
    return {
        rut: rutFicticio(i),
        nombres: nombre,
        apellido_paterno: ap,
        apellido_materno: am,
        email: `demo${i}@ejemplo.invalid`,          // .invalid: RFC 2606, no existe ni puede existir
        telefono: `+5699000${String(i).padStart(4, '0')}`,
        fecha_nacimiento: `${anio}-${mes}-${dia}`,
        estado_civil: ESTADOS_CIVILES[i % ESTADOS_CIVILES.length],
        direccion: `Calle Demo ${100 + i}, depto ${i % 20}`,
        comuna: COMUNAS[i % COMUNAS.length],
        nacionalidad: i % 9 === 0 ? 'Venezolana' : 'Chilena',
        afp: AFPS[i % AFPS.length],
        salud: SALUDES[i % SALUDES.length],
        cargas_familiares: i % 4,
        talla_calzado: 38 + (i % 8),
        talla_pantalon: 38 + (i % 10),
        talla_polera: ['S', 'M', 'L', 'XL'][i % 4],
        cuenta_rut: i % 3 === 0 ? 1 : 0,
        banco: i % 3 === 0 ? 'BancoEstado' : ['Banco de Chile', 'Santander', 'BCI'][i % 3],
        tipo_cuenta: i % 3 === 0 ? 'vista' : 'corriente',
        numero_cuenta: `000${String(900000 + i)}`,
        categoria_reporte: CATEGORIAS[i % CATEGORIAS.length],
    };
}

/** INSERT IGNORE + SELECT del id (los catálogos tienen UNIQUE por rut/nombre). */
async function upsertId(db, { insert, params, select, selectParams }) {
    const [res] = await db.query(insert, params);
    if (res.insertId) return res.insertId;
    const [rows] = await db.query(select, selectParams);
    return rows.length ? rows[0].id : null;
}

/**
 * Siembra empresas, obras, cargos, trabajadores, asistencia de los últimos 30 días y documentos.
 * Devuelve conteos + las rutas de archivo que el llamador debe materializar en disco.
 */
async function sembrar(db, { nTrabajadores = N_TRABAJADORES, diasAsistencia = 30 } = {}) {
    const resumen = { empresas: 0, obras: 0, cargos: 0, trabajadores: 0, asistencias: 0, documentos: 0 };
    const archivos = [];

    // ── Usuario que "registra" la asistencia (FK NOT NULL a usuarios) ──
    const [usuarios] = await db.query('SELECT id FROM usuarios ORDER BY id LIMIT 1');
    if (!usuarios.length) throw new Error('No hay usuarios en la base: no se puede sembrar asistencia (registrado_por es obligatorio).');
    const usuarioId = usuarios[0].id;

    // ── Catálogos ──
    const empresaIds = [];
    for (const e of EMPRESAS) {
        const id = await upsertId(db, {
            insert: 'INSERT IGNORE INTO empresas (rut, razon_social, direccion, representante_nombre, representante_rut, activo) VALUES (?, ?, ?, ?, ?, 1)',
            params: [e.rut, e.razon_social, e.direccion, 'Representante Demo', '44.000.999-1'],
            select: 'SELECT id FROM empresas WHERE rut = ?', selectParams: [e.rut],
        });
        if (id) { empresaIds.push(id); resumen.empresas += 1; }
    }

    const cargoIds = [];
    for (const nombre of CARGOS) {
        const id = await upsertId(db, {
            insert: 'INSERT IGNORE INTO cargos (nombre, activo) VALUES (?, 1)', params: [nombre],
            select: 'SELECT id FROM cargos WHERE nombre = ?', selectParams: [nombre],
        });
        if (id) { cargoIds.push(id); resumen.cargos += 1; }
    }

    const obraIds = [];
    for (const o of OBRAS) {
        const empresaId = empresaIds[o.empresaIdx] ?? empresaIds[0];
        const id = await upsertId(db, {
            insert: 'INSERT IGNORE INTO obras (nombre, direccion, empresa_id, encargado_nombre, activa, es_prueba) VALUES (?, ?, ?, ?, 1, 0)',
            params: [o.nombre, o.direccion, empresaId, 'Encargado Demo'],
            select: 'SELECT id FROM obras WHERE nombre = ?', selectParams: [o.nombre],
        });
        if (id) { obraIds.push(id); resumen.obras += 1; }
    }
    if (!empresaIds.length || !obraIds.length || !cargoIds.length) {
        throw new Error('No se pudieron preparar empresa/obra/cargo ficticios.');
    }

    // ── Trabajadores ──
    const trabajadorIds = [];
    for (let i = 0; i < nTrabajadores; i++) {
        const f = fichaFicticia(i);
        const obraId = obraIds[i % obraIds.length];
        const empresaId = empresaIds[i % empresaIds.length];
        const cargoId = cargoIds[i % cargoIds.length];
        // Ingresos escalonados hacia atrás: así hay trabajadores de 1 mes y de 2 años, y alguno
        // cae en el tramo de 10 meses que la portada de Gestiones destaca.
        const ingreso = new Date();
        ingreso.setMonth(ingreso.getMonth() - (i % 26));
        const fechaIngreso = ingreso.toISOString().slice(0, 10);

        const id = await upsertId(db, {
            insert: `INSERT IGNORE INTO trabajadores
                (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id,
                 email, telefono, fecha_ingreso, categoria_reporte, activo, es_prueba,
                 fecha_nacimiento, estado_civil, direccion, comuna, nacionalidad, afp, salud,
                 cargas_familiares, talla_calzado, talla_pantalon, talla_polera,
                 cuenta_rut, banco, tipo_cuenta, numero_cuenta)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [
                f.rut, f.nombres, f.apellido_paterno, f.apellido_materno, empresaId, obraId, cargoId,
                f.email, f.telefono, fechaIngreso, f.categoria_reporte,
                f.fecha_nacimiento, f.estado_civil, f.direccion, f.comuna, f.nacionalidad, f.afp, f.salud,
                f.cargas_familiares, f.talla_calzado, f.talla_pantalon, f.talla_polera,
                f.cuenta_rut, f.banco, f.tipo_cuenta, f.numero_cuenta,
            ],
            select: 'SELECT id FROM trabajadores WHERE rut = ?', selectParams: [f.rut],
        });
        if (id) { trabajadorIds.push({ id, obraId, i }); resumen.trabajadores += 1; }
    }

    // ── Asistencia de los últimos N días hábiles ──
    const [estados] = await db.query("SELECT id, codigo FROM estados_asistencia WHERE activo = 1");
    const codigo = c => (estados.find(e => e.codigo === c) || {}).id || null;
    const idPresente = codigo('P');
    const idAusente = codigo('A');
    const idAtraso = codigo('AT');

    if (idPresente) {
        const hoy = new Date();
        for (let d = 1; d <= diasAsistencia; d++) {
            const fecha = new Date(hoy);
            fecha.setDate(hoy.getDate() - d);
            const dow = fecha.getDay();
            if (dow === 0) continue;                        // domingo no se trabaja
            const fechaStr = fecha.toISOString().slice(0, 10);

            for (const t of trabajadorIds) {
                // Determinista: el mismo trabajador y día dan siempre el mismo estado.
                const semilla = (t.i * 31 + d * 17) % 100;
                let estadoId = idPresente;
                let estadoEnum = 'presente';
                let entrada = '08:00:00';
                if (semilla < 5 && idAusente) { estadoId = idAusente; estadoEnum = 'ausente'; entrada = null; }
                else if (semilla < 15 && idAtraso) { estadoId = idAtraso; estadoEnum = 'tardanza'; entrada = '08:25:00'; }

                const [r] = await db.query(
                    `INSERT IGNORE INTO asistencias
                        (trabajador_id, obra_id, fecha, estado, estado_id, hora_entrada, hora_salida, registrado_por)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [t.id, t.obraId, fechaStr, estadoEnum, estadoId, entrada, entrada ? '18:00:00' : null, usuarioId],
                );
                resumen.asistencias += r.affectedRows || 0;
            }
        }
    }

    // ── Documentos: 2 por trabajador, con su archivo marcador en disco ──
    const [tipos] = await db.query(
        'SELECT id, nombre FROM tipos_documento WHERE activo = 1 AND obligatorio = 1 AND codigo IS NULL ORDER BY id LIMIT 2',
    );
    for (const t of trabajadorIds) {
        for (const tipo of tipos) {
            const nombreArchivo = `demo-${t.id}-${tipo.id}.pdf`;
            const ruta = `${t.id}/${nombreArchivo}`;
            const [r] = await db.query(
                `INSERT IGNORE INTO documentos
                    (trabajador_id, tipo_documento_id, nombre_archivo, ruta_archivo, rut_empresa_al_subir,
                     origen, estado, activo)
                 VALUES (?, ?, ?, ?, ?, 'subido', 'subido', 1)`,
                [t.id, tipo.id, nombreArchivo, ruta, '44.000.900-K'],
            );
            if (r.affectedRows) {
                resumen.documentos += 1;
                archivos.push(ruta);
            }
        }
    }

    return { resumen, archivos };
}

module.exports = {
    sembrar,
    fichaFicticia,
    N_TRABAJADORES,
    _interno: { EMPRESAS, OBRAS, CARGOS, NOMBRES, APELLIDOS },
};
