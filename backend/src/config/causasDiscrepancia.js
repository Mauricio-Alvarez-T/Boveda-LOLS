/**
 * Catálogo CERRADO de causas para resolver una diferencia (discrepancia) de transferencia
 * (decisión del dueño 2026-10-21, mig 129). Al RESOLVER se elige la causa y el sistema ajusta el stock
 * según ella; DESCARTAR no mueve stock.
 *
 *  - `signo`: a qué diferencias aplica. Sobrante = llegó MÁS de lo enviado; faltante = llegó MENOS.
 *  - `mueve_stock`: si al resolver con esta causa se ajusta `ubicaciones_stock` (con kardex tipo
 *    'discrepancia'). Las que mueven stock no se aceptan en transferencias de régimen legacy
 *    (`stock_reconciliado = FALSE`): ahí el ajuste es a mano.
 *  - `nombre`: texto legible; va en el motivo del kardex.
 *
 * Reglas: docs/reglas/inventario-transferencias.md § Discrepancias.
 */
const CAUSAS_DISCREPANCIA = [
    { codigo: 'origen_envio_de_mas',    signo: 'sobrante', mueve_stock: false, nombre: 'El origen envió de más' },
    { codigo: 'error_conteo_recepcion', signo: 'sobrante', mueve_stock: true,  nombre: 'Error de conteo al recibir' },
    { codigo: 'perdida_en_transito',    signo: 'faltante', mueve_stock: true,  nombre: 'Pérdida en tránsito' },
    { codigo: 'nunca_salio',            signo: 'faltante', mueve_stock: false, nombre: 'Nunca salió del origen' },
    { codigo: 'llego_despues',          signo: 'faltante', mueve_stock: true,  nombre: 'Llegó después' },
];

const CODIGOS_CAUSA = CAUSAS_DISCREPANCIA.map(c => c.codigo);

const causaPorCodigo = (codigo) => CAUSAS_DISCREPANCIA.find(c => c.codigo === codigo) || null;

module.exports = { CAUSAS_DISCREPANCIA, CODIGOS_CAUSA, causaPorCodigo };
