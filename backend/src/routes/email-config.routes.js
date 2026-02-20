const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../config/db');
const crypto = require('crypto');

// Encryption helpers using AES-256-CBC
const ENCRYPTION_KEY = Buffer.from(
    (process.env.EMAIL_ENC_KEY || 'LOLS_BACKUP_KEY_32_CHARS_LONG123').padEnd(32, '0').substring(0, 32),
    'utf8'
);

function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedData) {
    if (!encryptedData) return null;
    try {
        const [ivHex, encrypted] = encryptedData.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return null;
    }
}

// ----------------------------------------------------------------
// GET /me/email-config 
// Returns email_corporativo and whether a password is saved (not the password itself)
// ----------------------------------------------------------------
router.get('/me/email-config', auth, async (req, res, next) => {
    try {
        const [rows] = await db.query(
            'SELECT email_corporativo, email_password_enc FROM usuarios WHERE id = ?',
            [req.user.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

        const user = rows[0];
        res.json({
            email_corporativo: user.email_corporativo,
            tiene_password: !!user.email_password_enc
        });
    } catch (err) { next(err); }
});

// ----------------------------------------------------------------
// PUT /me/email-config
// Saves email_corporativo and optionally updates encrypted password
// ----------------------------------------------------------------
router.put('/me/email-config', auth, async (req, res, next) => {
    try {
        const { email_corporativo, email_password } = req.body;

        if (!email_corporativo) {
            return res.status(400).json({ error: 'email_corporativo es requerido' });
        }

        const updates = { email_corporativo };

        if (email_password) {
            updates.email_password_enc = encrypt(email_password);
        }

        const fields = Object.keys(updates).map(f => `${f} = ?`).join(', ');
        const values = [...Object.values(updates), req.user.id];

        await db.query(`UPDATE usuarios SET ${fields} WHERE id = ?`, values);

        res.json({ message: 'Credenciales guardadas correctamente', email_corporativo });
    } catch (err) { next(err); }
});

// ----------------------------------------------------------------
// GET /me/plantillas
// Returns all templates for the logged-in user
// ----------------------------------------------------------------
router.get('/me/plantillas', auth, async (req, res, next) => {
    try {
        const [rows] = await db.query(
            'SELECT id, nombre, asunto, cuerpo, es_predeterminada FROM plantillas_correo WHERE usuario_id = ? AND activa = TRUE ORDER BY es_predeterminada DESC, created_at ASC',
            [req.user.id]
        );
        res.json({ data: rows });
    } catch (err) { next(err); }
});

// ----------------------------------------------------------------
// POST /me/plantillas
// Create a new template for the user
// ----------------------------------------------------------------
router.post('/me/plantillas', auth, async (req, res, next) => {
    try {
        const { nombre, asunto, cuerpo } = req.body;
        if (!nombre || !asunto || !cuerpo) {
            return res.status(400).json({ error: 'nombre, asunto y cuerpo son requeridos' });
        }

        const [result] = await db.query(
            'INSERT INTO plantillas_correo (usuario_id, nombre, asunto, cuerpo) VALUES (?, ?, ?, ?)',
            [req.user.id, nombre, asunto, cuerpo]
        );
        res.status(201).json({ id: result.insertId, nombre, asunto, cuerpo, es_predeterminada: false });
    } catch (err) { next(err); }
});

// ----------------------------------------------------------------
// PUT /me/plantillas/:id
// Update an existing template
// ----------------------------------------------------------------
router.put('/me/plantillas/:id', auth, async (req, res, next) => {
    try {
        const { nombre, asunto, cuerpo } = req.body;

        // Verify ownership
        const [rows] = await db.query('SELECT id FROM plantillas_correo WHERE id = ? AND usuario_id = ?', [req.params.id, req.user.id]);
        if (!rows.length) return res.status(404).json({ error: 'Plantilla no encontrada' });

        await db.query(
            'UPDATE plantillas_correo SET nombre = ?, asunto = ?, cuerpo = ? WHERE id = ?',
            [nombre, asunto, cuerpo, req.params.id]
        );

        res.json({ message: 'Plantilla actualizada' });
    } catch (err) { next(err); }
});

// ----------------------------------------------------------------
// DELETE /me/plantillas/:id
// Soft-delete a template
// ----------------------------------------------------------------
router.delete('/me/plantillas/:id', auth, async (req, res, next) => {
    try {
        const [rows] = await db.query('SELECT id FROM plantillas_correo WHERE id = ? AND usuario_id = ?', [req.params.id, req.user.id]);
        if (!rows.length) return res.status(404).json({ error: 'Plantilla no encontrada' });

        await db.query('UPDATE plantillas_correo SET activa = FALSE WHERE id = ?', [req.params.id]);
        res.json({ message: 'Plantilla eliminada' });
    } catch (err) { next(err); }
});

// ----------------------------------------------------------------
// PUT /me/plantillas/:id/predeterminar
// Set a template as the default
// ----------------------------------------------------------------
router.put('/me/plantillas/:id/predeterminar', auth, async (req, res, next) => {
    try {
        const [rows] = await db.query('SELECT id FROM plantillas_correo WHERE id = ? AND usuario_id = ?', [req.params.id, req.user.id]);
        if (!rows.length) return res.status(404).json({ error: 'Plantilla no encontrada' });

        await db.query('UPDATE plantillas_correo SET es_predeterminada = FALSE WHERE usuario_id = ?', [req.user.id]);
        await db.query('UPDATE plantillas_correo SET es_predeterminada = TRUE WHERE id = ?', [req.params.id]);

        res.json({ message: 'Plantilla predeterminada actualizada' });
    } catch (err) { next(err); }
});

// ----------------------------------------------------------------
// Export helper for fiscalizacion.routes.js to use saved credentials
// ----------------------------------------------------------------
router.getDecryptedPassword = async (userId) => {
    const [rows] = await db.query('SELECT email_corporativo, email_password_enc FROM usuarios WHERE id = ?', [userId]);
    if (!rows.length || !rows[0].email_password_enc) return null;
    return {
        email: rows[0].email_corporativo,
        password: decrypt(rows[0].email_password_enc)
    };
};

module.exports = router;
