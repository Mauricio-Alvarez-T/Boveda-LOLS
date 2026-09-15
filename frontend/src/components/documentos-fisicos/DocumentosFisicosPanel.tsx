/**
 * Pestaña "Documentos físicos" de Gestiones (plan Gestiones B6): lotes de documentos impresos en custodia.
 * RRHH (documentos.entrega.registrar) ve todos los lotes y arma lotes nuevos; el portador
 * (documentos.entrega.portar) ve solo los suyos y confirma el retiro desde el detalle. Ocupa el lugar de
 * la grilla de Consultas cuando `?tab=fisicos`, como SolicitudesIngresoPanel.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Truck, PackageOpen, RefreshCw, ChevronRight, PackageCheck } from 'lucide-react';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLotesPendientes } from '../../hooks/useLotesPendientes';
import { showApiError } from '../../utils/toastUtils';
import { fmtFechaHora } from '../../utils/fechas';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { NuevoLoteModal } from './NuevoLoteModal';
import { LoteDetalleModal } from './LoteDetalleModal';
import { AlertasDocumentosStrip } from './AlertasDocumentosStrip';
import { useDocumentosAlertas } from '../../hooks/useDocumentosAlertas';
import { LOTE_ESTADO_LABEL, resumenLote, diasDesde, accionesLote, type LoteEstado, type LoteResumen } from './documentosFisicos';

type Filtro = LoteEstado | 'todos';
const FILTROS: { value: Filtro; label: string }[] = [
    { value: 'pendiente_retiro', label: 'Por confirmar' },
    { value: 'en_terreno', label: 'En terreno' },
    { value: 'cerrado', label: 'Cerrados' },
    { value: 'todos', label: 'Todos' },
];
const toneLote: Record<LoteEstado, 'warning' | 'info' | 'neutral'> = { pendiente_retiro: 'warning', en_terreno: 'info', cerrado: 'neutral' };

export const DocumentosFisicosPanel: React.FC = () => {
    const { user, hasPermission } = useAuth();
    const puedeRegistrar = hasPermission('documentos.entrega.registrar');
    const puedePortar = hasPermission('documentos.entrega.portar');
    const { refetch: refetchPendientes } = useLotesPendientes();
    const { refetch: refetchAlertas } = useDocumentosAlertas();

    const [filtro, setFiltro] = useState<Filtro>('todos');
    const [lotes, setLotes] = useState<LoteResumen[]>([]);
    const [loading, setLoading] = useState(true);
    const [nuevo, setNuevo] = useState(false);
    const [abierto, setAbierto] = useState<number | null>(null);
    const seq = useRef(0);

    const cargar = useCallback(async (silencioso = false) => {
        const mio = ++seq.current;
        if (!silencioso) setLoading(true);
        try {
            const res = await api.get<{ data: LoteResumen[] }>('/documentos-lotes', { params: filtro === 'todos' ? {} : { estado: filtro } });
            if (mio !== seq.current) return;
            setLotes(res.data.data || []);
        } catch (err) {
            if (mio !== seq.current) return;
            showApiError(err, 'No se pudieron cargar los lotes');
        } finally {
            if (mio === seq.current) setLoading(false);
        }
    }, [filtro]);

    useEffect(() => { cargar(); }, [cargar]);

    const cambio = () => { cargar(true); refetchPendientes(); refetchAlertas(); };
    const cerrarDetalle = useCallback(() => setAbierto(null), []);
    const quien = { id: user?.id, puedeRegistrar, puedePortar };

    return (
        <div className="flex-1 min-h-0 flex flex-col bg-card border border-border rounded-3xl shadow-[var(--shadow-md)] overflow-hidden relative">
            <div className="min-h-[60px] border-b border-border bg-card/50 px-3 py-2 flex flex-wrap items-center justify-between shrink-0 gap-2">
                <div className="hidden sm:flex items-center gap-2 bg-muted text-muted-foreground px-3 py-1.5 rounded-xl">
                    <Truck className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-widest">Documentos físicos</span>
                </div>
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none w-full sm:w-auto">
                    {FILTROS.map(f => (
                        <Button key={f.value} size="sm" variant={filtro === f.value ? 'primary' : 'ghost'} onClick={() => setFiltro(f.value)} aria-pressed={filtro === f.value}
                            className={cn('shrink-0 text-xs font-semibold', filtro !== f.value && 'text-muted-foreground')}>
                            {f.label}
                        </Button>
                    ))}
                    <IconButton variant="ghost" aria-label="Recargar" title="Recargar" onClick={() => cargar()} icon={<RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />} />
                    {puedeRegistrar && (
                        <Button size="sm" leftIcon={<PackageOpen className="h-4 w-4" />} onClick={() => setNuevo(true)} className="shrink-0">Nuevo lote</Button>
                    )}
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-3">
                {/* B7: documentos y lotes que superaron su umbral (solo RRHH; el hook devuelve null sin permiso). */}
                {puedeRegistrar && <AlertasDocumentosStrip onAbrirLote={setAbierto} />}
                {loading && lotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">Cargando lotes…</p>
                ) : lotes.length === 0 ? (
                    <EmptyState icon={Truck}
                        title={filtro === 'todos' ? 'Sin lotes de documentos' : `Sin lotes ${FILTROS.find(f => f.value === filtro)?.label.toLowerCase() ?? ''}`}
                        description={puedeRegistrar
                            ? 'Imprime los documentos desde la ficha del trabajador y arma un lote para quien los lleve a firmar.'
                            : 'Cuando RRHH te entregue documentos impresos, aparecerán aquí para que confirmes el retiro.'}
                        action={puedeRegistrar ? <Button size="sm" leftIcon={<PackageOpen className="h-4 w-4" />} onClick={() => setNuevo(true)}>Nuevo lote</Button> : undefined} />
                ) : (
                    <ul className="space-y-2">
                        {lotes.map(l => {
                            const acc = accionesLote(l, quien);
                            const dias = diasDesde(l.retirado_en ?? l.creado_en);
                            return (
                                <li key={l.id}>
                                    {/* eslint-disable-next-line no-restricted-syntax -- fila-card completa clickeable (patrón de SolicitudesIngresoPanel) */}
                                    <button type="button" onClick={() => setAbierto(l.id)}
                                        className={cn('w-full text-left rounded-2xl border px-4 py-3 transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                                            acc.confirmarRetiro ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-500/5' : 'border-border')}>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-bold text-brand-dark">Lote #{l.id}</span>
                                            <Chip tone={toneLote[l.estado]} label={LOTE_ESTADO_LABEL[l.estado]} />
                                            <span className="text-sm text-brand-dark">{l.portador_nombre || '(usuario eliminado)'}</span>
                                            <span className="ml-auto text-xs text-muted-foreground tabular-nums">{l.total} doc{l.total === 1 ? '' : 's'}</span>
                                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {resumenLote(l)} · creado {fmtFechaHora(l.creado_en)}{l.creado_por_nombre ? ` por ${l.creado_por_nombre}` : ''}
                                            {l.estado === 'en_terreno' ? ` · en terreno hace ${dias} día${dias === 1 ? '' : 's'}` : ''}
                                        </p>
                                        {acc.confirmarRetiro && (
                                            <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                                                <PackageCheck className="h-3.5 w-3.5" /> Confirma que recibiste estos documentos
                                            </p>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div className="h-9 bg-muted border-t border-border flex items-center justify-between px-5 text-label font-bold text-muted-foreground shrink-0 uppercase tracking-widest rounded-b-3xl">
                <span>{lotes.length} {lotes.length === 1 ? 'lote' : 'lotes'}</span>
                <span>{puedeRegistrar ? 'Arma lotes y registra lo que vuelve firmado' : 'Tus lotes de documentos por firmar'}</span>
            </div>

            <NuevoLoteModal isOpen={nuevo} onClose={() => setNuevo(false)} onCreado={cambio} />
            <LoteDetalleModal loteId={abierto} onClose={cerrarDetalle} onCambio={cambio} />
        </div>
    );
};
