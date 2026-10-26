const db = require('../config/db');
const logger = require('../utils/logger-structured');
const TABLA_LOCAL = require('../config/feriadosChile');

class FeriadosService {
    async getAll() {
        const [rows] = await db.query('SELECT * FROM feriados WHERE activo = 1 ORDER BY fecha ASC');
        return rows;
    }

    async getByDateRange(start, end) {
        const [rows] = await db.query(
            'SELECT * FROM feriados WHERE fecha BETWEEN ? AND ? AND activo = 1',
            [start, end]
        );
        return rows;
    }

    async create(data) {
        const { fecha, nombre, tipo, irrenunciable } = data;
        const [result] = await db.query(
            'INSERT INTO feriados (fecha, nombre, tipo, irrenunciable) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), tipo = VALUES(tipo), irrenunciable = VALUES(irrenunciable), activo = 1',
            [fecha, nombre, tipo || 'obra', irrenunciable || false]
        );
        return { id: result.insertId || null, ...data };
    }

    async update(id, data) {
        const { fecha, nombre, tipo, irrenunciable } = data;
        await db.query(
            'UPDATE feriados SET fecha = ?, nombre = ?, tipo = ?, irrenunciable = ? WHERE id = ?',
            [fecha, nombre, tipo || 'obra', irrenunciable || false, id]
        );
        return { id, ...data };
    }

    async delete(id) {
        await db.query('UPDATE feriados SET activo = 0 WHERE id = ?', [id]);
        return true;
    }

    /**
     * Trae los feriados NACIONALES de un año y los guarda (botón «Sincronizar» de Configuración → Feriados).
     *
     * Hasta 2026-10 dependía solo de apis.digital.gob.cl, que dejó de existir (el dominio ya no resuelve), y
     * además la ruta /feriados/sync se había perdido en el refactor de permisos: el botón fallaba siempre.
     * Ahora prueba fuentes en orden y se queda con la primera que entregue una lista creíble:
     *   1. Gobierno Digital — la oficial, por si vuelve.
     *   2. api.boostr.cl — gratuita, sin llave; trae los feriados adicionales por ley y los irrenunciables.
     *   3. Tabla verificada en Bóveda (config/feriadosChile.js) — si el año está cargado.
     *   4. Nager.Date — último recurso: NO conoce los feriados adicionales chilenos (omitió el 17-09-2027,
     *      Ley 20.983), así que la respuesta sale marcada `parcial` para que la pantalla lo advierta.
     *
     * Al guardar: inserta los que faltan y actualiza nombre/irrenunciable de los nacionales existentes; un
     * feriado de obra/patronal/otro en la misma fecha se respeta tal cual (ya es feriado). No borra nada.
     */
    async syncNacionalHolidays(year, { fetchImpl = globalThis.fetch } = {}) {
        const r = await obtenerFeriadosNacionales(year, { fetchImpl });
        const [existentes] = await db.query(
            "SELECT id, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, nombre, tipo, irrenunciable, activo FROM feriados WHERE fecha BETWEEN ? AND ?",
            [`${year}-01-01`, `${year}-12-31`]
        );
        const porFecha = new Map(existentes.map(e => [e.fecha, e]));
        let nuevos = 0, actualizados = 0, respetados = 0;
        for (const f of r.feriados) {
            const e = porFecha.get(f.fecha);
            if (!e) {
                await db.query(
                    "INSERT INTO feriados (fecha, nombre, tipo, irrenunciable) VALUES (?, ?, 'nacional', ?)",
                    [f.fecha, f.nombre, f.irrenunciable ? 1 : 0]
                );
                nuevos++;
            } else if (e.tipo !== 'nacional') {
                respetados++;
            } else if (e.nombre !== f.nombre || !!e.irrenunciable !== f.irrenunciable || !e.activo) {
                await db.query(
                    'UPDATE feriados SET nombre = ?, irrenunciable = ?, activo = 1 WHERE id = ?',
                    [f.nombre, f.irrenunciable ? 1 : 0, e.id]
                );
                actualizados++;
            }
        }
        logger.info('Feriados sincronizados', { year, fuente: r.fuente, total: r.feriados.length, nuevos, actualizados, respetados });
        return {
            success: true, year, fuente: r.fuente, fuenteNombre: FUENTE_NOMBRE[r.fuente], parcial: r.parcial,
            count: r.feriados.length, nuevos, actualizados, respetados, intentos: r.intentos,
        };
    }
}

// ─── Fuentes de feriados nacionales ───────────────────────────────────────────

const TIMEOUT_MS = 8000;
const MIN_FERIADOS = 12;   // Chile tiene 15-18 al año: menos que esto es una respuesta rota
/** Irrenunciables del comercio (Ley 19.973): para la fuente que no lo informa. */
const IRRENUNCIABLES_MMDD = new Set(['01-01', '05-01', '09-18', '09-19', '12-25']);
const FUENTE_NOMBRE = Object.freeze({
    gobierno: 'Gobierno Digital', boostr: 'boostr.cl', tabla: 'tabla verificada de Bóveda', nager: 'Nager.Date',
});

async function _json(fetchImpl, url) {
    const res = await fetchImpl(url, { headers: { 'User-Agent': 'BovedaLOLS/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

const FUENTES = [
    { id: 'gobierno', leer: async (y, f) => (await _json(f, `https://apis.digital.gob.cl/fl/feriados/${y}`))
        .map(h => ({ fecha: h.fecha, nombre: h.nombre, irrenunciable: h.irrenunciable === '1' || h.irrenunciable === true })) },
    { id: 'boostr', leer: async (y, f) => {
        const j = await _json(f, `https://api.boostr.cl/holidays/${y}.json`);
        if (j.status !== 'success' || !Array.isArray(j.data)) throw new Error('respuesta sin datos');
        return j.data.map(h => ({ fecha: h.date, nombre: h.title, irrenunciable: h.inalienable === true }));
    } },
    { id: 'tabla', leer: async (y) => {
        const filas = TABLA_LOCAL[y];
        if (!filas) throw new Error(`el año ${y} no está en la tabla`);
        return filas.map(([fecha, nombre, irr]) => ({ fecha, nombre, irrenunciable: !!irr }));
    } },
    { id: 'nager', parcial: true, leer: async (y, f) => (await _json(f, `https://date.nager.at/api/v3/PublicHolidays/${y}/CL`))
        .filter(h => h.global !== false && !h.counties)   // fuera los regionales (Arica, Chillán…)
        .map(h => ({ fecha: h.date, nombre: h.localName, irrenunciable: IRRENUNCIABLES_MMDD.has(String(h.date).slice(5)) })) },
];

/** Limpia y valida lo que trae una fuente: fechas del año pedido, nombres no vacíos, sin duplicados. */
function normalizar(lista, year) {
    if (!Array.isArray(lista)) throw new Error('respuesta inesperada');
    const re = new RegExp(`^${year}-\\d{2}-\\d{2}$`);
    const porFecha = new Map();
    for (const h of lista) {
        const fecha = String(h?.fecha ?? '').slice(0, 10);
        const nombre = String(h?.nombre ?? '').trim().slice(0, 255);
        if (!re.test(fecha) || !nombre || porFecha.has(fecha)) continue;
        porFecha.set(fecha, { fecha, nombre, irrenunciable: !!h.irrenunciable });
    }
    const feriados = [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (feriados.length < MIN_FERIADOS) throw new Error(`solo ${feriados.length} feriados válidos`);
    return feriados;
}

/** Primera fuente que responda con una lista creíble. Si ninguna, 503 con el detalle de cada intento. */
async function obtenerFeriadosNacionales(year, { fetchImpl = globalThis.fetch } = {}) {
    const intentos = [];
    for (const fuente of FUENTES) {
        try {
            const feriados = normalizar(await fuente.leer(year, fetchImpl), year);
            return { fuente: fuente.id, parcial: !!fuente.parcial, feriados, intentos };
        } catch (err) {
            intentos.push({ fuente: fuente.id, error: err.name === 'TimeoutError' ? 'no respondió a tiempo' : err.message });
            logger.warn('Fuente de feriados falló', { year, fuente: fuente.id, err: err.message });
        }
    }
    const e = new Error(`No se pudieron obtener los feriados de ${year} de ninguna fuente. Cárgalos a mano con «Nuevo feriado».`);
    e.statusCode = 503;
    e.details = { intentos };
    throw e;
}

const service = new FeriadosService();
service._interno = { FUENTES, normalizar, obtenerFeriadosNacionales, MIN_FERIADOS, FUENTE_NOMBRE };
module.exports = service;
