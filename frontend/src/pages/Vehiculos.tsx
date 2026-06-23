import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Truck, Plus, Building2,
    Trash2, Edit2, X, ChevronLeft, ChevronRight, Search, Filter, Save, User, FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../utils/cn';
import { useAuth } from '../context/AuthContext';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { EmptyState } from '../components/ui/EmptyState';
import { fmtNumber } from '../utils/format';
import { VehiculoForm } from '../components/vehiculos/VehiculoForm';
import { EmpresaForm } from '../components/vehiculos/EmpresaForm';
import { VehiculoDocumentos } from '../components/vehiculos/VehiculoDocumentos';
import api from '../services/api';
import type { Vehiculo, EmpresaVehiculo } from '../types/entities';
import type { ApiResponse } from '../types';

// Color neutro para el grupo "Sin empresa" (slate-400). No es una empresa real.
const SIN_EMPRESA_COLOR = '#94a3b8';
// Fondo suave a partir de un hex de 6 dígitos (~10% alpha).
const softBg = (hex: string) => `${hex}1a`;

// ── Componente principal ──────────────────────────────────────────────────────

const VehiculosPage: React.FC = () => {
    const { hasPermission } = useAuth();

    const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
    const [empresas, setEmpresas] = useState<EmpresaVehiculo[]>([]);
    const [loading, setLoading] = useState(false);

    // Navegación de 2 niveles:
    //   null            → Nivel 1: grid de empresas
    //   EmpresaVehiculo → Nivel 2: vehículos de esa empresa
    //   'sin'           → Nivel 2: vehículos sin empresa asignada
    const [selectedEmpresa, setSelectedEmpresa] = useState<EmpresaVehiculo | 'sin' | null>(null);
    // Dentro del Nivel 2, vehículo seleccionado para el panel de detalle.
    const [selected, setSelected] = useState<Vehiculo | null>(null);

    // Filtro de búsqueda (patente, marca, modelo, año, tipo) — sólo Nivel 2.
    const [filtro, setFiltro] = useState('');
    const [filtroPatente, setFiltroPatente] = useState('');
    const [filtroMarca, setFiltroMarca] = useState('');
    const [filtroModelo, setFiltroModelo] = useState('');
    const [filtroTipo, setFiltroTipo] = useState('');
    const [showFiltros, setShowFiltros] = useState(false);

    const [modalVehiculo, setModalVehiculo] = useState(false);
    const [editVehiculo, setEditVehiculo] = useState<Vehiculo | null>(null);
    const [modalEmpresa, setModalEmpresa] = useState(false);
    const [editEmpresa, setEditEmpresa] = useState<EmpresaVehiculo | null>(null);

    // ── Fetch ─────────────────────────────────────────────────────────────────

    const fetchVehiculos = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<{ data: Vehiculo[] }>('/vehiculos');
            setVehiculos(res.data.data || []);
        } catch { toast.error('Error al cargar vehículos'); }
        finally { setLoading(false); }
    }, []);

    const fetchEmpresas = useCallback(async () => {
        try {
            // limit alto: el catálogo es paramétrico ("sin límite"); evita el truncado
            // por la paginación por defecto (50) del CRUD genérico.
            const res = await api.get<ApiResponse<EmpresaVehiculo[]>>('/empresas-vehiculos?activo=true&limit=1000');
            setEmpresas(res.data.data || []);
        } catch { /* no bloquea: el grid puede armarse desde los vehículos */ }
    }, []);

    useEffect(() => { fetchVehiculos(); fetchEmpresas(); }, [fetchVehiculos, fetchEmpresas]);

    // ── Estado derivado de navegación ───────────────────────────────────────
    const enNivel2 = selectedEmpresa !== null;
    const empresaActiva = selectedEmpresa === 'sin' || selectedEmpresa === null ? null : selectedEmpresa;

    // Ids de empresas activas (las que aparecen como tarjeta en el Nivel 1).
    const empresasActivasIds = useMemo(() => new Set(empresas.map(e => e.id)), [empresas]);

    // Conteo de vehículos por empresa (cliente → reactivo a altas/bajas). Un vehículo
    // cuya empresa no está activa (o es null) se cuenta como "Sin empresa", para que
    // nunca quede inalcanzable si su empresa fue desactivada.
    const conteos = useMemo(() => {
        const porEmpresa = new Map<number, number>();
        let sin = 0;
        vehiculos.forEach(v => {
            if (v.empresa_id != null && empresasActivasIds.has(v.empresa_id)) {
                porEmpresa.set(v.empresa_id, (porEmpresa.get(v.empresa_id) || 0) + 1);
            } else sin++;
        });
        return { porEmpresa, sin };
    }, [vehiculos, empresasActivasIds]);

    // Vehículos de la empresa activa (Nivel 2), antes de los filtros de búsqueda.
    const vehiculosEmpresa = useMemo(() => {
        if (!enNivel2) return [];
        if (selectedEmpresa === 'sin') {
            return vehiculos.filter(v => v.empresa_id == null || !empresasActivasIds.has(v.empresa_id));
        }
        return vehiculos.filter(v => v.empresa_id === (selectedEmpresa as EmpresaVehiculo).id);
    }, [vehiculos, empresasActivasIds, selectedEmpresa, enNivel2]);

    // Opciones únicas para los dropdowns de filtro (acotadas a la empresa activa).
    const opcionesFiltro = useMemo(() => {
        const patentes = Array.from(new Set(vehiculosEmpresa.map(v => v.patente))).sort();
        const marcas   = Array.from(new Set(vehiculosEmpresa.map(v => v.marca))).sort();
        const modelos  = Array.from(new Set(vehiculosEmpresa.map(v => v.modelo))).sort();
        const tipos    = Array.from(new Set(vehiculosEmpresa.map(v => v.tipo))).sort();
        return { patentes, marcas, modelos, tipos };
    }, [vehiculosEmpresa]);

    // Lista filtrada — combina texto libre + 4 dropdowns (AND entre ellos).
    const vehiculosFiltrados = useMemo(() => {
        const q = filtro.trim().toLowerCase();
        return vehiculosEmpresa.filter(v => {
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
    }, [vehiculosEmpresa, filtro, filtroPatente, filtroMarca, filtroModelo, filtroTipo]);

    const limpiarFiltros = () => {
        setFiltro(''); setFiltroPatente(''); setFiltroMarca(''); setFiltroModelo(''); setFiltroTipo('');
    };

    const filtrosActivos =
        (filtro.trim() ? 1 : 0) +
        (filtroPatente ? 1 : 0) +
        (filtroMarca ? 1 : 0) +
        (filtroModelo ? 1 : 0) +
        (filtroTipo ? 1 : 0);

    // ── Navegación ──────────────────────────────────────────────────────────
    const volverANivel1 = useCallback(() => {
        setSelectedEmpresa(null);
        setSelected(null);
        setShowFiltros(false);
        limpiarFiltros();
    }, []);

    const entrarEmpresa = (e: EmpresaVehiculo | 'sin') => {
        setSelectedEmpresa(e);
        setSelected(null);
    };

    // ── Header global de página (cambia según el nivel) ─────────────────────
    const empresaActivaNombre = selectedEmpresa === 'sin' ? 'Sin empresa' : empresaActiva?.nombre ?? '';
    const empresaActivaColor  = selectedEmpresa === 'sin' ? SIN_EMPRESA_COLOR : empresaActiva?.color ?? SIN_EMPRESA_COLOR;

    const headerTitle = useMemo(() => {
        if (!enNivel2) {
            return (
                <div className="flex items-center gap-3">
                    <Truck className="h-6 w-6 text-brand-primary" />
                    <div className="flex flex-col leading-tight">
                        <h1 className="text-lg font-bold text-brand-dark">
                            Vehículos
                            <span className="ml-2 text-xs font-black bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-md align-middle">
                                {vehiculos.length}
                            </span>
                        </h1>
                        <p className="text-muted-foreground text-xs">Empresas de flota</p>
                    </div>
                </div>
            );
        }
        return (
            <div className="flex items-center gap-2.5 min-w-0">
                {/* Sin botón "volver": en desktop las empresas están siempre a la izquierda
                    y en móvil son chips arriba; el detalle de vehículo tiene su propio volver. */}
                <IconButton aria-label="Volver a empresas" onClick={volverANivel1}
                    className="hidden" icon={<ChevronLeft className="h-5 w-5" />} />
                <div className="flex flex-col leading-tight min-w-0">
                    <h1 className="text-lg font-bold text-brand-dark flex items-center gap-2 min-w-0">
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-bold truncate"
                            style={{ color: empresaActivaColor, backgroundColor: softBg(empresaActivaColor) }}>
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: empresaActivaColor }} />
                            <span className="truncate">{empresaActivaNombre}</span>
                        </span>
                        <span className="text-xs font-black bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-md align-middle shrink-0">
                            {vehiculosEmpresa.length}
                        </span>
                    </h1>
                    <p className="text-muted-foreground text-xs">Vehículos de la empresa</p>
                </div>
            </div>
        );
    }, [enNivel2, vehiculos.length, vehiculosEmpresa.length, empresaActivaNombre, empresaActivaColor, volverANivel1]);

    const headerActions = useMemo(() => (
        <div className="flex items-center gap-2">
            {/* Nueva empresa: en móvil/tablet solo en el Nivel 1; en desktop siempre
                (la columna de empresas está siempre visible). */}
            {hasPermission('vehiculos.crear') && (
                <span className={cn(enNivel2 && 'hidden lg:inline-flex')}>
                    <Button size="sm" onClick={() => { setEditEmpresa(null); setModalEmpresa(true); }}
                        title="Nueva empresa" aria-label="Nueva empresa"
                        leftIcon={<Plus className="h-4 w-4" />} className="h-9">
                        <span className="hidden sm:inline">Nueva empresa</span>
                    </Button>
                </span>
            )}
            {enNivel2 && (
                <>
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
                    {/* "Nuevo vehículo" se movió a un ícono dentro de cada tarjeta de empresa. */}
                </>
            )}
        </div>
    ), [enNivel2, showFiltros, filtrosActivos, hasPermission]);

    useSetPageHeader(headerTitle, headerActions);

    // Auto-selección del primer vehículo SOLO en desktop ≥1024px (layout de 3
    // columnas), para que el panel de detalle no quede vacío al elegir una empresa.
    // En móvil/tablet (paso a paso) NO se auto-selecciona: el usuario ve primero la
    // lista de vehículos y elige cuál abrir.
    useEffect(() => {
        if (!enNivel2 || selected || vehiculosEmpresa.length === 0) return;
        const is3Col = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
        if (is3Col) setSelected(vehiculosEmpresa[0]);
    }, [enNivel2, vehiculosEmpresa, selected]);

    // En móvil (<lg) las empresas son chips arriba; preseleccionamos la primera para
    // que la lista de vehículos no quede vacía. En desktop, null = placeholder (se deja).
    useEffect(() => {
        if (selectedEmpresa !== null) return;
        const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
        if (!isMobile) return;
        if (empresas.length > 0) setSelectedEmpresa(empresas[0]);
        else if (conteos.sin > 0) setSelectedEmpresa('sin');
    }, [selectedEmpresa, empresas, conteos.sin]);

    // Reconciliar el detalle: si el vehículo seleccionado salió del bucket activo
    // (p.ej. se le cambió la empresa al editarlo) cerramos el detalle; si solo
    // cambiaron sus datos, lo refrescamos para no mostrar info obsoleta.
    useEffect(() => {
        if (!selected) return;
        const vigente = vehiculosEmpresa.find(v => v.id === selected.id);
        if (!vigente) setSelected(null);
        else if (vigente !== selected) setSelected(vigente);
    }, [vehiculosEmpresa, selected]);

    // ── Acciones ────────────────────────────────────────────────────────────
    const handleDelete = async (v: Vehiculo) => {
        if (!confirm(`¿Dar de baja el vehículo ${v.patente}?`)) return;
        try {
            await api.delete(`/vehiculos/${v.id}`);
            toast.success('Vehículo dado de baja');
            if (selected?.id === v.id) setSelected(null);
            fetchVehiculos(); fetchEmpresas(); // refresca conteos del backend
        } catch (err: any) { toast.error(err.response?.data?.error || 'Error al eliminar'); }
    };

    const handleDeleteEmpresa = async (e: EmpresaVehiculo) => {
        if (!confirm(`¿Eliminar la empresa "${e.nombre}"?`)) return;
        try {
            await api.delete(`/empresas-vehiculos/${e.id}`);
            toast.success('Empresa eliminada');
            fetchEmpresas();
        } catch (err: any) {
            // El backend rechaza (400) si la empresa todavía tiene vehículos.
            toast.error(err.response?.data?.error || 'Error al eliminar empresa');
        }
    };

    // ── Nivel 1: empresas como TARJETAS (estilo "Obras Finalizadas") ──────────
    // Cada empresa es una tarjeta: nombre (con su color, que envuelve a 2ª línea si
    // es largo) + caja destacada con la cantidad de vehículos + editar/eliminar.
    const renderEmpresaCard = (
        key: React.Key,
        nombre: string,
        color: string,
        count: number,
        activa: boolean,
        onEnter: () => void,
        acciones?: React.ReactNode,
    ) => (
        <div key={key}
            onClick={onEnter}
            role="button" tabIndex={0}
            onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onEnter(); } }}
            className={cn(
                'flex flex-col rounded-2xl border bg-card shadow-sm cursor-pointer transition-all overflow-hidden',
                'focus:outline-none focus:ring-2 focus:ring-brand-primary/30',
                activa
                    // Empresa activa: resaltada (en desktop queda visible junto a sus vehículos).
                    ? 'border-brand-primary ring-1 ring-brand-primary/30'
                    : 'border-border hover:border-brand-primary/40 hover:shadow-md'
            )}>
            {/* Cabecera: punto de color + nombre (envuelve, no se corta) + acciones */}
            <div className="flex items-start justify-between gap-2 p-3.5 pb-2.5 border-b border-border/60">
                <div className="flex items-start gap-2 min-w-0">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: color }} />
                    <h3 className="text-sm font-black leading-tight break-words" style={{ color }}>{nombre}</h3>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                    {acciones}
                    {/* Chevron solo en móvil/tablet (ahí navega). En desktop 3-col, clic = seleccionar. */}
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 lg:hidden" />
                </div>
            </div>
            {/* Caja destacada con la cantidad de vehículos */}
            <div className="p-3.5 pt-3">
                <div className="flex items-center gap-2.5 rounded-xl bg-brand-primary/5 border border-brand-primary/15 px-3 py-2">
                    <Truck className="h-4 w-4 text-brand-primary shrink-0" />
                    <div className="leading-tight">
                        <p className="text-lg font-black text-brand-dark">{count}</p>
                        <p className="text-micro text-muted-foreground uppercase font-bold tracking-wide">
                            {count === 1 ? 'vehículo' : 'vehículos'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );

    // Chip compacto de empresa (selector horizontal en móvil): punto de color +
    // nombre completo + contador. El activo se rellena con el color de la empresa.
    const renderEmpresaChip = (
        key: React.Key,
        nombre: string,
        color: string,
        count: number,
        activa: boolean,
        onSelect: () => void,
    ) => (
        <button key={key} type="button" onClick={onSelect}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold whitespace-nowrap shrink-0 transition-colors',
                activa ? 'border-transparent text-white shadow-sm' : 'border-border bg-card text-brand-dark'
            )}
            style={activa ? { backgroundColor: color } : undefined}
        >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: activa ? '#ffffff' : color }} />
            <span>{nombre}</span>
            <span className={cn('rounded-full px-1.5 text-xs', activa ? 'bg-white/25' : 'bg-muted text-muted-foreground')}>{count}</span>
        </button>
    );

    const EmpresasList = (
        <div className="flex flex-col flex-1 min-h-0 py-4 md:py-6 min-w-0">
            {loading ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm px-4 md:px-6">Cargando...</div>
            ) : empresas.length === 0 && conteos.sin === 0 ? (
                <EmptyState icon={Building2} title="Sin empresas registradas"
                    description={'Haz clic en "Nueva empresa" para comenzar'}
                    className="flex-1 justify-center px-4 md:px-6" />
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto w-full md:max-w-md lg:max-w-none px-3 md:px-4">
                    {/* Móvil 100%; tablet acotado. En desktop el ancho lo fija la columna (3 paneles).
                        Tarjetas apiladas con separación (estilo Obras Finalizadas). */}
                    <div className="flex flex-col gap-3">
                    {empresas.map(e => {
                        // Conteo autoritativo del backend (vehiculos_count); el cálculo
                        // client-side queda como fallback reactivo.
                        const count = e.vehiculos_count ?? (conteos.porEmpresa.get(e.id) || 0);
                        const acciones = (
                            <>
                                {hasPermission('vehiculos.crear') && (
                                    <IconButton size="sm" aria-label="Nuevo vehículo en esta empresa" title="Nuevo vehículo"
                                        onClick={ev => { ev.stopPropagation(); setSelectedEmpresa(e); setSelected(null); setEditVehiculo(null); setModalVehiculo(true); }}
                                        className="text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary"
                                        icon={<Plus className="h-4 w-4" />} />
                                )}
                                {hasPermission('vehiculos.editar') && (
                                    <IconButton size="sm" aria-label="Editar empresa" title="Editar empresa"
                                        onClick={ev => { ev.stopPropagation(); setEditEmpresa(e); setModalEmpresa(true); }}
                                        className="hover:bg-brand-primary/10 hover:text-brand-primary"
                                        icon={<Edit2 className="h-3.5 w-3.5" />} />
                                )}
                                {hasPermission('vehiculos.eliminar') && (
                                    <IconButton size="sm" variant="danger" aria-label="Eliminar empresa" title="Eliminar empresa"
                                        onClick={ev => { ev.stopPropagation(); handleDeleteEmpresa(e); }}
                                        icon={<Trash2 className="h-3.5 w-3.5" />} />
                                )}
                            </>
                        );
                        const activa = selectedEmpresa !== 'sin' && selectedEmpresa?.id === e.id;
                        return renderEmpresaCard(e.id, e.nombre, e.color, count, activa, () => entrarEmpresa(e), acciones);
                    })}

                    {/* Grupo "Sin empresa": sólo aparece si hay vehículos sin asignar */}
                    {conteos.sin > 0 &&
                        renderEmpresaCard('sin', 'Sin empresa', SIN_EMPRESA_COLOR, conteos.sin, selectedEmpresa === 'sin', () => entrarEmpresa('sin'))}
                    </div>
                </div>
            )}
        </div>
    );

    // ── Nivel 2: vista lista ──────────────────────────────────────────────────
    const ListView = (
        <div className="flex flex-col flex-1 min-h-0 py-4 md:py-6 min-w-0">
            {loading ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm px-4 md:px-6">Cargando...</div>
            ) : vehiculosEmpresa.length === 0 ? (
                <EmptyState icon={Truck} title="Sin vehículos en esta empresa"
                    description={'Haz clic en "Nuevo vehículo" para agregar el primero'}
                    className="flex-1 justify-center px-4 md:px-6" />
            ) : vehiculosFiltrados.length === 0 ? (
                <EmptyState icon={Search} title={`No se encontraron resultados para "${filtro}"`}
                    className="flex-1 justify-center px-4 md:px-6" />
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto">
                    {vehiculosFiltrados.map(v => (
                        <div key={v.id}
                            onClick={() => { if (hasPermission('vehiculos.editar')) { setEditVehiculo(v); setModalVehiculo(true); } else setSelected(v); }}
                            title={hasPermission('vehiculos.editar') ? 'Editar vehículo' : 'Ver documentos'}
                            className={cn(
                                'relative cursor-pointer transition-all px-4 md:px-6 py-3 border-l-[3px]',
                                'border-b border-b-border/50 last:border-b-0',
                                selected?.id === v.id
                                    ? 'border-l-brand-primary bg-brand-primary/[0.06]'
                                    : 'border-l-transparent hover:bg-brand-primary/[0.03] hover:border-l-brand-primary/30'
                            )}>
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    {/* marca · patente · conductor (la empresa ya está en el encabezado del nivel) */}
                                    <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap">
                                        <span className="font-semibold text-brand-dark text-sm break-words min-w-0">{v.marca}</span>
                                        <span className="font-black text-brand-dark text-sm break-words min-w-0">{v.patente}</span>
                                        {v.conductor_nombre && (
                                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-dark min-w-0">
                                                <User className="h-3.5 w-3.5 text-brand-primary shrink-0" /> <span className="break-words min-w-0">{v.conductor_nombre}</span>
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                        <span className="text-caption text-muted-foreground">{v.modelo} {v.anio}</span>
                                        <span className="text-caption px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-semibold capitalize">{v.tipo}</span>
                                        {v.es_leasing && (
                                            <span className="text-caption px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold dark:bg-amber-500/20 dark:text-amber-300">Leasing</span>
                                        )}
                                        <span className="text-caption text-muted-foreground">{fmtNumber(v.kilometraje_actual || 0)} km</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <IconButton size="sm" aria-label="Ver documentos" title="Documentos del vehículo"
                                        onClick={e => { e.stopPropagation(); setSelected(v); }}
                                        className="h-10 w-10 sm:h-8 sm:w-8 hover:bg-brand-primary/10 hover:text-brand-primary"
                                        icon={<FileText className="h-4 w-4" />} />
                                    {hasPermission('vehiculos.editar') && (
                                        <IconButton size="sm" aria-label="Editar vehículo" title="Editar vehículo"
                                            onClick={e => { e.stopPropagation(); setEditVehiculo(v); setModalVehiculo(true); }}
                                            className="h-10 w-10 sm:h-8 sm:w-8 hover:bg-brand-primary/10 hover:text-brand-primary"
                                            icon={<Edit2 className="h-4 w-4" />} />
                                    )}
                                    {hasPermission('vehiculos.eliminar') && (
                                        <IconButton size="sm" variant="danger" aria-label="Dar de baja vehículo" title="Dar de baja"
                                            onClick={e => { e.stopPropagation(); handleDelete(v); }}
                                            className="h-10 w-10 sm:h-8 sm:w-8"
                                            icon={<Trash2 className="h-4 w-4" />} />
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    // ── Nivel 2: vista detalle ────────────────────────────────────────────────
    const DetailView = selected ? (
        <div className="flex flex-col flex-1 min-h-0 p-4 md:p-6">
            <div className="flex items-center gap-3 mb-4 shrink-0">
                {/* Volver (móvil/tablet, panel único). En desktop 3-col no hace falta. */}
                <IconButton aria-label="Volver" onClick={() => setSelected(null)}
                    className="lg:hidden" icon={<ChevronLeft className="h-5 w-5" />} />
                <div className="flex-1 min-w-0">
                    <p className="text-caption uppercase font-black text-muted-foreground tracking-widest">Detalle vehículo</p>
                    <h4 className="text-base font-black text-brand-dark truncate">
                        {selected.patente} · {selected.marca} {selected.modelo} {selected.anio}
                        {selected.conductor_nombre && <span className="text-brand-primary"> · {selected.conductor_nombre}</span>}
                    </h4>
                </div>
                <IconButton size="sm" aria-label="Cerrar detalle" onClick={() => setSelected(null)}
                    className="hidden lg:flex" icon={<X className="h-4 w-4" />} />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-5">
                <VehiculoDocumentos vehiculoId={selected.id} />
            </div>
        </div>
    ) : null;

    // ── Helper: botones del headerAction para cada modal de form ─────────────
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
            {/* PANEL DE FILTROS (toggle desde el header) — sólo Nivel 2 */}
            {enNivel2 && showFiltros && (
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

            {/* ═══ DESKTOP (≥lg): 3 columnas — empresas | vehículos | detalle ═══
                Las empresas quedan SIEMPRE a la izquierda; al elegir una aparecen sus
                vehículos (centro) y el detalle (derecha) sin perderlas de vista. */}
            <div className="hidden lg:flex flex-1 min-h-0 bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
                {/* Empresas (~20%) · Vehículos (~26%) · Detalle (resto, ~54% — es lo importante) */}
                <div className="w-[20%] shrink-0 border-r border-border flex flex-col min-h-0">
                    {EmpresasList}
                </div>
                {selectedEmpresa ? (
                    <>
                        <div className="w-[26%] shrink-0 border-r border-border flex flex-col min-h-0">
                            {ListView}
                        </div>
                        {DetailView}
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center p-6">
                        <EmptyState icon={Truck} title="Selecciona una empresa"
                            description="Elige una empresa de la izquierda para ver sus vehículos." />
                    </div>
                )}
            </div>

            {/* ═══ MÓVIL + TABLET (<lg): empresas como chips arriba + vehículos abajo ═══
                Tocás un chip y abajo aparece el historial de vehículos de esa empresa.
                Al tocar un vehículo se abre el detalle a pantalla completa (con volver). */}
            <div className="lg:hidden flex flex-col flex-1 min-h-0 bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
                {selected ? DetailView : (
                    <>
                        {/* Chips de empresas (scroll horizontal si hay muchas) */}
                        <div className="shrink-0 border-b border-border overflow-x-auto">
                            <div className="flex items-center gap-2 p-3 w-max">
                                {empresas.map(e => renderEmpresaChip(
                                    e.id, e.nombre, e.color,
                                    e.vehiculos_count ?? (conteos.porEmpresa.get(e.id) || 0),
                                    selectedEmpresa !== 'sin' && selectedEmpresa?.id === e.id,
                                    () => entrarEmpresa(e),
                                ))}
                                {conteos.sin > 0 && renderEmpresaChip(
                                    'sin', 'Sin empresa', SIN_EMPRESA_COLOR, conteos.sin,
                                    selectedEmpresa === 'sin', () => entrarEmpresa('sin'),
                                )}
                            </div>
                        </div>

                        {/* Acciones de la empresa activa */}
                        {enNivel2 && (
                            <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border/60">
                                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-dark min-w-0">
                                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: empresaActivaColor }} />
                                    <span className="truncate">{empresaActivaNombre}</span>
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                                    {hasPermission('vehiculos.crear') && (
                                        <IconButton size="sm" aria-label="Nuevo vehículo" title="Nuevo vehículo"
                                            onClick={() => { setEditVehiculo(null); setModalVehiculo(true); }}
                                            className="h-10 w-10 text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary"
                                            icon={<Plus className="h-5 w-5" />} />
                                    )}
                                    {empresaActiva && hasPermission('vehiculos.editar') && (
                                        <IconButton size="sm" aria-label="Editar empresa" title="Editar empresa"
                                            onClick={() => { setEditEmpresa(empresaActiva); setModalEmpresa(true); }}
                                            className="h-10 w-10 hover:bg-brand-primary/10 hover:text-brand-primary"
                                            icon={<Edit2 className="h-4 w-4" />} />
                                    )}
                                    {empresaActiva && hasPermission('vehiculos.eliminar') && (
                                        <IconButton size="sm" variant="danger" aria-label="Eliminar empresa" title="Eliminar empresa"
                                            onClick={() => handleDeleteEmpresa(empresaActiva)}
                                            className="h-10 w-10"
                                            icon={<Trash2 className="h-4 w-4" />} />
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Lista de vehículos de la empresa activa */}
                        <div className="flex-1 min-h-0 flex flex-col">
                            {ListView}
                        </div>
                    </>
                )}
            </div>

            {/* ── Modales ── */}
            <Modal isOpen={modalVehiculo} onClose={() => setModalVehiculo(false)}
                title={editVehiculo ? 'Editar Vehículo' : 'Nuevo Vehículo'} size="lg"
                headerAction={formActions('vehiculo-form', () => setModalVehiculo(false))}>
                <VehiculoForm initialData={editVehiculo}
                    defaultEmpresaId={empresaActiva?.id ?? null}
                    onCancel={() => setModalVehiculo(false)}
                    onSuccess={() => { setModalVehiculo(false); fetchVehiculos(); fetchEmpresas(); }} />
            </Modal>

            <Modal isOpen={modalEmpresa} onClose={() => setModalEmpresa(false)}
                title={editEmpresa ? 'Editar Empresa' : 'Nueva Empresa'} size="md"
                headerAction={formActions('empresa-form', () => setModalEmpresa(false))}>
                <EmpresaForm initialData={editEmpresa} onCancel={() => setModalEmpresa(false)}
                    onSuccess={() => { setModalEmpresa(false); fetchEmpresas(); }} />
            </Modal>

        </div>
    );
};

export default VehiculosPage;
