import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Truck, Plus, Shield, ScrollText,
    Trash2, Edit2, X, ChevronLeft, Bell, Pencil, Search, Filter, Save, User
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../utils/cn';
import { useAuth } from '../context/AuthContext';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { EmptyState } from '../components/ui/EmptyState';
import { fmtMoney, fmtNumber } from '../utils/format';
import { VehiculoForm } from '../components/vehiculos/VehiculoForm';
import { SeguroForm } from '../components/vehiculos/SeguroForm';
import { PermisoCirculacionForm } from '../components/vehiculos/PermisoCirculacionForm';
import api from '../services/api';
import type { Vehiculo, VehiculoSeguro, VehiculoPermiso } from '../types/entities';

// ── Helpers ──────────────────────────────────────────────────────────────────

function diasHasta(fecha: string | null | undefined): number | null {
    if (!fecha) return null;
    const d = new Date(fecha + 'T12:00:00');
    return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function EstadoVencimiento({ fecha, label }: { fecha?: string | null; label: string }) {
    const dias = diasHasta(fecha);
    if (dias === null) return <span className="text-xs text-muted-foreground italic">Sin {label}</span>;
    if (dias < 0)   return <span className="text-caption font-black px-2 py-0.5 rounded-lg bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300">VENCIDO {Math.abs(dias)}d</span>;
    if (dias <= 30) return <span className="text-caption font-black px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300">Vence en {dias}d</span>;
    return <span className="text-caption font-black px-2 py-0.5 rounded-lg bg-green-100 text-green-700 border border-green-200 dark:bg-green-950/40 dark:text-green-300">Vigente</span>;
}

// Formato DD/MM/YYYY con barras (variante propia de Vehículos; pendiente de
// consolidar en utils/format si se estandariza el separador). fmtMoney/fmtNumber
// vienen de utils/format (design system F2).
function fmtDate(s?: string | null) {
    if (!s) return '—';
    return String(s).split('T')[0].split('-').reverse().join('/');
}

function AlertaBadge({ diasAlerta, emailAlerta }: { diasAlerta?: number | null; emailAlerta?: string | null }) {
    if (!emailAlerta || !diasAlerta) return null;
    return (
        <span className="inline-flex items-center gap-1 text-caption font-bold text-brand-primary bg-brand-primary/10 border border-brand-primary/20 px-1.5 py-0.5 rounded-md">
            <Bell className="h-2.5 w-2.5" />
            {diasAlerta}d · Email
        </span>
    );
}

// ── Componente principal ──────────────────────────────────────────────────────

const VehiculosPage: React.FC = () => {
    const { hasPermission } = useAuth();

    const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
    const [loading, setLoading] = useState(false);
    // En móvil: null = lista, Vehiculo = detalle
    const [selected, setSelected] = useState<Vehiculo | null>(null);
    // Filtro de búsqueda (patente, marca, modelo, año, tipo)
    const [filtro, setFiltro] = useState('');
    const [filtroPatente, setFiltroPatente] = useState('');
    const [filtroMarca, setFiltroMarca] = useState('');
    const [filtroModelo, setFiltroModelo] = useState('');
    const [filtroTipo, setFiltroTipo] = useState('');
    const [showFiltros, setShowFiltros] = useState(false);

    const [seguros, setSeguros] = useState<VehiculoSeguro[]>([]);
    const [permisos, setPermisos] = useState<VehiculoPermiso[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);

    const [modalVehiculo, setModalVehiculo] = useState(false);
    const [editVehiculo, setEditVehiculo] = useState<Vehiculo | null>(null);
    const [modalSeguro, setModalSeguro] = useState(false);
    const [editSeguro, setEditSeguro] = useState<VehiculoSeguro | null>(null);
    const [modalPermiso, setModalPermiso] = useState(false);
    const [editPermiso, setEditPermiso] = useState<VehiculoPermiso | null>(null);

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
            const [s, p] = await Promise.all([
                api.get<{ data: VehiculoSeguro[] }>(`/vehiculos/${vId}/seguros`),
                api.get<{ data: VehiculoPermiso[] }>(`/vehiculos/${vId}/permisos`),
            ]);
            setSeguros(s.data.data || []);
            setPermisos(p.data.data || []);
        } catch { /* silencioso */ }
        finally { setDetailLoading(false); }
    }, []);

    useEffect(() => { fetchVehiculos(); }, [fetchVehiculos]);
    useEffect(() => { if (selected) fetchDetail(selected.id); }, [selected, fetchDetail]);

    // Opciones únicas para los dropdowns de filtro (se generan a partir de
    // los vehículos cargados — la persona no escribe, elige).
    const opcionesFiltro = useMemo(() => {
        const patentes = Array.from(new Set(vehiculos.map(v => v.patente))).sort();
        const marcas   = Array.from(new Set(vehiculos.map(v => v.marca))).sort();
        const modelos  = Array.from(new Set(vehiculos.map(v => v.modelo))).sort();
        const tipos    = Array.from(new Set(vehiculos.map(v => v.tipo))).sort();
        return { patentes, marcas, modelos, tipos };
    }, [vehiculos]);

    // Lista filtrada — combina texto libre + 4 dropdowns (AND entre ellos).
    const vehiculosFiltrados = useMemo(() => {
        const q = filtro.trim().toLowerCase();
        return vehiculos.filter(v => {
            if (q && !(
                v.patente.toLowerCase().includes(q) ||
                v.marca.toLowerCase().includes(q) ||
                v.modelo.toLowerCase().includes(q) ||
                String(v.anio).includes(q) ||
                v.tipo.toLowerCase().includes(q)
            )) return false;
            if (filtroPatente && v.patente !== filtroPatente) return false;
            if (filtroMarca   && v.marca   !== filtroMarca)   return false;
            if (filtroModelo  && v.modelo  !== filtroModelo)  return false;
            if (filtroTipo    && v.tipo    !== filtroTipo)    return false;
            return true;
        });
    }, [vehiculos, filtro, filtroPatente, filtroMarca, filtroModelo, filtroTipo]);

    const limpiarFiltros = () => {
        setFiltro(''); setFiltroPatente(''); setFiltroMarca(''); setFiltroModelo(''); setFiltroTipo('');
    };

    // ── Header global de página ───────────────────────────────────────────────
    // Title: estilo Inventario (icono + título + subtítulo descriptivo).
    // Actions: botón Filtros (toggle) + Nuevo vehículo. Mismo patrón que Consultas.
    const headerTitle = useMemo(() => (
        <div className="flex items-center gap-3">
            <Truck className="h-6 w-6 text-brand-primary" />
            <div className="flex flex-col leading-tight">
                <h1 className="text-lg font-bold text-brand-dark">
                    Vehículos
                    <span className="ml-2 text-xs font-black bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-md align-middle">
                        {vehiculos.length}
                    </span>
                </h1>
                <p className="text-muted-foreground text-xs">Seguros y Antecedentes de Circulación</p>
            </div>
        </div>
    ), [vehiculos.length]);

    const filtrosActivos =
        (filtro.trim() ? 1 : 0) +
        (filtroPatente ? 1 : 0) +
        (filtroMarca ? 1 : 0) +
        (filtroModelo ? 1 : 0) +
        (filtroTipo ? 1 : 0);

    const headerActions = useMemo(() => (
        <div className="flex items-center gap-2">
            <Button
                size="sm"
                variant={showFiltros ? 'primary' : 'outline'}
                onClick={() => setShowFiltros(v => !v)}
                leftIcon={showFiltros ? <X className="h-3.5 w-3.5" /> : <Filter className="h-3.5 w-3.5" />}
                className="h-9"
            >
                <span className="hidden sm:inline">Filtros</span>
                {filtrosActivos > 0 && (
                    <span className={cn(
                        "ml-1 flex h-4 w-4 items-center justify-center rounded-full text-micro font-bold",
                        showFiltros ? "bg-card text-brand-primary" : "bg-brand-primary text-white"
                    )}>
                        {filtrosActivos}
                    </span>
                )}
            </Button>
            {hasPermission('vehiculos.crear') && (
                <Button size="sm" onClick={() => { setEditVehiculo(null); setModalVehiculo(true); }}
                    leftIcon={<Plus className="h-3.5 w-3.5" />} className="h-9">
                    <span className="hidden sm:inline">Nuevo vehículo</span>
                    <span className="sm:hidden">Nuevo</span>
                </Button>
            )}
        </div>
    ), [showFiltros, filtrosActivos, hasPermission]);

    useSetPageHeader(headerTitle, headerActions);

    // Auto-selección del primer vehículo en desktop, para que al entrar a la
    // página el panel de detalle se vea desde el inicio (no vacío).
    useEffect(() => {
        if (selected || vehiculos.length === 0) return;
        const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
        if (isDesktop) setSelected(vehiculos[0]);
    }, [vehiculos, selected]);

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
        <div className="flex flex-col flex-1 min-h-0 py-4 md:py-6 min-w-0">
            {loading ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm px-4 md:px-6">Cargando...</div>
            ) : vehiculos.length === 0 ? (
                <EmptyState icon={Truck} title="Sin vehículos registrados"
                    description={'Haz clic en "Nuevo vehículo" para comenzar'}
                    className="flex-1 justify-center px-4 md:px-6" />
            ) : vehiculosFiltrados.length === 0 ? (
                <EmptyState icon={Search} title={`No se encontraron resultados para "${filtro}"`}
                    className="flex-1 justify-center px-4 md:px-6" />
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto">
                    {vehiculosFiltrados.map(v => (
                        <div key={v.id}
                            onClick={() => setSelected(v)}
                            className={cn(
                                // Item base: full-width, separación por línea inferior (no border completo)
                                'relative cursor-pointer transition-all px-4 md:px-6 py-3 border-l-[3px]',
                                'border-b border-b-border/50 last:border-b-0',
                                selected?.id === v.id
                                    // Seleccionado: acento verde a la izquierda + fondo suave;
                                    // en desktop quita el padding-right para "conectarse" con el panel detalle.
                                    ? 'border-l-brand-primary bg-brand-primary/[0.06]'
                                    : 'border-l-transparent hover:bg-brand-primary/[0.03] hover:border-l-brand-primary/30'
                            )}>
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    {/* Nombre del vehículo en orden: empresa · marca · patente · conductor asignado */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {v.empresa && (
                                            <span className="text-caption font-bold px-1.5 py-0.5 rounded-md bg-brand-primary/10 text-brand-primary uppercase tracking-wide">{v.empresa}</span>
                                        )}
                                        <span className="font-semibold text-brand-dark text-sm">{v.marca}</span>
                                        <span className="font-black text-brand-dark text-sm">{v.patente}</span>
                                        {v.conductor_nombre && (
                                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-dark">
                                                <User className="h-3.5 w-3.5 text-brand-primary" /> {v.conductor_nombre}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                        <span className="text-caption text-muted-foreground">{v.modelo} {v.anio}</span>
                                        <span className="text-caption px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-semibold capitalize">{v.tipo}</span>
                                        <EstadoVencimiento fecha={v.seguro_vencimiento} label="seguro" />
                                        <span className="text-caption text-muted-foreground">{fmtNumber(v.kilometraje_actual || 0)} km</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    {hasPermission('vehiculos.editar') && (
                                        <IconButton size="sm" aria-label="Editar vehículo"
                                            onClick={e => { e.stopPropagation(); setEditVehiculo(v); setModalVehiculo(true); }}
                                            className="hover:bg-brand-primary/10 hover:text-brand-primary"
                                            icon={<Edit2 className="h-3.5 w-3.5" />} />
                                    )}
                                    {hasPermission('vehiculos.eliminar') && (
                                        <IconButton size="sm" variant="danger" aria-label="Dar de baja vehículo"
                                            onClick={e => { e.stopPropagation(); handleDelete(v); }}
                                            icon={<Trash2 className="h-3.5 w-3.5" />} />
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
        <div className="flex flex-col flex-1 min-h-0 p-4 md:p-6 md:w-[420px] md:shrink-0 md:border-l md:border-border">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4 shrink-0">
                {/* Botón volver - solo en móvil */}
                <IconButton aria-label="Volver" onClick={() => setSelected(null)}
                    className="md:hidden" icon={<ChevronLeft className="h-5 w-5" />} />
                <div className="flex-1 min-w-0">
                    <p className="text-caption uppercase font-black text-muted-foreground tracking-widest">Detalle vehículo</p>
                    <h4 className="text-base font-black text-brand-dark truncate">
                        {selected.patente} · {selected.marca} {selected.modelo} {selected.anio}
                        {selected.conductor_nombre && <span className="text-brand-primary"> · {selected.conductor_nombre}</span>}
                    </h4>
                </div>
                <IconButton size="sm" aria-label="Cerrar detalle" onClick={() => setSelected(null)}
                    className="hidden md:flex" icon={<X className="h-4 w-4" />} />
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
                                        {s.compania && <span className="text-caption text-muted-foreground">{s.compania}</span>}
                                        <EstadoVencimiento fecha={s.fecha_vencimiento} label="seguro" />
                                    </div>
                                    <p className="text-caption text-muted-foreground mt-0.5">
                                        {fmtDate(s.fecha_inicio)} → {fmtDate(s.fecha_vencimiento)}
                                        {(s as any).numero_poliza ? ` · Pól. ${(s as any).numero_poliza}` : ''}
                                        {(s as any).monto ? ` · ${fmtMoney((s as any).monto)}` : ''}
                                    </p>
                                    <AlertaBadge diasAlerta={(s as any).dias_alerta} emailAlerta={(s as any).email_alerta} />
                                </ItemRow>
                            ))
                        }
                    </Section>

                    {/* ANTECEDENTES DE CIRCULACIÓN */}
                    <Section
                        icon={<ScrollText className="h-3.5 w-3.5" />}
                        title="Antecedentes de Circulación"
                        onAdd={hasPermission('vehiculos.crear') ? () => setModalPermiso(true) : undefined}
                    >
                        {permisos.length === 0
                            ? <Empty>Sin antecedentes registrados</Empty>
                            : permisos.map(p => (
                                <ItemRow key={p.id}
                                    onEdit={hasPermission('vehiculos.editar') ? () => { setEditPermiso(p); setModalPermiso(true); } : undefined}
                                    onDelete={hasPermission('vehiculos.eliminar') ? () => removeItem('permisos', p.id) : undefined}>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-bold text-brand-dark">Antecedente de Circulación</span>
                                        <EstadoVencimiento fecha={p.fecha_vencimiento} label="permiso" />
                                    </div>
                                    <p className="text-caption text-muted-foreground mt-0.5">
                                        {(p as any).fecha_emision ? `${fmtDate((p as any).fecha_emision)} → ` : ''}{fmtDate(p.fecha_vencimiento)}
                                        {(p as any).municipalidad ? ` · ${(p as any).municipalidad}` : ''}
                                        {(p as any).numero_permiso ? ` · N° ${(p as any).numero_permiso}` : ''}
                                        {(p as any).monto ? ` · ${fmtMoney((p as any).monto)}` : ''}
                                    </p>
                                    <AlertaBadge diasAlerta={(p as any).dias_alerta} emailAlerta={(p as any).email_alerta} />
                                </ItemRow>
                            ))
                        }
                    </Section>
                </div>
            )}
        </div>
    ) : null;

    // ── Helper: botones del headerAction para cada modal de form ─────────────
    // El botón Guardar usa form="..." (HTML5) para disparar el submit del form
    // aunque viva fuera del <form>. Cancelar llama al onClose del Modal.
    const formActions = (formId: string, onCancel: () => void) => (
        <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
            <Button type="submit" size="sm" form={formId} leftIcon={<Save className="h-3.5 w-3.5" />}>
                Guardar
            </Button>
        </div>
    );

    // ── Layout responsive ─────────────────────────────────────────────────────

    return (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
            {/* PANEL DE FILTROS (toggle desde el header) */}
            {showFiltros && (
                <div className="bg-card border border-border rounded-2xl shadow-sm p-4 md:p-5 shrink-0 animate-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-2 mb-3">
                        <Filter className="h-3.5 w-3.5 text-brand-primary" />
                        <span className="text-xs font-black text-brand-dark/60 uppercase tracking-widest">Filtros de búsqueda</span>
                        {filtrosActivos > 0 && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={limpiarFiltros}
                                className="ml-auto text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            >
                                Limpiar filtros
                            </Button>
                        )}
                    </div>

                    {/* Búsqueda de texto libre (atajo rápido) */}
                    <div className="mb-3">
                        <label className="block text-caption font-bold text-brand-primary uppercase tracking-wider mb-1.5">
                            Buscar
                        </label>
                        <div className="relative">
                            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            <input
                                type="text"
                                value={filtro}
                                onChange={e => setFiltro(e.target.value)}
                                placeholder="Patente, marca, modelo, año o tipo..."
                                className="w-full pl-9 pr-8 py-2 text-sm border border-border rounded-xl bg-card focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                            />
                            {filtro && (
                                <IconButton
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setFiltro('')}
                                    className="absolute right-1 top-1/2 -translate-y-1/2"
                                    aria-label="Limpiar"
                                    icon={<X className="h-3.5 w-3.5" />}
                                />
                            )}
                        </div>
                    </div>

                    {/* Dropdowns con opciones existentes (la persona elige, no escribe) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                            <label className="block text-caption font-bold text-brand-primary uppercase tracking-wider mb-1.5">Patente</label>
                            <select
                                value={filtroPatente}
                                onChange={e => setFiltroPatente(e.target.value)}
                                className={cn(
                                    "w-full px-3 py-2 text-sm border rounded-xl bg-card focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary appearance-none cursor-pointer",
                                    filtroPatente ? "border-brand-primary text-brand-primary font-semibold" : "border-border text-brand-dark"
                                )}
                            >
                                <option value="">Todas las patentes</option>
                                {opcionesFiltro.patentes.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-caption font-bold text-brand-primary uppercase tracking-wider mb-1.5">Marca</label>
                            <select
                                value={filtroMarca}
                                onChange={e => setFiltroMarca(e.target.value)}
                                className={cn(
                                    "w-full px-3 py-2 text-sm border rounded-xl bg-card focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary appearance-none cursor-pointer",
                                    filtroMarca ? "border-brand-primary text-brand-primary font-semibold" : "border-border text-brand-dark"
                                )}
                            >
                                <option value="">Todas las marcas</option>
                                {opcionesFiltro.marcas.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-caption font-bold text-brand-primary uppercase tracking-wider mb-1.5">Modelo</label>
                            <select
                                value={filtroModelo}
                                onChange={e => setFiltroModelo(e.target.value)}
                                className={cn(
                                    "w-full px-3 py-2 text-sm border rounded-xl bg-card focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary appearance-none cursor-pointer",
                                    filtroModelo ? "border-brand-primary text-brand-primary font-semibold" : "border-border text-brand-dark"
                                )}
                            >
                                <option value="">Todos los modelos</option>
                                {opcionesFiltro.modelos.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-caption font-bold text-brand-primary uppercase tracking-wider mb-1.5">Tipo</label>
                            <select
                                value={filtroTipo}
                                onChange={e => setFiltroTipo(e.target.value)}
                                className={cn(
                                    "w-full px-3 py-2 text-sm border rounded-xl bg-card focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary appearance-none cursor-pointer capitalize",
                                    filtroTipo ? "border-brand-primary text-brand-primary font-semibold" : "border-border text-brand-dark"
                                )}
                            >
                                <option value="">Todos los tipos</option>
                                {opcionesFiltro.tipos.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* MOBILE: alterna entre lista y detalle */}
            <div className="md:hidden flex flex-1 min-h-0 bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
                {selected ? DetailView : ListView}
            </div>

            {/* DESKTOP: lista + detalle dentro de un mismo card (separados por border interno) */}
            <div className="hidden md:flex flex-1 min-h-0 bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
                {ListView}
                {DetailView}
            </div>

            {/* ── Modales ── */}
            <Modal isOpen={modalVehiculo} onClose={() => setModalVehiculo(false)}
                title={editVehiculo ? 'Editar Vehículo' : 'Nuevo Vehículo'} size="lg"
                headerAction={formActions('vehiculo-form', () => setModalVehiculo(false))}>
                <VehiculoForm initialData={editVehiculo} onCancel={() => setModalVehiculo(false)}
                    onSuccess={() => { setModalVehiculo(false); fetchVehiculos(); }} />
            </Modal>

            {selected && (
                <>
                    <Modal isOpen={modalSeguro}
                        onClose={() => { setModalSeguro(false); setEditSeguro(null); }}
                        title={editSeguro ? 'Editar Seguro' : 'Agregar Seguro'} size="lg"
                        headerAction={formActions('seguro-form', () => { setModalSeguro(false); setEditSeguro(null); })}>
                        <SeguroForm vehiculoId={selected.id} initialData={editSeguro}
                            onCancel={() => { setModalSeguro(false); setEditSeguro(null); }}
                            onSuccess={() => { setModalSeguro(false); setEditSeguro(null); fetchDetail(selected.id); fetchVehiculos(); }} />
                    </Modal>
                    <Modal isOpen={modalPermiso}
                        onClose={() => { setModalPermiso(false); setEditPermiso(null); }}
                        title={editPermiso ? 'Editar Antecedente de Circulación' : 'Agregar Antecedente de Circulación'} size="lg"
                        headerAction={formActions('permiso-form', () => { setModalPermiso(false); setEditPermiso(null); })}>
                        <PermisoCirculacionForm vehiculoId={selected.id} initialData={editPermiso}
                            onCancel={() => { setModalPermiso(false); setEditPermiso(null); }}
                            onSuccess={() => { setModalPermiso(false); setEditPermiso(null); fetchDetail(selected.id); fetchVehiculos(); }} />
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
                <Button variant="ghost" size="sm" onClick={onAdd}
                    leftIcon={<Plus className="h-3 w-3" />}
                    className="text-brand-primary hover:text-brand-primary hover:bg-brand-primary/5">
                    Agregar
                </Button>
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
                <IconButton size="sm" aria-label="Editar" onClick={onEdit}
                    className="hover:bg-brand-primary/10 hover:text-brand-primary"
                    icon={<Pencil className="h-3.5 w-3.5" />} />
            )}
            {onDelete && (
                <IconButton size="sm" variant="danger" aria-label="Eliminar" onClick={onDelete}
                    icon={<Trash2 className="h-3.5 w-3.5" />} />
            )}
        </div>
    </div>
);

const Empty: React.FC<{ children: string }> = ({ children }) => (
    <p className="text-xs text-muted-foreground py-1 pl-1 italic">{children}</p>
);

export default VehiculosPage;
