/**
 * Catálogo CERRADO de causales de desvinculación (plan Gestiones B4, mig 112).
 *
 * Vive en código (no en tabla) porque la lista es legal (Código del Trabajo, arts. 159/160/161)
 * y estable; el finiquito (B5) imprime `articulo_texto`. Las operativas LOLS son clasificación
 * interna y no llevan artículo. `sugiere_no_recontratar` precarga la marca en el modal;
 * `requiere_detalle` obliga a escribir el antecedente (art. 160 y OTRO).
 * 'LEGADO' identifica las bajas anteriores a la mig 112 (backfill) y NO es seleccionable.
 *
 * Reglas: docs/reglas/rrhh-trabajadores.md § Desvinculación con causal.
 */
const ART = (n, inciso) => (inciso ? `Artículo ${n}, N° ${inciso} del Código del Trabajo` : `Artículo ${n} del Código del Trabajo`);

const CAUSALES = [
    // ── Artículo 159 — causales no imputables ──
    { codigo: 'MUTUO_ACUERDO',      articulo: '159', inciso: '1', nombre: 'Mutuo acuerdo de las partes',                                     grupo: 'Artículo 159', sugiere_no_recontratar: false, requiere_detalle: false },
    { codigo: 'RENUNCIA',           articulo: '159', inciso: '2', nombre: 'Renuncia voluntaria del trabajador',                              grupo: 'Artículo 159', sugiere_no_recontratar: false, requiere_detalle: false },
    { codigo: 'MUERTE',             articulo: '159', inciso: '3', nombre: 'Muerte del trabajador',                                            grupo: 'Artículo 159', sugiere_no_recontratar: false, requiere_detalle: false },
    { codigo: 'VENCIMIENTO_PLAZO',  articulo: '159', inciso: '4', nombre: 'Vencimiento del plazo convenido en el contrato',                   grupo: 'Artículo 159', sugiere_no_recontratar: false, requiere_detalle: false },
    { codigo: 'CONCLUSION_OBRA',    articulo: '159', inciso: '5', nombre: 'Conclusión del trabajo o servicio que dio origen al contrato',     grupo: 'Artículo 159', sugiere_no_recontratar: false, requiere_detalle: false },
    { codigo: 'CASO_FORTUITO',      articulo: '159', inciso: '6', nombre: 'Caso fortuito o fuerza mayor',                                     grupo: 'Artículo 159', sugiere_no_recontratar: false, requiere_detalle: false },
    // ── Artículo 160 — imputables al trabajador (sugieren no recontratar; exigen detalle) ──
    { codigo: 'FALTA_PROBIDAD',     articulo: '160', inciso: '1', nombre: 'Falta de probidad, vías de hecho, injurias o conducta inmoral grave', grupo: 'Artículo 160', sugiere_no_recontratar: true, requiere_detalle: true },
    { codigo: 'ACOSO',              articulo: '160', inciso: '1', nombre: 'Acoso sexual o laboral',                                           grupo: 'Artículo 160', sugiere_no_recontratar: true, requiere_detalle: true },
    { codigo: 'NEGOCIACIONES_PROHIBIDAS', articulo: '160', inciso: '2', nombre: 'Negociaciones prohibidas por el contrato',                   grupo: 'Artículo 160', sugiere_no_recontratar: true, requiere_detalle: true },
    { codigo: 'INASISTENCIA',       articulo: '160', inciso: '3', nombre: 'Inasistencias injustificadas (2 días seguidos, 2 lunes en el mes o 3 días en el mes)', grupo: 'Artículo 160', sugiere_no_recontratar: true, requiere_detalle: true },
    { codigo: 'ABANDONO',           articulo: '160', inciso: '4', nombre: 'Abandono del trabajo',                                             grupo: 'Artículo 160', sugiere_no_recontratar: true, requiere_detalle: true },
    { codigo: 'ACTOS_IMPRUDENTES',  articulo: '160', inciso: '5', nombre: 'Actos, omisiones o imprudencias temerarias que afecten la seguridad', grupo: 'Artículo 160', sugiere_no_recontratar: true, requiere_detalle: true },
    { codigo: 'PERJUICIO_MATERIAL', articulo: '160', inciso: '6', nombre: 'Perjuicio material intencional en instalaciones, maquinarias o materiales', grupo: 'Artículo 160', sugiere_no_recontratar: true, requiere_detalle: true },
    { codigo: 'INCUMPLIMIENTO_GRAVE', articulo: '160', inciso: '7', nombre: 'Incumplimiento grave de las obligaciones del contrato',          grupo: 'Artículo 160', sugiere_no_recontratar: true, requiere_detalle: true },
    // ── Artículo 161 — decisión del empleador ──
    { codigo: 'NECESIDADES_EMPRESA', articulo: '161', inciso: '1', nombre: 'Necesidades de la empresa, establecimiento o servicio',           grupo: 'Artículo 161', sugiere_no_recontratar: false, requiere_detalle: false },
    { codigo: 'DESAHUCIO',          articulo: '161', inciso: '2', nombre: 'Desahucio escrito del empleador',                                  grupo: 'Artículo 161', sugiere_no_recontratar: false, requiere_detalle: false },
    // ── Operativas LOLS (clasificación interna; sin artículo) ──
    { codigo: 'TERMINO_FAENA',      articulo: null,  inciso: null, nombre: 'Término de faena / fin del período contratado',                   grupo: 'Operativas LOLS', sugiere_no_recontratar: false, requiere_detalle: false },
    { codigo: 'NO_PRESENTACION',    articulo: null,  inciso: null, nombre: 'No se presentó a trabajar después de contratado',                 grupo: 'Operativas LOLS', sugiere_no_recontratar: true,  requiere_detalle: true },
    { codigo: 'RENDIMIENTO',        articulo: null,  inciso: null, nombre: 'Bajo rendimiento / no cumple el perfil',                          grupo: 'Operativas LOLS', sugiere_no_recontratar: false, requiere_detalle: true },
    { codigo: 'OTRO',               articulo: null,  inciso: null, nombre: 'Otro motivo (detallar)',                                           grupo: 'Operativas LOLS', sugiere_no_recontratar: false, requiere_detalle: true },
    // ── Sistema ──
    { codigo: 'LEGADO',             articulo: null,  inciso: null, nombre: 'Desvinculación anterior al registro de causales',                 grupo: 'Sistema', sugiere_no_recontratar: false, requiere_detalle: false, seleccionable: false },
].map(c => ({
    ...c,
    seleccionable: c.seleccionable !== false,
    articulo_texto: c.articulo ? ART(c.articulo, c.inciso) : null,
}));

const CAUSALES_MAP = new Map(CAUSALES.map(c => [c.codigo, c]));

/** Causales que puede elegir el usuario (excluye LEGADO). */
const seleccionables = () => CAUSALES.filter(c => c.seleccionable);
const codigosSeleccionables = () => seleccionables().map(c => c.codigo);
const getCausal = codigo => CAUSALES_MAP.get(codigo) || null;
/** Nombre legible para reportes/UI; el código crudo si no existe (defensivo). */
const labelCausal = codigo => (codigo ? (getCausal(codigo)?.nombre ?? codigo) : '—');

module.exports = { CAUSALES, CAUSALES_MAP, seleccionables, codigosSeleccionables, getCausal, labelCausal };
