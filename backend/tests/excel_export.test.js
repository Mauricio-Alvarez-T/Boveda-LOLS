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
            { id: 1, codigo: 'A', nombre: 'Asistencia', color: '#34C759', activo: 1, es_presente: 1, cuenta_dia_trabajado: 1 },
            { id: 2, codigo: 'F', nombre: 'Falta', color: '#FF3B30', activo: 1, es_presente: 0, cuenta_dia_trabajado: 0 },
            { id: 3, codigo: 'V', nombre: 'Vacaciones', color: '#FFD60A', activo: 1, es_presente: 0, cuenta_dia_trabajado: 1 },
            { id: 4, codigo: 'LM', nombre: 'Licencia Médica', color: '#AF52DE', activo: 1, es_presente: 0, cuenta_dia_trabajado: 0 }
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
            { id: 1, codigo: 'A', nombre: 'Asistencia', color: '#34C759', activo: 1, es_presente: 1, cuenta_dia_trabajado: 1 },
            { id: 2, codigo: 'F', nombre: 'Falta', color: '#FF3B30', activo: 1, es_presente: 0, cuenta_dia_trabajado: 0 }
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

    // ── Test 5: Weekend/feriado dentro de LM se renderiza como bloque LM ──
    test('weekend dentro de período LM debe mostrar "LM" con fill LM y no sumar al total', async () => {
        const mockWorkers = [
            { id: 1, rut: '1-1', nombres: 'Juan', apellido_paterno: 'Perez', empresa_nombre: 'LOLS EMPRESAS DE INGENIERIA LTDA', activo: 1 }
        ];

        const mockEstados = [
            { id: 1, codigo: 'A', nombre: 'Asistencia', color: '#34C759', activo: 1, es_presente: 1, cuenta_dia_trabajado: 1 },
            { id: 2, codigo: 'F', nombre: 'Falta', color: '#FF3B30', activo: 1, es_presente: 0, cuenta_dia_trabajado: 0 },
            { id: 4, codigo: 'LM', nombre: 'Licencia Médica', color: '#5856D6', activo: 1, es_presente: 0, cuenta_dia_trabajado: 0 }
        ];

        // LM período: lunes 9 al domingo 15 de marzo 2026 (incluye sab 14 + dom 15)
        // crearPeriodo habría insertado filas para lun-vie (9-13). Sat 14 + Dom 15 no tienen registro.
        const mockRegistros = [
            { trabajador_id: 1, fecha: '2026-03-09', estado_id: 4 },
            { trabajador_id: 1, fecha: '2026-03-10', estado_id: 4 },
            { trabajador_id: 1, fecha: '2026-03-11', estado_id: 4 },
            { trabajador_id: 1, fecha: '2026-03-12', estado_id: 4 },
            { trabajador_id: 1, fecha: '2026-03-13', estado_id: 4 }
        ];

        const mockLMPeriods = [
            { trabajador_id: 1, fecha_inicio: '2026-03-09', fecha_fin: '2026-03-15', codigo: 'LM', color: '#5856D6' }
        ];

        db.query.mockImplementation((sql) => {
            if (sql.includes('FROM trabajadores')) return Promise.resolve([mockWorkers]);
            if (sql.includes('FROM estados_asistencia')) return Promise.resolve([mockEstados]);
            if (sql.includes('FROM asistencias')) return Promise.resolve([mockRegistros]);
            if (sql.includes('FROM feriados')) return Promise.resolve([[]]);
            if (sql.includes('FROM periodos_ausencia')) return Promise.resolve([mockLMPeriods]);
            return Promise.resolve([[]]);
        });

        const query = { fecha_inicio: '2026-03-01', fecha_fin: '2026-03-31' };
        const buffer = await asistenciaService.generarExcel(query);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const wsLols = workbook.worksheets.find(ws => ws.name.toLowerCase().includes('lols'));

        // Día 1 = Domingo, FUERA de LM → FDS gris (suma)
        expect(wsLols.getCell(9, 9).value).toBe('FDS');

        // Día 7 = Sábado, FUERA de LM → FDS gris (suma)
        expect(wsLols.getCell(9, 15).value).toBe('FDS');

        // Días 9-13 (lun-vie) con LM registrado → LM (fill azul)
        const lmCellMid = wsLols.getCell(9, 21); // día 13
        expect(lmCellMid.value).toBe('LM');
        expect(lmCellMid.fill?.fgColor?.argb).toBe('FF5856D6');

        // Día 14 = Sábado DENTRO de LM → "LM" con fill LM (bloque continuo, NO suma)
        const sabLM = wsLols.getCell(9, 22);
        expect(sabLM.value).toBe('LM');
        expect(sabLM.fill?.fgColor?.argb).toBe('FF5856D6');

        // Día 15 = Domingo DENTRO de LM → "LM" con fill LM
        const domLM = wsLols.getCell(9, 23);
        expect(domLM.value).toBe('LM');
        expect(domLM.fill?.fgColor?.argb).toBe('FF5856D6');

        // Verificar que fórmula COUNTIF NO incluye "LM" (LM cuenta_dia_trabajado=0, no está en codigosSumanDia)
        const q1Cell = wsLols.getCell(9, 24); // Q1 col
        const formula = q1Cell.value.formula;
        expect(formula).toContain('"FDS"');
        expect(formula).not.toMatch(/"LM"/);

        // Bordes color-matched al fill → bloque visual continuo
        const borderArgb = sabLM.border?.top?.color?.argb;
        expect(borderArgb).toBe('FF5856D6');
    });

    // ── Test 4: Leyenda en dos columnas (no más de 4 filas) ──
    test('la leyenda debe organizarse en dos columnas sin solapar datos', async () => {
        const mockWorkers = [
            { id: 1, rut: '1-1', nombres: 'Test', apellido_paterno: 'User', empresa_nombre: 'LOLS EMPRESAS DE INGENIERIA LTDA', activo: 1 }
        ];

        // 6 estados + 1 FDS = 7 items → 4 izquierda, 3 derecha
        const mockEstados = [
            { id: 1, codigo: 'A', nombre: 'Asistencia', color: '#34C759', activo: 1, es_presente: 1, cuenta_dia_trabajado: 1 },
            { id: 2, codigo: 'F', nombre: 'Falta', color: '#FF3B30', activo: 1, es_presente: 0, cuenta_dia_trabajado: 0 },
            { id: 3, codigo: 'V', nombre: 'Vacaciones', color: '#FFD60A', activo: 1, es_presente: 0, cuenta_dia_trabajado: 1 },
            { id: 4, codigo: 'LM', nombre: 'Licencia Médica', color: '#AF52DE', activo: 1, es_presente: 0, cuenta_dia_trabajado: 0 },
            { id: 5, codigo: 'JI', nombre: 'Jornada Incompleta', color: '#FF9500', activo: 1, es_presente: 1, cuenta_dia_trabajado: 1 },
            { id: 6, codigo: 'AT', nombre: 'Atraso', color: '#FF6B6B', activo: 1, es_presente: 1, cuenta_dia_trabajado: 1 }
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

        // AT becomes JI, leaving 5 real items + FDS + "31" (base 30) = 7 items
        // 7 items total → halfLegend = 4 → filas 1-4 izquierda, filas 1-3 derecha
        // Columna izquierda: A, F, V, LM (col 1)
        expect(wsLols.getCell(1, 1).value).toBe('A');
        expect(wsLols.getCell(2, 1).value).toBe('F');
        expect(wsLols.getCell(3, 1).value).toBe('V');
        expect(wsLols.getCell(4, 1).value).toBe('LM');

        // Columna derecha: JI, FDS, 31 (col 3)
        expect(wsLols.getCell(1, 3).value).toBe('JI');
        expect(wsLols.getCell(2, 3).value).toBe('FDS');
        expect(wsLols.getCell(3, 3).value).toBe('31');

        // Row 4 derecha debe estar vacía
        expect(wsLols.getCell(4, 3).value).toBeNull();
    });

    // ── Test 6: JI usa jornada/2 dinámica (no hardcoded 4.5) ──
    test('JI sin marcas de reloj usa jornada/2 de configuracion_horarios', async () => {
        const mockWorkers = [
            { id: 1, rut: '1-1', nombres: 'Juan', apellido_paterno: 'Perez', empresa_nombre: 'LOLS EMPRESAS DE INGENIERIA LTDA', activo: 1, obra_id: 10 }
        ];

        const mockEstados = [
            { id: 1, codigo: 'A', nombre: 'Asistencia', color: '#34C759', activo: 1, es_presente: 1, cuenta_dia_trabajado: 1 },
            { id: 5, codigo: 'JI', nombre: 'Jornada Incompleta', color: '#FF9500', activo: 1, es_presente: 1, cuenta_dia_trabajado: 1 }
        ];

        // JI el viernes 13 marzo 2026 SIN marcas de reloj
        const mockRegistros = [
            { trabajador_id: 1, fecha: '2026-03-13', estado_id: 5, hora_entrada: null, hora_salida: null }
        ];

        // Obra 10: jornada lun-vie 08:00-18:00 con colación 13:00-14:00 = 9h
        const mockHorarios = [
            { obra_id: 10, dia_semana: 'lun', hora_entrada: '08:00', hora_salida: '18:00', hora_colacion_inicio: '13:00', hora_colacion_fin: '14:00', activo: 1 },
            { obra_id: 10, dia_semana: 'mar', hora_entrada: '08:00', hora_salida: '18:00', hora_colacion_inicio: '13:00', hora_colacion_fin: '14:00', activo: 1 },
            { obra_id: 10, dia_semana: 'mie', hora_entrada: '08:00', hora_salida: '18:00', hora_colacion_inicio: '13:00', hora_colacion_fin: '14:00', activo: 1 },
            { obra_id: 10, dia_semana: 'jue', hora_entrada: '08:00', hora_salida: '18:00', hora_colacion_inicio: '13:00', hora_colacion_fin: '14:00', activo: 1 },
            { obra_id: 10, dia_semana: 'vie', hora_entrada: '08:00', hora_salida: '18:00', hora_colacion_inicio: '13:00', hora_colacion_fin: '14:00', activo: 1 }
        ];

        db.query.mockImplementation((sql) => {
            if (sql.includes('FROM trabajadores')) return Promise.resolve([mockWorkers]);
            if (sql.includes('FROM estados_asistencia')) return Promise.resolve([mockEstados]);
            if (sql.includes('FROM asistencias')) return Promise.resolve([mockRegistros]);
            if (sql.includes('FROM feriados')) return Promise.resolve([[]]);
            if (sql.includes('FROM configuracion_horarios')) return Promise.resolve([mockHorarios]);
            return Promise.resolve([[]]);
        });

        const query = { fecha_inicio: '2026-03-01', fecha_fin: '2026-03-31' };
        const buffer = await asistenciaService.generarExcel(query);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const wsLols = workbook.worksheets.find(ws => ws.name.toLowerCase().includes('lols'));

        // Header "HRS DESCONTADAS (JI)" debe existir
        // Grilla base 30 (31 columnas de día + DESC Q1/Q2): dayColStart = 9.
        // Q1 = 24, DESC Q1 = 25, d16-30 = 26-40, d31 = 41, Q2 = 42, DESC Q2 = 43,
        // total = 44, desc(JI) = 45, extra = 46, obs = 47.
        // (BALANCE HRS ORDINARIO eliminada a pedido de jefatura 2026-08-17.)
        const descHeader = wsLols.getCell(7, 45);
        expect(descHeader.value).toBe('HRS DESCONTADAS (JI)');

        // Regresión: la columna BALANCE no debe existir en ningún header
        for (let c = 44; c <= 48; c++) {
            expect(wsLols.getCell(7, c).value).not.toBe('BALANCE HRS ORDINARIO');
        }

        // Trabajador con 1 día JI (jornada 9h): descuento = 9 - 4.5 = 4.5
        const cDesc = wsLols.getCell(9, 45);
        expect(cDesc.value).toBeCloseTo(4.5, 1);
    });

    // ── Test 7: JI sin horario configurado fallback 4.5 ──
    test('JI sin configuracion_horarios usa fallback 4.5h (jornada 9h default)', async () => {
        const mockWorkers = [
            { id: 1, rut: '1-1', nombres: 'Juan', apellido_paterno: 'Perez', empresa_nombre: 'LOLS EMPRESAS DE INGENIERIA LTDA', activo: 1, obra_id: 99 }
        ];

        const mockEstados = [
            { id: 5, codigo: 'JI', nombre: 'Jornada Incompleta', color: '#FF9500', activo: 1, es_presente: 1, cuenta_dia_trabajado: 1 }
        ];

        const mockRegistros = [
            { trabajador_id: 1, fecha: '2026-03-13', estado_id: 5, hora_entrada: null, hora_salida: null }
        ];

        db.query.mockImplementation((sql) => {
            if (sql.includes('FROM trabajadores')) return Promise.resolve([mockWorkers]);
            if (sql.includes('FROM estados_asistencia')) return Promise.resolve([mockEstados]);
            if (sql.includes('FROM asistencias')) return Promise.resolve([mockRegistros]);
            if (sql.includes('FROM feriados')) return Promise.resolve([[]]);
            if (sql.includes('FROM configuracion_horarios')) return Promise.resolve([[]]);
            return Promise.resolve([[]]);
        });

        const query = { fecha_inicio: '2026-03-01', fecha_fin: '2026-03-31' };
        const buffer = await asistenciaService.generarExcel(query);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const wsLols = workbook.worksheets.find(ws => ws.name.toLowerCase().includes('lols'));
        // Fallback default 9h → JI calc = 4.5, descuento = 9 - 4.5 = 4.5
        // Grilla base 30 sin BALANCE: horasDesc col = 45 (ver Test 6).
        const cDesc = wsLols.getCell(9, 45);
        expect(cDesc.value).toBeCloseTo(4.5, 1);
    });

    // ── Test extra: período V cubriendo sábado pinta V (no FDS) ──
    test('período V cubriendo sábado pinta "V" con color, no FDS (mig periodos generalizada)', async () => {
        const mockWorkers = [
            { id: 1, rut: '1-1', nombres: 'Juan', apellido_paterno: 'Perez', empresa_nombre: 'LOLS EMPRESAS DE INGENIERIA LTDA', activo: 1 }
        ];

        const mockEstados = [
            { id: 1, codigo: 'A', nombre: 'Asistencia', color: '#34C759', activo: 1, es_presente: 1, cuenta_dia_trabajado: 1 },
            { id: 3, codigo: 'V', nombre: 'Vacaciones', color: '#FFD60A', activo: 1, es_presente: 0, cuenta_dia_trabajado: 1 }
        ];

        // V propaga TODOS los días → fila V en sábado 14/03/2026
        const mockRegistros = [
            { trabajador_id: 1, fecha: '2026-03-09', estado_id: 3 },
            { trabajador_id: 1, fecha: '2026-03-10', estado_id: 3 },
            { trabajador_id: 1, fecha: '2026-03-11', estado_id: 3 },
            { trabajador_id: 1, fecha: '2026-03-12', estado_id: 3 },
            { trabajador_id: 1, fecha: '2026-03-13', estado_id: 3 },
            { trabajador_id: 1, fecha: '2026-03-14', estado_id: 3 }, // sábado
            { trabajador_id: 1, fecha: '2026-03-15', estado_id: 3 }  // domingo
        ];

        const mockVPeriods = [
            { trabajador_id: 1, fecha_inicio: '2026-03-09', fecha_fin: '2026-03-15', codigo: 'V', color: '#FFD60A' }
        ];

        db.query.mockImplementation((sql) => {
            if (sql.includes('FROM trabajadores')) return Promise.resolve([mockWorkers]);
            if (sql.includes('FROM estados_asistencia')) return Promise.resolve([mockEstados]);
            if (sql.includes('FROM asistencias')) return Promise.resolve([mockRegistros]);
            if (sql.includes('FROM feriados')) return Promise.resolve([[]]);
            if (sql.includes('FROM periodos_ausencia')) return Promise.resolve([mockVPeriods]);
            return Promise.resolve([[]]);
        });

        const query = { fecha_inicio: '2026-03-01', fecha_fin: '2026-03-31' };
        const buffer = await asistenciaService.generarExcel(query);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const wsLols = workbook.worksheets.find(ws => ws.name.toLowerCase().includes('lols'));

        // Día 14 = sábado dentro de V → debe pintar "V" amarillo (no FDS gris)
        const sabV = wsLols.getCell(9, 22);
        expect(sabV.value).toBe('V');
        expect(sabV.fill?.fgColor?.argb).toBe('FFFFD60A');

        // Día 15 = domingo dentro de V → también "V"
        const domV = wsLols.getCell(9, 23);
        expect(domV.value).toBe('V');
    });

    // ── Test 8: NAC/DF/MT individuales (no consolidan a PL) ──
    test('NAC/DF/MT renderizan códigos propios y suman al total (mig 065)', async () => {
        const mockWorkers = [
            { id: 1, rut: '1-1', nombres: 'Juan',  apellido_paterno: 'Perez', empresa_nombre: 'LOLS EMPRESAS DE INGENIERIA LTDA', activo: 1 },
            { id: 2, rut: '2-2', nombres: 'Maria', apellido_paterno: 'Soto',  empresa_nombre: 'LOLS EMPRESAS DE INGENIERIA LTDA', activo: 1 },
            { id: 3, rut: '3-3', nombres: 'Luis',  apellido_paterno: 'Vega',  empresa_nombre: 'LOLS EMPRESAS DE INGENIERIA LTDA', activo: 1 }
        ];

        const mockEstados = [
            { id: 1, codigo: 'A',   nombre: 'Asistencia',  color: '#34C759', activo: 1, es_presente: 1, cuenta_dia_trabajado: 1 },
            { id: 7, codigo: 'NAC', nombre: 'Nacimiento',  color: '#F1C40F', activo: 1, es_presente: 0, cuenta_dia_trabajado: 1 },
            { id: 8, codigo: 'DF',  nombre: 'Defunción',   color: '#34495E', activo: 1, es_presente: 0, cuenta_dia_trabajado: 1 },
            { id: 9, codigo: 'MT',  nombre: 'Matrimonio',  color: '#E67E22', activo: 1, es_presente: 0, cuenta_dia_trabajado: 1 }
        ];

        // Viernes 13 marzo 2026: Juan→NAC, Maria→DF, Luis→MT
        const mockRegistros = [
            { trabajador_id: 1, fecha: '2026-03-13', estado_id: 7 },
            { trabajador_id: 2, fecha: '2026-03-13', estado_id: 8 },
            { trabajador_id: 3, fecha: '2026-03-13', estado_id: 9 }
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

        // Día 13 = col 21 (dayColStart=9, dIdx=12 → 9+12=21)
        // Juan (row 9) → NAC, Maria (row 10) → DF, Luis (row 11) → MT
        expect(wsLols.getCell(9, 21).value).toBe('NAC');
        expect(wsLols.getCell(10, 21).value).toBe('DF');
        expect(wsLols.getCell(11, 21).value).toBe('MT');

        // NINGUNA celda debe decir "PL" (consolidación removida)
        for (let r = 9; r <= 11; r++) {
            expect(wsLols.getCell(r, 21).value).not.toBe('PL');
        }

        // Fórmula COUNTIF Q1 de Juan debe contener "NAC", "DF", "MT"
        // (codigosSumanDia incluye los tres porque cuenta_dia_trabajado=1)
        const q1Cell = wsLols.getCell(9, 24);
        const formula = q1Cell.value.formula;
        expect(formula).toContain('"NAC"');
        expect(formula).toContain('"DF"');
        expect(formula).toContain('"MT"');
        expect(formula).not.toContain('"PL"');
    });
});

// ══════════════════════════════════════════════════════════════════════
// ═══  BASE 30 DÍAS: día 31 solo descuenta + relleno de meses cortos  ═══
// ══════════════════════════════════════════════════════════════════════
describe('Asistencia Service - Excel base 30 (día 31 y columnas DESCUENTOS)', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    const ESTADOS = [
        { id: 1, codigo: 'A',  nombre: 'Asistencia',      color: '#34C759', activo: 1, es_presente: 1, cuenta_dia_trabajado: 1 },
        { id: 2, codigo: 'F',  nombre: 'Falta',           color: '#FF3B30', activo: 1, es_presente: 0, cuenta_dia_trabajado: 0 },
        { id: 3, codigo: 'V',  nombre: 'Vacaciones',      color: '#FFD60A', activo: 1, es_presente: 0, cuenta_dia_trabajado: 1 },
        { id: 4, codigo: 'LM', nombre: 'Licencia Médica', color: '#5856D6', activo: 1, es_presente: 0, cuenta_dia_trabajado: 0 }
    ];

    // Layout base 30: d1-15 = 9-23, Q1 = 24, DESC Q1 = 25, d16-30 = 26-40,
    // d31 = 41 (col "AO"), Q2 = 42, DESC Q2 = 43, TOTAL = 44.
    const dayCol = (num) => 9 + (num - 1) + (num > 15 ? 2 : 0);
    const DESC_Q1_COL = 25;
    const DIA31_COL = 41;
    const Q2_COL = 42;
    const DESC_Q2_COL = 43;
    const TOTAL_COL = 44;

    // ExcelJS no evalúa fórmulas → replicar la semántica: Q1/Q2 aditivas por
    // código que paga + FDS, menos la penalización del día 31 (MAX(0, …)).
    const evalTotales = (ws, row) => {
        const pagan = new Set(['A', 'V', 'JI', 'TO', 'NAC', 'DF', 'MT', 'FDS']);
        const noPagan = new Set(['F', 'LM', 'PSG', '-']);
        const val = (col) => {
            const v = ws.getCell(row, col).value;
            return v == null ? '' : String(v);
        };
        let q1 = 0, q2 = 0;
        for (let n = 1; n <= 15; n++) if (pagan.has(val(dayCol(n)))) q1++;
        for (let n = 16; n <= 30; n++) if (pagan.has(val(dayCol(n)))) q2++;
        const penal31 = noPagan.has(val(DIA31_COL)) ? 1 : 0;
        const q2Final = Math.max(0, q2 - penal31);
        return { q1, q2: q2Final, total: q1 + q2Final };
    };

    const pad = (n) => String(n).padStart(2, '0');

    // Registros 'A' para todos los días hábiles (lun-vie) del mes hasta hastaDia
    const asistenciasHabiles = (anio, mesIdx, hastaDia, omitir = []) => {
        const rows = [];
        for (let d = 1; d <= hastaDia; d++) {
            if (omitir.includes(d)) continue;
            const dow = new Date(anio, mesIdx, d, 12).getDay();
            if (dow >= 1 && dow <= 5) {
                rows.push({ trabajador_id: 1, obra_id: 10, fecha: `${anio}-${pad(mesIdx + 1)}-${pad(d)}`, estado_id: 1 });
            }
        }
        return rows;
    };

    const mockWorker = (extra = {}) => ([{
        id: 1, rut: '1-1', nombres: 'Juan', apellido_paterno: 'Perez',
        empresa_nombre: 'LOLS EMPRESAS DE INGENIERIA LTDA', activo: 1, obra_id: 10, ...extra
    }]);

    const mockDb = ({ workers, registros, feriados = [], periodos = [] }) => {
        db.query.mockImplementation((sql) => {
            if (sql.includes('FROM trabajadores')) return Promise.resolve([workers]);
            if (sql.includes('FROM estados_asistencia')) return Promise.resolve([ESTADOS]);
            if (sql.includes('FROM asistencias')) return Promise.resolve([registros]);
            if (sql.includes('FROM feriados')) return Promise.resolve([feriados]);
            if (sql.includes('FROM periodos_ausencia')) return Promise.resolve([periodos]);
            return Promise.resolve([[]]);
        });
    };

    const generarHojaLols = async (fecha_inicio, fecha_fin) => {
        const buffer = await asistenciaService.generarExcel({ fecha_inicio, fecha_fin });
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer);
        return wb.worksheets.find(ws => ws.name.toLowerCase().includes('lols'));
    };

    // ── 1: Falta registrada el 31 descuenta → total 29 ──
    test('marzo 2026: F registrada el 31 descuenta (Q2=14, total 29)', async () => {
        // Marzo 2026: día 1 = domingo, día 31 = martes
        const registros = [
            ...asistenciasHabiles(2026, 2, 30),
            { trabajador_id: 1, obra_id: 10, fecha: '2026-03-31', estado_id: 2 }
        ];
        mockDb({ workers: mockWorker(), registros });
        const ws = await generarHojaLols('2026-03-01', '2026-03-31');

        expect(ws.getCell(9, DIA31_COL).value).toBe('F');

        // Fórmula Q2: MAX(0, aditivo − penalización sobre la celda del 31 (AO9))
        const q2Formula = ws.getCell(9, Q2_COL).value.formula;
        expect(q2Formula).toContain('MAX(0,');
        expect(q2Formula).toContain('COUNTIF(AO9');
        expect(q2Formula).toContain('"F"');

        const { q1, q2, total } = evalTotales(ws, 9);
        expect(q1).toBe(15);
        expect(q2).toBe(14);
        expect(total).toBe(29);

        // Detalle visible del descuento en DESC Q2
        expect(String(ws.getCell(9, DESC_Q2_COL).value)).toContain('Dia 31 (F): descuenta 1');
    });

    // ── 2: 31 asistido NO suma (tope base 30) ──
    test('marzo 2026: A el 31 no suma (total se mantiene en 30)', async () => {
        const registros = [
            ...asistenciasHabiles(2026, 2, 30),
            { trabajador_id: 1, obra_id: 10, fecha: '2026-03-31', estado_id: 1 }
        ];
        mockDb({ workers: mockWorker(), registros });
        const ws = await generarHojaLols('2026-03-01', '2026-03-31');

        expect(ws.getCell(9, DIA31_COL).value).toBe('A');
        expect(evalTotales(ws, 9).total).toBe(30);
        // Sin descuentos → columna DESC Q2 vacía
        expect(ws.getCell(9, DESC_Q2_COL).value).toBeNull();
    });

    // ── 3: 31 sin registro = NEUTRAL (protege exports históricos) ──
    test('marzo 2026: día 31 hábil sin registro es neutro (total 30)', async () => {
        mockDb({ workers: mockWorker(), registros: asistenciasHabiles(2026, 2, 30) });
        const ws = await generarHojaLols('2026-03-01', '2026-03-31');

        expect(ws.getCell(9, DIA31_COL).value).toBe('');
        expect(evalTotales(ws, 9).total).toBe(30);
        expect(ws.getCell(9, DESC_Q2_COL).value).toBeNull();
    });

    // ── 4: 31 en fin de semana → FDS neutro ──
    test('mayo 2026: 31 domingo sin registro renderiza FDS y es neutro', async () => {
        mockDb({ workers: mockWorker(), registros: asistenciasHabiles(2026, 4, 30) });
        const ws = await generarHojaLols('2026-05-01', '2026-05-31');

        expect(ws.getCell(9, DIA31_COL).value).toBe('FDS');
        expect(evalTotales(ws, 9).total).toBe(30);
    });

    // ── 5: feriado el 31 → FDS neutro ──
    test('marzo 2026: feriado el 31 sin registro renderiza FDS y es neutro', async () => {
        mockDb({
            workers: mockWorker(),
            registros: asistenciasHabiles(2026, 2, 30),
            feriados: [{ id: 1, fecha: '2026-03-31', nombre: 'Feriado Test', activo: 1 }]
        });
        const ws = await generarHojaLols('2026-03-01', '2026-03-31');

        expect(ws.getCell(9, DIA31_COL).value).toBe('FDS');
        expect(evalTotales(ws, 9).total).toBe(30);
    });

    // ── 6: LM cubriendo el 31 descuenta ──
    test('marzo 2026: LM registrada el 31 descuenta (total 29)', async () => {
        const registros = [
            ...asistenciasHabiles(2026, 2, 30),
            { trabajador_id: 1, obra_id: 10, fecha: '2026-03-31', estado_id: 4 }
        ];
        const periodos = [{
            trabajador_id: 1, obra_id: 10, estado_id: 4,
            fecha_inicio: '2026-03-31', fecha_fin: '2026-03-31', codigo: 'LM', color: '#5856D6'
        }];
        mockDb({ workers: mockWorker(), registros, periodos });
        const ws = await generarHojaLols('2026-03-01', '2026-03-31');

        expect(ws.getCell(9, DIA31_COL).value).toBe('LM');
        expect(evalTotales(ws, 9).total).toBe(29);
        expect(String(ws.getCell(9, DESC_Q2_COL).value)).toContain('Dia 31 (LM): descuenta 1');
    });

    // ── 7: febrero perfecto = 30 (relleno fantasma, sin fechas de marzo) ──
    test('febrero 2026 perfecto: fantasmas 29/30 pagan (FDS gris) y total 30', async () => {
        // Feb 2026: 28 días, día 1 = domingo. El bug histórico desbordaba las
        // columnas 29/30 al 1-2 de marzo.
        mockDb({ workers: mockWorker(), registros: asistenciasHabiles(2026, 1, 28) });
        const ws = await generarHojaLols('2026-02-01', '2026-02-28');

        // Fantasmas 29/30 pagan como relleno base 30, con fill estructural
        const g29 = ws.getCell(9, dayCol(29));
        const g30 = ws.getCell(9, dayCol(30));
        expect(g29.value).toBe('FDS');
        expect(g30.value).toBe('FDS');
        expect(g29.fill?.fgColor?.argb).toBe('FFE7E7E7');

        // Cabeceras fantasma SIN día de semana (regresión: antes mostraban el
        // DOW real del 1-2 de marzo)
        expect(ws.getCell(8, dayCol(29)).value).toBe('');
        expect(ws.getCell(8, dayCol(30)).value).toBe('');
        expect(ws.getCell(8, DIA31_COL).value).toBe('');
        expect(ws.getCell(7, DIA31_COL).value).toBe(31);

        // 31 fantasma vacío y neutro
        expect(ws.getCell(9, DIA31_COL).value).toBe('');

        expect(evalTotales(ws, 9).total).toBe(30);
    });

    // ── 8: febrero finiquitado el 15 → los fantasmas NO pagan ──
    test('febrero 2026 finiquitado el 15: total 15 (fantasmas sin relleno)', async () => {
        mockDb({
            workers: mockWorker({ fecha_desvinculacion: '2026-02-15' }),
            registros: asistenciasHabiles(2026, 1, 15)
        });
        const ws = await generarHojaLols('2026-02-01', '2026-02-28');

        expect(ws.getCell(9, dayCol(29)).value).toBe('');
        expect(ws.getCell(9, dayCol(30)).value).toBe('');
        expect(evalTotales(ws, 9).total).toBe(15);

        const descQ2 = String(ws.getCell(9, DESC_Q2_COL).value);
        expect(descQ2).toContain('Fuera contrato: 16-28');
        expect(descQ2).toContain('sin relleno base 30');
    });

    // ── 9: ausencia no-pago hasta fin de febrero extiende el descuento ──
    test('febrero 2026 con LM 20→28: fantasmas descuentan (total 19)', async () => {
        // Decisión jefatura 2026-08-17: LM que llega al último día real del mes
        // deja los días virtuales 29/30 sin relleno (19 días, no 21).
        const lmRows = [];
        for (let d = 20; d <= 28; d++) {
            lmRows.push({ trabajador_id: 1, obra_id: 10, fecha: `2026-02-${pad(d)}`, estado_id: 4 });
        }
        const periodos = [{
            trabajador_id: 1, obra_id: 10, estado_id: 4,
            fecha_inicio: '2026-02-20', fecha_fin: '2026-02-28', codigo: 'LM', color: '#5856D6'
        }];
        mockDb({
            workers: mockWorker(),
            registros: [...asistenciasHabiles(2026, 1, 19), ...lmRows],
            periodos
        });
        const ws = await generarHojaLols('2026-02-01', '2026-02-28');

        expect(ws.getCell(9, dayCol(28)).value).toBe('LM');
        expect(ws.getCell(9, dayCol(29)).value).toBe('');
        expect(ws.getCell(9, dayCol(30)).value).toBe('');
        expect(evalTotales(ws, 9).total).toBe(19);
        expect(String(ws.getCell(9, DESC_Q2_COL).value)).toContain('sin relleno base 30');
    });

    // ── 10: mes de 30 días — equivalencia con comportamiento histórico ──
    test('abril 2026 (30 días): totales idénticos al comportamiento anterior', async () => {
        mockDb({ workers: mockWorker(), registros: asistenciasHabiles(2026, 3, 30) });
        const ws = await generarHojaLols('2026-04-01', '2026-04-30');

        // Día 31 fantasma vacío + neutral; layout estable
        expect(ws.getCell(9, DIA31_COL).value).toBe('');
        expect(ws.getCell(7, TOTAL_COL).value).toBe('TOTAL DIAS TRABAJADOS');
        expect(ws.getCell(7, DESC_Q1_COL).value).toBe('DESCUENTOS Q1');
        expect(ws.getCell(7, DESC_Q2_COL).value).toBe('DESCUENTOS Q2');

        const { q1, q2, total } = evalTotales(ws, 9);
        expect(q1).toBe(15);
        expect(q2).toBe(15);
        expect(total).toBe(30);
    });

    // ── 11: columnas DESCUENTOS con día de semana ──
    test('DESC Q1 lista faltas y días sin registro con día de semana', async () => {
        // Marzo 2026: F el martes 10, sin registro el jueves 12, A el resto
        const registros = [
            ...asistenciasHabiles(2026, 2, 30, [10, 12]),
            { trabajador_id: 1, obra_id: 10, fecha: '2026-03-10', estado_id: 2 }
        ];
        mockDb({ workers: mockWorker(), registros });
        const ws = await generarHojaLols('2026-03-01', '2026-03-31');

        const descQ1 = String(ws.getCell(9, DESC_Q1_COL).value);
        expect(descQ1).toContain('F: martes 10');
        expect(descQ1).toContain('Sin registro: jueves 12');

        // Q2 sin descuentos → vacía
        expect(ws.getCell(9, DESC_Q2_COL).value).toBeNull();

        expect(evalTotales(ws, 9).q1).toBe(13);
        expect(evalTotales(ws, 9).total).toBe(28);
    });

    // ── 12: Q2 nunca negativa (MAX(0, …)) ──
    test('ingreso el 31 con F el 31: Q2 queda en 0, no negativa', async () => {
        const registros = [
            { trabajador_id: 1, obra_id: 10, fecha: '2026-03-31', estado_id: 2 }
        ];
        mockDb({ workers: mockWorker({ fecha_ingreso: '2026-03-31' }), registros });
        const ws = await generarHojaLols('2026-03-01', '2026-03-31');

        expect(ws.getCell(9, DIA31_COL).value).toBe('F');
        expect(ws.getCell(9, Q2_COL).value.formula).toContain('MAX(0,');

        const { q1, q2, total } = evalTotales(ws, 9);
        expect(q1).toBe(0);
        expect(q2).toBe(0);
        expect(total).toBe(0);

        const descQ2 = String(ws.getCell(9, DESC_Q2_COL).value);
        expect(descQ2).toContain('Dia 31 (F): descuenta 1');
        expect(descQ2).toContain('Fuera contrato: 16-30');
    });
});
