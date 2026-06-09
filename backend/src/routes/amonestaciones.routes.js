const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const amonestacionService = require('../services/amonestacion.service');

const hoy = () => new Date().toISOString().split('T')[0];

// POST /api/amonestaciones/generar
// Body: { trabajador_id, fecha?, texto }  →  { carta }
// 'texto' es la frase corta dictada/escrita por el jefe de obra.
router.post('/generar', auth, checkPermission('asistencia.amonestacion.generar'), async (req, res, next) => {
    try {
        const { trabajador_id, fecha, texto } = req.body;
        if (!trabajador_id || !texto || !String(texto).trim()) {
            return res.status(400).json({ error: 'Indica el trabajador y describe brevemente el motivo.' });
        }
        const trabajador = await amonestacionService.getTrabajador(trabajador_id);
        if (!trabajador) return res.status(404).json({ error: 'Trabajador no encontrado' });

        const carta = await amonestacionService.generarTexto({
            trabajador,
            fecha: fecha || hoy(),
            textoLibre: String(texto).trim()
        });
        res.json({ carta });
    } catch (err) { next(err); }
});

// POST /api/amonestaciones/pdf
// Body: { trabajador_id, fecha?, carta }  →  PDF (attachment)
// 'carta' es el texto final (posiblemente editado por el jefe).
router.post('/pdf', auth, checkPermission('asistencia.amonestacion.generar'), async (req, res, next) => {
    try {
        const { trabajador_id, fecha, carta } = req.body;
        if (!trabajador_id || !carta || !String(carta).trim()) {
            return res.status(400).json({ error: 'Falta el contenido de la carta.' });
        }
        const trabajador = await amonestacionService.getTrabajador(trabajador_id);
        if (!trabajador) return res.status(404).json({ error: 'Trabajador no encontrado' });

        const buffer = await amonestacionService.generarPdf({
            cartaTexto: String(carta),
            trabajador,
            fecha: fecha || hoy()
        });

        const safe = (s) => String(s || '')
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        const fechaSafe = String(fecha || hoy()).replace(/[^0-9-]/g, '') || 'fecha';
        const filename = `Amonestacion_${safe(trabajador.apellido_paterno)}_${safe(trabajador.nombres)}_${fechaSafe}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.send(buffer);
    } catch (err) { next(err); }
});

module.exports = router;
