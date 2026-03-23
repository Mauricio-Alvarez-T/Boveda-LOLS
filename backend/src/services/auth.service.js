const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const versionService = require('./version.service');

const authService = {
    async login(email, password) {
        const [users] = await db.query(
            `SELECT u.*, r.nombre as rol_nombre 
       FROM usuarios u 
       JOIN roles r ON u.rol_id = r.id 
       WHERE u.email = ? AND u.activo = TRUE`,
            [email]
        );

        if (users.length === 0) {
            throw Object.assign(new Error('Credenciales inválidas'), { statusCode: 401 });
        }

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            throw Object.assign(new Error('Credenciales inválidas'), { statusCode: 401 });
        }

        // Get effective permissions (Role + User overrides)
        const permisosService = require('./permisos.service');
        const permisosEfectivos = await permisosService.getPermisosEfectivos(user.id, user.rol_id);

        const rolVersion = versionService.get(user.rol_id);

        const token = jwt.sign(
            { 
                id: user.id, 
                email: user.email, 
                rol_id: user.rol_id, 
                obra_id: user.obra_id, 
                p: permisosEfectivos, // Permissions as array of strings
                rv: rolVersion 
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        return {
            token,
            user: {
                id: user.id,
                nombre: user.nombre,
                email: user.email,
                email_corporativo: user.email_corporativo,
                rol: user.rol_nombre,
                rol_id: user.rol_id,
                obra_id: user.obra_id,
                permisos: permisosEfectivos
            }
        };
    },

    async getMe(userId) {
        const [users] = await db.query(
            `SELECT u.id, u.nombre, u.email, u.email_corporativo, u.rol_id, u.obra_id, r.nombre as rol_nombre
       FROM usuarios u JOIN roles r ON u.rol_id = r.id 
       WHERE u.id = ? AND u.activo = TRUE`,
            [userId]
        );

        if (users.length === 0) {
            throw Object.assign(new Error('Usuario no encontrado'), { statusCode: 404 });
        }

        const permisosService = require('./permisos.service');
        const permisos = await permisosService.getPermisosEfectivos(users[0].id, users[0].rol_id);

        return { ...users[0], permisos };
    },

    async createInitialAdmin(nombre, email, password) {
        const hash = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO usuarios (nombre, email, password_hash, rol_id) VALUES (?, ?, ?, 1)',
            [nombre, email, hash]
        );
        return result.insertId;
    },

    async changeMyPassword(userId, currentPassword, newPassword) {
        const [users] = await db.query('SELECT password_hash FROM usuarios WHERE id = ?', [userId]);
        if (users.length === 0) throw Object.assign(new Error('Usuario no encontrado'), { statusCode: 404 });

        const validPassword = await bcrypt.compare(currentPassword, users[0].password_hash);
        if (!validPassword) throw Object.assign(new Error('La contraseña actual es incorrecta'), { statusCode: 400 });

        const hash = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [hash, userId]);
    }
};

module.exports = authService;
