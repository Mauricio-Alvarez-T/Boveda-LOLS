/**
 * Sitio web (lols.cl) — catálogos y rutas del módulo (mig 147, docs/reglas/sitio-web.md).
 *
 * La Bóveda escribe en el repo PÚBLICO de lols.cl un JSON por obra (src/content/obras/<slug>.json) y su
 * portada (public/proyectos/<slug>/). El contrato manda en lols.cl: src/content.config.ts (esquema
 * estricto), src/data/catalogo.ts (tiposObra), src/data/empresa.ts (servicios), src/data/referencia.ts
 * (referenciasDeObra) y docs/contenido-obras.md. Estas listas son su ESPEJO: si allá cambian, se cambian
 * aquí. El build del sitio es la segunda red (un valor fuera de catálogo hace fallar el build y el sitio
 * anterior sigue arriba).
 */

/** Estados en la Bóveda → valor en el JSON del sitio ('en-curso' conserva las URLs viejas del sitio). */
const ESTADO_SITIO = Object.freeze({
    en_construccion: 'en-curso',
    contratado: 'contratado',
    terminado: 'terminado',
});
/** En el orden en que los muestra el sitio: lo que está pasando ahora primero. */
const ESTADOS = Object.freeze(Object.keys(ESTADO_SITIO));
const ESTADO_DESDE_SITIO = Object.freeze(Object.fromEntries(Object.entries(ESTADO_SITIO).map(([b, s]) => [s, b])));
/** Como los nombra el sitio (catalogo.ts → estados). */
const ETIQUETA_ESTADO = Object.freeze({
    en_construccion: 'En construcción',
    contratado: 'En proyecto',
    terminado: 'Terminado',
});

/** tiposObra de lols.cl (src/data/catalogo.ts), mismo texto y orden. */
const TIPOS = Object.freeze([
    'Edificio de oficinas',
    'Edificio y oficinas',
    'Edificio comercial',
    'Bodegaje',
    'Centro de bodegas',
    'Industrial',
    'Habilitación',
]);

/** servicios de lols.cl (src/data/empresa.ts): el slug va al JSON; el nombre es para la pantalla. */
const SERVICIOS = Object.freeze([
    { slug: 'construccion', nombre: 'Construcción' },
    { slug: 'montaje-industrial', nombre: 'Montaje industrial' },
    { slug: 'electricidad', nombre: 'Electricidad' },
]);
const SLUGS_SERVICIO = Object.freeze(SERVICIOS.map(s => s.slug));

/**
 * Claves de referenciasDeObra (src/data/referencia.ts): imagen referencial de una obra que todavía no tiene
 * foto propia. La Bóveda no las ofrece para elegir: conserva la que trae una obra importada del sitio y la
 * pone en null cuando se aprueba una portada propia.
 */
const REFERENCIAS = Object.freeze([
    'rendersEjemplo/escobar-williams-195',
    'rendersEjemplo/conferencia-622',
    'rendersEjemplo/gorbea-3082',
    'rendersEjemplo/domeyko-2432',
    'rendersEjemplo/maipu-40',
    'rendersContratados/0',
    'rendersContratados/1',
    'rendersContratados/2',
    'fotosObrasEjemplo/abate-molina-676',
    'fotosObrasEjemplo/abate-molina-80',
    'fotosObrasEjemplo/san-alfonso-607',
    'fotosObrasEjemplo/abate-molina-321',
]);

/** Largos máximos del contrato (content.config.ts). */
const LARGOS = Object.freeze({
    slug: 80, nombre: 160, titular: 240, mandante: 160, comuna: 80, direccion: 200, inicio: 40,
    desafio: 1200, solucion: 1200, resultado: 1200, alt: 200,
});
const ALT_MIN = 5;
const ANIO_MIN = 1995;
const ANIO_MAX = 2100;

/** Slug = nombre del archivo en el sitio: minúsculas, números y guiones simples. */
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/**
 * Slugs que el sitio ya usa para otra cosa: «ejemplo» (la ficha de muestra) y los ids de las muestras de un
 * carrusel, `obra-<sección>-<n>` (CarruselObras.astro; verificar-obras-reales.mjs falla si chocan). «muestra-*»
 * queda reservado para las muestras de la Fase 0 del plan.
 */
const SLUG_RESERVADOS = Object.freeze(['ejemplo']);
const SLUG_PATRONES_RESERVADOS = Object.freeze([
    /^(en-construccion|terminados|han-confiado|contratados|en-obra-ahora|pr-ximos-proyectos)-\d+$/,
    /^muestra(-|$)/,
]);

/** Fotos: derivadas WebP que se publican y la maestra JPG (sin metadatos) que queda en la Bóveda. */
const ANCHOS = Object.freeze([800, 1600]);
const MAX_MAESTRA = 2400;
/** Menos de 800 px de ancho se vería borroso en la portada de la ficha. */
const MIN_ANCHO = 800;
const MAX_BYTES = 10 * 1024 * 1024;
const LIMIT_INPUT_PIXELS = 50000000;
const FORMATOS = Object.freeze(['jpeg', 'png', 'webp']);
const MIMES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
const CALIDAD_MAESTRA = 90;
const CALIDAD_WEBP = 78;
/** Lo que se pide en GET /fotos/:id/archivo?ancho= → sufijo del archivo en uploads. */
const ARCHIVOS_FOTO = Object.freeze({ 800: '-800.webp', 1600: '-1600.webp', maestra: '-maestra.jpg' });

/** Repo público del sitio: publicar en él exige el .env de PRODUCCIÓN (sitioWebGuarda.modoEfectivo). */
const REPO_PUBLICO = 'Mauricio-Alvarez-T/lols.cl';
const URL_SITIO = 'https://nuevo.lols.cl';

/**
 * Carpetas de public/proyectos/ de «Han confiado en nosotros» (obrasConfianza en src/data/proyectos.ts de lols.cl,
 * que sigue en el código del sitio): su 1.jpg es del repo, no de la Bóveda. Nunca se borra ni se reemplaza (el
 * build de lols.cl falla si falta). Son las 12 del carrusel, no solo las 4 que hoy también son una obra: lo mismo
 * vale para una obra futura con uno de estos slugs (docs/contenido-obras.md § Carpetas compartidas). ESPEJO: si
 * cambia obrasConfianza, cambia aquí.
 */
const CARPETAS_COMPARTIDAS = Object.freeze([
    'enfermera-lucia-vidal-arias-6679',
    'claudio-gay-2970',
    'av-providencia-1132',
    'abate-molina-221',
    'bascunan-guerrero-818',
    'grajales-2751',
    'bascunan-guerrero-239',
    'gorbea-2635',
    'tucapel-jimenez-84',
    'conferencia-442',
    'san-alfonso-580',
    'abate-molina-211',
]);

/**
 * Rutas del repo que son de la Bóveda (las únicas que puede escribir o borrar; sitioWebGuarda.rutaPermitida):
 *   - el JSON de cada obra;
 *   - las portadas que sube la Bóveda (el hash cambia con los bytes: la caché nunca tapa una foto nueva);
 *   - el 1.jpg heredado de una obra importada del sitio (solo para BORRARLO al aprobarse una portada nueva o
 *     al retirar la obra), salvo en las CARPETAS_COMPARTIDAS.
 * `.gitkeep` de src/content/obras/ no calza con ninguna: nunca se toca.
 */
const SLUG_EN_RUTA = '[a-z0-9]+(?:-[a-z0-9]+)*';
const RUTA_JSON_RE = new RegExp(`^src/content/obras/(${SLUG_EN_RUTA})\\.json$`);
const RUTA_PORTADA_RE = new RegExp(`^public/proyectos/(${SLUG_EN_RUTA})/portada\\.[0-9a-f]{8}-(?:800|1600)\\.webp$`);
const RUTA_HEREDADA_RE = new RegExp(`^public/proyectos/(${SLUG_EN_RUTA})/1\\.jpg$`);
const RUTAS_DUENAS = Object.freeze([RUTA_JSON_RE, RUTA_PORTADA_RE, RUTA_HEREDADA_RE]);

module.exports = {
    ESTADOS, ESTADO_SITIO, ESTADO_DESDE_SITIO, ETIQUETA_ESTADO,
    TIPOS, SERVICIOS, SLUGS_SERVICIO, REFERENCIAS,
    LARGOS, ALT_MIN, ANIO_MIN, ANIO_MAX,
    SLUG_RE, SLUG_RESERVADOS, SLUG_PATRONES_RESERVADOS,
    ANCHOS, MAX_MAESTRA, MIN_ANCHO, MAX_BYTES, LIMIT_INPUT_PIXELS, FORMATOS, MIMES,
    CALIDAD_MAESTRA, CALIDAD_WEBP, ARCHIVOS_FOTO,
    REPO_PUBLICO, URL_SITIO, CARPETAS_COMPARTIDAS,
    RUTA_JSON_RE, RUTA_PORTADA_RE, RUTA_HEREDADA_RE, RUTAS_DUENAS,
};
