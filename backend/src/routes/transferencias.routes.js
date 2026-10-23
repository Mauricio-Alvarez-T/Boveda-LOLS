const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const validateBody = require('../middleware/validateBody');
const transferenciaService = require('../services/transferencia.service');
const uploadTransferencias = require('../middleware/upload-transferencias');
const { logManualActivity } = require('../middleware/logger');
const {
    crearTransferencia, aprobar, recibir, resolverDiscrepancia,
    pushDirecto, intraBodega, devolucion, intraObra,
} = require('../schemas/transferencias.schema');

// F1.3 plan v2: schemas movidos a src/schemas/transferencias.schema.js.
// crear/aprobar validan sin strip (el service destructura explícito y el
// payload de aprobar es variable: legacy vs multi-origen). recibir y
// resolverDiscrepancia sí usan strip (campos acotados y verificados).

// ?simular de /discrepancias/:id/resolver y /rehacer (revisión 2026-10-21), estricto: '1' | 'true' simula;
// ausente | '0' | 'false' ejecuta; cualquier otro valor (incluido vacío o repetido) → null = 400.
function leerSimular(valor) {
    if (valor === undefined) return false;
    if (valor === '1' || valor === 'true') return true;
    if (valor === '0' || valor === 'false') return false;
    return null;
}
const ERROR_SIMULAR = 'El parámetro simular debe ser 1, true, 0 o false';

// Log de actividad de una diferencia aprobada/rechazada/rehecha DE VERDAD (las simulaciones no escriben nada y no se
// loguean). El activityLogger global excluye estas dos rutas (sin id real ni datos útiles quedaban como CREATE/UPDATE
// genérico); acá va con la TRF como entidad, el ítem y los ajustes. logManualActivity nunca lanza.
async function logDiferencia(req, accion, r) {
    if (!r) return;
    const codigo = r.transferencia_codigo || (r.transferencia_id != null ? `TRF #${r.transferencia_id}` : 'TRF');
    const item = (r.item && (r.item.descripcion || (r.item.id != null ? `ítem ${r.item.id}` : null))) || 'ítem';
    // Aprobar una de la regla anterior la cierra sin mover stock (cerrada_regla_anterior): el log lo dice.
    const cerradaAnterior = accion !== 'rehacer' && r.cerrada_regla_anterior === true;
    const resumen = accion === 'rehacer'
        ? `Diferencia #${r.id} rehecha con la regla nueva (${codigo} · ${item}): vuelve a pendiente`
        : `Diferencia #${r.id} ${r.estado === 'resuelta' ? 'aprobada' : 'rechazada'} (${codigo} · ${item})`
            + (cerradaAnterior ? ': regla anterior, se cierra sin mover stock' : '');
    await logManualActivity(
        req.user.id, 'transferencias', 'UPDATE', r.transferencia_id != null ? String(r.transferencia_id) : null,
        JSON.stringify({
            resumen,
            accion: accion === 'rehacer' ? 'diferencia_rehecha' : `diferencia_${r.estado}`,
            discrepancia_id: r.id,
            transferencia_id: r.transferencia_id ?? null,
            transferencia_codigo: r.transferencia_codigo ?? null,
            item: r.item ?? null,
            ...(accion === 'rehacer' ? { regimen: r.regimen ?? null, estado_anterior: r.estado_anterior ?? null } : { estado: r.estado }),
            ...(cerradaAnterior ? { cerrada_regla_anterior: true } : {}),
            ajustes: Array.isArray(r.ajustes) ? r.ajustes : [],
            aviso: r.aviso ?? null,
        }),
        req,
        { entidad_tipo: 'transferencia', entidad_label: r.transferencia_codigo ?? null }
    );
}

// GET /api/transferencias
// Si NO tiene `inventario.transferencias.ver_todas` → backend scopea por
// solicitante_id = user.id (sólo ve sus propias) + las DESTINADAS a su bodega
// si tiene una asignada (usuarios.bodega_id, rol bodeguero — mig 097).
// Permiso default deny; admin lo concede a roles que necesiten visión global.
router.get('/', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const verTodas = Array.isArray(req.user?.p) && req.user.p.includes('inventario.transferencias.ver_todas');
        const solicitanteId = verTodas ? null : req.user.id;
        const destinoBodegaId = verTodas ? null : (req.user.bodega_id ?? null);
        const result = await transferenciaService.getAll(req.query, solicitanteId, destinoBodegaId);
        res.json(result);
    } catch (err) { next(err); }
});

// GET /api/transferencias/pendientes — lista para aprobadores
router.get('/pendientes', auth, checkPermission('inventario.transferencias.aprobar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.getPendientes();
        res.json(result);
    } catch (err) { next(err); }
});

// GET /api/transferencias/inicio/perfil — detalle «Inventario» del Inicio por perfil (Leonardo, jefatura, obra): circuito,
// solicitudes con sus ítems, diferencias (solo `aprobar` o `diferencias_ver`) y SoD, en una respuesta y con el alcance
// de GET /:id (transferenciaService.inicioPerfil). Va ANTES de /:id.
router.get('/inicio/perfil', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const result = await transferenciaService.inicioPerfil(req.user);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// GET /api/transferencias/inicio — conteos de la tarjeta «Inventario» del Inicio, según el perfil
// (transferenciaService.resumenInicio). Va ANTES de /:id para que Express no lo tome como un ID.
router.get('/inicio', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const result = await transferenciaService.resumenInicio(req.user);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// GET /api/transferencias/mis-solicitudes
router.get('/mis-solicitudes', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const result = await transferenciaService.getMisSolicitudes(req.user.id, req.query);
        res.json(result);
    } catch (err) { next(err); }
});

// GET /api/transferencias/solicitantes — lista de solicitantes para el filtro del
// panel. Va ANTES de /:id para que Express no interprete 'solicitantes' como un ID.
router.get('/solicitantes', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const result = await transferenciaService.getSolicitantes();
        res.json({ data: result });
    } catch (err) { next(err); }
});

// GET /api/transferencias/discrepancias?estado=pendiente|resuelta|descartada
// (debe ir ANTES de /:id para que Express no interprete 'discrepancias' como un ID)
// VER es OR (mig 131): quien aprueba o quien solo mira las diferencias (`diferencias_ver`). Resolver, rehacer y la
// foto de abajo siguen pidiendo `aprobar`.
router.get('/discrepancias', auth, checkPermission('inventario.transferencias.aprobar', 'inventario.transferencias.diferencias_ver'), async (req, res, next) => {
    try {
        const result = await transferenciaService.getDiscrepancias(req.query);
        res.json(result);
    } catch (err) { next(err); }
});

// PUT /api/transferencias/discrepancias/:id/resolver[?simular=1]  body: { estado, resolucion? }
// Regla del dueño 2026-10-21: 'resuelta' = APROBAR lo que declaró el receptor (sobrante: destino +dif /
// origen −dif; faltante: destino −f / origen + lo que de verdad salió de más); 'descartada' = RECHAZARLO (no
// mueve stock: queda lo enviado). resolucion opcional (vacía → texto generado). Responde { id, estado,
// resolucion, ajustes (con antes/despues), aviso, transferencia_id, transferencia_codigo, item, simulado } y
// `cerrada_regla_anterior: true` si aprobó una de la regla anterior (se cierra sin mover stock).
// ?simular=1 corre lo mismo sin escribir y responde 200 con `bloqueo` ({ code, message }) donde lo real daría
// 409 (salvo REINTENTAR, que es pasajero y sale como 409). Solo lo REAL va al log de actividad (logDiferencia).
// Una `causa` (modelo anterior) la descarta el strip.
router.put('/discrepancias/:id/resolver', auth, checkPermission('inventario.transferencias.aprobar'), validateBody(resolverDiscrepancia, { strip: true }), async (req, res, next) => {
    try {
        const simular = leerSimular(req.query.simular);
        if (simular === null) return res.status(400).json({ error: ERROR_SIMULAR });
        const { estado, resolucion } = req.body;
        const result = await transferenciaService.resolverDiscrepancia(
            req.params.id, req.user.id, estado, resolucion, { simular }
        );
        if (!simular) await logDiferencia(req, 'resolver', result);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/discrepancias/:id/rehacer?simular=1 — rehace con la regla nueva una diferencia de
// la regla ANTERIOR (diferencia_aplicada = 1, mig 130): deja el stock como si hubiera llegado lo enviado y la
// reabre como pendiente. simular=1 devuelve el plan sin escribir. Solo Super Administrador (rol_id 1),
// además del permiso de aprobar. Va junto a las rutas /discrepancias (antes de /:id). Solo lo REAL va al log.
router.post('/discrepancias/:id/rehacer', auth, checkPermission('inventario.transferencias.aprobar'), async (req, res, next) => {
    try {
        if (Number(req.user?.rol_id) !== 1) {
            return res.status(403).json({ error: 'Solo el Super Administrador puede rehacer una diferencia de la regla anterior' });
        }
        const simular = leerSimular(req.query.simular);
        if (simular === null) return res.status(400).json({ error: ERROR_SIMULAR });
        const result = await transferenciaService.rehacerDiscrepancia(req.params.id, req.user.id, { simular });
        if (!simular) await logDiferencia(req, 'rehacer', result);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/discrepancias/:id/foto — adjuntar foto OPCIONAL a una
// discrepancia. Va junto a las otras rutas /discrepancias (antes de /:id) para que
// Express no interprete 'discrepancias' como un ID.
router.post('/discrepancias/:id/foto', auth, checkPermission('inventario.transferencias.aprobar'), uploadTransferencias.single('foto'), async (req, res, next) => {
    try {
        if (!req.file) { const e = new Error('No se recibió ninguna imagen'); e.statusCode = 400; throw e; }
        const fotoUrl = `/api/uploads/transferencias/${req.file.filename}`;
        const result = await transferenciaService.setFotoDiscrepancia(req.params.id, fotoUrl);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// DELETE /api/transferencias/discrepancias/:id — borrado PERMANENTE de una
// diferencia (la saca del historial). Va junto a las rutas /discrepancias
// (antes de /:id). Gateado por el permiso de eliminar.
router.delete('/discrepancias/:id', auth, checkPermission('inventario.transferencias.eliminar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.eliminarDiscrepancia(req.params.id, req.user.id);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// GET /api/transferencias/:id
// Defensa en profundidad: si NO tiene `inventario.transferencias.ver_todas`,
// sólo puede ver el detalle de transferencias que él mismo creó o que están
// DESTINADAS a su bodega (usuarios.bodega_id, rol bodeguero). Evita que un
// usuario adivine IDs y abra solicitudes de terceros.
router.get('/:id', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const result = await transferenciaService.getById(req.params.id);
        if (!result) return res.status(404).json({ error: 'Transferencia no encontrada' });

        const verTodas = Array.isArray(req.user?.p) && req.user.p.includes('inventario.transferencias.ver_todas');
        const esDestinoMiBodega = req.user.bodega_id != null && result.destino_bodega_id === req.user.bodega_id;
        if (!verTodas && result.solicitante_id !== req.user.id && !esDestinoMiBodega) {
            return res.status(403).json({ error: 'No tienes permiso para ver esta transferencia' });
        }
        res.json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias — solicitud normal (flujo con aprobación)
router.post('/', auth, checkPermission('inventario.transferencias.solicitar'), validateBody(crearTransferencia), async (req, res, next) => {
    try {
        const result = await transferenciaService.crear(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/solicitud-materiales — obra pide materiales de construcción.
// Misma lógica que solicitud estándar (flujo con aprobación, SoD aplica) pero con
// permiso independiente para gating granular por rol.
router.post('/solicitud-materiales', auth, checkPermission('inventario.transferencias.solicitud_materiales'), validateBody(crearTransferencia), async (req, res, next) => {
    try {
        req.body.tipo_flujo = 'solicitud_materiales';
        const result = await transferenciaService.crear(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/push-directo — bodega → obra sin aprobación.
// Por diseño consolida solicitante + aprobador + transportista en 1 user; SoD no aplica.
router.post('/push-directo', auth, checkPermission('inventario.transferencias.push_directo'), validateBody(pushDirecto), async (req, res, next) => {
    try {
        const result = await transferenciaService.pushDirecto(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/intra-bodega — bodega → bodega CON aprobación.
// Nace 'pendiente'; sigue el flujo normal (aprobar → despachar → recibir).
// El stock se mueve recién en la recepción (decisión jefatura mayo 2026).
router.post('/intra-bodega', auth, checkPermission('inventario.transferencias.intra_bodega'), validateBody(intraBodega), async (req, res, next) => {
    try {
        const result = await transferenciaService.intraBodega(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/devolucion — obra → bodega, con aprobación
router.post('/devolucion', auth, checkPermission('inventario.transferencias.devolucion'), validateBody(devolucion), async (req, res, next) => {
    try {
        const result = await transferenciaService.devolucion(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/intra-obra — obra → obra, con aprobación
router.post('/intra-obra', auth, checkPermission('inventario.transferencias.intra_obra'), validateBody(intraObra), async (req, res, next) => {
    try {
        const result = await transferenciaService.intraObra(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/orden-gerencia — orden ejecutiva PM/dueño, bypasa aprobación.
// Por diseño consolida solicitante + aprobador + transportista; SoD no aplica.
router.post('/orden-gerencia', auth, checkPermission('inventario.transferencias.orden_gerencia'), async (req, res, next) => {
    try {
        const result = await transferenciaService.ordenGerencia(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/aprobar — SoD: el aprobador no puede ser el solicitante
router.put('/:id/aprobar', auth, checkPermission('inventario.transferencias.aprobar'), validateBody(aprobar), async (req, res, next) => {
    try {
        const result = await transferenciaService.aprobar(req.params.id, req.user.id, req.body, req.user.p);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/despachar — SoD: el transportista no puede ser el aprobador
router.put('/:id/despachar', auth, checkPermission('inventario.transferencias.despachar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.despachar(req.params.id, req.user.id, req.user.p);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/recibir — SoD: el receptor no puede ser el transportista
// Body acepta `tipo: 'parcial' | 'total'` (default 'total' por back-compat).
// En modo parcial: deja la TRF en estado 'recepcion_parcial' para múltiples viajes.
// En modo total: cierra la TRF (estado 'recibida') y genera discrepancias por gaps.
router.put('/:id/recibir', auth, checkPermission('inventario.transferencias.recibir'), validateBody(recibir, { strip: true }), async (req, res, next) => {
    try {
        const tipo = req.body.tipo === 'parcial' ? 'parcial' : 'total';
        const result = await transferenciaService.recibir(req.params.id, req.user.id, req.body.items, req.user.p, tipo, req.body.observacion, req.body.items_custom, req.user.bodega_id ?? null);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// GET /api/transferencias/:id/recepciones — historial de eventos de recepción
// Mismo scoping que GET /:id (defensa en profundidad): sin `ver_todas` solo se ve
// el historial de TRFs propias o destinadas a la bodega del usuario. Antes NO
// scopeaba → un usuario con `inventario.ver` (ej. bodeguero) podía iterar IDs y
// leer recepciones de todo el sistema.
router.get('/:id/recepciones', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const trf = await transferenciaService.getById(req.params.id);
        if (!trf) return res.status(404).json({ error: 'Transferencia no encontrada' });
        const verTodas = Array.isArray(req.user?.p) && req.user.p.includes('inventario.transferencias.ver_todas');
        const esDestinoMiBodega = req.user.bodega_id != null && trf.destino_bodega_id === req.user.bodega_id;
        if (!verTodas && trf.solicitante_id !== req.user.id && !esDestinoMiBodega) {
            return res.status(403).json({ error: 'No tienes permiso para ver esta transferencia' });
        }
        const result = await transferenciaService.getRecepciones(req.params.id);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/:id/recepciones/:recepcionId/foto — adjuntar foto
// OPCIONAL a una recepción ya registrada (POST-then-attach). La foto nunca bloquea
// el flujo de recepción; este endpoint es un paso aparte y opcional.
router.post('/:id/recepciones/:recepcionId/foto', auth, checkPermission('inventario.transferencias.recibir'), uploadTransferencias.single('foto'), async (req, res, next) => {
    try {
        if (!req.file) { const e = new Error('No se recibió ninguna imagen'); e.statusCode = 400; throw e; }
        const fotoUrl = `/api/uploads/transferencias/${req.file.filename}`;
        // Mismo enforcement de bodega que recibir(): un bodeguero solo adjunta fotos
        // a recepciones de TRFs destinadas a SU bodega (evita manipular evidencia ajena).
        const result = await transferenciaService.setFotoRecepcion(req.params.id, req.params.recepcionId, fotoUrl, req.user.bodega_id ?? null);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/rechazar — rechazo del aprobador (desde pendiente|aprobada)
router.put('/:id/rechazar', auth, checkPermission('inventario.transferencias.aprobar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.rechazar(req.params.id, req.user.id, req.body.motivo);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/rechazar-recepcion — rechazo físico del receptor (desde en_transito)
// Permiso del receptor (no del aprobador) — bodeguero/jefe obra destino.
router.put('/:id/rechazar-recepcion', auth, checkPermission('inventario.transferencias.recibir'), async (req, res, next) => {
    try {
        const result = await transferenciaService.rechazar(req.params.id, req.user.id, req.body.motivo, req.user.bodega_id ?? null);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/:id/crear-faltante
// Crea una nueva solicitud de transferencia por las cantidades faltantes (solicitadas - enviadas)
// de una transferencia aprobada parcialmente.
router.post('/:id/crear-faltante', auth, checkPermission('inventario.transferencias.solicitar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.crearFaltante(req.params.id, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/cancelar
router.put('/:id/cancelar', auth, checkPermission('inventario.transferencias.cancelar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.cancelar(req.params.id, req.user.id, req.user.p);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// DELETE /api/transferencias/:id — borrado PERMANENTE (hard delete) de la
// transferencia y, por CASCADE, sus items/discrepancias/recepciones. NO toca
// stock (decisión: purgar datos de prueba). Gateado por el permiso de eliminar.
router.delete('/:id', auth, checkPermission('inventario.transferencias.eliminar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.eliminar(req.params.id, req.user.id);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/prorrogar — extiende 10 días una solicitud pendiente estancada.
// Requiere permiso de aprobar (quien gestiona el flujo decide extender el plazo).
router.put('/:id/prorrogar', auth, checkPermission('inventario.transferencias.aprobar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.prorrogar(req.params.id, req.user.id);
        res.json({ data: result });
    } catch (err) { next(err); }
});

module.exports = router;
