import React, { useState, useEffect, useCallback } from 'react';
import { Truck, Plus, Shield, Wrench, ClipboardList, AlertTriangle, Trash2, Edit2, X, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../utils/cn';
import { useAuth } from '../context/AuthContext';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { VehiculoForm } from '../components/vehiculos/VehiculoForm';
import { SeguroForm } from '../components/vehiculos/SeguroForm';
import { RevisionForm } from '../components/vehiculos/RevisionForm';
import { MantencionForm } from '../components/vehiculos/MantencionForm';
import api from '../services/api';
import type { Vehiculo, VehiculoSeguro, VehiculoRevision, VehiculoMantencion } from '../types/entities';

// ── Helpers ──────────────────────────────────────────────────────────────────

function diasHasta(fecha: string | null | undefined): number | null {
    if (!fecha) return null;
    const d = new Date(fecha + 'T12:00:00');
    return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function EstadoVencimiento({ fecha, label }: { fecha?: string | null; label: string }) {
    const dias = diasHasta(fecha);
    if (dias === null) return <span className="text-xs text-muted-foreground">Sin {label}</span>;
    if (dias < 0)  return <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300">VENCIDO ({Math.abs(dias)}d)</span>;
    if (dias <= 30) return <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300">Vence en {dias}d</span>;
    return <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-green-100 text-green-700 border border-green-200 dark:bg-green-950/40 dark:text-green-300">Vigente</span>;
}

function fmtDate(s?: string | null) {
    if (!s) return '—';
    return String(s).split('T')[0].split('-').reverse().join('/');
}
function fmtMoney(n?: number | null) {
    if (n === null || n === undefined) return '—';
    return `$${Number(n).toLocaleString('es-CL')}`;
}

// ── Componente principal ──────────────────────────────────────────────────────

type TabKey = 'vehiculos' | 'seguros' | 'revisiones' | 'mantenciones';

const VehiculosPage: React.FC = () => {
    const { hasPermission } = useAuth();
    useSetPageHeader(
        <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-brand-primary" />
            <span className="font-bold">Vehículos</span>
        </div>
    );

    const [activeTab, setActiveTab] = useState<TabKey>('vehiculos');
    const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Vehiculo | null>(null);

    // Datos del panel detalle
    const [seguros, setSeguros] = useState<VehiculoSeguro[]>([]);
    const [revisiones, setRevisiones] = useState<VehiculoRevision[]>([]);
    const [mantenciones, setMantenciones] = useState<VehiculoMantencion[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);

    // Modales
    const [modalVehiculo, setModalVehiculo] = useState(false);
    const [editVehiculo, setEditVehiculo] = useState<Vehiculo | null>(null);
    const [modalSeguro, setModalSeguro] = useState(false);
    const [modalRevision, setModalRevision] = useState(false);
    const [modalMantencion, setModalMantencion] = useState(false);

    // ── Fetch ────────────────────────────────────────────────────────────────

    const fetchVehiculos = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<{ data: Vehiculo[] }>('/vehiculos');
            setVehiculos(res.data.data || []);
        } catch { toast.error('Error al cargar vehículos'); }
        finally { setLoading(false); }
    }, []);

    const fetchDetail = useCallback(async (vId: number) => {
        setDetailLoading(true);
        try {
            const [s, r, m] = await Promise.all([
                api.get<{ data: VehiculoSeguro[] }>(`/vehiculos/${vId}/seguros`),
                api.get<{ data: VehiculoRevision[] }>(`/vehiculos/${vId}/revisiones`),
                api.get<{ data: VehiculoMantencion[] }>(`/vehiculos/${vId}/mantenciones`),
            ]);
            setSeguros(s.data.data || []);
            setRevisiones(r.data.data || []);
            setMantenciones(m.data.data || []);
        } catch { /* silencioso */ }
        finally { setDetailLoading(false); }
    }, []);

    useEffect(() => { fetchVehiculos(); }, [fetchVehiculos]);
    useEffect(() => { if (selected) fetchDetail(selected.id); }, [selected, fetchDetail]);

    // ── Eliminar ─────────────────────────────────────────────────────────────

    const handleDelete = async (v: Vehiculo) => {
        if (!confirm(`¿Dar de baja el vehículo ${v.patente}?`)) return;
        try {
            await api.delete(`/vehiculos/${v.id}`);
            toast.success('Vehículo dado de baja');
            if (selected?.id === v.id) setSelected(null);
            fetchVehiculos();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al eliminar');
        }
    };

    const removeSeguro = async (id: number) => {
        if (!selected) return;
        await api.delete(`/vehiculos/${selected.id}/seguros/${id}`);
        fetchDetail(selected.id);
        toast.success('Seguro eliminado');
    };
    const removeRevision = async (id: number) => {
        if (!selected) return;
        await api.delete(`/vehiculos/${selected.id}/revisiones/${id}`);
        fetchDetail(selected.id);
        toast.success('Revisión eliminada');
    };
    const removeMantencion = async (id: number) => {
        if (!selected) return;
        await api.delete(`/vehiculos/${selected.id}/mantenciones/${id}`);
        fetchDetail(selected.id);
        toast.success('Mantención eliminada');
    };

    // ── Tabs ─────────────────────────────────────────────────────────────────

    const tabs = [
        { key: 'vehiculos'    as TabKey, label: 'Vehículos',  icon: Truck },
        { key: 'seguros'      as TabKey, label: 'Seguros',    icon: Shield },
        { key: 'revisiones'   as TabKey, label: 'Revisiones', icon: ClipboardList },
        { key: 'mantenciones' as TabKey, label: 'Mantenciones', icon: Wrench },
    ];

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col flex-1 min-h-0 gap-4">
            {/* Tab bar */}
            <div className="sticky top-0 z-30 -mx-3 md:-mx-5 px-3 md:px-5 py-2 bg-background shrink-0">
                <div className="flex items-center gap-1 p-1.5 bg-card/95 backdrop-blur-xl rounded-2xl border border-border overflow-x-auto scrollbar-none shadow-sm">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                title={tab.label}
                                className={cn(
                                    'flex flex-col items-center justify-center gap-1.5 rounded-xl py-2.5 px-2 flex-1 min-w-0 transition-all',
                                    activeTab === tab.key
                                        ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/25'
                                        : 'text-muted-foreground hover:bg-background hover:text-brand-dark'
                                )}>
                                <Icon className="h-5 w-5 shrink-0" />
                                <span className="text-[10px] font-black uppercase tracking-tight leading-none">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Content */}
            <div className="flex flex-1 min-h-0 gap-4">

                {/* ── Lista de vehículos (siempre visible en la pestaña vehiculos) ── */}
                <div className={cn(
                    "flex flex-col min-h-0 flex-1 bg-card border border-border rounded-3xl shadow-sm p-4 md:p-6",
                    activeTab !== 'vehiculos' && 'hidden md:flex'
                )}>
                    <div className="flex items-center justify-between shrink-0 mb-4">
                        <h3 className="text-sm font-bold text-brand-dark flex items-center gap-2">
                            <Truck className="h-4 w-4 text-brand-primary" />
                            Flota de Vehículos
                        </h3>
                        {hasPermission('vehiculos.crear') && (
                            <Button size="sm" onClick={() => { setEditVehiculo(null); setModalVehiculo(true); }}
                                leftIcon={<Plus className="h-3.5 w-3.5" />}>
                                Nuevo vehículo
                            </Button>
                        )}
                    </div>

                    {loading ? (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Cargando...</div>
                    ) : vehiculos.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                            <Truck className="h-10 w-10 opacity-20" />
                            <p className="text-sm font-semibold">Sin vehículos registrados</p>
                            <p className="text-xs">Haz clic en "Nuevo vehículo" para comenzar</p>
                        </div>
                    ) : (
                        <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                            {vehiculos.map(v => (
                                <div key={v.id}
                                    onClick={() => setSelected(selected?.id === v.id ? null : v)}
                                    className={cn(
                                        'px-4 py-3 rounded-2xl border cursor-pointer transition-all',
                                        selected?.id === v.id
                                            ? 'border-brand-primary bg-brand-primary/5 shadow-sm'
                                            : 'border-border hover:border-brand-primary/40 hover:bg-brand-primary/[0.02]'
                                    )}>
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-black text-brand-dark text-sm">{v.patente}</span>
                                                <span className="text-xs text-muted-foreground">{v.marca} {v.modelo} {v.anio}</span>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-semibold capitalize">{v.tipo}</span>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                                <EstadoVencimiento fecha={v.seguro_vencimiento} label="seguro" />
                                                <EstadoVencimiento fecha={v.revision_tecnica_vencimiento} label="revisión" />
                                                <span className="text-[10px] text-muted-foreground">{(v.kilometraje_actual || 0).toLocaleString('es-CL')} km</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            {hasPermission('vehiculos.editar') && (
                                                <button onClick={e => { e.stopPropagation(); setEditVehiculo(v); setModalVehiculo(true); }}
                                                    className="p-1.5 rounded-lg hover:bg-brand-primary/10 text-muted-foreground hover:text-brand-primary transition-colors">
                                                    <Edit2 className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                            {hasPermission('vehiculos.eliminar') && (
                                                <button onClick={e => { e.stopPropagation(); handleDelete(v); }}
                                                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                            <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", selected?.id === v.id && "rotate-90")} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Panel detalle ── */}
                {selected && (
                    <div className="flex flex-col min-h-0 md:w-[420px] lg:w-[480px] md:shrink-0 bg-card border border-border rounded-3xl shadow-sm p-4 md:p-6">
                        <div className="flex items-center justify-between mb-4 shrink-0">
                            <div>
                                <p className="text-[10px] uppercase font-black text-brand-dark/40 tracking-widest">Detalle</p>
                                <h4 className="text-base font-black text-brand-dark">{selected.patente} — {selected.marca} {selected.modelo}</h4>
                            </div>
                            <button onClick={() => setSelected(null)} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {detailLoading ? (
                            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Cargando...</div>
                        ) : (
                            <div className="flex-1 min-h-0 overflow-y-auto space-y-6">

                                {/* Seguros */}
                                <section>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-black text-brand-dark/50 uppercase tracking-widest flex items-center gap-1.5">
                                            <Shield className="h-3.5 w-3.5" /> Seguros
                                        </span>
                                        {hasPermission('vehiculos.crear') && (
                                            <button onClick={() => setModalSeguro(true)}
                                                className="text-[10px] font-bold text-brand-primary hover:underline flex items-center gap-1">
                                                <Plus className="h-3 w-3" /> Agregar
                                            </button>
                                        )}
                                    </div>
                                    {seguros.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">Sin seguros registrados</p>
                                    ) : seguros.map(s => (
                                        <div key={s.id} className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-muted/40 border border-border mb-1.5">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-xs font-bold text-brand-dark">{s.tipo}</span>
                                                    {s.compania && <span className="text-[10px] text-muted-foreground">{s.compania}</span>}
                                                    <EstadoVencimiento fecha={s.fecha_vencimiento} label="seguro" />
                                                </div>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                                    {fmtDate(s.fecha_inicio)} → {fmtDate(s.fecha_vencimiento)}
                                                    {s.numero_poliza && ` · Pól. ${s.numero_poliza}`}
                                                    {s.monto && ` · ${fmtMoney(s.monto)}`}
                                                </p>
                                            </div>
                                            {hasPermission('vehiculos.eliminar') && (
                                                <button onClick={() => removeSeguro(s.id)}
                                                    className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </section>

                                {/* Revisiones */}
                                <section>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-black text-brand-dark/50 uppercase tracking-widest flex items-center gap-1.5">
                                            <ClipboardList className="h-3.5 w-3.5" /> Revisiones Técnicas
                                        </span>
                                        {hasPermission('vehiculos.crear') && (
                                            <button onClick={() => setModalRevision(true)}
                                                className="text-[10px] font-bold text-brand-primary hover:underline flex items-center gap-1">
                                                <Plus className="h-3 w-3" /> Agregar
                                            </button>
                                        )}
                                    </div>
                                    {revisiones.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">Sin revisiones registradas</p>
                                    ) : revisiones.map(r => (
                                        <div key={r.id} className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-muted/40 border border-border mb-1.5">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-xs font-bold text-brand-dark capitalize">{r.tipo}</span>
                                                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md",
                                                        r.resultado === 'aprobado' ? 'bg-green-100 text-green-700' :
                                                        r.resultado === 'rechazado' ? 'bg-red-100 text-red-700' :
                                                        'bg-amber-100 text-amber-700'
                                                    )}>{r.resultado}</span>
                                                    <EstadoVencimiento fecha={r.fecha_vencimiento} label="revisión" />
                                                </div>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                                    {fmtDate(r.fecha)} → {fmtDate(r.fecha_vencimiento)}
                                                    {r.planta && ` · ${r.planta}`}
                                                </p>
                                            </div>
                                            {hasPermission('vehiculos.eliminar') && (
                                                <button onClick={() => removeRevision(r.id)}
                                                    className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </section>

                                {/* Mantenciones */}
                                <section>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-black text-brand-dark/50 uppercase tracking-widest flex items-center gap-1.5">
                                            <Wrench className="h-3.5 w-3.5" /> Mantenciones
                                        </span>
                                        {hasPermission('vehiculos.crear') && (
                                            <button onClick={() => setModalMantencion(true)}
                                                className="text-[10px] font-bold text-brand-primary hover:underline flex items-center gap-1">
                                                <Plus className="h-3 w-3" /> Agregar
                                            </button>
                                        )}
                                    </div>
                                    {mantenciones.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">Sin mantenciones registradas</p>
                                    ) : mantenciones.map(m => (
                                        <div key={m.id} className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-muted/40 border border-border mb-1.5">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-brand-dark">{m.tipo}</span>
                                                    <span className="text-[10px] text-muted-foreground">{(m.km_al_realizar).toLocaleString('es-CL')} km</span>
                                                </div>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                                    {fmtDate(m.fecha)}
                                                    {m.taller && ` · ${m.taller}`}
                                                    {m.costo && ` · ${fmtMoney(m.costo)}`}
                                                </p>
                                                {m.descripcion && <p className="text-[10px] text-muted-foreground/70 mt-0.5 italic">{m.descripcion}</p>}
                                            </div>
                                            {hasPermission('vehiculos.eliminar') && (
                                                <button onClick={() => removeMantencion(m.id)}
                                                    className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </section>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Pestañas consolidadas (seguros / revisiones / mantenciones) ── */}
                {activeTab !== 'vehiculos' && (
                    <div className="flex flex-col flex-1 min-h-0 bg-card border border-border rounded-3xl shadow-sm p-4 md:p-6">
                        <ConsolidatedTab tab={activeTab} vehiculos={vehiculos} />
                    </div>
                )}
            </div>

            {/* ── Modales ── */}
            <Modal isOpen={modalVehiculo} onClose={() => setModalVehiculo(false)}
                title={editVehiculo ? 'Editar Vehículo' : 'Nuevo Vehículo'} size="lg">
                <VehiculoForm initialData={editVehiculo} onCancel={() => setModalVehiculo(false)}
                    onSuccess={() => { setModalVehiculo(false); fetchVehiculos(); }} />
            </Modal>

            {selected && (
                <>
                    <Modal isOpen={modalSeguro} onClose={() => setModalSeguro(false)} title="Agregar Seguro" size="md">
                        <SeguroForm vehiculoId={selected.id} onCancel={() => setModalSeguro(false)}
                            onSuccess={() => { setModalSeguro(false); fetchDetail(selected.id); fetchVehiculos(); }} />
                    </Modal>
                    <Modal isOpen={modalRevision} onClose={() => setModalRevision(false)} title="Agregar Revisión Técnica" size="md">
                        <RevisionForm vehiculoId={selected.id} onCancel={() => setModalRevision(false)}
                            onSuccess={() => { setModalRevision(false); fetchDetail(selected.id); fetchVehiculos(); }} />
                    </Modal>
                    <Modal isOpen={modalMantencion} onClose={() => setModalMantencion(false)} title="Registrar Mantención" size="md">
                        <MantencionForm vehiculoId={selected.id} kmActual={selected.kilometraje_actual}
                            onCancel={() => setModalMantencion(false)}
                            onSuccess={() => { setModalMantencion(false); fetchDetail(selected.id); }} />
                    </Modal>
                </>
            )}
        </div>
    );
};

// ── Vista consolidada ─────────────────────────────────────────────────────────

const ConsolidatedTab: React.FC<{ tab: TabKey; vehiculos: Vehiculo[] }> = ({ tab, vehiculos }) => {
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (tab === 'vehiculos') return;
        setLoading(true);
        const endpoint = tab === 'seguros' ? 'seguros' : tab === 'revisiones' ? 'revisiones' : 'mantenciones';
        Promise.all(
            vehiculos.map(v =>
                api.get<{ data: any[] }>(`/vehiculos/${v.id}/${endpoint}`)
                    .then(r => r.data.data.map((item: any) => ({ ...item, vehiculo: v })))
                    .catch(() => [])
            )
        ).then(all => {
            const flat = all.flat().sort((a, b) => {
                const fa = a.fecha_vencimiento || a.fecha || '';
                const fb = b.fecha_vencimiento || b.fecha || '';
                return fa.localeCompare(fb);
            });
            setRows(flat);
        }).finally(() => setLoading(false));
    }, [tab, vehiculos]);

    if (loading) return <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Cargando...</div>;
    if (rows.length === 0) return (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <AlertTriangle className="h-8 w-8 opacity-20" />
            <p className="text-sm font-semibold">Sin registros</p>
        </div>
    );

    return (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
            {rows.map((row, i) => (
                <div key={i} className="flex items-start justify-between gap-3 p-3 rounded-xl border border-border bg-muted/30">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-black text-brand-dark">{row.vehiculo?.patente}</span>
                            <span className="text-[10px] text-muted-foreground">{row.vehiculo?.marca} {row.vehiculo?.modelo}</span>
                            {tab === 'seguros' && <><span className="text-xs font-bold text-brand-dark">{row.tipo}</span>{row.compania && <span className="text-[10px] text-muted-foreground">{row.compania}</span>}</>}
                            {tab === 'revisiones' && <><span className="text-xs font-bold text-brand-dark capitalize">{row.tipo}</span><span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md", row.resultado === 'aprobado' ? 'bg-green-100 text-green-700' : row.resultado === 'rechazado' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>{row.resultado}</span></>}
                            {tab === 'mantenciones' && <><span className="text-xs font-bold text-brand-dark">{row.tipo}</span><span className="text-[10px] text-muted-foreground">{(row.km_al_realizar || 0).toLocaleString('es-CL')} km</span></>}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            {tab !== 'mantenciones' ? `${fmtDate(row.fecha_inicio || row.fecha)} → ${fmtDate(row.fecha_vencimiento)}` : fmtDate(row.fecha)}
                            {tab === 'seguros' && row.monto ? ` · ${fmtMoney(row.monto)}` : ''}
                        </p>
                    </div>
                    {tab !== 'mantenciones' && <EstadoVencimiento fecha={row.fecha_vencimiento} label="" />}
                </div>
            ))}
        </div>
    );
};

export default VehiculosPage;
