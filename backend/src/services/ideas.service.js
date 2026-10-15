const db = require('../config/db');
const { logManualActivity } = require('../middleware/logger');
const logger = require('../utils/logger-structured');
const emailService = require('./email.service');

/**
 * Ideas para Bóveda — buzón de mejoras (mig 120, docs/reglas/ideas.md).
 *
 * Cualquiera propone (con nombre); Marcos y Mauricio (`ideas.revisar`) las revisan
 * una a una. La regla de producto que manda todo el diseño: **mejoras del sistema,
 * no mañas** — por eso una idea no entra sin el problema de hoy, cada cuánto pasa,
 * a quién afecta y qué se ganaría.
 */

const err = (statusCode, message, extra = {}) => Object.assign(new Error(message), { statusCode, ...extra });
const limpio = v => (typeof v === 'string' ? v.trim() : v);
const vacioANull = v => (v === '' || v === undefined ? null : v);


/**
 * Foto opcional (mig 121): miniatura comprimida en el cliente, meta ~5 KB. El servidor
 * acepta hasta 12 KB como red de seguridad y verifica que los bytes sean de verdad la
 * imagen que dice el data URL (no confiar en el prefijo).
 */
const MAX_FOTO_BYTES = 12 * 1024;
const FOTO_RE = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/;

function leerFoto(dataUrl) {
    if (!dataUrl) return null;
    const m = FOTO_RE.exec(String(dataUrl));
    if (!m) throw err(400, 'La foto tiene que ser una imagen (WEBP, JPG o PNG).', { code: 'IDEA_FOTO_FORMATO' });
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length) throw err(400, 'La foto llegó vacía.', { code: 'IDEA_FOTO_FORMATO' });
    if (buf.length > MAX_FOTO_BYTES) {
        throw err(400, `La foto pesa ${Math.ceil(buf.length / 1024)} KB y el máximo es ${MAX_FOTO_BYTES / 1024} KB.`, { code: 'IDEA_FOTO_PESADA' });
    }
    const esJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
    const esPng = buf[0] === 0x89 && buf.slice(1, 4).toString('latin1') === 'PNG';
    const esWebp = buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP';
    const coincide = (m[1] === 'image/jpeg' && esJpeg) || (m[1] === 'image/png' && esPng) || (m[1] === 'image/webp' && esWebp);
    if (!coincide) throw err(400, 'El archivo no es la imagen que dice ser.', { code: 'IDEA_FOTO_FORMATO' });
    return { buf, mime: m[1] };
}

/** Transiciones permitidas. `hecha` y `desechada` se pueden reabrir por si fue un error. */
const TRANSICIONES = {
    pendiente: ['aceptada', 'desechada'],
    aceptada: ['hecha', 'desechada', 'pendiente'],
    desechada: ['pendiente'],
    hecha: ['aceptada'],
};

const ETIQUETA_TIPO = { idea: 'Tengo una idea', cuesta: 'Algo me cuesta', falla: 'Algo no funciona' };


/**
 * Revisores efectivos de `ideas.revisar`: rol con la clave o grant por usuario, sin deny;
 * el Super Administrador (rol 1) siempre salvo deny. Mismo SQL que los portadores de
 * documentos (documentosLotes.service) para no recalcular permisos usuario por usuario.
 */
const SELECT_REVISORES = `
    SELECT u.id, u.nombre, u.email
      FROM usuarios u
     WHERE u.activo = 1
       AND NOT EXISTS (SELECT 1 FROM permisos_usuario_override o WHERE o.usuario_id = u.id AND o.permiso_clave = 'ideas.revisar' AND o.tipo = 'deny' AND u.rol_id <> 1)
       AND (u.rol_id = 1
            OR EXISTS (SELECT 1 FROM permisos_rol_v2 pr WHERE pr.rol_id = u.rol_id AND pr.permiso_clave = 'ideas.revisar')
            OR EXISTS (SELECT 1 FROM permisos_usuario_override o WHERE o.usuario_id = u.id AND o.permiso_clave = 'ideas.revisar' AND o.tipo = 'grant'))`;

/** Columnas para la bandeja de revisores (todo, incluida la nota interna). */
const SELECT_BANDEJA = `
    SELECT i.id, i.usuario_id, i.tipo, i.resumen, i.detalle, i.esperado, i.frecuencia, i.alcance, i.beneficio,
           i.pantalla, i.pantalla_nombre, i.obra_id, i.dispositivo, i.navegador,
           i.estado, i.motivo, i.respuesta, i.nota_interna, i.revisado_por, i.revisado_en, i.hecha_en,
           i.visto_por_autor, i.created_at, i.updated_at, i.foto_mime, i.foto_bytes,
           (i.foto IS NOT NULL) AS tiene_foto,
           u.nombre AS autor_nombre, u.email AS autor_email, r.nombre AS autor_rol,
           o.nombre AS obra_nombre,
           rv.nombre AS revisor_nombre
      FROM ideas i
      JOIN usuarios u ON u.id = i.usuario_id
      LEFT JOIN roles r ON r.id = u.rol_id
      LEFT JOIN obras o ON o.id = i.obra_id
      LEFT JOIN usuarios rv ON rv.id = i.revisado_por`;

/** Lo que ve el autor de su propia idea: sin nota interna ni datos del revisor más allá del nombre. */
const aVistaAutor = (fila) => {
    const { nota_interna, navegador, revisado_por, ...resto } = fila;
    return { ...resto, tiene_foto: !!fila.tiene_foto, novedad: fila.visto_por_autor === 0 || fila.visto_por_autor === false };
};

/** MySQL devuelve 0/1 para `tiene_foto`; afuera va como booleano. */
const normalizar = (fila) => (fila ? { ...fila, tiene_foto: !!fila.tiene_foto } : fila);

module.exports = {
    MAX_FOTO_BYTES,
    TRANSICIONES,

    /**
     * Crea una idea. Reglas por tipo que el DSL no alcanza a expresar:
     *  · idea/cuesta: resumen ≥ 10, problema ≥ 40, y frecuencia + alcance + beneficio.
     *  · falla: qué hacía ≥ 10, qué pasó ≥ 40, y qué esperaba (obligatorio).
     * Si es falla, avisa por correo a los revisores; el correo nunca hace fallar el alta.
     */
    async crear(data, usuario, req) {
        const tipo = data.tipo;
        const resumen = limpio(data.resumen) || '';
        const detalle = limpio(data.detalle) || '';
        const esperado = vacioANull(limpio(data.esperado));
        const frecuencia = vacioANull(data.frecuencia);
        const alcance = vacioANull(data.alcance);
        const beneficio = vacioANull(data.beneficio);

        // Sin mínimo de caracteres (Marcos 15-10: "la persona tiene que escribir lo que siente"):
        // basta con que no venga vacío.
        if (!resumen) {
            throw err(400, tipo === 'falla' ? 'Cuéntanos qué estabas haciendo.'
                : tipo === 'idea' ? 'Cuéntanos qué se te ocurre.' : 'Cuéntanos qué te gustaría que cambie.', { code: 'IDEA_RESUMEN_VACIO' });
        }
        if (!detalle) {
            throw err(400, tipo === 'falla' ? 'Cuéntanos qué pasó.'
                : tipo === 'idea' ? 'Cuéntanos cómo te lo imaginas.' : 'Cuéntanos qué te cuesta o qué no entiendes.', { code: 'IDEA_DETALLE_VACIO' });
        }
        if (tipo === 'falla') {
            if (!esperado) throw err(400, 'Cuéntanos qué esperabas que pasara.', { code: 'IDEA_FALTA_ESPERADO' });
        } else if (!frecuencia || !alcance || !beneficio) {
            throw err(400, tipo === 'idea'
                ? 'Marca cada cuánto lo usarías, quién lo usaría y qué ganaríamos.'
                : 'Marca cada cuánto te pasa, a quién afecta y qué ganaríamos.', { code: 'IDEA_FALTAN_SENALES' });
        }

        const foto = leerFoto(data.foto);
        const navegador = String(req?.headers?.['user-agent'] || '').slice(0, 255) || null;
        const [res] = await db.query(
            `INSERT INTO ideas
             (usuario_id, tipo, resumen, detalle, esperado, frecuencia, alcance, beneficio,
              pantalla, pantalla_nombre, obra_id, dispositivo, foto, foto_mime, foto_bytes, navegador)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                usuario.id, tipo, resumen, detalle,
                // falla: qué esperaba (obligatorio) · idea: cómo lo hace hoy (opcional) · cuesta: no aplica
                tipo === 'cuesta' ? null : esperado,
                tipo === 'falla' ? null : frecuencia,
                tipo === 'falla' ? null : alcance,
                tipo === 'falla' ? null : beneficio,
                vacioANull(limpio(data.pantalla)), vacioANull(limpio(data.pantalla_nombre)),
                data.obra_id || null, vacioANull(data.dispositivo),
                foto ? foto.buf : null, foto ? foto.mime : null, foto ? foto.buf.length : null,
                navegador,
            ]
        );
        const id = res.insertId;

        try {
            await logManualActivity(usuario.id, 'ideas', 'CREATE', id,
                JSON.stringify({ resumen: `Propuso una mejora (${ETIQUETA_TIPO[tipo]}): ${resumen}` }), req);
        } catch (logErr) {
            logger.error('Error registrando log de idea', { err: logErr.message });
        }

        if (tipo === 'falla') {
            // Sin await: el autor no espera al SMTP, y un correo caído no le quita su envío.
            this._avisarFalla(id).catch(e => logger.warn('No se pudo avisar la falla por correo', { id, err: e.message }));
        }

        return { id, tipo, estado: 'pendiente', tiene_foto: !!foto };
    },

    /**
     * La foto de una idea, para el autor o para un revisor (`ideas.revisar`). Nunca
     * viaja en los listados: se pide aparte, de a una.
     */
    async getFoto(id, usuario) {
        const [[fila]] = await db.query('SELECT usuario_id, foto, foto_mime FROM ideas WHERE id = ?', [id]);
        if (!fila) throw err(404, 'Idea no encontrada');
        const esRevisor = Array.isArray(usuario?.p) && usuario.p.includes('ideas.revisar');
        if (!esRevisor && fila.usuario_id !== usuario?.id) throw err(403, 'No tienes acceso a esta foto');
        if (!fila.foto) throw err(404, 'La idea no tiene foto');
        return { buf: fila.foto, mime: fila.foto_mime || 'image/jpeg' };
    },

    /** Correo inmediato a los revisores cuando alguien reporta "algo no funciona". */
    async _avisarFalla(id) {
        const [[idea]] = await db.query(`${SELECT_BANDEJA} WHERE i.id = ?`, [id]);
        if (!idea) return;
        const [revisores] = await db.query(SELECT_REVISORES);
        const para = revisores.map(r => r.email).filter(Boolean);
        if (!para.length) return;

        // La miniatura (~5 KB) va adjunta: en una falla, ver la pantalla ahorra la pregunta.
        const [[conFoto]] = await db.query('SELECT foto, foto_mime FROM ideas WHERE id = ?', [id]);
        const adjuntos = conFoto?.foto
            ? [{ filename: `idea-${id}.${(conFoto.foto_mime || 'image/jpeg').split('/')[1]}`, content: conFoto.foto, contentType: conFoto.foto_mime }]
            : [];

        const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const donde = [idea.pantalla_nombre, idea.obra_nombre].filter(Boolean).join(' · ') || 'sin pantalla';
        await emailService.sendSystemEmail({
            to: para,
            fromName: 'Bóveda LOLS — Ideas',
            attachments: adjuntos,
            subject: `Algo no funciona — ${idea.autor_nombre}: ${idea.resumen}`.slice(0, 180),
            text: [
                `${idea.autor_nombre} (${idea.autor_rol || 'sin rol'}) reportó que algo no funciona.`,
                `Dónde: ${donde} · ${idea.dispositivo === 'movil' ? 'celular' : 'computador'}`,
                '',
                `Qué estaba haciendo: ${idea.resumen}`,
                `Qué pasó: ${idea.detalle}`,
                `Qué esperaba: ${idea.esperado || '—'}`,
                '',
                'Revísalo en Bóveda → Ideas.',
            ].join('\n'),
            html: `<p><strong>${esc(idea.autor_nombre)}</strong> (${esc(idea.autor_rol || 'sin rol')}) reportó que algo no funciona.</p>
                   <p style="color:#5E5E62">Dónde: ${esc(donde)} · ${idea.dispositivo === 'movil' ? 'celular' : 'computador'}</p>
                   <p><strong>Qué estaba haciendo:</strong> ${esc(idea.resumen)}</p>
                   <p><strong>Qué pasó:</strong> ${esc(idea.detalle)}</p>
                   <p><strong>Qué esperaba:</strong> ${esc(idea.esperado || '—')}</p>
                   <p>Revísalo en Bóveda → Ideas.</p>`,
        });
    },

    /** Mis ideas: las del usuario, de la más nueva a la más vieja, sin nota interna. */
    async misIdeas(usuarioId) {
        const [rows] = await db.query(`${SELECT_BANDEJA} WHERE i.usuario_id = ? ORDER BY i.created_at DESC`, [usuarioId]);
        return rows.map(({ autor_email, ...f }) => aVistaAutor(f));
    },

    /** Para el botón del menú: cuántas ideas tiene y cuántas cambiaron sin que las haya visto. */
    async misIdeasResumen(usuarioId) {
        const [[r]] = await db.query(
            `SELECT COUNT(*) AS total, COALESCE(SUM(visto_por_autor = 0), 0) AS novedades
               FROM ideas WHERE usuario_id = ?`,
            [usuarioId]
        );
        return { total: Number(r?.total) || 0, novedades: Number(r?.novedades) || 0 };
    },

    /** El autor abrió "Mis ideas": sus novedades quedan vistas. */
    async marcarVistas(usuarioId) {
        const [res] = await db.query('UPDATE ideas SET visto_por_autor = 1 WHERE usuario_id = ? AND visto_por_autor = 0', [usuarioId]);
        return { marcadas: res.affectedRows || 0 };
    },

    /**
     * Lo último que se hizo gracias a una idea, para todos: es lo que hace que la gente
     * siga proponiendo. Solo `hecha`, con el nombre de pila + inicial del autor.
     */
    async hechasRecientes(limite = 6) {
        const [rows] = await db.query(
            `SELECT i.id, i.tipo, i.resumen, i.respuesta, i.hecha_en, u.nombre AS autor_nombre
               FROM ideas i JOIN usuarios u ON u.id = i.usuario_id
              WHERE i.estado = 'hecha'
              ORDER BY i.hecha_en DESC
              LIMIT ?`,
            [limite]
        );
        return rows.map(r => {
            const partes = String(r.autor_nombre || '').trim().split(/\s+/);
            const credito = partes.length > 1 ? `${partes[0]} ${partes[1][0]}.` : partes[0] || '';
            const { autor_nombre, ...resto } = r;
            return { ...resto, autor: credito };
        });
    },

    /** Bandeja completa (revisores). Pendientes primero, de la más antigua a la más nueva. */
    async bandeja({ estado, tipo } = {}) {
        const where = [];
        const params = [];
        if (estado) { where.push('i.estado = ?'); params.push(estado); }
        if (tipo) { where.push('i.tipo = ?'); params.push(tipo); }
        const [filas] = await db.query(
            `${SELECT_BANDEJA}
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY FIELD(i.estado, 'pendiente', 'aceptada', 'hecha', 'desechada'),
                      CASE WHEN i.estado = 'pendiente' THEN i.created_at END ASC,
                      i.updated_at DESC`,
            params
        );
        const [conteos] = await db.query('SELECT estado, COUNT(*) AS n, MIN(created_at) AS mas_antigua FROM ideas GROUP BY estado');
        const resumen = { pendiente: 0, aceptada: 0, desechada: 0, hecha: 0, pendiente_mas_antigua: null };
        for (const c of conteos) {
            resumen[c.estado] = Number(c.n) || 0;
            if (c.estado === 'pendiente') resumen.pendiente_mas_antigua = c.mas_antigua;
        }
        return { ideas: filas.map(normalizar), resumen };
    },

    /** Para el número del menú lateral de los revisores. */
    async pendientesCount() {
        const [[r]] = await db.query("SELECT COUNT(*) AS total FROM ideas WHERE estado = 'pendiente'");
        return { total: Number(r?.total) || 0 };
    },

    /**
     * Revisar una idea. Cambiar el estado valida la transición; desechar exige motivo;
     * cada cambio de estado o de respuesta deja una novedad para el autor. La nota
     * interna se puede editar sola, sin tocar nada de lo que ve el autor.
     */
    async revisar(id, data, revisorId, req) {
        const [[actual]] = await db.query('SELECT id, estado, respuesta FROM ideas WHERE id = ?', [id]);
        if (!actual) throw err(404, 'Idea no encontrada');

        const sets = [];
        const params = [];
        let novedadAutor = false;
        const nuevoEstado = data.estado && data.estado !== actual.estado ? data.estado : null;

        if (nuevoEstado) {
            if (!TRANSICIONES[actual.estado]?.includes(nuevoEstado)) {
                throw err(400, `Una idea "${actual.estado}" no puede pasar a "${nuevoEstado}".`, { code: 'IDEA_TRANSICION' });
            }
            if (nuevoEstado === 'desechada' && !data.motivo) {
                throw err(400, 'Para desechar una idea hay que elegir el motivo.', { code: 'IDEA_FALTA_MOTIVO' });
            }
            sets.push('estado = ?'); params.push(nuevoEstado);
            sets.push('motivo = ?'); params.push(nuevoEstado === 'desechada' ? data.motivo : null);
            sets.push('hecha_en = ?'); params.push(nuevoEstado === 'hecha' ? new Date() : null);
            sets.push('revisado_por = ?'); params.push(revisorId);
            sets.push('revisado_en = NOW()');
            novedadAutor = true;
        }
        if (data.respuesta !== undefined) {
            const r = vacioANull(limpio(data.respuesta));
            if (r !== actual.respuesta) {
                sets.push('respuesta = ?'); params.push(r);
                novedadAutor = novedadAutor || !!r;
            }
        }
        if (data.nota_interna !== undefined) {
            sets.push('nota_interna = ?'); params.push(vacioANull(limpio(data.nota_interna)));
        }
        if (!sets.length) return this._unaDeBandeja(id);
        if (novedadAutor) sets.push('visto_por_autor = 0');

        params.push(id);
        await db.query(`UPDATE ideas SET ${sets.join(', ')} WHERE id = ?`, params);

        if (nuevoEstado) {
            try {
                await logManualActivity(revisorId, 'ideas', 'UPDATE', id,
                    JSON.stringify({ resumen: `Idea #${id} ${actual.estado} → ${nuevoEstado}${data.motivo && nuevoEstado === 'desechada' ? ` (${data.motivo})` : ''}` }), req);
            } catch (logErr) {
                logger.error('Error registrando log de revisión de idea', { err: logErr.message });
            }
        }
        return this._unaDeBandeja(id);
    },

    async _unaDeBandeja(id) {
        const [[fila]] = await db.query(`${SELECT_BANDEJA} WHERE i.id = ?`, [id]);
        return normalizar(fila) || null;
    },
};
