/**
 * Schemas de validación para endpoints de escritura de Usuarios. Plan v2 F1.3.
 *
 * IMPORTANTE: usuariosService NO define allowedFields → SIN el strip de aquí,
 * el PUT /:id hace `{...req.body}` directo al UPDATE (mass-assignment). El strip
 * de `editarUsuario` ES la whitelist. `password_hash` NO va en el schema (el
 * cliente no debe poder mandarlo); el handler lo deriva de `password` tras el strip.
 */

const crearUsuario = {
    nombre: { required: true, type: 'string', maxLength: 200 },
    email: { required: true, type: 'string', format: 'email', maxLength: 255 },
    password: { required: true, type: 'string', minLength: 4, maxLength: 200 },
    rol_id: { required: true, type: 'integer', min: 1 },
    obra_id: { type: 'integer', min: 1 },                 // nullable: null pasa el strip
    email_corporativo: { type: 'string', format: 'email', maxLength: 255 },
};

const editarUsuario = {
    nombre: { type: 'string', maxLength: 200 },
    email: { type: 'string', format: 'email', maxLength: 255 },
    password: { type: 'string', minLength: 4, maxLength: 200 },  // handler → password_hash
    rol_id: { type: 'integer', min: 1 },
    obra_id: { type: 'integer', min: 1 },
    email_corporativo: { type: 'string', format: 'email', maxLength: 255 },
    activo: { type: 'boolean' },
};

const cambiarPassword = {
    currentPassword: { required: true, type: 'string' },
    newPassword: { required: true, type: 'string', minLength: 4, maxLength: 200 },
};

module.exports = { crearUsuario, editarUsuario, cambiarPassword };
