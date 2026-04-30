/**
 * Tests del helper resolveEntidad() del middleware de logger.
 *
 * Cubre los 3 caminos:
 *   - Resolución desde tabla maestra (UPDATE/DELETE — hay item_id).
 *   - Resolución desde body (CREATE — sin id aún).
 *   - Módulo desconocido → { tipo: null, label: null }.
 *
 * Mockea db.query para validar la SQL emitida y simular respuestas.
 */
jest.mock('../src/config/db', () => ({
    query: jest.fn(),
}));

const db = require('../src/config/db');
const { resolveEntidad } = require('../src/middleware/logger');

describe('resolveEntidad()', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('resuelve label desde tabla maestra cuando hay item_id (trabajadores)', async () => {
        db.query.mockResolvedValueOnce([[{ label: 'Juan Pérez' }]]);

        const result = await resolveEntidad('trabajadores', 42, null);

        expect(result).toEqual({ tipo: 'trabajador', label: 'Juan Pérez' });
        expect(db.query).toHaveBeenCalledTimes(1);
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain('FROM trabajadores');
        expect(sql).toContain("CONCAT(nombres, ' ', apellido_paterno)");
        expect(params).toEqual([42]);
    });

    test('resuelve label de obra usando columna nombre', async () => {
        db.query.mockResolvedValueOnce([[{ label: 'Obra Centro' }]]);

        const result = await resolveEntidad('obras', 10, null);

        expect(result).toEqual({ tipo: 'obra', label: 'Obra Centro' });
        const [sql] = db.query.mock.calls[0];
        expect(sql).toContain('FROM obras');
        expect(sql).toContain('SELECT nombre');
    });

    test('CREATE — usa body cuando no hay item_id (trabajadores)', async () => {
        const body = { nombres: 'Carlos', apellido_paterno: 'Soto', rut: '11.111.111-1' };
        const result = await resolveEntidad('trabajadores', null, body);

        expect(result).toEqual({ tipo: 'trabajador', label: 'Carlos Soto' });
        expect(db.query).not.toHaveBeenCalled();
    });

    test('CREATE — usa razon_social como label de empresa', async () => {
        const result = await resolveEntidad('empresas', null, { razon_social: 'LOLS S.A.' });
        expect(result).toEqual({ tipo: 'empresa', label: 'LOLS S.A.' });
    });

    test('CREATE — fallback a rut cuando razon_social no viene', async () => {
        const result = await resolveEntidad('empresas', null, { rut: '76.000.000-0' });
        expect(result).toEqual({ tipo: 'empresa', label: '76.000.000-0' });
    });

    test('CREATE — devuelve label null cuando body no aporta info útil', async () => {
        const result = await resolveEntidad('obras', null, { activa: true });
        expect(result).toEqual({ tipo: 'obra', label: null });
        expect(db.query).not.toHaveBeenCalled();
    });

    test('módulo desconocido → tipo + label null sin tocar DB', async () => {
        const result = await resolveEntidad('modulo-inexistente', 99, { nombre: 'X' });
        expect(result).toEqual({ tipo: null, label: null });
        expect(db.query).not.toHaveBeenCalled();
    });

    test('item_id no encontrado en tabla → label null pero tipo conservado', async () => {
        db.query.mockResolvedValueOnce([[]]);

        const result = await resolveEntidad('cargos', 999, null);
        expect(result).toEqual({ tipo: 'cargo', label: null });
    });

    test('error de DB no rompe — devuelve tipo + label null silenciosamente', async () => {
        db.query.mockRejectedValueOnce(new Error('Table doesn\'t exist'));

        const result = await resolveEntidad('cargos', 5, null);
        expect(result).toEqual({ tipo: 'cargo', label: null });
    });

    test('label del DB se trunca a 160 chars', async () => {
        const huge = 'a'.repeat(500);
        db.query.mockResolvedValueOnce([[{ label: huge }]]);

        const result = await resolveEntidad('items-inventario', 1, null);
        expect(result.label.length).toBe(160);
        expect(result.tipo).toBe('item');
    });

    test('sabados-extra arma label desde fecha del body', async () => {
        const result = await resolveEntidad('sabados-extra', null, { fecha: '2026-05-09' });
        expect(result).toEqual({ tipo: 'sabado_extra', label: 'Sábado 2026-05-09' });
    });

    test('transferencias usa el código del body en CREATE', async () => {
        const result = await resolveEntidad('transferencias', null, { codigo: 'TRF-2026-001' });
        expect(result).toEqual({ tipo: 'transferencia', label: 'TRF-2026-001' });
    });

    test('item_id="" se trata como falsy y cae a body', async () => {
        const result = await resolveEntidad('cargos', '', { nombre: 'Jefe Bodega' });
        expect(result).toEqual({ tipo: 'cargo', label: 'Jefe Bodega' });
        expect(db.query).not.toHaveBeenCalled();
    });
});
