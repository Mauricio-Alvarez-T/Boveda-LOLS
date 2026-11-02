const crypto = require('crypto');
const db = require('../config/db');
const logger = require('../utils/logger-structured');
const avisosCelular = require('./avisosCelular.service');
const emailService = require('./email.service');
const horarioHabil = require('../utils/horarioHabil');

/**
 * «Errores» de Soporte (mig 141, Marcos 2026-10-26; docs/reglas/seguridad-rbac.md § Errores).
 *
 * La app de la persona clasifica el error por el CÓDIGO de la respuesta (frontend `services/reporteErrores.ts`) y lo
 * manda acá. Este service:
 *   · agrupa los repetidos: misma persona + misma `firma` en 10 minutos → suma `veces` en la misma fila;
 *   · decide si pide la foto: SOLO para `falla` y `app`, una por fila, y con topes (por persona y día, por día en total
 *     y bytes guardados en total) para que nunca se llene la base;
 *   · borra las fotos a los 30 días, y las filas que solo cuentan (lento, sin señal, datos) también.
 * Revisar (lista, foto, marcar revisado) es solo del Super Administrador (las rutas pasan por `soloSuperAdmin`).
 */

const CATEGORIAS = ['falla', 'app', 'permiso', 'lento', 'sin_senal', 'dato'];
/** Las que piden revisión (cuentan en el número de Soporte). Las otras solo se cuentan. */
const PARA_REVISAR = ['falla', 'app', 'permiso'];
/** Las únicas con foto: fallas reales del servidor o de la pantalla. */
const CON_FOTO = ['falla', 'app'];

const MINUTOS_REPETIDO = 10;
const MAX_FOTO_BYTES = 200 * 1024;
const FOTOS_POR_PERSONA_DIA = 5;
const FOTOS_POR_DIA = 40;
const FOTOS_TOTAL_BYTES = 40 * 1024 * 1024;
const DIAS_FOTO = 30;
const DIAS_CONTEO = 30;
const DIAS_REVISADOS = 180;
/** Tope de avisos por persona (en memoria): una pantalla en bucle no puede inundar la tabla. */
const AVISOS_POR_PERSONA = 40;
const VENTANA_AVISOS_MS = 10 * 60 * 1000;
const LIMPIEZA_CADA_MS = 60 * 60 * 1000;
/** Aviso a los programadores: el mismo error (misma firma, de cualquier persona) suena una vez por hora… */
const MINUTOS_MISMO_AVISO = 60;
/** …y a lo más tantos avisos por hora en total (un servidor caído no los bombardea; todo queda en la bandeja). */
const AVISOS_PROGRAMADORES_HORA = 10;
/** Cómo se llama cada error por revisar en el correo (las etiquetas de la bandeja, `components/soporte/errores.ts`). */
const NOMBRE_CATEGORIA = { falla: 'Falla del servidor', app: 'Pantalla rota', permiso: 'Permiso' };
/**
 * Horario de esos avisos (Marcos 2026-11-02: «inmediato, siempre y cuando sea día hábil y de 7:30 a 18:00»): días
 * hábiles (lunes a viernes, sin feriados), de 7:30 a 18:00 hora de Chile. Lo que llega fuera queda marcado
 * (`aviso_pendiente`, mig 149) y les llega en un solo aviso al empezar el siguiente horario (lo manda el cron).
 */
const HORARIO_PROGRAMADORES = { desde: 7 * 60 + 30, hasta: 18 * 60 };
/** Cuántos de fuera de horario caben en un aviso (los demás, en el siguiente: el cron pasa cada 5 min). */
const MAX_FUERA_DE_HORARIO = 30;

const httpError = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });
const texto = (v, max) => {
    const s = v === undefined || v === null ? '' : String(v).trim();
    return s ? s.slice(0, max) : null;
};

function idValido(raw) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) throw httpError('Aviso inválido', 400, 'ID_INVALIDO');
    return id;
}

/** La pantalla sin la consulta (`?u=7`): así el mismo error en la misma pantalla se agrupa. */
const sinConsulta = (p) => String(p || '').split('?')[0];

function firmaDe(categoria, mensaje, accion, pantalla) {
    return crypto.createHash('sha1').update([categoria, mensaje, accion || '', sinConsulta(pantalla)].join('|')).digest('hex');
}

// ───────────── Tope de avisos por persona (memoria del proceso) ─────────────
const avisosRecientes = new Map();
function pasaElTope(usuarioId, ahora = Date.now()) {
    const lista = (avisosRecientes.get(usuarioId) || []).filter(t => ahora - t < VENTANA_AVISOS_MS);
    if (lista.length >= AVISOS_POR_PERSONA) {
        avisosRecientes.set(usuarioId, lista);
        return false;
    }
    lista.push(ahora);
    avisosRecientes.set(usuarioId, lista);
    return true;
}

// ───────────── Aviso a los programadores (Marcos 2026-11-02) ─────────────
let avisosProgramadores = [];
function pasaElFrenoDeAvisos(ahora = Date.now()) {
    avisosProgramadores = avisosProgramadores.filter(t => ahora - t < 60 * 60 * 1000);
    if (avisosProgramadores.length >= AVISOS_PROGRAMADORES_HORA) return false;
    avisosProgramadores.push(ahora);
    return true;
}

const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** ¿Ahora es horario de avisar a los programadores? Día hábil, de 7:30 a 18:00 (18:00 incluida). */
async function enHorarioProgramadores(ahora = horarioHabil.ahoraChile()) {
    if (horarioHabil.finDeSemana(ahora)) return false;
    if (ahora.minutos < HORARIO_PROGRAMADORES.desde || ahora.minutos > HORARIO_PROGRAMADORES.hasta) return false;
    return !(await horarioHabil.esFeriado(ahora.fecha));
}

/** Los programadores (rol 1, activos) y lo que sale en el asunto y el enlace del correo según el entorno. */
async function destinoProgramadores() {
    const [programadores] = await db.query('SELECT id, email FROM usuarios WHERE rol_id = 1 AND activo = 1');
    // Test o producción, por la base (la misma regla que scripts/sanear_staging.js).
    const prefijo = /test|staging|dev/i.test(process.env.DB_NAME || '') ? '[TEST] ' : '';
    const base = /^https:\/\//.test(process.env.FRONTEND_URL || '') ? process.env.FRONTEND_URL.replace(/\/+$/, '') : '';
    return { programadores, prefijo, enlace: base ? `${base}/soporte?vista=errores` : null };
}

/**
 * Un error por revisar NUEVO (falla, app o permiso; no un repetido) → aviso a los programadores, que son el rol 1
 * (Marcos y Mauricio, mig 139): al celular (los equipos donde activaron los avisos) y al correo del sistema. El mismo
 * error suena una vez por hora y a lo más AVISOS_PROGRAMADORES_HORA por hora en total. Solo en horario hábil
 * (HORARIO_PROGRAMADORES): fuera, queda marcado para el aviso de la mañana siguiente (`avisarFueraDeHorario`). Nunca
 * lanza: un SMTP caído no frena el aviso al celular ni el registro del error. Devuelve (sin que nadie tenga que
 * esperarlo) qué pasó, en una línea.
 */
function avisarProgramadores({ id, firma, usuarioId, categoria, mensaje, accion, codigo, permisos, pantalla, dispositivo }) {
    return (async () => {
        const [mismoError] = await db.query(
            `SELECT id FROM soporte_errores
              WHERE firma = ? AND id <> ? AND created_at >= NOW() - INTERVAL ${MINUTOS_MISMO_AVISO} MINUTE LIMIT 1`,
            [firma, id]
        );
        if (mismoError.length) return 'el mismo error ya sonó en la última hora';
        // Si no se puede saber (la tabla de feriados no responde), se avisa: mejor de más que perderlo.
        if (!(await enHorarioProgramadores().catch(() => true))) {
            try {
                await db.query('UPDATE soporte_errores SET aviso_pendiente = 1 WHERE id = ?', [id]);
                return 'fuera de horario: les llega al empezar el siguiente día hábil (7:30)';
            } catch (e) {
                // Sin la columna (falta la mig 149): se avisa ya, para no perderlo.
                logger.warn('[soporteErrores] no se pudo dejar el aviso para el horario hábil; se manda ya', { err: e.message });
            }
        }
        if (!pasaElFrenoDeAvisos()) return `tope de ${AVISOS_PROGRAMADORES_HORA} avisos por hora`;
        const { programadores, prefijo, enlace } = await destinoProgramadores();
        if (!programadores.length) return 'no hay programadores activos';
        const [[quien]] = await db.query('SELECT nombre FROM usuarios WHERE id = ?', [usuarioId]);
        const nombre = (quien && quien.nombre) || 'alguien';
        const donde = pantalla || 'Bóveda';
        const esPermiso = categoria === 'permiso';

        const cel = await avisosCelular.enviarA(programadores.map(p => p.id), {
            titulo: esPermiso ? 'Permiso que faltó' : 'Nueva falla en Soporte',
            cuerpo: esPermiso ? `A ${nombre} le faltó un permiso en ${donde}. Toca para verlo.` : `A ${nombre} le falló ${donde}. Toca para verla.`,
            url: '/soporte?vista=errores',
            etiqueta: 'soporte-errores',
        });
        const alCelular = `celular: ${cel.enviados} enviado(s), ${cel.fallidos} fallido(s)`;

        const para = programadores.map(p => p.email).filter(Boolean);
        if (!para.length) return `${alCelular} · sin correos`;
        const equipo = dispositivo === 'movil' ? 'celular' : dispositivo === 'escritorio' ? 'computador' : null;
        const campos = [
            ['Qué es', NOMBRE_CATEGORIA[categoria] || categoria],
            ['Mensaje', mensaje],
            ...(accion || codigo !== null ? [['Acción', [accion, codigo !== null ? `código ${codigo}` : null].filter(Boolean).join(' · ')]] : []),
            ...(permisos ? [['Permiso que faltó', permisos.split(',').join(', ')]] : []),
        ];
        try {
            await emailService.sendSystemEmail({
                to: para,
                fromName: 'Bóveda LOLS — Soporte',
                subject: `${prefijo}${NOMBRE_CATEGORIA[categoria] || 'Error'}: ${nombre} en ${donde}`.slice(0, 180),
                text: [
                    `A ${nombre} ${esPermiso ? `le faltó un permiso en ${donde}` : `le falló ${donde}`}${equipo ? ` (${equipo})` : ''}.`,
                    '',
                    ...campos.map(([k, v]) => `${k}: ${v}`),
                    '',
                    `Revísalo en Bóveda → Soporte → Errores${enlace ? `: ${enlace}` : '.'}`,
                ].join('\n'),
                html: `<p>A <strong>${esc(nombre)}</strong> ${esPermiso ? `le faltó un permiso en ${esc(donde)}` : `le falló ${esc(donde)}`}${equipo ? ` (${equipo})` : ''}.</p>
                       ${campos.map(([k, v]) => `<p><strong>${k}:</strong> ${esc(v)}</p>`).join('\n                   ')}
                       <p>Revísalo en Bóveda → Soporte → Errores${enlace ? `: <a href="${esc(enlace)}">${esc(enlace)}</a>` : '.'}</p>`,
            });
        } catch (e) {
            logger.warn('[soporteErrores] el correo a los programadores no salió', { err: e.message });
            return `${alCelular} · correo NO salió (${e.message})`;
        }
        return `${alCelular} · correo a ${para.length}`;
    })().catch(e => {
        logger.warn('[soporteErrores] el aviso a los programadores no salió', { err: e.message });
        return `no salió (${e.message})`;
    });
}

// ───────────── Limpieza (a lo más una vez por hora, sin cron) ─────────────
let ultimaLimpieza = 0;
async function limpiar(ahora = Date.now()) {
    if (ahora - ultimaLimpieza < LIMPIEZA_CADA_MS) return;
    ultimaLimpieza = ahora;
    try {
        await db.query(
            `UPDATE soporte_errores
                SET foto = NULL, foto_mime = NULL, foto_bytes = NULL, foto_borrada_en = NOW()
              WHERE foto IS NOT NULL AND created_at < NOW() - INTERVAL ${DIAS_FOTO} DAY`
        );
        await db.query(
            `DELETE FROM soporte_errores
              WHERE categoria IN ('lento', 'sin_senal', 'dato') AND ultima_vez < NOW() - INTERVAL ${DIAS_CONTEO} DAY`
        );
        await db.query(
            `DELETE FROM soporte_errores
              WHERE estado = 'revisado' AND ultima_vez < NOW() - INTERVAL ${DIAS_REVISADOS} DAY`
        );
    } catch (e) {
        logger.warn('[soporteErrores] limpieza falló', { err: e.message });
    }
}

/** Foto: data URL de una imagen que de verdad es lo que dice (como las de Ideas, mig 121). */
const FOTO_RE = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/;
function leerFoto(dataUrl) {
    const m = FOTO_RE.exec(String(dataUrl || ''));
    if (!m) throw httpError('La foto tiene que ser una imagen (WEBP, JPG o PNG).', 400, 'ERROR_FOTO_FORMATO');
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length) throw httpError('La foto llegó vacía.', 400, 'ERROR_FOTO_FORMATO');
    if (buf.length > MAX_FOTO_BYTES) {
        throw httpError(`La foto pesa ${Math.ceil(buf.length / 1024)} KB y el máximo es ${MAX_FOTO_BYTES / 1024} KB.`, 400, 'ERROR_FOTO_PESADA');
    }
    const esJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
    const esPng = buf[0] === 0x89 && buf.slice(1, 4).toString('latin1') === 'PNG';
    const esWebp = buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP';
    const coincide = (m[1] === 'image/jpeg' && esJpeg) || (m[1] === 'image/png' && esPng) || (m[1] === 'image/webp' && esWebp);
    if (!coincide) throw httpError('El archivo no es la imagen que dice ser.', 400, 'ERROR_FOTO_FORMATO');
    return { buf, mime: m[1] };
}

/** ¿Se puede pedir una foto más? Una sola consulta con los tres topes. */
async function hayCupoDeFoto(usuarioId) {
    const [[t]] = await db.query(
        `SELECT
            COALESCE(SUM(foto_pedida = 1 AND created_at >= CURDATE() AND usuario_id = ?), 0) AS persona_hoy,
            COALESCE(SUM(foto_pedida = 1 AND created_at >= CURDATE()), 0) AS hoy,
            COALESCE(SUM(CASE WHEN foto IS NOT NULL THEN foto_bytes ELSE 0 END), 0) AS bytes
           FROM soporte_errores
          WHERE created_at >= NOW() - INTERVAL ${DIAS_FOTO + 1} DAY`,
        [usuarioId]
    );
    return Number(t.persona_hoy) < FOTOS_POR_PERSONA_DIA
        && Number(t.hoy) < FOTOS_POR_DIA
        && Number(t.bytes) < FOTOS_TOTAL_BYTES;
}

const VISTAS = {
    revisar: `e.categoria IN ('falla', 'app', 'permiso') AND e.estado = 'pendiente'`,
    revisados: `e.categoria IN ('falla', 'app', 'permiso') AND e.estado = 'revisado'`,
    senal: `e.categoria IN ('lento', 'sin_senal')`,
    datos: `e.categoria = 'dato'`,
    todos: '1 = 1',
};

const soporteErroresService = {
    CATEGORIAS,
    PARA_REVISAR,
    CON_FOTO,
    MAX_FOTO_BYTES,
    FOTOS_POR_PERSONA_DIA,
    FOTOS_POR_DIA,
    FOTOS_TOTAL_BYTES,
    VISTAS: Object.keys(VISTAS),

    /**
     * Un aviso de la app de la persona. Devuelve `{ id, repetido, pedir_foto }` (`ignorado: true` si pasó el tope de
     * avisos; la app no insiste). La categoría la decide la app por el código; acá se valida y se agrupa.
     * `esperarAviso` (solo los scripts, p. ej. la prueba programada del cron): espera el aviso a los programadores y
     * devuelve qué pasó en `aviso`; la app nunca lo espera.
     */
    async reportar(usuario, body, req, { esperarAviso = false } = {}) {
        const usuarioId = Number(usuario?.id);
        if (!usuarioId) throw httpError('Sin sesión', 401, 'SIN_SESION');
        const categoria = String(body.categoria || '');
        if (!CATEGORIAS.includes(categoria)) throw httpError('Categoría inválida', 400, 'ERROR_CATEGORIA');
        if (!pasaElTope(usuarioId)) return { ignorado: true, pedir_foto: false };
        limpiar().catch(() => {});

        const mensaje = texto(body.mensaje, 300) || 'Error sin mensaje';
        const accion = texto(body.accion, 255);
        const pantalla = texto(body.pantalla, 255);
        const firma = firmaDe(categoria, mensaje, accion, pantalla);
        const duracion = Number.isFinite(Number(body.duracion_ms)) && Number(body.duracion_ms) >= 0
            ? Math.min(Math.round(Number(body.duracion_ms)), 4294967295) : null;

        // ¿Ya está (misma persona, mismo error, hace menos de 10 min)? → suma una vez más.
        const [repetidos] = await db.query(
            `SELECT id FROM soporte_errores
              WHERE usuario_id = ? AND firma = ? AND ultima_vez >= NOW() - INTERVAL ${MINUTOS_REPETIDO} MINUTE
              ORDER BY id DESC LIMIT 1`,
            [usuarioId, firma]
        );
        if (repetidos.length) {
            const id = Number(repetidos[0].id);
            await db.query(
                'UPDATE soporte_errores SET veces = veces + 1, ultima_vez = NOW(), duracion_ms = COALESCE(?, duracion_ms) WHERE id = ?',
                [duracion, id]
            );
            return { id, repetido: true, pedir_foto: false };
        }

        const pedirFoto = CON_FOTO.includes(categoria) && await hayCupoDeFoto(usuarioId);
        const permisos = Array.isArray(body.permisos_faltantes)
            ? body.permisos_faltantes.map(p => String(p).trim()).filter(Boolean).slice(0, 10).join(',').slice(0, 500) || null
            : null;
        const codigo = Number.isInteger(Number(body.codigo)) && body.codigo !== null && body.codigo !== undefined && body.codigo !== ''
            ? Number(body.codigo) : null;
        const obraId = Number.isInteger(Number(body.obra_id)) && Number(body.obra_id) > 0 ? Number(body.obra_id) : null;
        const navegador = String(req?.headers?.['user-agent'] || '').slice(0, 255) || null;

        const [r] = await db.query(
            `INSERT INTO soporte_errores
                (usuario_id, categoria, firma, mensaje, accion, codigo, permisos_faltantes, detalle_tecnico,
                 pantalla, pantalla_nombre, obra_id, dispositivo, navegador, duracion_ms, foto_pedida)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT o.id FROM obras o WHERE o.id = ?), ?, ?, ?, ?)`,
            [
                usuarioId, categoria, firma, mensaje, accion, codigo, permisos, texto(body.detalle_tecnico, 4000),
                pantalla, texto(body.pantalla_nombre, 120), obraId,
                ['movil', 'escritorio'].includes(body.dispositivo) ? body.dispositivo : null,
                navegador, duracion, pedirFoto ? 1 : 0,
            ]
        );
        // Un error por revisar nuevo (no un repetido): aviso a los programadores, al celular y al correo.
        let aviso;
        if (PARA_REVISAR.includes(categoria)) {
            const enCurso = avisarProgramadores({
                id: Number(r.insertId), firma, usuarioId, categoria, mensaje, accion, codigo, permisos,
                pantalla: texto(body.pantalla_nombre, 120) || sinConsulta(pantalla), dispositivo: body.dispositivo,
            });
            if (esperarAviso) aviso = await enCurso;
        }
        return { id: Number(r.insertId), repetido: false, pedir_foto: pedirFoto, ...(aviso ? { aviso } : {}) };
    },

    /** La foto que pidió el servidor: solo la persona dueña, una vez, y dentro de la hora. */
    async subirFoto(usuario, rawId, dataUrl) {
        const id = idValido(rawId);
        const { buf, mime } = leerFoto(dataUrl);
        const [r] = await db.query(
            `UPDATE soporte_errores SET foto = ?, foto_mime = ?, foto_bytes = ?
              WHERE id = ? AND usuario_id = ? AND foto_pedida = 1 AND foto IS NULL AND foto_borrada_en IS NULL
                AND created_at >= NOW() - INTERVAL 1 HOUR`,
            [buf, mime, buf.length, id, Number(usuario?.id)]
        );
        if (!r.affectedRows) throw httpError('Esa foto ya no se puede subir.', 409, 'ERROR_FOTO_NO_PEDIDA');
        return { id, foto_bytes: buf.length };
    },

    /** «Quitar»: la persona borra la foto de su aviso (el aviso queda). */
    async quitarFoto(usuario, rawId) {
        const id = idValido(rawId);
        const [r] = await db.query(
            `UPDATE soporte_errores SET foto = NULL, foto_mime = NULL, foto_bytes = NULL, foto_borrada_en = NOW()
              WHERE id = ? AND usuario_id = ?`,
            [id, Number(usuario?.id)]
        );
        if (!r.affectedRows) throw httpError('Aviso no encontrado', 404, 'ERROR_NO_EXISTE');
        return { id };
    },

    /** «Contar qué pasó»: el texto de la persona, dentro del día. */
    async describir(usuario, rawId, descripcion) {
        const id = idValido(rawId);
        const t = texto(descripcion, 1000);
        const [r] = await db.query(
            `UPDATE soporte_errores SET descripcion = ?
              WHERE id = ? AND usuario_id = ? AND created_at >= NOW() - INTERVAL 1 DAY`,
            [t, id, Number(usuario?.id)]
        );
        if (!r.affectedRows) throw httpError('Aviso no encontrado', 404, 'ERROR_NO_EXISTE');
        return { id };
    },

    /** La bandeja (Super Administrador). `vista`: revisar (por defecto) | revisados | senal | datos | todos. */
    async listar(vista) {
        await limpiar();
        const donde = VISTAS[vista] || VISTAS.revisar;
        const [filas] = await db.query(
            `SELECT e.id, e.usuario_id, u.nombre AS usuario_nombre, u.email AS usuario_email, r.nombre AS rol_nombre,
                    e.categoria, e.mensaje, e.accion, e.codigo, e.permisos_faltantes, e.detalle_tecnico,
                    e.pantalla, e.pantalla_nombre, e.obra_id, o.nombre AS obra_nombre, e.dispositivo, e.navegador,
                    e.duracion_ms, e.veces, e.primera_vez, e.ultima_vez, e.foto_bytes, (e.foto IS NOT NULL) AS tiene_foto,
                    e.foto_pedida, e.foto_borrada_en, e.descripcion, e.estado, e.nota, e.revisado_en,
                    rv.nombre AS revisado_por_nombre
               FROM soporte_errores e
               JOIN usuarios u ON u.id = e.usuario_id
               LEFT JOIN roles r ON r.id = u.rol_id
               LEFT JOIN obras o ON o.id = e.obra_id
               LEFT JOIN usuarios rv ON rv.id = e.revisado_por
              WHERE ${donde}
              ORDER BY e.ultima_vez DESC
              LIMIT 200`
        );
        // Los permisos que faltaban, con su nombre del catálogo («Editar Trabajadores»).
        const claves = [...new Set(filas.flatMap(f => String(f.permisos_faltantes || '').split(',').filter(Boolean)))];
        const nombres = new Map();
        if (claves.length) {
            const [cat] = await db.query('SELECT clave, nombre FROM permisos_catalogo WHERE clave IN (?)', [claves]);
            for (const c of cat) nombres.set(c.clave, c.nombre);
        }
        return filas.map(f => {
            const faltan = String(f.permisos_faltantes || '').split(',').filter(Boolean);
            return {
                ...f,
                id: Number(f.id),
                usuario_id: Number(f.usuario_id),
                veces: Number(f.veces),
                tiene_foto: !!Number(f.tiene_foto),
                foto_pedida: !!Number(f.foto_pedida),
                permisos_faltantes: faltan.map(clave => ({ clave, nombre: nombres.get(clave) || clave })),
            };
        });
    },

    /** El número de Soporte y el aviso de lentitud: cuántas personas tuvieron respuestas lentas en la última hora. */
    async resumen() {
        const [[p]] = await db.query(
            `SELECT COUNT(*) AS n FROM soporte_errores
              WHERE categoria IN ('falla', 'app', 'permiso') AND estado = 'pendiente'`
        );
        const [[l]] = await db.query(
            `SELECT COUNT(DISTINCT usuario_id) AS personas, COALESCE(SUM(veces), 0) AS veces,
                    MIN(primera_vez) AS desde, MAX(ultima_vez) AS hasta
               FROM soporte_errores
              WHERE categoria = 'lento' AND ultima_vez >= NOW() - INTERVAL 1 HOUR`
        );
        return {
            pendientes: Number(p.n) || 0,
            lentos: { personas: Number(l.personas) || 0, veces: Number(l.veces) || 0, desde: l.desde || null, hasta: l.hasta || null },
        };
    },

    /** La foto de un aviso (Super Administrador). */
    async foto(rawId) {
        const id = idValido(rawId);
        const [[f]] = await db.query('SELECT foto, foto_mime FROM soporte_errores WHERE id = ?', [id]);
        if (!f || !f.foto) throw httpError('Ese aviso no tiene foto', 404, 'ERROR_SIN_FOTO');
        return { buf: f.foto, mime: f.foto_mime || 'image/jpeg' };
    },

    /** Marcar revisado (con nota) o volver a «pendiente». */
    async revisar(superAdmin, rawId, { estado, nota }) {
        const id = idValido(rawId);
        if (!['pendiente', 'revisado'].includes(estado)) throw httpError('Estado inválido', 400, 'ERROR_ESTADO');
        const revisado = estado === 'revisado';
        const [r] = await db.query(
            `UPDATE soporte_errores
                SET estado = ?, nota = COALESCE(?, nota), revisado_por = ?, revisado_en = ${revisado ? 'NOW()' : 'NULL'}
              WHERE id = ?`,
            [estado, nota === undefined ? null : texto(nota, 1000), revisado ? Number(superAdmin.id) : null, id]
        );
        if (!r.affectedRows) throw httpError('Aviso no encontrado', 404, 'ERROR_NO_EXISTE');
        return { id, estado };
    },

    /**
     * (Cron, en cada pasada) Los errores por revisar que llegaron fuera del horario hábil, en UN aviso a los
     * programadores apenas empieza el siguiente horario (celular + un correo con la lista). Los que alguien marcó
     * «revisado» entretanto no se avisan. Devuelve una línea para avisos-status.txt, o null si no había nada.
     */
    async avisarFueraDeHorario(ahora = horarioHabil.ahoraChile()) {
        if (!(await enHorarioProgramadores(ahora))) return null;
        let filas;
        try {
            [filas] = await db.query(
                `SELECT e.id, e.categoria, e.mensaje, e.accion, e.codigo, e.pantalla_nombre, e.pantalla, e.estado, e.created_at, u.nombre
                   FROM soporte_errores e LEFT JOIN usuarios u ON u.id = e.usuario_id
                  WHERE e.aviso_pendiente = 1 ORDER BY e.id LIMIT ${MAX_FUERA_DE_HORARIO}`
            );
        } catch (e) {
            if (e && e.errno === 1054) return null; // falta la mig 149: todavía no hay nada guardado
            throw e;
        }
        if (!filas.length) return null;
        // Tomarlos: si dos pasadas del cron se cruzan, solo una avisa.
        const [r] = await db.query('UPDATE soporte_errores SET aviso_pendiente = 0 WHERE aviso_pendiente = 1 AND id IN (?)', [filas.map(f => Number(f.id))]);
        if (!r.affectedRows) return null;
        const pendientes = filas.filter(f => f.estado === 'pendiente');
        if (!pendientes.length) return `fuera de horario: ${filas.length} ya revisado(s), sin aviso`;
        const { programadores, prefijo, enlace } = await destinoProgramadores();
        if (!programadores.length) return 'fuera de horario: no hay programadores activos';

        const n = pendientes.length;
        const cuando = (d) => {
            if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
            const p = new Intl.DateTimeFormat('es-CL', {
                timeZone: 'America/Santiago', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
            }).formatToParts(d);
            const g = (t) => (p.find(x => x.type === t) || {}).value || '';
            return `${g('weekday').replace('.', '')} ${g('day')}-${g('month')} ${g('hour')}:${g('minute')}`;
        };
        const linea = (f) => {
            const c = cuando(f.created_at);
            return `${NOMBRE_CATEGORIA[f.categoria] || f.categoria}: ${f.nombre || 'alguien'} en ${f.pantalla_nombre || sinConsulta(f.pantalla) || 'Bóveda'}${c ? ` (${c})` : ''}`;
        };
        const detalle = (f) => [f.mensaje, [f.accion, f.codigo !== null && f.codigo !== undefined ? `código ${f.codigo}` : null].filter(Boolean).join(' · ')]
            .filter(Boolean).join(' — ');

        const cel = await avisosCelular.enviarA(programadores.map(p => p.id), {
            titulo: n === 1 ? 'Error de fuera de horario' : `${n} errores de fuera de horario`,
            cuerpo: n === 1 ? `${linea(pendientes[0])}. Toca para verlo.` : 'Llegaron fuera del horario hábil y siguen por revisar. Toca para verlos.',
            url: '/soporte?vista=errores',
            etiqueta: 'soporte-errores',
        });
        const alCelular = `fuera de horario (${n}): celular: ${cel.enviados} enviado(s), ${cel.fallidos} fallido(s)`;
        const para = programadores.map(p => p.email).filter(Boolean);
        if (!para.length) return `${alCelular} · sin correos`;
        try {
            await emailService.sendSystemEmail({
                to: para,
                fromName: 'Bóveda LOLS — Soporte',
                subject: `${prefijo}${n === 1 ? '1 error' : `${n} errores`} por revisar de fuera de horario`,
                text: [
                    'Llegaron fuera del horario hábil (días hábiles de 7:30 a 18:00) y siguen por revisar:',
                    '',
                    ...pendientes.map(f => `· ${linea(f)}\n  ${detalle(f)}`),
                    '',
                    `Revísalos en Bóveda → Soporte → Errores${enlace ? `: ${enlace}` : '.'}`,
                ].join('\n'),
                html: `<p>Llegaron fuera del horario hábil (días hábiles de 7:30 a 18:00) y siguen por revisar:</p>
                       <ul>${pendientes.map(f => `<li><strong>${esc(linea(f))}</strong><br>${esc(detalle(f))}</li>`).join('')}</ul>
                       <p>Revísalos en Bóveda → Soporte → Errores${enlace ? `: <a href="${esc(enlace)}">${esc(enlace)}</a>` : '.'}</p>`,
            });
        } catch (e) {
            logger.warn('[soporteErrores] el correo de fuera de horario no salió', { err: e.message });
            return `${alCelular} · correo NO salió (${e.message})`;
        }
        return `${alCelular} · correo a ${para.length}`;
    },

    // Para las pruebas.
    _reiniciar() { avisosRecientes.clear(); ultimaLimpieza = 0; avisosProgramadores = []; },
    _firmaDe: firmaDe,
};

module.exports = soporteErroresService;
