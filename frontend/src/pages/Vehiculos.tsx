import React, { useState, useEffect, useCallback } from 'react';
import {
    Truck, Plus, Shield, Wrench, ClipboardList,
    Trash2, Edit2, X, ChevronLeft, Bell, Pencil
} from 'lucide-react';
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
    if (dias === null) return <span className="text-xs text-muted-foreground italic">Sin {label}</span>;
    if (dias < 0)   return <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300">VENCIDO {Math.abs(dias)}d</span>;
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

function AlertaBadge({ diasAlerta, emailAlerta, telAlerta }: { diasAlerta?: number | null; emailAlerta?: string | null; telAlerta?: string | null }) {
    const canales = [emailAlerta && 'Email', telAlerta && 'WhatsApp'].filter(Boolean).join(' + ');
    if (!canales || !diasAlerta) return null;
    return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-primary bg-brand-primary/10 border border-brand-primary/20 px-1.5 py-0.5 rounded-md">
            <Bell className="h-2.5 w-2.5" />
            {diasAlerta}d · {canales}
        </span>
    );
}

// ── Componente principal ──────────────────────────────────────────────────────

const VehiculosPage: React.FC = () => {
    const { hasPermission } = useAuth();
    useSetPageHeader(
        <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-brand-primary" />
            <span className="font-bold">Vehículos</span>
        </div>
    );

    const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
    const [loading, setLoading] = useState(false);
    // En móvil: null = lista, Vehiculo = detalle
    const [selected, setSelected] = useState<Vehiculo | null>(null);

    const [seguros, setSeguros] = useState<VehiculoSeguro[]>([]);
    const [revisiones, setRevisiones] = useState<VehiculoRevision[]>([]);
    const [mantenciones, setMantenciones] = useState<VehiculoMantencion[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);

    const [modalVehiculo, setModalVehiculo] = useState(false);
    const [editVehiculo, setEditVehiculo] = useState<Vehiculo | null>(null);
    const [modalSeguro, setModalSeguro] = useState(false);
    const [editSeguro, setEditSeguro] = useState<VehiculoSeguro | null>(null);
    const [modalRevision, setModalRevision] = useState(false);
    const [editRevision, setEditRevision] = useState<VehiculoRevision | null>(null);
    const [modalMantencion, setModalMantencion] = useState(false);
    const [editMantencion, setEditMantencion] = useState<VehiculoMantencion | null>(null);

    // ── Fetch ─────────────────────────────────────────────────────────────────

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

    const handleDelete = async (v: Vehiculo) => {
        if (!confirm(`¿Dar de baja el vehículo ${v.patente}?`)) return;
        try {
            await api.delete(`/vehiculos/${v.id}`);
            toast.success('Vehículo dado de baja');
            if (selected?.id === v.id) setSelected(null);
            fetchVehiculos();
        } catch (err: any) { toast.error(err.response?.data?.error || 'Error al eliminar'); }
    };

    const removeItem = async (endpoint: string, id: number) => {
        if (!selected) return;
        await api.delete(`/vehiculos/${selected.id}/${endpoint}/${id}`);
        fetchDetail(selected.id);
        toast.success('Eliminado');
    };

    // ── Vista lista ───────────────────────────────────────────────────────────

    const ListView = (
        <div className="flex flex-col flex-1 min-h-0 bg-card border border-border rounded-3xl shadow-sm p-4 md:p-6">
            <div className="flex items-center justify-between shrink-0 mb-4">
                <div className="flex items-center gap-2 bg-brand-primary text-white px-4 py-2.5 rounded-xl shadow-lg shadow-brand-primary/25">
                    <Truck className="h-4 w-4" />
                    <span className="text-xs font-black uppercase tracking-widest">Flota de Vehículos</span>
                    <span className="text-[10px] font-black bg-white/20 px-1.5 py-0.5 rounded-md">{vehiculos.length}</span>
                </div>
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
                <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                        <Truck className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-semibold text-brand-dark">Sin vehículos registrados</p>
                        <p className="text-xs text-muted-foreground mt-1">Haz clic en "Nuevo vehículo" para comenzar</p>
                    </div>
                </div>
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                    {vehiculos.map(v => (
                        <div key={v.id}
                            onClick={() => setSelected(v)}
                            className={cn(
                                'px-4 py-3 rounded-2xl border cursor-pointer transition-all active:scale-[0.99]',
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
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    // ── Vista detalle ─────────────────────────────────────────────────────────

    const DetailView = selected ? (
        <div className="flex flex-col flex-1 min-h-0 bg-card border border-border rounded-3xl shadow-sm p-4 md:p-6 md:w-[460px] md:shrink-0">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4 shrink-0">
                {/* Botón volver - solo en móvil */}
                <button onClick={() => setSelected(null)}
                    className="md:hidden p-2 rounded-xl hover:bg-muted text-muted-foreground">
                    <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Detalle vehículo</p>
                    <h4 className="text-base font-black text-brand-dark truncate">{selected.patente} · {selected.marca} {selected.modelo} {selected.anio}</h4>
                </div>
                <button onClick={() => setSelected(null)}
                    className="hidden md:flex p-1.5 rounded-full hover:bg-muted text-muted-foreground">
                    <X className="h-4 w-4" />
                </button>
            </div>

            {detailLoading ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Cargando...</div>
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto space-y-5">

                    {/* SEGUROS */}
                    <Section
                        icon={<Shield className="h-3.5 w-3.5" />}
                        title="Seguros"
                        onAdd={hasPermission('vehiculos.crear') ? () => setModalSeguro(true) : undefined}
                    >
                        {seguros.length === 0
                            ? <Empty>Sin seguros registrados</Empty>
                            : seguros.map(s => (
                                <ItemRow key={s.id}
                                    onEdit={hasPermission('vehiculos.editar') ? () => { setEditSeguro(s); setModalSeguro(true); } : undefined}
                                    onDelete={hasPermission('vehiculos.eliminar') ? () => removeItem('seguros', s.id) : undefined}>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-bold text-brand-dark">{s.tipo}</span>
                                        {s.compania && <span className="text-[10px] text-muted-foreground">{s.compania}</span>}
                                        <EstadoVencimiento fecha={s.fecha_vencimiento} label="seguro" />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                        {fmtDate(s.fecha_inicio)} → {fmtDate(s.fecha_vencimiento)}
                                        {(s as any).numero_poliza ? ` · Pól. ${(s as any).numero_poliza}` : ''}
                                        {(s as any).monto ? ` · ${fmtMoney((s as any).monto)}` : ''}
                                    </p>
                                    <AlertaBadge diasAlerta={(s as any).dias_alerta} emailAlerta={(s as any).email_alerta} telAlerta={(s as any).tel_alerta} />
                                </ItemRow>
                            ))
                        }
                    </Section>

                    {/* REVISIONES */}
                    <Section
                        icon={<ClipboardList className="h-3.5 w-3.5" />}
                        title="Revisiones Técnicas"
                        onAdd={hasPermission('vehiculos.crear') ? () => setModalRevision(true) : undefined}
                    >
                        {revisiones.length === 0
                            ? <Empty>Sin revisiones registradas</Empty>
                            : revisiones.map(r => (
                                <ItemRow key={r.id}
                                    onEdit={hasPermission('vehiculos.editar') ? () => { setEditRevision(r); setModalRevision(true); } : undefined}
                                    onDelete={hasPermission('vehiculos.eliminar') ? () => removeItem('revisiones', r.id) : undefined}>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-bold text-brand-dark capitalize">{r.tipo}</span>
                                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md",
                                            r.resultado === 'aprobado' ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300' :
                                            r.resultado === 'rechazado' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' :
                                            'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                        )}>{r.resultado}</span>
                                        <EstadoVencimiento fecha={r.fecha_vencimiento} label="revisión" />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                        {fmtDate(r.fecha)} → {fmtDate(r.fecha_vencimiento)}
                                        {r.planta ? ` · ${r.planta}` : ''}
                                    </p>
                                    <AlertaBadge diasAlerta={(r as any).dias_alerta} emailAlerta={(r as any).email_alerta} telAlerta={(r as any).tel_alerta} />
                                </ItemRow>
                            ))
                        }
                    </Section>

                    {/* MANTENCIONES */}
                    <Section
                        icon={<Wrench className="h-3.5 w-3.5" />}
                        title="Mantenciones"
                        onAdd={hasPermission('vehiculos.crear') ? () => setModalMantencion(true) : undefined}
                    >
                        {mantenciones.length === 0
                            ? <Empty>Sin mantenciones registradas</Empty>
                            : mantenciones.map(m => (
                                <ItemRow key={m.id}
                                    onEdit={hasPermission('vehiculos.editar') ? () => { setEditMantencion(m); setModalMantencion(true); } : undefined}
                                    onDelete={hasPermission('vehiculos.eliminar') ? () => removeItem('mantenciones', m.id) : undefined}>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-brand-dark">{m.tipo}</span>
                                        <span className="text-[10px] text-muted-foreground">{(m.km_al_realizar || 0).toLocaleString('es-CL')} km</span>
                                        {(m as any).fecha_proxima && <EstadoVencimiento fecha={(m as any).fecha_proxima} label="próx. mantención" />}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                        {fmtDate(m.fecha)}
                                        {m.taller ? ` · ${m.taller}` : ''}
                                        {m.costo ? ` · ${fmtMoney(m.costo)}` : ''}
                                    </p>
                                    {m.descripcion && <p className="text-[10px] text-muted-foreground/70 italic">{m.descripcion}</p>}
                                    <AlertaBadge diasAlerta={(m as any).dias_alerta} emailAlerta={(m as any).email_alerta} telAlerta={(m as any).tel_alerta} />
                                </ItemRow>
                            ))
                        }
                    </Section>
                </div>
            )}
        </div>
    ) : null;

    // ── Layout responsive ─────────────────────────────────────────────────────

    return (
        <div className="flex flex-col flex-1 min-h-0 gap-4">
            {/* MOBILE: alterna entre lista y detalle */}
            <div className="md:hidden flex flex-1 min-h-0">
                {selected ? DetailView : ListView}
            </div>

            {/* DESKTOP: lista + detalle en paralelo */}
            <div className="hidden md:flex flex-1 min-h-0 gap-4">
                {ListView}
                {DetailView}
            </div>

            {/* ── Modales ── */}
            <Modal isOpen={modalVehiculo} onClose={() => setModalVehiculo(false)}
                title={editVehiculo ? 'Editar Vehículo' : 'Nuevo Vehículo'} size="lg">
                <VehiculoForm initialData={editVehiculo} onCancel={() => setModalVehiculo(false)}
                    onSuccess={() => { setModalVehiculo(false); fetchVehiculos(); }} />
            </Modal>

            {selected && (
                <>
                    <Modal isOpen={modalSeguro}
                        onClose={() => { setModalSeguro(false); setEditSeguro(null); }}
                        title={editSeguro ? 'Editar Seguro' : 'Agregar Seguro'} size="md">
                        <SeguroForm vehiculoId={selected.id} initialData={editSeguro}
                            onCancel={() => { setModalSeguro(false); setEditSeguro(null); }}
                            onSuccess={() => { setModalSeguro(false); setEditSeguro(null); fetchDetail(selected.id); fetchVehiculos(); }} />
                    </Modal>
                    <Modal isOpen={modalRevision}
                        onClose={() => { setModalRevision(false); setEditRevision(null); }}
                        title={editRevision ? 'Editar Revisión Técnica' : 'Agregar Revisión Técnica'} size="md">
                        <RevisionForm vehiculoId={selected.id} initialData={editRevision}
                            onCancel={() => { setModalRevision(false); setEditRevision(null); }}
                            onSuccess={() => { setModalRevision(false); setEditRevision(null); fetchDetail(selected.id); fetchVehiculos(); }} />
                    </Modal>
                    <Modal isOpen={modalMantencion}
                        onClose={() => { setModalMantencion(false); setEditMantencion(null); }}
                        title={editMantencion ? 'Editar Mantención' : 'Registrar Mantención'} size="md">
                        <MantencionForm vehiculoId={selected.id} kmActual={selected.kilometraje_actual}
                            initialData={editMantencion}
                            onCancel={() => { setModalMantencion(false); setEditMantencion(null); }}
                            onSuccess={() => { setModalMantencion(false); setEditMantencion(null); fetchDetail(selected.id); }} />
                    </Modal>
                </>
            )}
        </div>
    );
};

// ── Sub-componentes ───────────────────────────────────────────────────────────

const Section: React.FC<{ icon: React.ReactNode; title: string; onAdd?: () => void; children: React.ReactNode }> = ({ icon, title, onAdd, children }) => (
    <section>
        <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-brand-dark/50 uppercase tracking-widest flex items-center gap-1.5">
                {icon} {title}
            </span>
            {onAdd && (
                <button onClick={onAdd}
                    className="text-[10px] font-bold text-brand-primary hover:underline flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-brand-primary/5 transition-colors">
                    <Plus className="h-3 w-3" /> Agregar
                </button>
            )}
        </div>
        <div className="space-y-1.5">{children}</div>
    </section>
);

const ItemRow: React.FC<{ onEdit?: () => void; onDelete?: () => void; children: React.ReactNode }> = ({ onEdit, onDelete, children }) => (
    <div className="flex items-start justify-between gap-2 p-3 rounded-xl bg-muted/40 border border-border">
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">{children}</div>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
            {onEdit && (
                <button onClick={onEdit}
                    className="p-1.5 rounded-lg hover:bg-brand-primary/10 text-muted-foreground hover:text-brand-primary transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                </button>
            )}
            {onDelete && (
                <button onClick={onDelete}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    </div>
);

const Empty: React.FC<{ children: string }> = ({ children }) => (
    <p className="text-xs text-muted-foreground py-1 pl-1 italic">{children}</p>
);

export default VehiculosPage;
