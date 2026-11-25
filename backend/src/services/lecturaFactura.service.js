const db = require('../config/db');
const logger = require('../utils/logger-structured');

/**
 * «Leer factura»: Claude lee la foto o PDF de una factura y devuelve los datos para
 * prellenar el formulario (pedido Daphne 2026-11-25). Nada se guarda: la persona
 * revisa y corrige antes de registrar.
 *
 * - Se activa con ANTHROPIC_API_KEY en el .env del backend; sin ella, el botón no
 *   aparece (GET /facturas-inventario/config → lectura_ia: false).
 * - SDK oficial cargado perezoso: si heal-deps todavía no lo instaló en el servidor,
 *   el backend arranca igual y solo esta función falla (con un 503 legible).
 * - Cada línea trae el ítem del catálogo que mejor calza (item_id) o null; el id se
 *   re-valida acá contra el catálogo real (la IA no puede inventar uno).
 */

const MODELO = 'claude-opus-5-5';

let Anthropic = null;
let cliente = null;
function getCliente() {
    if (cliente) return cliente;
    if (!Anthropic) {
        const mod = require('@anthropic-ai/sdk');
        Anthropic = mod.default || mod;
    }
    cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 90 * 1000, maxRetries: 1 });
    return cliente;
}

const disponible = () => !!process.env.ANTHROPIC_API_KEY;

const httpError = (status, msg) => { const e = new Error(msg); e.statusCode = status; return e; };

// Nulos con anyOf (soportado en structured outputs; las listas de tipos no están garantizadas).
const oNulo = (tipo, description) => ({ anyOf: [{ type: tipo }, { type: 'null' }], description });

const ESQUEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['es_factura', 'proveedor', 'numero_factura', 'fecha_factura', 'monto_neto', 'items'],
    properties: {
        es_factura: { type: 'boolean', description: 'false si la imagen no es una factura, boleta o guía de compra' },
        proveedor: oNulo('string', 'Razón social del emisor'),
        numero_factura: oNulo('string', 'Folio / N° de la factura, solo dígitos y letras'),
        fecha_factura: oNulo('string', 'Fecha de emisión en formato YYYY-MM-DD'),
        monto_neto: oNulo('number', 'Monto NETO (sin IVA) en pesos chilenos'),
        items: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['descripcion', 'cantidad', 'precio_unitario', 'item_id'],
                properties: {
                    descripcion: { type: 'string', description: 'Texto de la línea tal cual en la factura' },
                    cantidad: { type: 'number' },
                    precio_unitario: { type: 'number', description: 'Precio unitario NETO (sin IVA)' },
                    item_id: oNulo('integer', 'id del catálogo que corresponde a esta línea, o null si ninguno calza con seguridad'),
                },
            },
        },
    },
};

const SISTEMA = `Lees facturas de compra chilenas (SII) de una constructora y extraes sus datos.
- Montos en pesos chilenos: el punto separa miles y la coma decimales ("1.234.567" = 1234567). Devuelve números sin separadores.
- monto_neto y precio_unitario van SIN IVA. Si la línea muestra solo valor con IVA, divide por 1,19.
- Una línea por cada ítem de la factura, en el orden del documento. Ignora líneas de flete, descuento global o totales.
- item_id: elige del catálogo SOLO si es claramente el mismo producto (misma cosa y medida). Si dudas, null: la persona lo elige después.
- Si un dato no se lee, null. No inventes.`;

async function catalogo() {
    const [rows] = await db.query(
        'SELECT id, descripcion, unidad FROM items_inventario WHERE activo = 1 ORDER BY descripcion LIMIT 2000'
    );
    return rows;
}

/**
 * @param {{ buffer: Buffer, mimetype: string }} file  archivo en memoria (multer memoryStorage)
 */
async function leer(file) {
    if (!disponible()) throw httpError(503, 'La lectura automática de facturas no está activada en este servidor');
    if (!file?.buffer?.length) throw httpError(400, 'No se recibió la foto ni el PDF de la factura');

    let client;
    try { client = getCliente(); } catch {
        throw httpError(503, 'La lectura automática aún se está instalando en el servidor; prueba en unos minutos');
    }

    const items = await catalogo();
    const idsValidos = new Set(items.map(i => Number(i.id)));
    const lista = items.map(i => `${i.id} | ${i.descripcion} | ${i.unidad}`).join('\n');

    const data = file.buffer.toString('base64');
    const bloqueArchivo = file.mimetype === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
        : { type: 'image', source: { type: 'base64', media_type: file.mimetype, data } };

    let respuesta;
    try {
        respuesta = await client.beta.messages.create({
            model: MODELO,
            max_tokens: 16000,
            // Si un clasificador de seguridad rechaza (falso positivo), el servidor reintenta solo con otro modelo.
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
            system: SISTEMA,
            messages: [{
                role: 'user',
                content: [
                    bloqueArchivo,
                    { type: 'text', text: `Catálogo de ítems (id | descripción | unidad):\n${lista}\n\nExtrae los datos de esta factura.` },
                ],
            }],
        });
    } catch (err) {
        const status = err?.status;
        logger.error('[FACTURA-IA] Error llamando a Claude', { status, message: err?.message });
        if (status === 401 || status === 403) throw httpError(503, 'La clave de la lectura automática no es válida; avisa a TI');
        if (status === 429 || status === 529) throw httpError(503, 'El servicio de lectura está ocupado; prueba en un minuto');
        if (status === 400) throw httpError(400, 'No se pudo leer el archivo (¿está dañado o es muy grande?)');
        throw httpError(502, 'No se pudo leer la factura; puedes llenarla a mano');
    }

    if (respuesta.stop_reason === 'refusal') throw httpError(422, 'No se pudo leer esta factura; llénala a mano');
    if (respuesta.stop_reason === 'max_tokens') throw httpError(422, 'La factura es demasiado larga para leerla de una vez; llénala a mano');

    const texto = respuesta.content.filter(b => b.type === 'text').map(b => b.text).join('');
    let json;
    try { json = JSON.parse(texto); } catch {
        throw httpError(502, 'La lectura vino incompleta; prueba de nuevo o llénala a mano');
    }
    if (!json.es_factura) throw httpError(422, 'La imagen no parece una factura');

    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(json.fecha_factura || '') ? json.fecha_factura : null;
    return {
        proveedor: json.proveedor || null,
        numero_factura: json.numero_factura ? String(json.numero_factura).slice(0, 50) : null,
        fecha_factura: fecha,
        monto_neto: Number.isFinite(json.monto_neto) ? Math.round(json.monto_neto) : null,
        items: (json.items || []).map(it => ({
            descripcion: String(it.descripcion || '').slice(0, 255),
            cantidad: Number(it.cantidad) > 0 ? Number(it.cantidad) : 1,
            precio_unitario: Number(it.precio_unitario) >= 0 ? Math.round(Number(it.precio_unitario) * 100) / 100 : 0,
            item_id: idsValidos.has(Number(it.item_id)) ? Number(it.item_id) : null,
        })),
    };
}

module.exports = { leer, disponible };
