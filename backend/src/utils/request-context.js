const { AsyncLocalStorage } = require('async_hooks');

/**
 * Contexto por-request propagado vía AsyncLocalStorage.
 * Permite que cualquier log emitido durante un request incluya su reqId
 * sin tener que pasar `req` por todas las capas (rutas → servicios → utils).
 *
 * Lo establece el middleware `requestContext` (ver logger-structured.js).
 */
const als = new AsyncLocalStorage();

module.exports = {
    als,
    run: (store, fn) => als.run(store, fn),
    get: () => als.getStore(),
    getRequestId: () => als.getStore()?.reqId,
};
