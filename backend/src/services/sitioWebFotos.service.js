const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const logger = require('../utils/logger-structured');
const cfg = require('../config/sitioWeb.config');
const sitio = require('./sitioWeb.service');
const { limpiarTmp } = require('../middleware/upload-sitio-web');

/**
 * Sitio web — la portada de cada obra (mig 147, plan 4.6, docs/reglas/sitio-web.md).
 *
 * «Nadie reconocible»: ni caras, ni nombres en cascos o chalecos, ni patentes. Dos llaves atadas a los BYTES:
 *   1. quien sube confirma «no se reconoce a ninguna persona» (sin eso la subida no entra: 400);
 *   2. quien tiene `sitio_web.publicar` aprueba ESE hash (decisión del dueño 28-10, D4: puede ser la misma
 *      persona que subió; la confirmación se exige igual).
 * Cambiar la confirmación anula la aprobación. «Rechazar» es el bloqueo de emergencia: la foto nunca vuelve a
 * salir (la fila rechazada no se borra y la misma imagen, por su hash, no se vuelve a subir ni aprobar). La
 * publicación exige hash === aprobada_hash, sin rechazo y confirmación anterior a la aprobación
 * (sitioWeb.service.fotoPublicable).
 *
 * El archivo del teléfono nunca se guarda: sharp lo vuelve a codificar (orientación aplicada, sin EXIF/GPS,
 * XMP ni IPTC, verificado en las tres salidas) en una maestra JPG de hasta 2400 px y dos WebP de 800 y 1600 px
 * de ancho, que son las que se publican (portada.<hash8>-<800|1600>.webp). El hash es el sha256 de la maestra.
 * Archivos: uploads/sitio-web/<sitio_obra_id>/<hash>-{maestra.jpg,800.webp,1600.webp}; la BD guarda el prefijo
 * (`ruta`) y el archivo se sirve SOLO desde esa ruta (nunca desde algo que mande el cliente).
 */

const { err, linea, registrar } = sitio._h;
const UPLOADS_DIR = sitio._h.UPLOADS_DIR;
const RUTA_RE = /^sitio-web\/\d+\/[0-9a-f]{64}$/;

/*
 * sharp se carga al PRIMER uso y no al arrancar (mismo patrón que docxExport.service): si el dep falta o se
 * está reinstalando (heal-deps), el backend levanta igual y solo falla la subida.
 */
let sharp;
function cargarDeps() {
    if (!sharp) sharp = require('sharp');
}

/** Los primeros bytes dicen el formato real: ni un SVG ni un PDF con nombre de foto llegan a sharp. */
function formatoPorFirma(b) {
    if (!b || b.length < 12) return null;
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
    if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
    return null;
}

const sinMetadatos = (m) => m.exif === undefined && m.xmp === undefined && m.iptc === undefined;

/**
 * La foto subida → { hash, maestra, v800, v1600 } (cada una { data, info }). 400 si no es JPG/PNG/WEBP de verdad,
 * si está dañada, si pasa de 50 MP o si queda con menos de `minAncho` px de ancho (800; la foto heredada de una obra
 * retirada, que ya estaba en el sitio, se guarda con el ancho que tenga).
 */
async function procesarImagen(buffer, { minAncho = cfg.MIN_ANCHO } = {}) {
    cargarDeps();
    const invalida = () => err(400, 'El archivo no es una foto JPG, PNG o WEBP válida.', { code: 'SITIO_WEB_FOTO_FORMATO' });
    if (!formatoPorFirma(buffer)) throw invalida();
    const opciones = { failOn: 'error', limitInputPixels: cfg.LIMIT_INPUT_PIXELS };
    let meta;
    try { meta = await sharp(buffer, opciones).metadata(); } catch { throw invalida(); }
    if (!cfg.FORMATOS.includes(meta.format)) throw invalida();

    let maestra;
    try {
        maestra = await sharp(buffer, opciones)
            .autoOrient()
            .resize({ width: cfg.MAX_MAESTRA, height: cfg.MAX_MAESTRA, fit: 'inside', withoutEnlargement: true })
            .flatten({ background: '#ffffff' })
            .jpeg({ quality: cfg.CALIDAD_MAESTRA })
            .toBuffer({ resolveWithObject: true });
    } catch (e) {
        if (/pixel limit/i.test(e.message)) throw err(400, 'La foto es demasiado grande (más de 50 megapíxeles).', { code: 'SITIO_WEB_FOTO_FORMATO' });
        throw invalida();
    }
    if (maestra.info.width < minAncho) {
        throw err(400, `La foto es muy chica: tiene que tener al menos ${cfg.MIN_ANCHO} px de ancho para verse bien en el sitio.`, { code: 'SITIO_WEB_FOTO_CHICA' });
    }
    const derivada = (ancho) => sharp(maestra.data, opciones)
        .resize({ width: ancho, withoutEnlargement: true })
        .webp({ quality: cfg.CALIDAD_WEBP })
        .toBuffer({ resolveWithObject: true });
    const v800 = await derivada(800);
    const v1600 = await derivada(1600);

    // Las salidas no pueden traer nada de la cámara: si sharp alguna vez copiara metadatos, se rechaza.
    for (const salida of [maestra, v800, v1600]) {
        if (!sinMetadatos(await sharp(salida.data).metadata())) {
            throw err(500, 'La foto no se pudo limpiar de metadatos; no se guardó.');
        }
    }
    const hash = crypto.createHash('sha256').update(maestra.data).digest('hex');
    return { hash, maestra, v800, v1600 };
}

/* ──────────────────────── archivos ──────────────────────── */

const SUFIJOS = Object.values(cfg.ARCHIVOS_FOTO);

/** Ruta absoluta de un archivo de la foto, solo si la `ruta` de la BD tiene la forma esperada. */
function rutaAbsoluta(ruta, sufijo) {
    if (!RUTA_RE.test(String(ruta || ''))) return null;
    const base = path.resolve(UPLOADS_DIR, 'sitio-web');
    const full = path.resolve(UPLOADS_DIR, `${ruta}${sufijo}`);
    return full.startsWith(base + path.sep) ? full : null;
}

/** Borra los archivos de una foto si ninguna OTRA fila usa la misma ruta (la misma foto subida dos veces). */
async function borrarArchivosSiHuerfanos(ruta, sinFilaId) {
    if (!RUTA_RE.test(String(ruta || ''))) return;
    const [[otra]] = await db.query('SELECT id FROM sitio_obra_fotos WHERE ruta = ? AND id <> ? LIMIT 1', [ruta, sinFilaId || 0]);
    if (otra) return;
    for (const suf of SUFIJOS) {
        const full = rutaAbsoluta(ruta, suf);
        if (full) await fs.promises.unlink(full).catch(() => { /* ya no estaba */ });
    }
}

async function fotoOFalla(fotoId) {
    if (!Number.isInteger(fotoId) || fotoId < 1) throw err(404, 'Foto no encontrada');
    const [[f]] = await db.query(
        `SELECT f.*, s.nombre AS obra_nombre, s.slug AS obra_slug
           FROM sitio_obra_fotos f JOIN sitio_obras s ON s.id = f.sitio_obra_id
          WHERE f.id = ?`, [fotoId]
    );
    if (!f) throw err(404, 'Foto no encontrada');
    return f;
}

const sha256Archivo = async (full) => crypto.createHash('sha256').update(await fs.promises.readFile(full)).digest('hex');

/**
 * El rechazo es de la IMAGEN, no de la fila: la misma foto vuelta a subir da el mismo hash (sharp es determinista),
 * así que se busca en todas las obras. Las filas rechazadas nunca se borran (borrarFoto), así el registro queda.
 */
async function hashRechazado(hash) {
    const [[r]] = await db.query('SELECT id FROM sitio_obra_fotos WHERE hash = ? AND rechazada_at IS NOT NULL LIMIT 1', [hash]);
    return !!r;
}
const errFotoYaRechazada = () => err(409, 'Esta foto ya fue rechazada para el sitio: no puede volver a salir. Elige otra.', { code: 'SITIO_WEB_FOTO_RECHAZADA' });

/* ──────────────────────── API ──────────────────────── */

const api = {
    /**
     * POST /obras/:id/fotos (multipart: foto, alt, sin_personas='true'). Siempre crea una fila NUEVA, sin
     * aprobar; la portada anterior se borra cuando se aprueba esta. El .bin original se borra siempre.
     */
    async subirPortada(sitioObraId, file, campos = {}, userId) {
        try {
            if (!file || !file.path) throw err(400, 'No llegó la foto.', { code: 'SITIO_WEB_SIN_FOTO' });
            const confirma = campos.sin_personas === 'true' || campos.sin_personas === true;
            const alt = linea(campos.alt);
            if (!confirma || !alt) {
                throw err(400, 'Para subir la foto marca «Confirmo que en la foto no se reconoce a ninguna persona» y escribe qué se ve en ella.',
                    { code: 'SITIO_WEB_FOTO_SIN_CONFIRMAR' });
            }
            if (alt.length < cfg.ALT_MIN || alt.length > cfg.LARGOS.alt) {
                throw err(400, `La descripción de la foto tiene que tener entre ${cfg.ALT_MIN} y ${cfg.LARGOS.alt} letras.`, { code: 'SITIO_WEB_FOTO_ALT' });
            }
            const obra = await sitio._h.obraOFalla(sitioObraId);
            const img = await procesarImagen(await fs.promises.readFile(file.path));
            if (await hashRechazado(img.hash)) throw errFotoYaRechazada();   // antes de escribir nada

            const ruta = `sitio-web/${obra.id}/${img.hash}`;
            await fs.promises.mkdir(path.join(UPLOADS_DIR, 'sitio-web', String(obra.id)), { recursive: true });
            const salidas = [[cfg.ARCHIVOS_FOTO.maestra, img.maestra], [cfg.ARCHIVOS_FOTO[800], img.v800], [cfg.ARCHIVOS_FOTO[1600], img.v1600]];
            for (const [suf, salida] of salidas) await fs.promises.writeFile(rutaAbsoluta(ruta, suf), salida.data);

            const ahora = new Date();
            let r;
            try {
                [r] = await db.query(
                    `INSERT INTO sitio_obra_fotos (sitio_obra_id, rol, orden, alt, ruta, hash, ancho, alto, tamano_bytes, subido_por,
                                                   sin_personas_confirmado, confirmado_por, confirmado_at)
                     VALUES (?, 'portada', 0, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
                    [obra.id, alt, ruta, img.hash, img.v1600.info.width, img.v1600.info.height, img.v1600.info.size, userId, userId, ahora]
                );
            } catch (e) {
                await borrarArchivosSiHuerfanos(ruta, 0).catch(() => {});
                throw e;
            }
            await registrar(null, { sitio_obra_id: obra.id, entidad: 'foto', entidad_id: r.insertId, accion: 'subir',
                resumen: `Subió una foto de portada para «${obra.nombre}» y confirmó que no se reconoce a nadie (espera aprobación)`,
                detalle: { hash: img.hash.slice(0, 8), ancho: img.v1600.info.width, alto: img.v1600.info.height }, usuario_id: userId });
            return {
                id: r.insertId, sitio_obra_id: obra.id, rol: 'portada', alt, estado: 'por_aprobar',
                ancho: img.v1600.info.width, alto: img.v1600.info.height, tamano_bytes: img.v1600.info.size,
            };
        } finally {
            if (file && file.path) await fs.promises.unlink(file.path).catch(() => { /* ya no estaba */ });
            limpiarTmp();
        }
    },

    /** PUT /fotos/:fotoId: descripción y confirmación. Cualquier cambio en la confirmación ANULA la aprobación. */
    async editarFoto(fotoId, data, userId) {
        const f = await fotoOFalla(fotoId);
        if (f.rechazada_at) throw err(409, 'Esta foto fue rechazada: ya no se puede usar. Sube otra.', { code: 'SITIO_WEB_FOTO_RECHAZADA' });
        const sets = {};
        if (data.alt !== undefined && data.alt !== null) {
            const alt = linea(data.alt);
            if (!alt || alt.length < cfg.ALT_MIN || alt.length > cfg.LARGOS.alt) {
                throw err(400, `La descripción de la foto tiene que tener entre ${cfg.ALT_MIN} y ${cfg.LARGOS.alt} letras.`, { code: 'SITIO_WEB_FOTO_ALT' });
            }
            if (alt !== f.alt) sets.alt = alt;
        }
        let anulada = false;
        if (typeof data.sin_personas_confirmado === 'boolean' && data.sin_personas_confirmado !== !!f.sin_personas_confirmado) {
            Object.assign(sets, data.sin_personas_confirmado
                ? { sin_personas_confirmado: true, confirmado_por: userId, confirmado_at: new Date() }
                : { sin_personas_confirmado: false, confirmado_por: null, confirmado_at: null });
            anulada = !!f.aprobada_at;
            Object.assign(sets, { aprobada_por: null, aprobada_at: null, aprobada_hash: null });
        }
        if (!Object.keys(sets).length) return { id: fotoId, sin_cambios: true };
        await db.query(`UPDATE sitio_obra_fotos SET ${Object.keys(sets).map(c => `${c} = ?`).join(', ')} WHERE id = ?`,
            [...Object.values(sets), fotoId]);
        const partes = [];
        if (sets.alt) partes.push('cambió la descripción');
        if (sets.sin_personas_confirmado === true) partes.push('confirmó que no se reconoce a nadie');
        if (sets.sin_personas_confirmado === false) partes.push('quitó la confirmación «no se reconoce a nadie»');
        if (anulada) partes.push('la aprobación quedó anulada');
        await registrar(null, { sitio_obra_id: f.sitio_obra_id, entidad: 'foto', entidad_id: fotoId,
            accion: sets.sin_personas_confirmado !== undefined ? 'confirmar' : 'editar',
            resumen: `Foto de «${f.obra_nombre}»: ${partes.join('; ')}`, usuario_id: userId });
        return { id: fotoId, aprobacion_anulada: anulada };
    },

    /**
     * POST /fotos/:fotoId/aprobar (`sitio_web.publicar`). Exige la confirmación y que los bytes guardados sigan
     * siendo los del hash. Al aprobarse: la imagen referencial de la obra pasa a null y la portada anterior se
     * borra (fila y archivos; lo ya publicado sigue en el repo hasta la próxima publicación).
     */
    async aprobarFoto(fotoId, userId) {
        const f = await fotoOFalla(fotoId);
        if (f.rechazada_at) throw err(409, 'Esta foto fue rechazada: no puede volver a salir. Sube otra.', { code: 'SITIO_WEB_FOTO_RECHAZADA' });
        if (!f.sin_personas_confirmado || !f.confirmado_at) {
            throw err(409, 'Antes de aprobarla, alguien tiene que confirmar que en la foto no se reconoce a ninguna persona.', { code: 'SITIO_WEB_FOTO_SIN_CONFIRMAR' });
        }
        if (!linea(f.alt) || linea(f.alt).length < cfg.ALT_MIN) {
            throw err(409, 'La foto necesita una descripción antes de aprobarla.', { code: 'SITIO_WEB_FOTO_ALT' });
        }
        if (sitio.fotoPublicable(f)) return { id: fotoId, sin_cambios: true };
        // Segunda red: la misma imagen ya rechazada en otra fila (o en otra obra) no se aprueba.
        if (await hashRechazado(f.hash)) throw errFotoYaRechazada();
        const maestra = rutaAbsoluta(f.ruta, cfg.ARCHIVOS_FOTO.maestra);
        const intacta = maestra && await sha256Archivo(maestra).then(h => h === f.hash, () => false);
        if (!intacta) {
            throw err(409, 'El archivo de la foto no coincide con lo que se subió: súbela de nuevo.', { code: 'SITIO_WEB_FOTO_ALTERADA' });
        }
        const [r] = await db.query(
            `UPDATE sitio_obra_fotos SET aprobada_por = ?, aprobada_at = ?, aprobada_hash = hash
              WHERE id = ? AND hash = ? AND rechazada_at IS NULL AND sin_personas_confirmado = 1`,
            [userId, new Date(), fotoId, f.hash]
        );
        if (!r || !r.affectedRows) throw err(409, 'La foto cambió mientras la aprobabas. Recarga e inténtalo de nuevo.', { code: 'SITIO_WEB_FOTO_CAMBIO' });

        if (f.rol === 'portada') {
            await db.query('UPDATE sitio_obras SET referencia = NULL, updated_at = updated_at WHERE id = ? AND referencia IS NOT NULL', [f.sitio_obra_id]);
            const [anteriores] = await db.query(
                `SELECT id, ruta FROM sitio_obra_fotos
                  WHERE sitio_obra_id = ? AND rol = 'portada' AND id <> ? AND aprobada_at IS NOT NULL AND rechazada_at IS NULL`,
                [f.sitio_obra_id, fotoId]
            );
            if (anteriores.length) {
                await db.query('DELETE FROM sitio_obra_fotos WHERE id IN (?)', [anteriores.map(a => a.id)]);
                for (const a of anteriores) await borrarArchivosSiHuerfanos(a.ruta, a.id).catch(e => logger.error('No se pudo borrar una portada reemplazada', { err: e.message, id: a.id }));
            }
            await registrar(null, { sitio_obra_id: f.sitio_obra_id, entidad: 'foto', entidad_id: fotoId, accion: 'aprobar',
                resumen: `Aprobó la portada de «${f.obra_nombre}»${anteriores.length ? ' (reemplaza la anterior)' : ''}`,
                detalle: { hash: String(f.hash).slice(0, 8), reemplazadas: anteriores.map(a => a.id) }, usuario_id: userId });
            return { id: fotoId, estado: 'vigente', reemplazadas: anteriores.map(a => a.id), obra_nombre: f.obra_nombre };
        }
        await registrar(null, { sitio_obra_id: f.sitio_obra_id, entidad: 'foto', entidad_id: fotoId, accion: 'aprobar',
            resumen: `Aprobó una foto de «${f.obra_nombre}»`, usuario_id: userId });
        return { id: fotoId, estado: 'aprobada', reemplazadas: [], obra_nombre: f.obra_nombre };
    },

    /**
     * POST /fotos/:fotoId/rechazar (`sitio_web.publicar`): bloqueo de emergencia. Anula la aprobación y la foto
     * no vuelve a salir; si estaba publicada, la próxima publicación la saca del sitio.
     */
    async rechazarFoto(fotoId, userId) {
        const f = await fotoOFalla(fotoId);
        if (f.rechazada_at) return { id: fotoId, sin_cambios: true };
        const estabaPublicable = sitio.fotoPublicable(f);
        await db.query(
            `UPDATE sitio_obra_fotos SET rechazada_por = ?, rechazada_at = ?, aprobada_por = NULL, aprobada_at = NULL, aprobada_hash = NULL
              WHERE id = ?`, [userId, new Date(), fotoId]
        );
        await registrar(null, { sitio_obra_id: f.sitio_obra_id, entidad: 'foto', entidad_id: fotoId, accion: 'rechazar',
            resumen: `Rechazó una foto de «${f.obra_nombre}» (no vuelve a salir al sitio)`,
            detalle: { hash: String(f.hash).slice(0, 8), heredada_src: f.heredada_src || null, estaba_aprobada: estabaPublicable }, usuario_id: userId });
        return { id: fotoId, estado: 'rechazada', estaba_aprobada: estabaPublicable, obra_nombre: f.obra_nombre };
    },

    /**
     * DELETE /fotos/:fotoId: la fila y sus archivos. NO se borra (409):
     *   · una RECHAZADA: queda registrada para siempre (el rechazo es de la imagen: si la fila se fuera, la próxima
     *     publicación ya no sabría que tiene que sacar la foto del sitio, y la misma foto se podría volver a subir);
     *   · una que el sitio muestra hoy (la nombra `publicado_json`): borrarla aquí no la saca de allá; la publicación
     *     mantendría la versión publicada con esa foto. Para sacarla: rechazarla y publicar, o reemplazarla.
     */
    async borrarFoto(fotoId, userId) {
        const f = await fotoOFalla(fotoId);
        if (f.rechazada_at) {
            throw err(409, 'Una foto rechazada queda registrada para que nunca vuelva a salir al sitio: no se borra.',
                { code: 'SITIO_WEB_FOTO_RECHAZADA_QUEDA' });
        }
        const [[obra]] = await db.query('SELECT publicado_json FROM sitio_obras WHERE id = ?', [f.sitio_obra_id]);
        let publicada = null;
        try { publicada = obra && obra.publicado_json ? JSON.parse(obra.publicado_json) : null; } catch { publicada = null; }
        if (publicada && sitio.fotoNombradaEn(publicada, f)) {
            throw err(409, 'Esta foto está publicada en el sitio: borrarla aquí no la saca de ahí. Para sacarla, quien publica la rechaza y publica (o aprueba otra portada que la reemplace).',
                { code: 'SITIO_WEB_FOTO_PUBLICADA' });
        }
        await db.query('DELETE FROM sitio_obra_fotos WHERE id = ?', [fotoId]);
        await borrarArchivosSiHuerfanos(f.ruta, fotoId);
        await registrar(null, { sitio_obra_id: f.sitio_obra_id, entidad: 'foto', entidad_id: fotoId, accion: 'borrar',
            resumen: `Borró una foto de «${f.obra_nombre}»`, detalle: { hash: String(f.hash).slice(0, 8) }, usuario_id: userId });
        return { id: fotoId };
    },

    /**
     * GET /fotos/:fotoId/archivo?ancho=800|1600|maestra → { rel, root } para res.sendFile. La ruta sale SOLO de
     * la BD (y se revisa su forma); `ancho` fuera de la lista → 400. Una heredada del sitio sirve su maestra.
     */
    async archivoFoto(fotoId, ancho) {
        const clave = typeof ancho === 'string' ? ancho : '';
        if (!Object.prototype.hasOwnProperty.call(cfg.ARCHIVOS_FOTO, clave)) {
            throw err(400, 'ancho tiene que ser 800, 1600 o maestra.', { code: 'SITIO_WEB_ANCHO' });
        }
        if (!Number.isInteger(fotoId) || fotoId < 1) throw err(404, 'Foto no encontrada');
        const [[f]] = await db.query('SELECT id, ruta, heredada_src FROM sitio_obra_fotos WHERE id = ?', [fotoId]);
        if (!f) throw err(404, 'Foto no encontrada');
        // La heredada del sitio (importación) es solo la maestra: el 1.jpg tal cual, sin derivadas.
        const full = rutaAbsoluta(f.ruta, f.heredada_src ? cfg.ARCHIVOS_FOTO.maestra : cfg.ARCHIVOS_FOTO[clave]);
        if (!full || !fs.existsSync(full)) throw err(404, 'El archivo de la foto ya no está.');
        return { rel: path.relative(UPLOADS_DIR, full), root: UPLOADS_DIR };
    },
};

const envuelto = Object.fromEntries(Object.entries(api).map(([k, fn]) => [k, sitio._h.conTablas(fn)]));

module.exports = { ...envuelto, procesarImagen, formatoPorFirma, rutaAbsoluta, _interno: { cargarDeps, RUTA_RE } };
