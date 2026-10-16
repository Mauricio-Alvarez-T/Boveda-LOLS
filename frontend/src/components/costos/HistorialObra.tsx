import React, { useEffect, useMemo, useState } from 'react';
import { History, Plus, Pencil, Trash2, FileSpreadsheet } from 'lucide-react';
import api from '../../services/api';
import { EmptyState } from '../ui/EmptyState';
import { fmtMoney } from '../../utils/format';
import { fmtFechaHora } from '../../utils/fechas';
import { CATEGORIAS, ESTADOS_PAGO, TIPOS_DOC } from './costosConfig';
import type { CostoHistorial, CostoPartida } from '../../types/entities';

const ICONO = { crear: Plus, editar: Pencil, borrar: Trash2, importar: FileSpreadsheet } as const;

const CAMPO: Record<string, string> = {
    capitulo: 'Capítulo', codigo: 'Ítem', descripcion: 'Descripción', unidad: 'Unidad', cantidad: 'Cantidad',
    precio_unitario: 'Precio unitario', origen: 'Origen', motivo: 'Motivo',
    gg_pct: 'Gastos generales %', imprevistos_pct: 'Imprevistos %', utilidad_pct: 'Utilidad %', iva_pct: 'IVA %', observacion: 'Observación',
    fecha: 'Fecha', tipo_documento: 'Documento', proveedor: 'Proveedor', folio: 'Folio', monto_total: 'Total', monto_neto: 'Neto', iva: 'IVA',
    categoria: 'Categoría', partida_id: 'Partida', estado_pago: 'Pago', fecha_vencimiento: 'Vencimiento', fecha_pago: 'Fecha de pago',
};

const DINERO = new Set(['precio_unitario', 'monto_total', 'monto_neto', 'iva']);

function valor(campo: string, v: unknown, partidas: Map<number, string>): string {
    if (v === null || v === undefined || v === '') return '(vacío)';
    if (DINERO.has(campo)) return fmtMoney(v as number) || String(v);
    if (campo === 'categoria') return CATEGORIAS[v as keyof typeof CATEGORIAS] || String(v);
    if (campo === 'tipo_documento') return TIPOS_DOC[v as keyof typeof TIPOS_DOC] || String(v);
    if (campo === 'estado_pago') return ESTADOS_PAGO[v as keyof typeof ESTADOS_PAGO] || String(v);
    if (campo === 'partida_id') return partidas.get(Number(v)) || `partida #${v} (ya no existe)`;
    if (campo === 'origen') return v === 'modificacion' ? 'Modificación' : 'Original';
    return String(v).slice(0, 120);
}

/**
 * Quién cambió qué y cuándo. Las ediciones muestran el antes → después de cada
 * campo: lo que hoy se pierde al llevarlo de memoria o en un Excel sin historial.
 */
export const HistorialObra: React.FC<{ obraId: number; version: number; partidas: CostoPartida[] }> = ({ obraId, version, partidas }) => {
    const nombres = useMemo(() => new Map(partidas.map(p => [p.id, p.descripcion])), [partidas]);
    const [filas, setFilas] = useState<CostoHistorial[] | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelado = false;
        api.get<{ data: CostoHistorial[] }>(`/costos/obras/${obraId}/historial`)
            .then(res => { if (!cancelado) { setFilas(res.data.data || []); setError(false); } })
            .catch(() => { if (!cancelado) setError(true); });
        return () => { cancelado = true; };
    }, [obraId, version]);

    if (error) return <EmptyState icon={History} title="No se pudo cargar el historial" description="Vuelve a intentarlo en un momento." />;
    if (!filas) return <div className="h-64 animate-pulse rounded-card border border-border bg-card" />;
    if (!filas.length) return <EmptyState icon={History} title="Sin movimientos todavía" description="Cada partida, gasto o cambio de porcentaje queda anotado aquí con quién lo hizo." />;

    return (
        <ol className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
            {filas.map(h => {
                const Icono = ICONO[h.accion] || Pencil;
                const cambios = h.accion === 'editar' && h.detalle
                    ? Object.entries(h.detalle).filter(([, v]) => Array.isArray(v) && v.length === 2) as [string, [unknown, unknown]][]
                    : [];
                return (
                    <li key={h.id} className="flex items-start gap-3 px-4 py-3">
                        <span className={h.accion === 'borrar' ? 'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10' : 'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted'}>
                            <Icono className={h.accion === 'borrar' ? 'h-3.5 w-3.5 text-destructive' : 'h-3.5 w-3.5 text-muted-foreground'} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm text-brand-dark">{h.resumen}</p>
                            <p className="mt-0.5 text-caption text-muted-foreground">{h.usuario_nombre || 'Alguien'} · {fmtFechaHora(h.created_at)}</p>
                            {cambios.length > 0 && (
                                <ul className="mt-1.5 flex flex-col gap-0.5">
                                    {cambios.map(([campo, [antes, despues]]) => (
                                        <li key={campo} className="text-caption text-muted-foreground">
                                            <span className="font-semibold">{CAMPO[campo] || campo}:</span>{' '}
                                            <span className="line-through decoration-muted-foreground/50">{valor(campo, antes, nombres)}</span>{' → '}
                                            <span className="text-brand-dark">{valor(campo, despues, nombres)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
};

export default HistorialObra;
