const asistenciaService = require('../src/services/asistencia.service');
const db = require('../src/config/db');
const ExcelJS = require('exceljs');

jest.mock('../src/config/db');

describe('Asistencia Service - Exportación Excel Mejorada', () => {
    
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ── Test 1: Hojas por empresa y fórmulas correctas ──
    test('debe generar hojas por empresa con fórmulas que incluyen FDS', async () => {
        const mockWorkers = [
            { id: 1, rut: '1-1', nombres: 'Juan', apellido_paterno: 'Perez', empresa_nombre: 'LOLS EMPRESAS DE INGENIERIA LTDA', activo: 1 },
            { id: 2, rut: '2-2', nombres: 'Maria', apellido_paterno: 'Gomez', empresa_nombre: 'MIGUEL ANGEL URRUTIA AGUILERA', activo: 1 },
            { id: 3, rut: '3-3', nombres: 'Pedro', apellido_paterno: 'Soto', empresa_nombre: 'TRANSPORTES DEDALIUS LIMITADA', activo: 1 }
        ];

        const mockEstados = [
            { id: 1, codigo: 'A', nombre: 'Asistencia', color: '#34C759', activo: 1 },
            { id: 2, codigo: 'F', nombre: 'Falta', color: '#FF3B30', activo: 1 },
            { id: 3, codigo: 'V', nombre: 'Vacaciones', color: '#FFD60A', activo: 1 },
            { id: 4, codigo: 'LM', nombre: 'Licencia Médica', color: '#AF52DE', activo: 1 }
        ];

        // Juan solo tiene 1 asistencia el viernes 13 de marzo 2026
        const mockRegistros = [
            { trabajador_id: 1, fecha: '2026-03-13', estado_id: 1, estado_codigo: 'A' }
        ];

        db.query.mockImplementation((sql) => {
            if (sql.includes('FROM trabajadores')) return Promise.resolve([mockWorkers]);
            if (sql.includes('FROM estados_asistencia')) return Promise.resolve([mockEstados]);
            if (sql.includes('FROM asistencias')) return Promise.resolve([mockRegistros]);
            if (sql.includes('FROM feriados')) return Promise.resolve([[]]);
            return Promise.resolve([[]]);
        });

        const query = { fecha_inicio: '2026-03-01', fecha_fin: '2026-03-31' };
        const buffer = await asistenciaService.generarExcel(query);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        // ✓ Verificar que existen las 3 hojas
        const sheetNames = workbook.worksheets.map(ws => ws.name.toLowerCase());
        expect(sheetNames).toContain('lols marzo 2026');
        expect(sheetNames).toContain('maua marzo 2026');
        expect(sheetNames).toContain('dedalius marzo 2026');

        // ✓ Verificar fórmulas de Juan en hoja LOLS
        const wsLols = workbook.worksheets.find(ws => ws.name.toLowerCase().includes('lols'));
        const q1Cell = wsLols.getCell(9, 24); // dayColStart(9) + 15 = col 24
        const formula = q1Cell.value.formula;

        // Fórmula debe tener COUNTIF para A, V, LM, AL, JI, AT, FDS
        expect(formula).toContain('"A"');
        expect(formula).toContain('"V"');
        expect(formula).toContain('"FDS"');
        // NO debe tener COUNTBLANK (ese era el bug)
        expect(formula).not.toContain('COUNTBLANK');
    });

    // ── Test 2: Marcador FDS en fines de semana ──
    test('debe escribir FDS en fines de semana sin registro (no dejar vacío)', async () => {
        const mockWorkers = [
            { id: 1, rut: '19.745.003-7', nombres: 'FABIAN MAXIMILIANO', apellido_paterno: 'AGUILERA', apellido_materno: 'SANDOVAL', empresa_nombre: 'LOLS EMPRESAS DE INGENIERIA LTDA', activo: 1 }
        ];

        const mockEstados = [
            { id: 1, codigo: 'A', nombre: 'Asistencia', color: '#34C759', activo: 1 },
            { id: 2, codigo: 'F', nombre: 'Falta', color: '#FF3B30', activo: 1 }
        ];

        // Solo asistió el viernes 13 de marzo 2026
        const mockRegistros = [
            { trabajador_id: 1, fecha: '2026-03-13', estado_id: 1 }
        ];

        db.query.mockImplementation((sql) => {
            if (sql.includes('FROM trabajadores')) return Promise.resolve([mockWorkers]);
            if (sql.includes('FROM estados_asistencia')) return Promise.resolve([mockEstados]);
            if (sql.includes('FROM asistencias')) return Promise.resolve([mockRegistros]);
            if (sql.includes('FROM feriados')) return Promise.resolve([[]]);
            return Promise.resolve([[]]);
        });

        const query = { fecha_inicio: '2026-03-01', fecha_fin: '2026-03-31' };
        const buffer = await asistenciaService.generarExcel(query);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const wsLols = workbook.worksheets.find(ws => ws.name.toLowerCase().includes('lols'));
        
        // Marzo 2026: Día 1 = Domingo -> FDS (col 9 + 0 = 9)
        const day1Cell = wsLols.getCell(9, 9); // Fila 9, primera columna de días
        expect(day1Cell.value).toBe('FDS');

        // Día 2 = Lunes laboral sin registro -> vacío
        const day2Cell = wsLols.getCell(9, 10);
        expect(day2Cell.value).toBe('');

        // Día 7 = Sábado -> FDS  (col 9 + 6 = 15)
        const day7Cell = wsLols.getCell(9, 15);
        expect(day7Cell.value).toBe('FDS');

        // Día 13 = Viernes con asistencia -> A (col 9 + 12 = 21)
        const day13Cell = wsLols.getCell(9, 21);
        expect(day13Cell.value).toBe('A');
    });

    // ── Test 3: Trabajadores sin empresa ──
    test('debe manejar trabajadores sin empresa en hoja SIN EMPRESA', async () => {
        const mockWorkers = [
            { id: 4, rut: '4-4', nombres: 'Extra', apellido_paterno: 'SinEmpresa', empresa_nombre: null, activo: 1 }
        ];

        db.query.mockImplementation((sql) => {
            if (sql.includes('FROM trabajadores')) return Promise.resolve([mockWorkers]);
            if (sql.includes('FROM estados_asistencia')) return Promise.resolve([[]]);
            if (sql.includes('FROM asistencias')) return Promise.resolve([[]]);
            if (sql.includes('FROM feriados')) return Promise.resolve([[]]);
            return Promise.resolve([[]]);
        });

        const query = { fecha_inicio: '2026-03-01', fecha_fin: '2026-03-31' };
        const buffer = await asistenciaService.generarExcel(query);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const sheetNames = workbook.worksheets.map(ws => ws.name.toUpperCase());
        expect(sheetNames.some(n => n.includes('PROVISORIOS'))).toBe(true);
    });

    // ── Test 4: Leyenda en dos columnas (no más de 4 filas) ──
    test('la leyenda debe organizarse en dos columnas sin solapar datos', async () => {
        const mockWorkers = [
            { id: 1, rut: '1-1', nombres: 'Test', apellido_paterno: 'User', empresa_nombre: 'LOLS EMPRESAS DE INGENIERIA LTDA', activo: 1 }
        ];

        // 6 estados + 1 FDS = 7 items → 4 izquierda, 3 derecha
        const mockEstados = [
            { id: 1, codigo: 'A', nombre: 'Asistencia', color: '#34C759', activo: 1 },
            { id: 2, codigo: 'F', nombre: 'Falta', color: '#FF3B30', activo: 1 },
            { id: 3, codigo: 'V', nombre: 'Vacaciones', color: '#FFD60A', activo: 1 },
            { id: 4, codigo: 'LM', nombre: 'Licencia Médica', color: '#AF52DE', activo: 1 },
            { id: 5, codigo: 'JI', nombre: 'Jornada Incompleta', color: '#FF9500', activo: 1 },
            { id: 6, codigo: 'AT', nombre: 'Atraso', color: '#FF6B6B', activo: 1 }
        ];

        db.query.mockImplementation((sql) => {
            if (sql.includes('FROM trabajadores')) return Promise.resolve([mockWorkers]);
            if (sql.includes('FROM estados_asistencia')) return Promise.resolve([mockEstados]);
            if (sql.includes('FROM asistencias')) return Promise.resolve([[]]);
            if (sql.includes('FROM feriados')) return Promise.resolve([[]]);
            return Promise.resolve([[]]);
        });

        const query = { fecha_inicio: '2026-03-01', fecha_fin: '2026-03-31' };
        const buffer = await asistenciaService.generarExcel(query);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const wsLols = workbook.worksheets.find(ws => ws.name.toLowerCase().includes('lols'));

        // 7 items total → halfLegend = 4 → filas 1-4 izquierda, filas 1-3 derecha
        // Columna izquierda: A (code col 1), B (name col 2)
        expect(wsLols.getCell(1, 1).value).toBe('A');
        expect(wsLols.getCell(2, 1).value).toBe('F');
        expect(wsLols.getCell(3, 1).value).toBe('V');
        expect(wsLols.getCell(4, 1).value).toBe('LM');

        // Columna derecha: C (code col 3), D (name col 4)
        expect(wsLols.getCell(1, 3).value).toBe('JI');
        expect(wsLols.getCell(2, 3).value).toBe('AT');
        expect(wsLols.getCell(3, 3).value).toBe('FDS');

        // Row 5 debe estar vacía (sin leyenda) → sin solapamiento con headers en fila 7
        expect(wsLols.getCell(5, 1).value).toBeNull();
    });
});
