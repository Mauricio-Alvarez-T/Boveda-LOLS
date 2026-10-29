/**
 * Schemas de /api/sitio-web (validateBody, mini-DSL propio; NO zod). Mig 147, docs/reglas/sitio-web.md.
 *
 * Lo que el mini-DSL no cubre lo revisa el service: el recorte de textos ('' → null), los servicios contra el
 * catálogo, el slug reservado y las reglas cruzadas del contrato (faltantes). Los booleanos son reales
 * (true/false), nunca 0/1. `null` en un campo opcional = borrar ese dato.
 */
const { ESTADOS, TIPOS, SLUG_RE, LARGOS, ALT_MIN, ANIO_MIN, ANIO_MAX } = require('../config/sitioWeb.config');

const texto = (max) => ({ type: 'string', maxLength: max });

const camposObra = {
    slug: { type: 'string', maxLength: LARGOS.slug, pattern: SLUG_RE },
    obra_id: { type: 'integer', min: 1 },
    titular: texto(LARGOS.titular),
    // '' = sin tipo (el selector vacío); el service lo guarda como null.
    tipo: { type: 'string', in: [...TIPOS, ''] },
    mandante: texto(LARGOS.mandante),
    mandante_autoriza: { type: 'boolean' },
    comuna: texto(LARGOS.comuna),
    direccion: texto(LARGOS.direccion),
    superficie_m2: { type: 'integer', min: 1, max: 10000000 },
    estado: { type: 'string', in: ESTADOS },
    anio: { type: 'integer', min: ANIO_MIN, max: ANIO_MAX },
    inicio: texto(LARGOS.inicio),
    // Cada slug se revisa contra el catálogo en el service (itemRules es para listas de objetos).
    servicios: { type: 'array' },
    desafio: texto(LARGOS.desafio),
    solucion: texto(LARGOS.solucion),
    resultado: texto(LARGOS.resultado),
};

// POST /obras
const crearObra = {
    nombre: { required: true, type: 'string', minLength: 1, maxLength: LARGOS.nombre },
    ...camposObra,
};

// PUT /obras/:id — todo opcional, pero con la versión que se editó (concurrencia).
const editarObra = {
    nombre: { type: 'string', minLength: 1, maxLength: LARGOS.nombre },
    ...camposObra,
    updated_at: { required: true, type: 'string', maxLength: 40 },
};

// PUT /obras/:id/incluir
const incluir = {
    incluir: { required: true, type: 'boolean' },
};

// PUT /obras/orden — los ids de UN estado, en el orden nuevo.
const orden = {
    estado: { required: true, type: 'string', in: ESTADOS },
    ids: { required: true, type: 'array', minLength: 1 },
};

// PUT /fotos/:fotoId
const editarFoto = {
    alt: { type: 'string', minLength: ALT_MIN, maxLength: LARGOS.alt },
    sin_personas_confirmado: { type: 'boolean' },
};

// POST /publicar (Fase 1, parte 2)
const publicar = {
    confirmo_revision: { required: true, type: 'boolean' },
};

// POST /publicaciones/resincronizar (Fase 1, parte 2)
const resincronizar = {
    confirmo: { required: true, type: 'boolean' },
};

module.exports = { crearObra, editarObra, incluir, orden, editarFoto, publicar, resincronizar };
