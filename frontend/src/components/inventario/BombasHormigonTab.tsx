import React, { useState, useEffect, useMemo } from 'react';
import { Droplets, Building2, Truck, DollarSign, Calendar, MapPin, ChevronDown, Search, X, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';
import type { RegistroBombaHormigon } from '../../types/entities';
import { cn } from '../../utils/cn';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../ui/Modal';

interface Props {
    obras: { id: number; nombre: string }[];
    canCreate: boolean;
    /** Permite editar/eliminar registros existentes. Default false. */
    canEdit?: boolean;
}

/** Shape del formulario de registro/edición de bomba. */
interface BombaFormState {
    obra_id: number | '';
    fecha: string;
    tipo_bomba: string;
    es_externa: boolean;
    proveedor: string;
    costo: string; // string para el input; se castea a number al enviar
    observaciones: string;
}

const emptyForm = (): BombaFormState => ({
    obra_id: '',
    fecha: new Date().toISOString().slice(0, 10),
    tipo_bomba: '',
    es_externa: false,
    proveedor: '',
    costo: '',
    observaciones: '',
});

const fmtMoney = (n: number) => `$${Number(n).toLocaleString('es-CL')}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDateShort = (d: string) => new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });

const BombasHormigonTab: React.FC<Props> = ({ obras, canCreate, canEdit = false }) => {
    // Gate financiero: usuarios sin `inventario.bombas.ver_costos` no ven
    // el StatCard "Costo Total" ni la columna costo por registro (el backend
    // ya sanitiza `r.costo` → undefined, aquí cubrimos la parte UI).
    const { hasPermission } = useAuth();
    const verCostos = hasPermission('inventario.bombas.ver_costos');

    const [registros, setRegistros] = useState<RegistroBombaHormigon[]>([]);
    const [loading, setLoading] = useState(false);
    const [filterObraId, setFilterObraId] = useState<number | ''>('');
    const [searchQuery, setSearchQuery] = useState('');

    // Modal de registro/edición
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState<BombaFormState>(emptyForm());
    const [submitting, setSubmitting] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = filterObraId ? `?obra_id=${filterObraId}` : '';
            const res = await api.get(`/bombas-hormigon${params}`);
            setRegistros(res.data.data || []);
        } catch { setRegistros([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, [filterObraId]);

    // ── Abrir modal en modo crear ──
    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm());
        setShowModal(true);
    };

    // ── Abrir modal en modo editar ──
    const openEdit = (r: RegistroBombaHormigon) => {
        setEditingId(r.id);
        setForm({
            obra_id: r.obra_id,
            fecha: r.fecha ? new Date(r.fecha).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
            tipo_bomba: r.tipo_bomba || '',
            es_externa: !!r.es_externa,
            proveedor: r.proveedor || '',
            costo: r.costo != null ? String(r.costo) : '',
            observaciones: r.observaciones || '',
        });
        setShowModal(true);
    };

    const closeModal = () => { setShowModal(false); setEditingId(null); };

    // ── Guardar (crear o editar) ──
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.obra_id) { toast.error('Selecciona una obra'); return; }
        if (!form.fecha) { toast.error('Indica la fecha'); return; }
        if (!form.tipo_bomba.trim()) { toast.error('Indica el tipo de bomba'); return; }

        // Payload: costo solo se envía si el usuario tiene permiso financiero y
        // escribió un valor. El backend igual lo descarta si no tiene permiso.
        const payload: Record<string, unknown> = {
            obra_id: Number(form.obra_id),
            fecha: form.fecha,
            tipo_bomba: form.tipo_bomba.trim(),
            es_externa: form.es_externa,
            proveedor: form.proveedor.trim() || null,
            observaciones: form.observaciones.trim() || null,
        };
        if (verCostos && form.costo.trim() !== '') {
            payload.costo = Number(form.costo) || 0;
        }

        setSubmitting(true);
        try {
            if (editingId) {
                await api.put(`/bombas-hormigon/${editingId}`, payload);
                toast.success('Registro actualizado');
            } else {
                await api.post('/bombas-hormigon', payload);
                toast.success('Uso de bomba registrado');
            }
            closeModal();
            fetchData();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar el registro');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Eliminar ──
    const handleDelete = async (r: RegistroBombaHormigon) => {
        if (!window.confirm(`¿Eliminar el registro de bomba de "${r.obra_nombre}" del ${fmtDateShort(r.fecha)}?`)) return;
        try {
            await api.delete(`/bombas-hormigon/${r.id}`);
            toast.success('Registro eliminado');
            fetchData();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al eliminar');
        }
    };

    // Filter by search
    const filtered = useMemo(() => {
        if (!searchQuery) return registros;
        const q = searchQuery.toLowerCase();
        return registros.filter(r =>
            (r.obra_nombre || '').toLowerCase().includes(q) ||
            (r.tipo_bomba || '').toLowerCase().includes(q) ||
            (r.proveedor || '').toLowerCase().includes(q)
        );
    }, [registros, searchQuery]);

    // Stats
    const stats = useMemo(() => {
        const total = filtered.length;
        const externas = filtered.filter(r => r.es_externa).length;
        const propias = total - externas;
        const costoTotal = filtered.reduce((sum, r) => sum + (Number(r.costo) || 0), 0);
        return { total, externas, propias, costoTotal };
    }, [filtered]);

    // Group by month
    const grouped = useMemo(() => {
        const groups: Record<string, RegistroBombaHormigon[]> = {};
        for (const r of filtered) {
            const d = new Date(r.fecha);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        }
        // Sort keys descending
        const sorted = Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
        return sorted.map(([key, items]) => {
            const d = new Date(items[0].fecha);
            const label = d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
            return { key, label: label.charAt(0).toUpperCase() + label.slice(1), items };
        });
    }, [filtered]);

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Header + filters */}
            <div className="shrink-0 space-y-3 mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <h3 className="text-sm font-bold text-brand-dark">Bombas de Hormigón</h3>
                    <div className="flex items-center gap-2 flex-1">
                        {canCreate && (
                            <button
                                onClick={openCreate}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 transition-all shadow-sm shrink-0 order-last sm:order-none"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Registrar uso</span>
                            </button>
                        )}
                        {/* Search */}
                        <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Buscar obra, tipo, proveedor..."
                                className="w-full pl-8 pr-8 py-2 text-xs border border-border rounded-xl bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded">
                                    <X className="h-3 w-3 text-muted-foreground" />
                                </button>
                            )}
                        </div>
                        {/* Obra filter */}
                        <div className="relative">
                            <select
                                value={filterObraId}
                                onChange={e => setFilterObraId(e.target.value ? Number(e.target.value) : '')}
                                className="appearance-none pl-3 pr-8 py-2 text-xs border border-border rounded-xl bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none cursor-pointer"
                            >
                                <option value="">Todas las obras</option>
                                {obras.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                        </div>
                    </div>
                </div>

                {/* Stats cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <StatCard
                        icon={Droplets}
                        label="Total Bombeos"
                        value={String(stats.total)}
                        color="bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300"
                    />
                    <StatCard
                        icon={Building2}
                        label="Empresa"
                        value={String(stats.propias)}
                        color="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
                    />
                    <StatCard
                        icon={Truck}
                        label="Arriendo Ext."
                        value={String(stats.externas)}
                        color="bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
                    />
                    {verCostos && (
                        <StatCard
                            icon={DollarSign}
                            label="Costo Total"
                            value={stats.costoTotal > 0 ? fmtMoney(stats.costoTotal) : '—'}
                            color="bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300"
                        />
                    )}
                </div>
            </div>

            {/* List */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {loading ? (
                    <div className="py-12 text-center text-muted-foreground text-xs">Cargando...</div>
                ) : filtered.length === 0 ? (
                    <div className="py-16 text-center text-muted-foreground">
                        <Droplets className="h-10 w-10 mx-auto opacity-20 mb-3" />
                        <p className="text-sm font-medium">Sin registros de bombas</p>
                        <p className="text-xs mt-1 text-muted-foreground/60">
                            {searchQuery ? 'No hay resultados para la búsqueda' : 'No se han registrado bombeos aún'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {grouped.map(group => (
                            <div key={group.key}>
                                {/* Month header */}
                                <div className="flex items-center gap-2 mb-2 px-1">
                                    <Calendar className="h-3 w-3 text-muted-foreground/50" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                                        {group.label}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground/40">
                                        ({group.items.length})
                                    </span>
                                    <div className="flex-1 border-t border-border/60" />
                                </div>

                                {/* Cards grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {group.items.map(r => (
                                        <BombaCard
                                            key={r.id}
                                            registro={r}
                                            canEdit={canEdit}
                                            onEdit={() => openEdit(r)}
                                            onDelete={() => handleDelete(r)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ═══ MODAL REGISTRAR / EDITAR ═══ */}
            <Modal isOpen={showModal} onClose={closeModal} title={editingId ? 'Editar uso de bomba' : 'Registrar uso de bomba'} size="md">
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                    {/* Obra + Fecha */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">Obra <span className="text-red-500">*</span></label>
                            <select
                                value={form.obra_id}
                                onChange={e => setForm(f => ({ ...f, obra_id: e.target.value ? Number(e.target.value) : '' }))}
                                className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                required
                            >
                                <option value="">Seleccionar obra...</option>
                                {obras.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">Fecha <span className="text-red-500">*</span></label>
                            <input
                                type="date"
                                value={form.fecha}
                                onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                                className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                required
                            />
                        </div>
                    </div>

                    {/* Tipo de bomba */}
                    <div>
                        <label className="text-xs font-bold text-brand-dark mb-1 block">Tipo de bomba <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={form.tipo_bomba}
                            onChange={e => setForm(f => ({ ...f, tipo_bomba: e.target.value }))}
                            placeholder="Ej: Pluma 32m, Estacionaria, Telescópica..."
                            className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none"
                            required
                        />
                    </div>

                    {/* Propia / Externa toggle */}
                    <div>
                        <label className="text-xs font-bold text-brand-dark mb-1.5 block">Origen de la bomba <span className="text-red-500">*</span></label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, es_externa: false }))}
                                className={cn(
                                    "flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all",
                                    !form.es_externa
                                        ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                                        : "bg-card text-muted-foreground border-border hover:border-emerald-300"
                                )}
                            >
                                <Building2 className="h-3.5 w-3.5" />
                                Empresa (propia)
                            </button>
                            <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, es_externa: true }))}
                                className={cn(
                                    "flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all",
                                    form.es_externa
                                        ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                                        : "bg-card text-muted-foreground border-border hover:border-amber-300"
                                )}
                            >
                                <Truck className="h-3.5 w-3.5" />
                                Externa (arriendo)
                            </button>
                        </div>
                    </div>

                    {/* Proveedor (opcional) */}
                    <div>
                        <label className="text-xs font-bold text-brand-dark mb-1 block">
                            Proveedor <span className="text-muted-foreground font-normal">(opcional)</span>
                        </label>
                        <input
                            type="text"
                            value={form.proveedor}
                            onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))}
                            placeholder="Nombre del proveedor / arrendador"
                            className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none"
                        />
                    </div>

                    {/* Costo (opcional, solo si tiene permiso financiero) */}
                    {verCostos && (
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">
                                Costo <span className="text-muted-foreground font-normal">(opcional)</span>
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                                <input
                                    type="number" min={0} step="any"
                                    value={form.costo}
                                    onChange={e => setForm(f => ({ ...f, costo: e.target.value }))}
                                    placeholder="0"
                                    className="w-full pl-7 pr-3 py-2 text-sm border border-border rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                />
                            </div>
                        </div>
                    )}

                    {/* Observaciones */}
                    <div>
                        <label className="text-xs font-bold text-brand-dark mb-1 block">
                            Observaciones <span className="text-muted-foreground font-normal">(opcional)</span>
                        </label>
                        <textarea
                            value={form.observaciones}
                            onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
                            placeholder="Opcional..."
                            className="w-full px-3 py-2 text-sm border border-border rounded-xl resize-none h-16 focus:ring-2 focus:ring-brand-primary/20 outline-none"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-1">
                        <button type="button" onClick={closeModal}
                            className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors">
                            Cancelar
                        </button>
                        <button type="submit" disabled={submitting}
                            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 disabled:opacity-50 transition-all shadow-sm">
                            <Droplets className="h-3.5 w-3.5" />
                            {submitting ? 'Guardando...' : (editingId ? 'Guardar cambios' : 'Registrar')}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

/* ─── Stat card ─── */
const StatCard: React.FC<{ icon: React.ElementType; label: string; value: string; color: string }> = ({ icon: Icon, label, value, color }) => (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-card">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", color)}>
            <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
            <p className="text-sm font-bold text-brand-dark leading-tight truncate">{value}</p>
        </div>
    </div>
);

/* ─── Bomba card ─── */
const BombaCard: React.FC<{
    registro: RegistroBombaHormigon;
    canEdit?: boolean;
    onEdit?: () => void;
    onDelete?: () => void;
}> = ({ registro: r, canEdit = false, onEdit, onDelete }) => {
    const isExterna = r.es_externa;

    return (
        <div className={cn(
            "group flex flex-col px-3.5 py-3 rounded-xl border transition-colors",
            isExterna
                ? "border-amber-200/70 bg-amber-50/30 hover:border-amber-300 dark:border-amber-900/60 dark:bg-amber-950/20 dark:hover:border-amber-700"
                : "border-border bg-card hover:border-brand-primary/20"
        )}>
            {/* Top row: obra + badge + acciones */}
            <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                    <MapPin className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                    <span className="text-[11px] font-bold text-brand-dark truncate">{r.obra_nombre}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <span className={cn(
                        "text-[9px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap",
                        isExterna
                            ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-800/60"
                            : "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-800/60"
                    )}>
                        {isExterna ? 'ARRIENDO' : 'EMPRESA'}
                    </span>
                    {canEdit && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={onEdit}
                                className="p-1 text-muted-foreground/60 hover:text-brand-primary hover:bg-brand-primary/10 rounded-md transition-colors"
                                title="Editar"
                            >
                                <Pencil className="h-3 w-3" />
                            </button>
                            <button
                                onClick={onDelete}
                                className="p-1 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                title="Eliminar"
                            >
                                <Trash2 className="h-3 w-3" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Type + date row */}
            <div className="flex items-center gap-1.5 mb-1">
                <Droplets className="h-3 w-3 text-blue-400 shrink-0" />
                <span className="text-xs text-brand-dark/80 font-medium">{r.tipo_bomba}</span>
                <span className="text-[10px] text-muted-foreground/50 mx-0.5">&middot;</span>
                <span className="text-[10px] text-muted-foreground">{fmtDateShort(r.fecha)}</span>
            </div>

            {/* Bottom row: proveedor + costo */}
            {(r.proveedor || r.costo) && (
                <div className="flex items-center justify-between gap-2 mt-0.5 pt-1.5 border-t border-border/50">
                    {r.proveedor && (
                        <span className="text-[10px] text-muted-foreground truncate">{r.proveedor}</span>
                    )}
                    {r.costo && (
                        <span className="text-[11px] font-bold text-brand-dark shrink-0">{fmtMoney(Number(r.costo))}</span>
                    )}
                </div>
            )}
        </div>
    );
};

export default BombasHormigonTab;
