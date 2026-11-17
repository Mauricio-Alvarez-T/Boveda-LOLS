/**
 * Períodos laborales (reingreso, mig 152): módulo puro utils/periodosLaborales + la migración.
 * Un trabajador que volvió tiene períodos cerrados [fecha_ingreso_periodo, fecha_desvinculacion]
 * más el actual [fecha_ingreso, fecha_desvinculacion | abierto]. La asistencia vale dentro de
 * cualquiera; el hueco entre una baja y el reingreso queda fuera.
 */
const fs = require('fs');
const path = require('path');
const { periodosDe, motivoFuera, dentroDeAlgunPeriodo, parseCerrados, sumarUnDia, mensajeFuera, sqlCerrados } = require('../src/utils/periodosLaborales');

describe('periodosDe + motivoFuera', () => {
    test('sin períodos cerrados = comportamiento de siempre (antes del contrato / después del finiquito)', () => {
        const p = periodosDe({ fecha_ingreso: '2026-03-01', fecha_desvinculacion: '2026-06-30' });
        expect(p).toEqual([{ desde: '2026-03-01', hasta: '2026-06-30' }]);
        expect(motivoFuera('2026-02-28', p)).toBe('pre_contrato');
        expect(motivoFuera('2026-03-01', p)).toBeNull();
        expect(motivoFuera('2026-06-30', p)).toBeNull(); // el día de la baja vale
        expect(motivoFuera('2026-07-01', p)).toBe('finiquitado');
    });

    test('reingresado: el hueco entre períodos queda fuera; ambos períodos valen', () => {
        const p = periodosDe({ fecha_ingreso: '2026-09-01', fecha_desvinculacion: null }, parseCerrados('2026-01-15|2026-06-30'));
        expect(p).toEqual([{ desde: '2026-01-15', hasta: '2026-06-30' }, { desde: '2026-09-01', hasta: null }]);
        expect(motivoFuera('2026-01-14', p)).toBe('pre_contrato');
        expect(motivoFuera('2026-03-10', p)).toBeNull();          // corregir el período 1 sigue permitido
        expect(motivoFuera('2026-07-15', p)).toBe('entre_periodos');
        expect(motivoFuera('2026-08-31', p)).toBe('entre_periodos');
        expect(motivoFuera('2026-09-01', p)).toBeNull();
        expect(motivoFuera('2027-12-31', p)).toBeNull();          // período actual abierto
        expect(dentroDeAlgunPeriodo('2026-07-15', p)).toBe(false);
    });

    test('reactivado con el flujo viejo (ingreso sin mover): períodos solapados → igual que antes, sin regresión', () => {
        const p = periodosDe({ fecha_ingreso: '2026-01-15', fecha_desvinculacion: null }, [{ fecha_ingreso_periodo: '2026-01-15', fecha_desvinculacion: '2026-06-30' }]);
        expect(motivoFuera('2026-07-15', p)).toBeNull();
        expect(motivoFuera('2026-01-14', p)).toBe('pre_contrato');
    });

    test('sin fecha de ingreso ni períodos → nada bloquea (fichas viejas sin dato)', () => {
        expect(motivoFuera('2026-01-01', periodosDe({}))).toBeNull();
        expect(motivoFuera('2026-01-01', [])).toBeNull();
    });

    test('parseCerrados tolera null, vacío e ingreso desconocido', () => {
        expect(parseCerrados(null)).toEqual([]);
        expect(parseCerrados('')).toEqual([]);
        expect(parseCerrados('|2026-06-30,2026-08-01|2026-09-15')).toEqual([
            { desde: null, hasta: '2026-06-30' }, { desde: '2026-08-01', hasta: '2026-09-15' },
        ]);
    });

    test('sumarUnDia cruza mes y año; mensajes por motivo', () => {
        expect(sumarUnDia('2026-06-30')).toBe('2026-07-01');
        expect(sumarUnDia('2026-12-31')).toBe('2027-01-01');
        expect(mensajeFuera('entre_periodos', '2026-07-15', 7)).toMatch(/entre dos períodos laborales del trabajador ID 7/);
        expect(mensajeFuera('pre_contrato', '2026-01-01', 7)).toMatch(/antes de la fecha de contratación/);
        expect(mensajeFuera('finiquitado', '2026-01-01', 7)).toMatch(/después de la fecha de finiquito/);
    });

    test('sqlCerrados usa el alias pedido y solo filas cerradas por un reingreso', () => {
        const s = sqlCerrados('trabajadores');
        expect(s).toContain('dp.trabajador_id = trabajadores.id');
        expect(s).toContain('dp.reactivado_en IS NOT NULL');
        expect(s).toMatch(/AS periodos_cerrados$/);
    });
});

describe('migración 152_reingreso_periodos.sql', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../db/migrations/152_reingreso_periodos.sql'), 'utf8')
        .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

    test('idempotente: ADD COLUMN IF NOT EXISTS para la foto empresa/obra/cargo', () => {
        for (const col of ['empresa_id', 'obra_id', 'cargo_id']) {
            expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col} INT NULL`));
        }
    });

    test('backfill solo donde la foto está vacía; sin DELETE/DROP ni permisos', () => {
        expect(sql).toMatch(/WHERE d\.empresa_id IS NULL AND d\.obra_id IS NULL AND d\.cargo_id IS NULL/);
        expect(sql).not.toMatch(/\bDELETE\b|\bDROP\b|permisos_/i);
    });
});
