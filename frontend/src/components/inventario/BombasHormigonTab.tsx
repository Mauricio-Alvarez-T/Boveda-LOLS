import React, { useState, useEffect, useMemo } from 'react';
import { Building2, Truck, DollarSign, Calendar, MapPin, ChevronDown, ChevronRight, ChevronLeft, Search, X, Plus, Pencil, Trash2, Check } from 'lucide-react';
import { MixerTruck } from '../icons/MixerTruck';
import { toast } from 'sonner';
import api from '../../services/api';
import type { ApiResponse } from '../../types';
import type { RegistroBombaHormigon, Obra } from '../../types/entities';
import { cn } from '../../utils/cn';
import WhatsAppIcon from '../ui/WhatsAppIcon';
import { shareViaWhatsApp } from '../../utils/whatsappShare';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../ui/Modal';
import { FieldError } from '../ui/FieldError';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

interface Props {
    /** Ya no se usa: el tab fetchea sus obras filtradas por participa_bombas. */
    obras?: { id: number; nombre: string }[];
    canCreate: boolean;
    /** Permite editar/eliminar registros existentes. Default false. */
    canEdit?: boolean;
}

/** Shape del formulario de registro/edición de bomba. */
interface BombaFormState {
    obra_id: number | '';
    fecha: string;
    tipo_bomba: string;
    hora_inicio: string;
    toma_muestras: boolean;
    traslado_bombas: boolean;
    vibradores_origen: string;
    vibradores_detalle: string;
    tipo_hormigon: string;
    cantidad_m3: string; // string para el input; se castea a number al enviar
    frecuencia: string;
    hidrofugo: boolean;
    permiso_calzada: boolean;
    es_externa: boolean;
    observaciones: string;
}

// Tipos de bomba de hormigón. Si más adelante hay que administrarlos desde la UI,
// conviene moverlos a un catálogo en BD (como las empresas de flota).
const TIPOS_BOMBA = ['Estacionaria', 'Telescópica'];

const emptyForm = (): BombaFormState => ({
    obra_id: '',
    fecha: new Date().toISOString().slice(0, 10),
    tipo_bomba: '',
    hora_inicio: '',
    toma_muestras: false,
    traslado_bombas: false,
    vibradores_origen: '',
    vibradores_detalle: '',
    tipo_hormigon: '',
    cantidad_m3: '',
    frecuencia: '',
    hidrofugo: false,
    permiso_calzada: false,
    es_externa: false,
    observaciones: '',
});

const fmtMoney = (n: number) => `$${Number(n).toLocaleString('es-CL')}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDateShort = (d: string) => new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });

const BombasHormigonTab: React.FC<Props> = ({ canCreate, canEdit = false }) => {
    // Gate financiero: usuarios sin `inventario.bombas.ver_costos` no ven
    // el StatCard "Costo Total" ni la columna costo por registro (el backend
    // ya sanitiza `r.costo` → undefined, aquí cubrimos la parte UI).
    const { hasPermission } = useAuth();
    const verCostos = hasPermission('inventario.bombas.ver_costos');

    const [registros, setRegistros] = useState<RegistroBombaHormigon[]>([]);
    // Obras filtradas por participa_bombas (selector + filtro). Fetch propio.
    const [obras, setObras] = useState<{ id: number; nombre: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [filterObraId, setFilterObraId] = useState<number | ''>('');
    const [searchQuery, setSearchQuery] = useState('');
    // Mes abierto en el historial (drill-down). null = vista de lista de meses.
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

    // Modal de registro/edición
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState<BombaFormState>(emptyForm());
    const [submitting, setSubmitting] = useState(false);
    // Errores inline por campo (los mostramos con <FieldError> bajo cada input).
    const [formErrors, setFormErrors] = useState<{ obra_id?: string; fecha?: string; tipo_bomba?: string }>({});

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

    // Obras que participan en Bombas (independiente de inventario).
    useEffect(() => {
        api.get<ApiResponse<Obra[]>>('/obras?activo=true&participa_bombas=1&limit=500')
            .then(res => setObras((res.data.data || []).map(o => ({ id: o.id, nombre: o.nombre }))))
            .catch(() => setObras([]));
    }, []);

    // ── Abrir modal en modo crear ──
    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm());
        setFormErrors({});
        setShowModal(true);
    };

    // ── Abrir modal en modo editar ──
    const openEdit = (r: RegistroBombaHormigon) => {
        setEditingId(r.id);
        setForm({
            obra_id: r.obra_id,
            fecha: r.fecha ? new Date(r.fecha).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
            tipo_bomba: r.tipo_bomba || '',
            hora_inicio: r.hora_inicio ? String(r.hora_inicio).slice(0, 5) : '',
            toma_muestras: !!r.toma_muestras,
            traslado_bombas: !!r.traslado_bombas,
            vibradores_origen: r.vibradores_origen || '',
            vibradores_detalle: r.vibradores_detalle || '',
            tipo_hormigon: r.tipo_hormigon || '',
            cantidad_m3: r.cantidad_m3 != null ? String(r.cantidad_m3) : '',
            frecuencia: r.frecuencia || '',
            hidrofugo: !!r.hidrofugo,
            permiso_calzada: !!r.permiso_calzada,
            es_externa: !!r.es_externa,
            observaciones: r.observaciones || '',
        });
        setFormErrors({});
        setShowModal(true);
    };

    const closeModal = () => { setShowModal(false); setEditingId(null); setFormErrors({}); };

    // ── Guardar (crear o editar) ──
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // Validación inline por campo (no toast): cada mensaje aparece bajo su input.
        const errs: typeof formErrors = {};
        if (!form.obra_id) errs.obra_id = 'Selecciona una obra';
        if (!form.fecha) errs.fecha = 'Indica la fecha';
        if (!form.tipo_bomba.trim()) errs.tipo_bomba = 'Indica el tipo de bomba';
        setFormErrors(errs);
        if (Object.keys(errs).length > 0) return;

        // Payload: costo solo se envía si el usuario tiene permiso financiero y
        // escribió un valor. El backend igual lo descarta si no tiene permiso.
        const payload: Record<string, unknown> = {
            obra_id: Number(form.obra_id),
            fecha: form.fecha,
            tipo_bomba: form.tipo_bomba.trim(),
            hora_inicio: form.hora_inicio || null,
            toma_muestras: form.toma_muestras,
            traslado_bombas: form.traslado_bombas,
            vibradores_origen: form.vibradores_origen || null,
            vibradores_detalle: form.vibradores_detalle.trim() || null,
            tipo_hormigon: form.tipo_hormigon.trim() || null,
            cantidad_m3: form.cantidad_m3.trim() !== '' ? Number(form.cantidad_m3) : null,
            frecuencia: form.frecuencia.trim() || null,
            hidrofugo: form.hidrofugo,
            permiso_calzada: form.permiso_calzada,
            es_externa: form.es_externa,
            observaciones: form.observaciones.trim() || null,
        };

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

    // ── Compartir por WhatsApp (mismo patrón que asistencia) ──
    const buildWhatsAppMessage = (): string => {
        const obraNombre = obras.find(o => o.id === form.obra_id)?.nombre || '—';
        const lines = [
            '*Registro de uso de bomba*',
            `Obra: ${obraNombre}`,
            `Fecha: ${form.fecha ? form.fecha.split('-').reverse().join('/') : '—'}`,
            `Tipo: ${form.tipo_bomba || '—'}`,
        ];
        if (form.hora_inicio) lines.push(`Hora de inicio: ${form.hora_inicio}`);
        lines.push(`Toma de muestras: ${form.toma_muestras ? 'Sí' : 'No'}`);
        lines.push(`Traslado de bombas: ${form.traslado_bombas ? 'Sí' : 'No'}`);
        if (form.vibradores_origen || form.vibradores_detalle.trim()) lines.push(`Vibradores: ${[form.vibradores_origen, form.vibradores_detalle.trim()].filter(Boolean).join(' — ')}`);
        if (form.tipo_hormigon.trim()) lines.push(`Tipo de hormigón: ${form.tipo_hormigon.trim()}`);
        if (form.cantidad_m3.trim()) lines.push(`Cantidad: ${form.cantidad_m3} m³`);
        if (form.frecuencia.trim()) lines.push(`Frecuencia: ${form.frecuencia.trim()}`);
        lines.push(`Hidrófugo: ${form.hidrofugo ? 'Sí' : 'No'}`);
        lines.push(`Permiso de la calzada: ${form.permiso_calzada ? 'Sí' : 'No'}`);
        lines.push(`Origen: ${form.es_externa ? 'Externa (arriendo)' : 'Empresa (propia)'}`);
        if (form.observaciones.trim()) lines.push(`Observaciones: ${form.observaciones.trim()}`);
        return lines.join('\n');
    };

    const handleShareWhatsApp = () => {
        if (!form.obra_id || !form.tipo_bomba.trim()) {
            toast.error('Completa al menos obra y tipo de bomba para compartir');
            return;
        }
        shareViaWhatsApp(buildWhatsAppMessage(), 'Registro de uso de bomba');
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

    // Agrupar por mes (más reciente primero). Dentro de cada mes los registros
    // ya vienen ordenados por fecha DESC (más reciente arriba) desde el backend.
    const grouped = useMemo(() => {
        const groups: Record<string, RegistroBombaHormigon[]> = {};
        for (const r of filtered) {
            const d = new Date(r.fecha);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        }
        const sorted = Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
        return sorted.map(([key, items]) => {
            const d = new Date(items[0].fecha);
            const label = d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
            const propias = items.filter(r => !r.es_externa).length;
            return { key, label: label.charAt(0).toUpperCase() + label.slice(1), items, propias, externas: items.length - propias };
        });
    }, [filtered]);

    // Mes abierto en el drill-down (null = lista de meses). Si el mes ya no existe
    // tras un filtro, cae a null → se muestra la lista de meses.
    const selectedGroup = selectedMonth ? (grouped.find(g => g.key === selectedMonth) ?? null) : null;

    // Stats del alcance visible: el mes abierto, o todo el historial filtrado.
    const scopeRecords = selectedGroup ? selectedGroup.items : filtered;
    const stats = useMemo(() => {
        const total = scopeRecords.length;
        const externas = scopeRecords.filter(r => r.es_externa).length;
        const propias = total - externas;
        const costoTotal = scopeRecords.reduce((sum, r) => sum + (Number(r.costo) || 0), 0);
        return { total, externas, propias, costoTotal };
    }, [scopeRecords]);

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Header + filters */}
            <div className="shrink-0 space-y-3 mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <h3 className="text-sm font-bold text-brand-dark">Bombas de Hormigón</h3>
                    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                        {canCreate && (
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={openCreate}
                                leftIcon={<Plus className="h-3.5 w-3.5" />}
                                title="Registrar uso"
                                aria-label="Registrar uso"
                                className="shrink-0 order-last sm:order-none"
                            >
                                <span className="hidden sm:inline">Registrar uso</span>
                            </Button>
                        )}
                        {/* Search */}
                        <div className="relative flex-1 min-w-0 max-w-xs">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Buscar obra, tipo, proveedor..."
                                className="w-full pl-8 pr-8 py-2.5 text-base sm:py-2 sm:text-xs border border-border rounded-xl bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all"
                            />
                            {searchQuery && (
                                <IconButton
                                    onClick={() => setSearchQuery('')}
                                    icon={<X className="h-3.5 w-3.5" />}
                                    variant="ghost"
                                    size="sm"
                                    aria-label="Limpiar búsqueda"
                                    title="Limpiar búsqueda"
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                                />
                            )}
                        </div>
                        {/* Obra filter */}
                        <div className="relative">
                            <select
                                value={filterObraId}
                                onChange={e => setFilterObraId(e.target.value ? Number(e.target.value) : '')}
                                className="appearance-none pl-3 pr-8 py-2.5 text-base sm:py-2 sm:text-xs border border-border rounded-xl bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none cursor-pointer"
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
                        icon={MixerTruck}
                        label="Total Bombeos"
                        value={String(stats.total)}
                        color="bg-muted text-muted-foreground"
                    />
                    <StatCard
                        icon={Building2}
                        label="Empresa"
                        value={String(stats.propias)}
                        color="bg-muted text-muted-foreground"
                    />
                    <StatCard
                        icon={Truck}
                        label="Arriendo Ext."
                        value={String(stats.externas)}
                        color="bg-muted text-muted-foreground"
                    />
                    {verCostos && (
                        <StatCard
                            icon={DollarSign}
                            label="Costo Total"
                            value={stats.costoTotal > 0 ? fmtMoney(stats.costoTotal) : '—'}
                            color="bg-muted text-muted-foreground"
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
                        <MixerTruck className="h-10 w-10 mx-auto opacity-20 mb-3" />
                        <p className="text-sm font-medium">Sin registros de bombas</p>
                        <p className="text-xs mt-1 text-muted-foreground/60">
                            {searchQuery ? 'No hay resultados para la búsqueda' : 'No se han registrado bombeos aún'}
                        </p>
                    </div>
                ) : selectedGroup ? (
                    /* ─── Detalle del mes: registros por día, más reciente primero ─── */
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedMonth(null)} leftIcon={<ChevronLeft className="h-4 w-4" />}>
                                Meses
                            </Button>
                            <span className="text-sm font-bold text-brand-dark capitalize">{selectedGroup.label}</span>
                            <span className="text-caption text-muted-foreground/50">({selectedGroup.items.length})</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {selectedGroup.items.map(r => (
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
                ) : (
                    /* ─── Vista de meses: lista clickeable, más reciente arriba ─── */
                    <div className="space-y-2">
                        {grouped.map(group => (
                            /* eslint-disable-next-line no-restricted-syntax -- fila de mes clickeable (drill-down al detalle) */
                            <button
                                key={group.key}
                                type="button"
                                onClick={() => setSelectedMonth(group.key)}
                                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card text-left transition-all hover:border-brand-primary/40 hover:bg-brand-primary/[0.03] active:scale-[0.99]"
                            >
                                <div className="shrink-0 h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                                    <Calendar className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-brand-dark capitalize">{group.label}</div>
                                    <div className="text-caption text-muted-foreground">
                                        {group.items.length} bombeo{group.items.length === 1 ? '' : 's'} · {group.propias} empresa · {group.externas} arriendo
                                    </div>
                                </div>
                                <ChevronRight className="shrink-0 h-4 w-4 text-muted-foreground/40" />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ═══ MODAL REGISTRAR / EDITAR ═══ */}
            {/* Acciones arriba como iconos (sin texto): WhatsApp para compartir + Registrar (✓).
                La X del Modal hace de "Cancelar". */}
            <Modal
                isOpen={showModal}
                onClose={closeModal}
                title="Hormigón"
                size="md"
                headerAction={
                    <>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handleShareWhatsApp}
                            title="Compartir por WhatsApp"
                            className="rounded-full h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        >
                            <WhatsAppIcon className="h-4 w-4" />
                            <span className="sr-only">Compartir por WhatsApp</span>
                        </Button>
                        <Button
                            type="submit"
                            form="bomba-form"
                            variant="primary"
                            size="icon"
                            disabled={submitting}
                            isLoading={submitting}
                            title={editingId ? 'Guardar cambios' : 'Registrar'}
                            className="rounded-full h-8 w-8"
                        >
                            <Check className="h-4 w-4" />
                            <span className="sr-only">{editingId ? 'Guardar cambios' : 'Registrar'}</span>
                        </Button>
                    </>
                }
            >
                <form id="bomba-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    {/* Obra + Fecha (misma fila, también en móvil) */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">Obra <span className="text-red-500">*</span></label>
                            <select
                                value={form.obra_id}
                                onChange={e => { setForm(f => ({ ...f, obra_id: e.target.value ? Number(e.target.value) : '' })); if (formErrors.obra_id) setFormErrors(p => ({ ...p, obra_id: undefined })); }}
                                className={cn(
                                    "w-full px-3 py-2.5 text-base border rounded-xl bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none",
                                    formErrors.obra_id ? "border-destructive" : "border-border"
                                )}
                            >
                                <option value="">Seleccionar obra...</option>
                                {obras.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                            </select>
                            <FieldError message={formErrors.obra_id} className="mt-1" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">Fecha <span className="text-muted-foreground font-normal">(programar)</span> <span className="text-red-500">*</span></label>
                            <input
                                type="date"
                                value={form.fecha}
                                onChange={e => { setForm(f => ({ ...f, fecha: e.target.value })); if (formErrors.fecha) setFormErrors(p => ({ ...p, fecha: undefined })); }}
                                className={cn(
                                    "w-full px-3 py-2.5 text-base border rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none",
                                    formErrors.fecha ? "border-destructive" : "border-border"
                                )}
                            />
                            <FieldError message={formErrors.fecha} className="mt-1" />
                        </div>
                    </div>

                    {/* Tipo de bomba + origen (dropdown) — fila compacta */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">Tipo de bomba <span className="text-red-500">*</span></label>
                            <select
                                value={form.tipo_bomba}
                                onChange={e => { setForm(f => ({ ...f, tipo_bomba: e.target.value })); if (formErrors.tipo_bomba) setFormErrors(p => ({ ...p, tipo_bomba: undefined })); }}
                                className={cn(
                                    "w-full px-3 py-2.5 text-base border rounded-xl bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none",
                                    formErrors.tipo_bomba ? "border-destructive" : "border-border"
                                )}
                            >
                                <option value="">Selecciona el tipo...</option>
                                {/* Conserva un valor antiguo no estándar (registros previos a texto libre) */}
                                {form.tipo_bomba && !TIPOS_BOMBA.includes(form.tipo_bomba) && (
                                    <option value={form.tipo_bomba}>{form.tipo_bomba}</option>
                                )}
                                {TIPOS_BOMBA.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <FieldError message={formErrors.tipo_bomba} className="mt-1" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">Origen de la bomba <span className="text-red-500">*</span></label>
                            <select
                                value={form.es_externa ? 'externa' : 'empresa'}
                                onChange={e => setForm(f => ({ ...f, es_externa: e.target.value === 'externa' }))}
                                className="w-full px-3 py-2.5 text-base border border-border rounded-xl bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none"
                            >
                                <option value="empresa">Empresa (propia)</option>
                                <option value="externa">Externa (arriendo)</option>
                            </select>
                        </div>
                    </div>

                    {/* Tipo de hormigón + cantidad (m³) — fila compacta */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">
                                Tipo de hormigón <span className="text-muted-foreground font-normal">(opcional)</span>
                            </label>
                            <input
                                type="text"
                                value={form.tipo_hormigon}
                                onChange={e => setForm(f => ({ ...f, tipo_hormigon: e.target.value }))}
                                placeholder="Ej: H-30..."
                                className="w-full px-3 py-2.5 text-base border border-border rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">
                                Cantidad <span className="text-muted-foreground font-normal">(m³)</span>
                            </label>
                            <input
                                type="number"
                                min={0}
                                step="any"
                                value={form.cantidad_m3}
                                onChange={e => setForm(f => ({ ...f, cantidad_m3: e.target.value }))}
                                placeholder="0"
                                className="w-full px-3 py-2.5 text-base border border-border rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none"
                            />
                        </div>
                    </div>

                    {/* Hora de inicio + frecuencia */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">
                                Hora de inicio <span className="text-muted-foreground font-normal">(opcional)</span>
                            </label>
                            <input
                                type="time"
                                value={form.hora_inicio}
                                onChange={e => setForm(f => ({ ...f, hora_inicio: e.target.value }))}
                                className="w-full px-3 py-2.5 text-base border border-border rounded-xl bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">
                                Frecuencia <span className="text-muted-foreground font-normal">(opcional)</span>
                            </label>
                            <input
                                type="text"
                                value={form.frecuencia}
                                onChange={e => setForm(f => ({ ...f, frecuencia: e.target.value }))}
                                placeholder="Escribe la frecuencia..."
                                className="w-full px-3 py-2.5 text-base border border-border rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none"
                            />
                        </div>
                    </div>

                    {/* Detalle de vibradores + vibradores (apilan en móvil) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">
                                Detalle de vibradores <span className="text-muted-foreground font-normal">(opcional)</span>
                            </label>
                            <input
                                type="text"
                                value={form.vibradores_detalle}
                                onChange={e => setForm(f => ({ ...f, vibradores_detalle: e.target.value }))}
                                placeholder="Ej: 3 vibradores con sonda de 45"
                                className="w-full px-3 py-2.5 text-base border border-border rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">Vibradores</label>
                            <select
                                value={form.vibradores_origen}
                                onChange={e => setForm(f => ({ ...f, vibradores_origen: e.target.value }))}
                                className="w-full px-3 py-2.5 text-base border border-border rounded-xl bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none"
                            >
                                <option value="">Seleccionar...</option>
                                {/* Conserva un valor antiguo (registros previos a Empresa/Externa) */}
                                {form.vibradores_origen && !['Empresa', 'Externa'].includes(form.vibradores_origen) && (
                                    <option value={form.vibradores_origen}>{form.vibradores_origen}</option>
                                )}
                                <option value="Empresa">Empresa</option>
                                <option value="Externa">Externa</option>
                            </select>
                        </div>
                    </div>

                    {/* Los 4 checkboxes en 2 columnas (2x2) — compacto, también en móvil */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={form.toma_muestras}
                                onChange={e => setForm(f => ({ ...f, toma_muestras: e.target.checked }))}
                                className="h-4 w-4 rounded border-border text-brand-primary focus:ring-brand-primary"
                            />
                            <span className="text-sm text-brand-dark font-medium">Toma de muestras</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={form.traslado_bombas}
                                onChange={e => setForm(f => ({ ...f, traslado_bombas: e.target.checked }))}
                                className="h-4 w-4 rounded border-border text-brand-primary focus:ring-brand-primary"
                            />
                            <span className="text-sm text-brand-dark font-medium">Traslado de bombas</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={form.hidrofugo}
                                onChange={e => setForm(f => ({ ...f, hidrofugo: e.target.checked }))}
                                className="h-4 w-4 rounded border-border text-brand-primary focus:ring-brand-primary"
                            />
                            <span className="text-sm text-brand-dark font-medium">Hidrófugo</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={form.permiso_calzada}
                                onChange={e => setForm(f => ({ ...f, permiso_calzada: e.target.checked }))}
                                className="h-4 w-4 rounded border-border text-brand-primary focus:ring-brand-primary"
                            />
                            <span className="text-sm text-brand-dark font-medium">Permiso de la calzada</span>
                        </label>
                    </div>

                    {/* Observaciones */}
                    <div>
                        <label className="text-xs font-bold text-brand-dark mb-1 block">
                            Observaciones <span className="text-muted-foreground font-normal">(opcional)</span>
                        </label>
                        <textarea
                            value={form.observaciones}
                            onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
                            placeholder="Opcional..."
                            className="w-full px-3 py-2.5 text-base border border-border rounded-xl resize-none h-16 focus:ring-2 focus:ring-brand-primary/20 outline-none"
                        />
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
            <p className="text-caption text-muted-foreground leading-tight">{label}</p>
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
                    <span className="text-label font-bold text-brand-dark truncate">{r.obra_nombre}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <span className={cn(
                        "text-micro font-bold px-2 py-0.5 rounded-full border whitespace-nowrap",
                        isExterna
                            ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-800/60"
                            : "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-800/60"
                    )}>
                        {isExterna ? 'ARRIENDO' : 'EMPRESA'}
                    </span>
                    {canEdit && (
                        // Siempre visibles en móvil (táctil, sin hover); el hover queda para desktop.
                        <div className="flex items-center gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <IconButton
                                onClick={onEdit}
                                icon={<Pencil className="h-4 w-4 sm:h-3 sm:w-3" />}
                                variant="ghost"
                                size="sm"
                                aria-label="Editar"
                                title="Editar"
                                className="h-9 w-9 sm:h-7 sm:w-7"
                            />
                            <IconButton
                                onClick={onDelete}
                                icon={<Trash2 className="h-4 w-4 sm:h-3 sm:w-3" />}
                                variant="danger"
                                size="sm"
                                aria-label="Eliminar"
                                title="Eliminar"
                                className="h-9 w-9 sm:h-7 sm:w-7"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Type + date row */}
            <div className="flex items-center gap-1.5 mb-1">
                <MixerTruck className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-xs text-brand-dark/80 font-medium">{r.tipo_bomba}</span>
                <span className="text-caption text-muted-foreground/50 mx-0.5">&middot;</span>
                <span className="text-caption text-muted-foreground">{fmtDateShort(r.fecha)}</span>
            </div>

            {/* Detalles extra: hora de inicio, vibradores, muestras, traslado, hidrófugo */}
            {(r.hora_inicio || r.toma_muestras || r.traslado_bombas || r.vibradores_origen || r.hidrofugo || r.permiso_calzada) && (
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    {r.hora_inicio && (
                        <span className="text-micro font-medium text-brand-dark/70 bg-muted px-1.5 py-0.5 rounded-md">
                            Inicio {String(r.hora_inicio).slice(0, 5)}
                        </span>
                    )}
                    {r.vibradores_origen && (
                        <span className="text-micro font-medium text-brand-dark/70 bg-muted px-1.5 py-0.5 rounded-md">
                            Vibradores: {r.vibradores_origen}
                        </span>
                    )}
                    {r.toma_muestras && (
                        <span className="text-micro font-medium text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded-md">Muestras</span>
                    )}
                    {r.hidrofugo && (
                        <span className="text-micro font-medium text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded-md">Hidrófugo</span>
                    )}
                    {r.permiso_calzada && (
                        <span className="text-micro font-medium text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded-md">Permiso calzada</span>
                    )}
                    {r.traslado_bombas && (
                        <span className="text-micro font-medium text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded-md">Traslado</span>
                    )}
                </div>
            )}

            {/* Bottom row: proveedor + costo */}
            {(r.proveedor || r.costo) && (
                <div className="flex items-center justify-between gap-2 mt-0.5 pt-1.5 border-t border-border/50">
                    {r.proveedor && (
                        <span className="text-caption text-muted-foreground truncate">{r.proveedor}</span>
                    )}
                    {r.costo && (
                        <span className="text-label font-bold text-brand-dark shrink-0">{fmtMoney(Number(r.costo))}</span>
                    )}
                </div>
            )}
        </div>
    );
};

export default BombasHormigonTab;
