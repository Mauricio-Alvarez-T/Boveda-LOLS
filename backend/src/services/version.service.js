const db = require('../config/db');

/**
 * Servicio para gestionar las versiones de los roles en memoria.
 * Esto permite validar tokens JWT contra la versión actual del rol sin consultar la BD en cada petición.
 */
class VersionService {
    constructor() {
        this.versions = new Map();
        this.initialized = false;
        this.initPromise = null;
    }

    async init() {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;
        this.initPromise = (async () => {
            try {
                const [rows] = await db.query('SELECT id, version FROM roles');
                rows.forEach(r => {
                    this.versions.set(Number(r.id), Number(r.version));
                });
                this.initialized = true;
                console.log(`[VersionService] Cargadas versiones para ${this.versions.size} roles.`);
            } catch (err) {
                console.error('[VersionService] Error inicializando versiones:', err);
                this.initPromise = null; // allow retry
                throw err;
            }
        })();
        return this.initPromise;
    }

    // Sync — asume que init() ya completó antes de servir requests (ver index.js).
    // Si un rol no está en el Map, devuelve 1 como fallback compatible con el
    // comportamiento previo; increment() lo hidratará en caliente cuando ocurra.
    get(rolId) {
        return this.versions.get(Number(rolId)) || 1;
    }

    async increment(rolId) {
        const id = Number(rolId);
        const current = this.get(id);
        const next = current + 1;

        try {
            await db.query('UPDATE roles SET version = ? WHERE id = ?', [next, id]);
            this.versions.set(id, next);
            console.log(`[VersionService] Rol #${id} incrementado a versión ${next}. Sesiones previas liquidadas.`);
            return next;
        } catch (err) {
            console.error(`[VersionService] Error incrementando versión rol #${id}:`, err);
            throw err;
        }
    }
}

const versionService = new VersionService();
module.exports = versionService;
