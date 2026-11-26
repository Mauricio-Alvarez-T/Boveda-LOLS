/**
 * Plantillas de documentos laborales (plan Gestiones B2/B5). Mapa BLANCO `codigo → plantilla`;
 * el código debe coincidir con `tipos_documento.codigo` (mig 110).
 *
 * Contrato de cada plantilla:
 *   codigo, version ('1.0'), titulo,
 *   requiere(ctx)  → string[] de datos faltantes (vacío = se puede emitir; si no → 400/409 en el service),
 *   nombreBase(ctx)→ base del nombre de archivo (sin extensión ni timestamp),
 *   build(ctx)     → HTML interno (el service lo envuelve con docGenerador.wrapHtml),
 *   metadata(ctx)  → snapshot de los datos usados (se guarda en documentos.metadata; NUNCA sale
 *                    por rutas con documentos.ver: puede traer remuneración).
 *
 * `ctx` lo arma documentosLaborales.service: { hoy, empresa, trabajador, remuneracion, datos, solicitud }.
 * Los textos legales son DATO reemplazable (RRHH los ajusta sin tocar lógica).
 */
const contrato = require('./contrato.plantilla');
const odi = require('./odiD40.plantilla');
const das = require('./das.plantilla');
const pts = require('./ptsAltura.plantilla');
const epp = require('./eppRecepcion.plantilla');
const ri = require('./riRecepcion.plantilla');
const amonestacion = require('./amonestacion.plantilla');
const solicitud = require('./solicitudIngreso.plantilla');
const finiquito = require('./finiquito.plantilla');
const cartaAviso = require('./cartaAviso.plantilla');

const PLANTILLAS = Object.freeze({
    [contrato.codigo]: contrato,
    [odi.codigo]: odi,
    [das.codigo]: das,
    [pts.codigo]: pts,
    [epp.codigo]: epp,
    [ri.codigo]: ri,
    [amonestacion.codigo]: amonestacion,
    [solicitud.codigo]: solicitud,
    [finiquito.codigo]: finiquito,
    [cartaAviso.codigo]: cartaAviso,
});

/** Kit de ingreso: los 6 documentos que se emiten juntos al contratar (orden de impresión). */
const KIT_INGRESO = Object.freeze(['CONTRATO', 'ODI_D40', 'DAS', 'PTS_ALTURA', 'EPP_RECEPCION', 'RI_RECEPCION']);

/**
 * Códigos que puede pedir el cliente por POST /emitir (la solicitud se emite sola al aprobar).
 * FINIQUITO (B5) y CARTA_AVISO (mig 160) exigen trabajador DESVINCULADO; el service ramifica ese guard.
 */
const EMITIBLES = Object.freeze([...KIT_INGRESO, 'AMONESTACION', 'FINIQUITO', 'CARTA_AVISO']);

/** Documentos que salen de la baja vigente (no de un trabajador activo). */
const DE_LA_BAJA = Object.freeze(['FINIQUITO', 'CARTA_AVISO']);

/** Permiso propio de las cartas de aviso: emitir, descargar e imprimir (mig 160; Marcos 2026-11-26: «que solo Matías pueda imprimir»). */
const PERMISO_CARTAS_AVISO = 'documentos.cartas_aviso';

function getPlantilla(codigo) {
    return PLANTILLAS[codigo] || null;
}

module.exports = { PLANTILLAS, KIT_INGRESO, EMITIBLES, DE_LA_BAJA, PERMISO_CARTAS_AVISO, getPlantilla };
