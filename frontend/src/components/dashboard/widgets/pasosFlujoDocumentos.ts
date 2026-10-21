/**
 * Lógica pura del detalle de Gestiones para RRHH (detalle D del lienzo, dueño 2026-10-21): el flujo de los
 * documentos físicos en 5 pasos —sin imprimir → impreso sin portador → en oficina → en terreno → firmados—,
 * cada uno con su lista. «Fuera de plazo» = las alertas B7 (documentos y lotes en oficina) y, en terreno, la
 * tenencia de 4 días hábiles.
 */
import type { AlertasDocumentos } from '../../documentos-fisicos/documentosAlertas';
import { diaCorto, diasDesde, resumenLote, textoTenencia, tonoTenencia, type LoteResumen } from '../../documentos-fisicos/documentosFisicos';

export interface DocFlujo {
    documento_id: number;
    tipo_nombre: string | null;
    trabajador_id: number | null;
    trabajador_nombre: string | null;
    rut: string | null;
    obra_nombre: string | null;
    dias: number;
    firmado_el?: string | null;
}

export interface FlujoRespuesta {
    hoy: string;
    desde_firmados: string;
    sin_imprimir: { n: number; items: DocFlujo[] };
    impresos: { n: number; items: DocFlujo[] };
    en_oficina: LoteResumen[];
    en_terreno: LoteResumen[];
    firmados: { n: number; items: DocFlujo[] };
}

export type TonoFila = 'normal' | 'aviso' | 'critico' | 'listo';
export interface FilaFlujo { key: string; titulo: string; sub: string; quien: string; dias: string; tono: TonoFila }
export interface PasoFlujo {
    key: 'sin_imprimir' | 'impresos' | 'en_oficina' | 'en_terreno' | 'firmados';
    nombre: string;
    unidad: string;
    n: number;
    fuera: number;
    listo: boolean;
    accion: string;
    filas: FilaFlujo[];
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
export const diasTexto = (n: number) => (n <= 0 ? 'hoy' : `${n} ${plural(n, 'día', 'días')}`);

const persona = (d: DocFlujo) => [d.trabajador_nombre || '(sin trabajador)', d.obra_nombre].filter(Boolean).join(' · ');

export function pasosFlujo(f: FlujoRespuesta, alertas: AlertasDocumentos | null, hoy: Date = new Date()): PasoFlujo[] {
    const alertaDoc = new Map((alertas?.items ?? []).map(i => [i.documento_id, i.critical]));
    const alertaOficina = new Map((alertas?.lotes.sin_confirmar.items ?? []).map(i => [i.lote_id, i.critical]));
    const tonoDoc = (id: number): TonoFila => {
        const c = alertaDoc.get(id);
        return c === undefined ? 'normal' : c ? 'critico' : 'aviso';
    };
    const fuera = (filas: FilaFlujo[]) => filas.filter(x => x.tono === 'aviso' || x.tono === 'critico').length;

    const sin = f.sin_imprimir.items.map(d => ({ key: `d${d.documento_id}`, titulo: d.tipo_nombre || 'Documento', sub: persona(d), quien: 'RRHH', dias: diasTexto(d.dias), tono: tonoDoc(d.documento_id) }));
    const imp = f.impresos.items.map(d => ({ key: `d${d.documento_id}`, titulo: d.tipo_nombre || 'Documento', sub: persona(d), quien: 'Sin portador', dias: diasTexto(d.dias), tono: tonoDoc(d.documento_id) }));
    const ofi = f.en_oficina.map(l => {
        const c = alertaOficina.get(l.id);
        return {
            key: `l${l.id}`, titulo: `Lote #${l.id} · ${l.total} ${plural(l.total, 'documento', 'documentos')}`,
            sub: l.creado_por_nombre ? `Lo preparó ${l.creado_por_nombre}` : 'Listo para retiro',
            quien: `Para ${l.portador_nombre || '(usuario eliminado)'}`, dias: diasTexto(diasDesde(l.creado_en, hoy)),
            tono: (c === undefined ? 'normal' : c ? 'critico' : 'aviso') as TonoFila,
        };
    });
    const ter = f.en_terreno.map(l => {
        const t = l.tenencia;
        const tono = t ? tonoTenencia(t) : 'ok';
        return {
            key: `l${l.id}`, titulo: `Lote #${l.id} · ${l.total} ${plural(l.total, 'documento', 'documentos')}`, sub: resumenLote(l),
            quien: `Con ${l.portador_nombre || '(usuario eliminado)'}`, dias: t ? textoTenencia(t).cifra : diasTexto(diasDesde(l.retirado_en, hoy)),
            tono: (tono === 'atrasado' ? 'critico' : tono === 'ultimo' ? 'aviso' : 'normal') as TonoFila,
        };
    });
    const fir = f.firmados.items.map(d => ({
        key: `d${d.documento_id}`, titulo: `${d.tipo_nombre || 'Documento'} · ${d.trabajador_nombre || '(sin trabajador)'}`,
        sub: d.obra_nombre || '', quien: 'Volvió firmado', dias: d.firmado_el ? diaCorto(d.firmado_el) : '', tono: 'listo' as TonoFila,
    }));

    return [
        { key: 'sin_imprimir', nombre: 'Sin imprimir', unidad: plural(f.sin_imprimir.n, 'documento', 'documentos'), n: f.sin_imprimir.n, fuera: fuera(sin), listo: false, accion: 'Se imprimen desde la ficha del trabajador', filas: sin },
        { key: 'impresos', nombre: 'Impreso, sin portador', unidad: plural(f.impresos.n, 'documento', 'documentos'), n: f.impresos.n, fuera: fuera(imp), listo: false, accion: 'Hay que prepararles un lote a un portador', filas: imp },
        { key: 'en_oficina', nombre: 'En oficina, esperando retiro', unidad: plural(ofi.length, 'lote', 'lotes'), n: ofi.length, fuera: fuera(ofi), listo: false, accion: 'El portador aún no pasa a buscarlos', filas: ofi },
        { key: 'en_terreno', nombre: 'En terreno', unidad: plural(ter.length, 'lote', 'lotes'), n: ter.length, fuera: ter.filter(x => x.tono === 'critico').length, listo: false, accion: 'Esperando que vuelvan firmados · máximo 4 días hábiles', filas: ter },
        { key: 'firmados', nombre: 'Firmados esta semana', unidad: plural(f.firmados.n, 'documento', 'documentos'), n: f.firmados.n, fuera: 0, listo: true, accion: 'Volvieron firmados y quedaron en la ficha', filas: fir },
    ];
}

/** Paso que se abre primero: el primero con algo fuera de plazo; si no, el primero con algo pendiente. */
export function pasoInicial(pasos: PasoFlujo[]): number {
    const conFuera = pasos.findIndex(p => p.fuera > 0);
    if (conFuera >= 0) return conFuera;
    const conAlgo = pasos.findIndex(p => !p.listo && p.n > 0);
    return conAlgo >= 0 ? conAlgo : 0;
}

/** Línea de estado bajo la cifra del paso. */
export const estadoPaso = (p: PasoFlujo) => (p.listo ? 'cerrados' : p.fuera > 0 ? `${p.fuera} fuera de plazo` : p.n > 0 ? 'en plazo' : 'nada pendiente');
