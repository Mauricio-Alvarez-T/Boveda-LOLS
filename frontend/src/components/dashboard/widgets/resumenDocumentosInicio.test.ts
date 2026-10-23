import { resumenDocumentosInicio } from './resumenDocumentosInicio';
import type { AlertasDocumentos } from '../../documentos-fisicos/documentosAlertas';

const conteo = (total = 0, criticos = 0) => ({ total, criticos });

function alertas(parcial: Partial<AlertasDocumentos> = {}): AlertasDocumentos {
    return {
        total: 0,
        criticos: 0,
        por_tipo: [],
        por_etapa: { sin_imprimir: conteo(), por_retirar: conteo(), por_confirmar: conteo(), en_terreno: conteo() },
        lotes: { sin_confirmar: { ...conteo(), items: [] }, en_terreno: { ...conteo(), items: [] } },
        items: [],
        ...parcial,
    };
}

describe('resumenDocumentosInicio', () => {
    test('caso de la captura: 41 fuera de plazo, 12 críticos, etapas en orden del flujo', () => {
        const r = resumenDocumentosInicio(
            alertas({
                total: 41,
                criticos: 12,
                por_etapa: { sin_imprimir: conteo(1, 0), por_retirar: conteo(40, 12), por_confirmar: conteo(), en_terreno: conteo() },
            }),
            { por_confirmar: 0, en_terreno: 1, alcance: 'todos' },
            57,
        );
        expect(r).toMatchObject({ tono: 'rojo', fueraDePlazo: 41, criticos: 12, impresosSinAsignar: 57, lotesEnOficina: 0, lotesEnTerreno: 1 });
        expect(r.etapas).toEqual([
            { clave: 'sin_imprimir', texto: 'Sin imprimir', total: 1, critico: false, paso: 'sin_imprimir' },
            { clave: 'por_retirar', texto: 'Impreso, sin portador', total: 40, critico: true, paso: 'impresos' },
        ]);
    });

    test('lotes atascados suman a críticos y salen como una etapa más', () => {
        const r = resumenDocumentosInicio(
            alertas({
                lotes: { sin_confirmar: { ...conteo(1, 0), items: [] }, en_terreno: { ...conteo(2, 1), items: [] } },
            }),
            null,
            null,
        );
        expect(r.tono).toBe('rojo');
        expect(r.criticos).toBe(1);
        // El crítico está en terreno (el de oficina solo avisa): la píldora abre «En terreno».
        expect(r.etapas).toEqual([{ clave: 'lotes', texto: 'Lotes atascados', total: 3, critico: true, paso: 'en_terreno' }]);
    });

    test('cada etapa abre su paso del flujo', () => {
        const r = resumenDocumentosInicio(
            alertas({ por_etapa: { sin_imprimir: conteo(), por_retirar: conteo(), por_confirmar: conteo(2, 0), en_terreno: conteo(1, 1) } }),
            null,
            null,
        );
        expect(r.etapas.map(e => [e.clave, e.paso])).toEqual([['por_confirmar', 'en_oficina'], ['en_terreno', 'en_terreno']]);
    });

    test('solo avisos (sin críticos) → ámbar; singular del lote', () => {
        const r = resumenDocumentosInicio(
            alertas({ lotes: { sin_confirmar: { ...conteo(1, 0), items: [] }, en_terreno: { ...conteo(), items: [] } } }),
            null,
            null,
        );
        expect(r.tono).toBe('ambar');
        expect(r.etapas[0]).toMatchObject({ texto: 'Lote atascado', paso: 'en_oficina' });
    });

    test('nada fuera de plazo → verde, sin etapas', () => {
        const r = resumenDocumentosInicio(alertas(), { por_confirmar: 2, en_terreno: 0, alcance: 'todos' }, 0);
        expect(r).toMatchObject({ tono: 'verde', fueraDePlazo: 0, criticos: 0, etapas: [], lotesEnOficina: 2, impresosSinAsignar: 0 });
    });

    test('cargando: todo null y tono neutro, nunca un 0 falso', () => {
        expect(resumenDocumentosInicio(null, null, null)).toEqual({
            tono: 'neutro', fueraDePlazo: null, criticos: 0, etapas: [], impresosSinAsignar: null, lotesEnOficina: null, lotesEnTerreno: null,
        });
    });
});
