import {
    filasBandejaAlertas, nombreCortoTipo, validarUmbrales, agruparPorEtapa, esCategoriaLote,
    type AlertasDocumentos, type AlertaDocumentoItem,
} from './documentosAlertas';

const vacio = (): AlertasDocumentos => ({
    total: 0, criticos: 0, por_tipo: [],
    por_etapa: { sin_imprimir: { total: 0, criticos: 0 }, por_retirar: { total: 0, criticos: 0 }, por_confirmar: { total: 0, criticos: 0 }, en_terreno: { total: 0, criticos: 0 } },
    lotes: { sin_confirmar: { total: 0, criticos: 0, items: [] }, en_terreno: { total: 0, criticos: 0, items: [] } },
    items: [],
});

describe('documentosAlertas (plan Gestiones B7)', () => {
    it('nombreCortoTipo quita el sufijo "(Bóveda)" y pasa a minúsculas', () => {
        expect(nombreCortoTipo('Contrato de Trabajo (Bóveda)')).toBe('contrato de trabajo');
        expect(nombreCortoTipo('Finiquito (Bóveda) ')).toBe('finiquito');
        expect(nombreCortoTipo('ODI')).toBe('odi');
    });

    it('filasBandejaAlertas: una fila por tipo (críticos primero), tope con "+N tipos más", filas de lotes; vacío → []', () => {
        expect(filasBandejaAlertas(null)).toEqual([]);
        expect(filasBandejaAlertas(vacio())).toEqual([]);
        const a: AlertasDocumentos = {
            ...vacio(), total: 9, criticos: 3,
            por_tipo: [
                { tipo_codigo: 'DAS', tipo_nombre: 'DAS (Bóveda)', total: 1, criticos: 0 },
                { tipo_codigo: 'CONTRATO', tipo_nombre: 'Contrato de Trabajo (Bóveda)', total: 3, criticos: 2 },
                { tipo_codigo: 'FINIQUITO', tipo_nombre: 'Finiquito (Bóveda)', total: 1, criticos: 1 },
                { tipo_codigo: 'ODI_D40', tipo_nombre: 'ODI (Bóveda)', total: 2, criticos: 0 },
                { tipo_codigo: 'EPP_RECEPCION', tipo_nombre: 'EPP (Bóveda)', total: 2, criticos: 0 },
            ],
            lotes: { sin_confirmar: { total: 1, criticos: 0, items: [] }, en_terreno: { total: 2, criticos: 1, items: [] } },
        };
        const filas = filasBandejaAlertas(a, { maxFilas: 3 });
        expect(filas.map(f => [f.severity, f.title])).toEqual([
            ['critical', '3 contrato de trabajo sin firmar · 2 críticos'],
            ['critical', '1 finiquito sin firmar · 1 crítico'],
            ['warning', '2 odi sin firmar'],
            ['warning', '+2 tipos más (3 documentos)'],
            ['warning', '1 lote que el portador no confirmó'],
            ['critical', '2 lotes demasiado tiempo en terreno'],
        ]);
        expect(filas.every(f => f.ruta === '/consultas?tab=fisicos')).toBe(true);
    });

    it('validarUmbrales: enteros ≥ 0 y crítico ≥ aviso', () => {
        expect(validarUmbrales(3, 10)).toBeNull();
        expect(validarUmbrales(5, 5)).toBeNull();
        expect(validarUmbrales(7, 3)).toMatch(/Crítico \(3\) no puede ser menor que aviso \(7\)/);
        expect(validarUmbrales(-1, 3)).toMatch(/aviso/);
        expect(validarUmbrales('2', 'x')).toMatch(/crítico/);
        expect(validarUmbrales(1.5, 3)).toMatch(/aviso/);
    });

    it('agruparPorEtapa: en terreno primero, peor (más días) arriba, etapas vacías fuera', () => {
        const item = (id: number, etapa: AlertaDocumentoItem['etapa'], dias: number): AlertaDocumentoItem => ({
            documento_id: id, tipo_codigo: 'CONTRATO', tipo_nombre: 'Contrato', etapa, dias, critical: dias >= 10, dias_aviso: 3, dias_critico: 10,
            trabajador: { id: 5, nombre: 'Pérez Juan', rut: null }, obra_nombre: null, lote_id: null, portador_nombre: null,
        });
        const g = agruparPorEtapa([item(1, 'por_retirar', 4), item(2, 'en_terreno', 3), item(3, 'por_retirar', 12), item(4, 'sin_imprimir', 5)]);
        expect(g.map(x => [x.etapa, x.items.map(i => i.documento_id)])).toEqual([
            ['en_terreno', [2]], ['por_retirar', [3, 1]], ['sin_imprimir', [4]],
        ]);
        expect(esCategoriaLote('LOTE_EN_TERRENO')).toBe(true);
        expect(esCategoriaLote('CONTRATO')).toBe(false);
    });
});
