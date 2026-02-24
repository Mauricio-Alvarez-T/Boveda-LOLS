const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const db = require('../config/db');

router.get('/', auth, checkPermission('usuarios', 'puede_ver'), async (req, res, next) => {
    try {
        const { q, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT l.*, u.nombre as usuario_nombre 
            FROM logs_actividad l
            LEFT JOIN usuarios u ON l.usuario_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (q) {
            query += ` AND (l.modulo LIKE ? OR l.detalle LIKE ? OR u.nombre LIKE ?)`;
            params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }

        query += ` ORDER BY l.created_at DESC LIMIT ? OFFSET ?`;
        params.push(Number(limit), Number(offset));

        const [rows] = await db.query(query, params);
        res.json({ data: rows });
    } catch (err) { next(err); }
});

module.exports = router;
