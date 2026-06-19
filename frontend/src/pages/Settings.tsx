import React, { useState } from 'react';
import {
    Settings,
    Building2,
    HardHat,
    Briefcase,
    FileText,
    Users,
    Shield,
    CheckSquare,
    AlertTriangle,
    Clock,
    Mail,
    Truck
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../utils/cn';
import { useAuth } from '../context/AuthContext';

import { CrudTable } from '../components/ui/CrudTable';
import type { ColumnDef } from '../components/ui/CrudTable';
import { IconButton } from '../components/ui/IconButton';
import { Chip } from '../components/ui/Chip';
import { StatusBadge } from '../components/ui/StatusBadge';
import { fmtMoney } from '../utils/format';
import type { Empresa, Obra, Cargo, Conductor, TipoDocumento, EstadoAsistencia, TipoAusencia, CategoriaInventario, Bodega, ItemInventario } from '../types/entities';

interface UserData {
    id: number;
    nombre: string;
    email: string;
    rol_id: number;
    rol_nombre?: string;
    obra_id?: number | null;
    obra_nombre?: string;
    activo: boolean;
}

interface RoleData {
    id: number;
    nombre: string;
    descripcion?: string;
    activo: boolean;
    /** Subquery del backend (usuarios.routes.js rolesService). Count de permisos
        asignados al rol. Usado para badge ⚠️ "Sin permisos" en tabla. */
    permisos_count?: number;
}
import { EmpresaForm } from '../components/settings/EmpresaForm';
import { ObraForm } from '../components/settings/ObraForm';
import { CargoForm } from '../components/settings/CargoForm';
import { ConductorForm } from '../components/settings/ConductorForm';
import { TipoDocumentoForm } from '../components/settings/TipoDocumentoForm';
import { UsuarioForm } from '../components/settings/UsuarioForm';
import { RolForm } from '../components/settings/RolForm';
import { EstadoAsistenciaForm } from '../components/settings/EstadoAsistenciaForm';
import { TipoAusenciaForm } from '../components/settings/TipoAusenciaForm';
import { HorariosConfigPanel } from '../components/settings/HorariosConfigPanel';
import EmailConfigForm from '../components/settings/EmailConfigForm';
import PlantillasEmailPanel from '../components/settings/PlantillasEmailPanel';
import ChangePasswordForm from '../components/settings/ChangePasswordForm';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { ActivityLogsPanel } from '../components/settings/ActivityLogsPanel';
import { FeriadosPanel } from '../components/settings/FeriadosPanel';
import { ShieldCheck, UserCog, Package, Warehouse, Wrench, Archive, Bell } from 'lucide-react';
import { FinalizarObraModal } from '../components/obras/FinalizarObraModal';
import { ParticipaToggle } from '../components/settings/ParticipaToggle';
import { CategoriaInventarioForm } from '../components/settings/CategoriaInventarioForm';
import { BodegaForm } from '../components/settings/BodegaForm';
import { ItemInventarioForm } from '../components/settings/ItemInventarioForm';
import PermisosRolPanel from '../components/settings/PermisosRolPanel';
import PermisosUsuarioPanel from '../components/settings/PermisosUsuarioPanel';
import ReporteSuscriptoresPanel from '../components/settings/ReporteSuscriptoresPanel';
import AvisosPanel from '../components/settings/AvisosPanel';
import { Modal } from '../components/ui/Modal';

type TabKey = 'empresas' | 'obras' | 'cargos' | 'conductores' | 'tipos_doc' | 'usuarios' | 'roles' | 'estados_asistencia' | 'tipos_ausencia' | 'horarios' | 'feriados' | 'mi_correo' | 'plantillas' | 'reportes_suscriptores' | 'avisos' | 'logs' | 'seguridad' | 'cat_inventario' | 'bodegas' | 'items_inventario';

interface TabDef {
    key: TabKey;
    label: string;
    shortLabel?: string;
    icon: React.ElementType;
}

interface TabGroup {
    title: string;
    shortTitle: string;
    icon: React.ElementType;
    items: TabDef[];
}

const tabGroups: TabGroup[] = [
    {
        title: "Organización",
        shortTitle: "Org.",
        icon: Building2,
        items: [
            { key: 'empresas', label: 'Empresas', shortLabel: 'Empresas', icon: Building2 },
            { key: 'obras', label: 'Obras', shortLabel: 'Obras', icon: HardHat },
            { key: 'cargos', label: 'Cargos', shortLabel: 'Cargos', icon: Briefcase },
        ]
    },
    {
        title: "Personal & Documentos",
        shortTitle: "Personal",
        icon: Users,
        items: [
            { key: 'usuarios', label: 'Usuarios', shortLabel: 'Usuarios', icon: Users },
            { key: 'roles', label: 'Roles', shortLabel: 'Roles', icon: Shield },
            { key: 'conductores', label: 'Conductores', shortLabel: 'Conduct.', icon: Truck },
            { key: 'tipos_doc', label: 'Tipos de Documento', shortLabel: 'Tipos Doc.', icon: FileText },
        ]
    },
    {
        title: "Asistencia",
        shortTitle: "Asist.",
        icon: CheckSquare,
        items: [
            { key: 'estados_asistencia', label: 'Estados Asist.', shortLabel: 'Estados', icon: CheckSquare },
            { key: 'tipos_ausencia', label: 'Tipos Ausencia', shortLabel: 'Ausencia', icon: AlertTriangle },
            { key: 'horarios', label: 'Horarios Laborales', shortLabel: 'Horarios', icon: Clock },
            { key: 'feriados', label: 'Feriados', shortLabel: 'Feriados', icon: CheckSquare },
        ]
    },
    {
        title: "Inventario",
        shortTitle: "Invent.",
        icon: Package,
        items: [
            { key: 'cat_inventario', label: 'Categorías', shortLabel: 'Categ.', icon: Package },
            { key: 'bodegas', label: 'Bodegas', shortLabel: 'Bodegas', icon: Warehouse },
            { key: 'items_inventario', label: 'Ítems', shortLabel: 'Ítems', icon: Wrench },
        ]
    },
    {
        title: "Sistema & Correo",
        shortTitle: "Sistema",
        icon: Settings,
        items: [
            { key: 'mi_correo', label: 'Mi Correo', shortLabel: 'Correo', icon: Mail },
            { key: 'plantillas', label: 'Plantillas Email', shortLabel: 'Plantillas', icon: FileText },
            { key: 'reportes_suscriptores', label: 'Reportes Automáticos', shortLabel: 'Reportes', icon: Mail },
            { key: 'avisos', label: 'Avisos de Novedades', shortLabel: 'Avisos', icon: Bell },
            { key: 'logs', label: 'Historial de Actividad', shortLabel: 'Historial', icon: Clock },
            { key: 'seguridad', label: 'Seguridad', icon: Shield },
        ]
    }
];

// Column definitions for each entity
const empresaCols: ColumnDef<Empresa>[] = [
    { key: 'rut', label: 'RUT' },
    { key: 'razon_social', label: 'Razón Social' },
    { key: 'direccion', label: 'Dirección', render: (v) => v || '—' },
    { key: 'telefono', label: 'Teléfono', render: (v) => v || '—' },
    {
        key: 'activo', label: 'Estado',
        render: (v) => (
            <Chip tone={v ? 'success' : 'danger'} label={v ? 'Activo' : 'Finiquitado'} className="text-caption" />
        ),
    },
];

const obraCols: ColumnDef<Obra>[] = [
    {
        key: 'nombre', label: 'Nombre',
        render: (v, row) => (
            <span className="inline-flex items-center gap-2">
                {v}
                {!!row.es_prueba && <StatusBadge domain="obra" status="prueba" className="text-micro" />}
                {!!row.finalizada && <StatusBadge domain="obra" status="finalizada" className="text-micro" />}
            </span>
        ),
    },
    { key: 'direccion', label: 'Dirección', render: (v) => v || '—' },
    {
        key: 'activa', label: 'Estado',
        render: (v) => (
            <StatusBadge domain="obra" status={v ? 'activa' : 'inactiva'} className="text-caption" />
        ),
    },
];

const cargoCols: ColumnDef<Cargo>[] = [
    { key: 'nombre', label: 'Nombre' },
    {
        key: 'activo', label: 'Estado',
        render: (v) => (
            <Chip tone={v ? 'success' : 'danger'} label={v ? 'Activo' : 'Finiquitado'} className="text-caption" />
        ),
    },
];

const conductorCols: ColumnDef<Conductor>[] = [
    { key: 'nombre', label: 'Nombre' },
    {
        key: 'activo', label: 'Estado',
        render: (v) => (
            <Chip tone={v ? 'success' : 'danger'} label={v ? 'Activo' : 'Inactivo'} className="text-caption" />
        ),
    },
];

const tipoDocCols: ColumnDef<TipoDocumento>[] = [
    { key: 'nombre', label: 'Nombre' },
    {
        key: 'dias_vigencia', label: 'Vigencia',
        render: (v) => v ? `${v} días` : 'Sin vencimiento'
    },
    {
        key: 'obligatorio', label: 'Obligatorio',
        render: (v) => (
            <Chip tone={v ? 'warning' : 'neutral'} label={v ? 'Sí' : 'No'} className="text-caption" />
        ),
    },
];

const usuarioCols: ColumnDef<UserData>[] = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'rol_nombre', label: 'Rol', render: (v) => v || '—' },
    { key: 'obra_nombre', label: 'Obra', render: (v) => v || 'Oficina Central' },
    {
        key: 'activo', label: 'Estado',
        render: (v) => (
            <Chip tone={v ? 'success' : 'danger'} label={v ? 'Activo' : 'Finiquitado'} className="text-caption" />
        ),
    },
];

const rolCols: ColumnDef<RoleData>[] = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'descripcion', label: 'Descripción', render: (v) => v || '—' },
    {
        key: 'permisos_count',
        label: 'Permisos',
        render: (v) => {
            const count = typeof v === 'number' ? v : 0;
            if (count === 0) {
                return (
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                        <AlertTriangle className="h-3 w-3" /> Sin permisos
                    </span>
                );
            }
            return (
                <span className="text-xs text-muted-foreground font-medium">
                    {count} permiso{count === 1 ? '' : 's'}
                </span>
            );
        },
    },
];

const estadoAsistenciaCols: ColumnDef<EstadoAsistencia>[] = [
    { key: 'nombre', label: 'Nombre' },
    {
        key: 'codigo', label: 'Código', render: (v) => (
            <span className="text-caption font-bold px-2 py-0.5 rounded-full bg-background">{v}</span>
        )
    },
    {
        key: 'color', label: 'Color', render: (v) => (
            <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: v }} />
                <span className="text-caption text-muted-foreground">{v}</span>
            </div>
        )
    },
    {
        key: 'es_presente', label: 'Cuenta como Presente', render: (v) => (
            <Chip tone={v ? 'success' : 'neutral'} label={v ? 'Sí' : 'No'} className="text-caption" />
        )
    },
    {
        key: 'cuenta_dia_trabajado', label: 'Cuenta Día Trabajado', render: (v) => (
            <Chip tone={v ? 'success' : 'neutral'} label={v ? 'Sí' : 'No'} className="text-caption" />
        )
    },
];

const tipoAusenciaCols: ColumnDef<TipoAusencia>[] = [
    { key: 'nombre', label: 'Nombre' },
    {
        key: 'es_justificada', label: 'Justificada', render: (v) => (
            <Chip tone={v ? 'success' : 'danger'} label={v ? 'Sí' : 'No'} className="text-caption" />
        )
    },
    {
        key: 'activo', label: 'Estado',
        render: (v) => (
            <Chip tone={v ? 'success' : 'danger'} label={v ? 'Activo' : 'Finiquitado'} className="text-caption" />
        ),
    },
];

const SettingsPage: React.FC = () => {
    const { hasPermission } = useAuth();
    const [activeTab, setActiveTab] = useState<TabKey>('empresas');
    
    // Estados para gestión de permisos
    const [rolPermsModal, setRolPermsModal] = useState<{ open: boolean; rol: RoleData | null }>({ open: false, rol: null });
    // Finalizar obra: obra seleccionada para el modal + nonce para remontar la
    // CrudTable de obras tras finalizar (fuerza refetch).
    const [obraAFinalizar, setObraAFinalizar] = useState<Obra | null>(null);
    const [obrasNonce, setObrasNonce] = useState(0);
    // Nonce para remontar la CrudTable de bodegas tras togglear participación.
    const [bodegasNonce, setBodegasNonce] = useState(0);
    const [userPermsModal, setUserPermsModal] = useState<{ open: boolean; user: UserData | null }>({ open: false, user: null });

    // Find current active group for navigation
    const activeGroup = tabGroups.find(g => g.items.some(t => t.key === activeTab)) || tabGroups[0];

    const headerTitle = React.useMemo(() => (
        <div className="flex items-center gap-3">
            <Settings className="h-6 w-6 text-brand-primary" />
            <div className="flex flex-col leading-tight">
                <h1 className="text-lg font-bold text-brand-dark">Configuración</h1>
                <p className="text-muted-foreground text-xs">Catálogos y Parámetros del Sistema</p>
            </div>
        </div>
    ), []);

    // Global Header
    useSetPageHeader(headerTitle);

    return (
        <div className="h-[calc(100dvh-116px)] md:h-[calc(100dvh-120px)] flex flex-col gap-2 p-0 overflow-hidden w-full">
            {/* ── Mobile: Icon + Short Label Category Tabs (all 5 visible) ── */}
            <div className="md:hidden flex-none bg-card/80 backdrop-blur-xl rounded-2xl border border-border p-1 flex items-center gap-0.5 shadow-sm">
                {tabGroups.map((group, idx) => {
                    const isActive = activeGroup.title === group.title;
                    const GroupIcon = group.icon;
                    return (
                        // eslint-disable-next-line no-restricted-syntax -- tab nav con estado activo; no hay primitivo Tab (ver diseno.md)
                        <button
                            key={idx}
                            onClick={() => setActiveTab(group.items[0].key)}
                            className={cn(
                                "flex flex-col items-center gap-0.5 flex-1 py-2 rounded-xl transition-all relative overflow-hidden",
                                isActive
                                    ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/25"
                                    : "text-muted-foreground active:bg-background"
                            )}
                        >
                            <GroupIcon className={cn("h-[18px] w-[18px] relative z-10", isActive && "drop-shadow-sm")} />
                            <span className="text-micro font-black uppercase tracking-tight leading-none relative z-10">
                                {group.shortTitle}
                            </span>
                            {isActive && (
                                <motion.div
                                    layoutId="activeCategoryMobile"
                                    className="absolute inset-0 bg-white/10 rounded-xl"
                                    transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                                />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── Desktop: Full Text Category Tabs ── */}
            <div className="hidden md:flex flex-none bg-card/80 backdrop-blur-xl rounded-2xl border border-border p-2 items-center gap-1 overflow-x-auto scrollbar-none shadow-sm">
                {tabGroups.map((group, idx) => {
                    const isActive = activeGroup.title === group.title;
                    const GroupIcon = group.icon;
                    return (
                        // eslint-disable-next-line no-restricted-syntax -- tab nav con estado activo; no hay primitivo Tab (ver diseno.md)
                        <button
                            key={idx}
                            onClick={() => setActiveTab(group.items[0].key)}
                            className={cn(
                                "flex items-center gap-2 px-6 py-2.5 rounded-xl text-caption font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap shrink-0 relative overflow-hidden group",
                                isActive
                                    ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/25 translate-y-[-1px]"
                                    : "text-muted-foreground hover:bg-background hover:text-brand-dark"
                            )}
                        >
                            <GroupIcon className={cn("h-4 w-4 relative z-10", isActive ? "text-white" : "text-muted-foreground/60")} />
                            <span className="relative z-10">{group.title}</span>
                            {isActive && (
                                <motion.div
                                    layoutId="activeCategoryGlow"
                                    className="absolute inset-0 bg-white/10"
                                />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Main Content Area (Full Width) — mobile: full-bleed sin chrome; md+: card */}
            <div className="flex-1 min-h-0 flex flex-col md:bg-card md:border md:border-border md:rounded-3xl md:shadow-[0_10px_40px_rgb(0,0,0,0.08)] md:overflow-hidden relative">

                {/* ── Mobile Sub-Tabs: pill card flotante (sin wrapper blanco encima) ── */}
                <div className="md:hidden bg-card/80 backdrop-blur-xl rounded-2xl border border-border shadow-sm px-1.5 py-1.5 flex items-center shrink-0 gap-0.5">
                    {activeGroup.items.map(tab => {
                        const isActive = activeTab === tab.key;
                        return (
                            // eslint-disable-next-line no-restricted-syntax -- tab nav con estado activo; no hay primitivo Tab (ver diseno.md)
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    "flex flex-col items-center gap-0.5 flex-1 py-2 rounded-xl transition-all relative overflow-hidden",
                                    isActive
                                        ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/25"
                                        : "text-muted-foreground active:bg-background"
                                )}
                            >
                                <tab.icon className={cn("h-[18px] w-[18px] relative z-10", isActive && "drop-shadow-sm")} />
                                <span className="text-micro font-black uppercase tracking-tight leading-none relative z-10">
                                    {tab.shortLabel || tab.label}
                                </span>
                                {isActive && (
                                    <motion.div
                                        layoutId="activeSubTabMobile"
                                        className="absolute inset-0 bg-white/10 rounded-xl"
                                        transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* ── Desktop Sub-Tabs: pills con icono + texto ── */}
                <div className="hidden md:flex h-[60px] border-b border-border bg-white/50 dark:bg-white/5 px-3 lg:px-5 items-center shrink-0 overflow-x-auto scrollbar-none gap-2">
                    {activeGroup.items.map(tab => (
                        // eslint-disable-next-line no-restricted-syntax -- tab nav con estado activo; no hay primitivo Tab (ver diseno.md)
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all border whitespace-nowrap shrink-0",
                                activeTab === tab.key
                                    ? "bg-card border-brand-primary text-brand-primary shadow-sm ring-4 ring-brand-primary/5"
                                    : "bg-white/50 dark:bg-white/5 border-border text-muted-foreground hover:border-brand-primary/30 hover:text-brand-primary"
                            )}
                        >
                            <tab.icon className={cn("h-4 w-4", activeTab === tab.key ? "text-brand-primary" : "text-muted-foreground/60")} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Inner Content Area - Scrollable — mobile: pt-3 sin padding lateral; md+: p-6/p-8 con bg gris */}
                <div className="flex-1 overflow-y-auto custom-scrollbar md:bg-muted pt-3 md:p-6 lg:p-8">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                    {activeTab === 'empresas' && (
                        <CrudTable
                            endpoint="/empresas"
                            columns={empresaCols}
                            entityName="Empresa"
                            entityNamePlural="Empresas"
                            FormComponent={EmpresaForm}
                            searchPlaceholder="Buscar por RUT o razón social..."
                            queryParams={{ activo: true }}
                            canCreate={hasPermission('empresas.crear')}
                            canEdit={hasPermission('empresas.editar')}
                            canDelete={hasPermission('empresas.eliminar')}
                            canExport={false}
                        />
                    )}
                    {activeTab === 'obras' && (
                        <>
                            <CrudTable
                                reloadSignal={obrasNonce}
                                endpoint="/obras"
                                columns={obraCols}
                                entityName="Obra"
                                entityNamePlural="Obras"
                                FormComponent={ObraForm}
                                queryParams={{ activo: true, incluir_prueba: true, incluir_finalizadas: true }}
                                canCreate={hasPermission('obras.crear')}
                                canEdit={hasPermission('obras.editar')}
                                canDelete={hasPermission('obras.eliminar')}
                                canExport={false}
                                renderActions={(row) => (
                                    <div className="flex items-center gap-1 flex-wrap justify-end">
                                        {hasPermission('obras.editar') && (
                                            <div className="hidden sm:flex items-center gap-1 flex-wrap">
                                                <ParticipaToggle id={row.id} endpoint="/obras" field="participa_inventario" value={row.participa_inventario} label="Inv" onDone={() => setObrasNonce(n => n + 1)} />
                                                <ParticipaToggle id={row.id} endpoint="/obras" field="participa_asistencia" value={row.participa_asistencia} label="Asis" onDone={() => setObrasNonce(n => n + 1)} />
                                                <ParticipaToggle id={row.id} endpoint="/obras" field="participa_transferencias" value={row.participa_transferencias} label="Transf" onDone={() => setObrasNonce(n => n + 1)} />
                                                <ParticipaToggle id={row.id} endpoint="/obras" field="participa_bombas" value={row.participa_bombas} label="Bombas" onDone={() => setObrasNonce(n => n + 1)} />
                                            </div>
                                        )}
                                        {hasPermission('obras.finalizar') && !row.finalizada && (
                                            <IconButton
                                                variant="ghost"
                                                size="sm"
                                                aria-label="Finalizar obra"
                                                title="Finalizar obra (concluida)"
                                                onClick={() => setObraAFinalizar(row)}
                                                className="hover:bg-amber-100 dark:hover:bg-amber-950/40 hover:text-amber-600"
                                                icon={<Archive className="h-3.5 w-3.5" />}
                                            />
                                        )}
                                    </div>
                                )}
                            />
                            <FinalizarObraModal
                                obra={obraAFinalizar}
                                onClose={() => setObraAFinalizar(null)}
                                onSuccess={() => setObrasNonce(n => n + 1)}
                            />
                        </>
                    )}
                    {activeTab === 'cargos' && (
                        <CrudTable
                            endpoint="/cargos"
                            columns={cargoCols}
                            entityName="Cargo"
                            entityNamePlural="Cargos"
                            FormComponent={CargoForm}
                            queryParams={{ activo: true }}
                            canCreate={hasPermission('cargos.crear')}
                            canEdit={hasPermission('cargos.editar')}
                            canDelete={hasPermission('cargos.eliminar')}
                            canExport={false}
                        />
                    )}
                    {activeTab === 'conductores' && (
                        <CrudTable
                            endpoint="/conductores"
                            columns={conductorCols}
                            entityName="Conductor"
                            entityNamePlural="Conductores"
                            FormComponent={ConductorForm}
                            queryParams={{ activo: true }}
                            canCreate={hasPermission('conductores.crear')}
                            canEdit={hasPermission('conductores.editar')}
                            canDelete={hasPermission('conductores.eliminar')}
                            canExport={false}
                        />
                    )}
                    {activeTab === 'tipos_doc' && (
                        <CrudTable
                            endpoint="/documentos/tipos"
                            columns={tipoDocCols}
                            entityName="Tipo de Documento"
                            entityNamePlural="Tipos de Documento"
                            FormComponent={TipoDocumentoForm}
                            queryParams={{ activo: true }}
                            canCreate={hasPermission('sistema.tipos_doc.gestionar')}
                            canEdit={hasPermission('sistema.tipos_doc.gestionar')}
                            canDelete={hasPermission('sistema.tipos_doc.gestionar')}
                            canExport={false}
                        />
                    )}
                    {activeTab === 'usuarios' && (
                        <CrudTable
                            endpoint="/usuarios"
                            columns={usuarioCols}
                            entityName="Usuario"
                            entityNamePlural="Usuarios"
                            FormComponent={UsuarioForm}
                            canCreate={hasPermission('usuarios.crear')}
                            canEdit={hasPermission('usuarios.editar')}
                            canDelete={hasPermission('usuarios.eliminar')}
                            canExport={false}
                            renderActions={(row) => (
                                <IconButton
                                    variant="ghost"
                                    aria-label="Gestionar permisos especiales"
                                    title="Gestionar Permisos Especiales"
                                    onClick={() => setUserPermsModal({ open: true, user: row })}
                                    icon={<UserCog className="h-4 w-4" />}
                                />
                            )}
                        />
                    )}
                    {activeTab === 'roles' && (
                        <CrudTable
                            endpoint="/usuarios/roles"
                            columns={rolCols}
                            entityName="Rol"
                            entityNamePlural="Roles"
                            FormComponent={RolForm}
                            canCreate={hasPermission('usuarios.roles.crear')}
                            canEdit={hasPermission('usuarios.roles.editar')}
                            canDelete={hasPermission('usuarios.roles.eliminar')}
                            canExport={false}
                            renderActions={(row) => (
                                <IconButton
                                    variant="ghost"
                                    aria-label="Configurar permisos del rol"
                                    title="Configurar Permisos del Rol"
                                    onClick={() => setRolPermsModal({ open: true, rol: row })}
                                    icon={<ShieldCheck className="h-4 w-4" />}
                                />
                            )}
                        />
                    )}
                    {activeTab === 'estados_asistencia' && (
                        <CrudTable
                            endpoint="/estados-asistencia"
                            columns={estadoAsistenciaCols}
                            entityName="Estado de Asistencia"
                            entityNamePlural="Estados de Asistencia"
                            FormComponent={EstadoAsistenciaForm}
                            queryParams={{ activo: true }}
                            canCreate={hasPermission('sistema.estados.gestionar')}
                            canEdit={hasPermission('sistema.estados.gestionar')}
                            canDelete={hasPermission('sistema.estados.gestionar')}
                            canExport={false}
                        />
                    )}
                    {activeTab === 'tipos_ausencia' && (
                        <CrudTable
                            endpoint="/tipos-ausencia"
                            columns={tipoAusenciaCols}
                            entityName="Tipo de Ausencia"
                            entityNamePlural="Tipos de Ausencia"
                            FormComponent={TipoAusenciaForm}
                            queryParams={{ activo: true }}
                            canCreate={hasPermission('sistema.tipos_ausencia.gestionar')}
                            canEdit={hasPermission('sistema.tipos_ausencia.gestionar')}
                            canDelete={hasPermission('sistema.tipos_ausencia.gestionar')}
                            canExport={false}
                        />
                    )}
                    {activeTab === 'horarios' && (
                        <HorariosConfigPanel />
                    )}
                    {activeTab === 'feriados' && (
                        <FeriadosPanel />
                    )}
                    {activeTab === 'mi_correo' && (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-base font-semibold text-brand-dark">Configuración de Correo</h3>
                                <p className="text-sm text-muted-foreground mt-1">Guarda tu correo corporativo y contraseña una sola vez para poder enviar reportes desde Nómina & Reportes sin volver a ingresarlos.</p>
                            </div>
                            <EmailConfigForm />
                        </div>
                    )}
                    {activeTab === 'plantillas' && (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-base font-semibold text-brand-dark">Plantillas de Correo</h3>
                                <p className="text-sm text-muted-foreground mt-1">Crea y gestiona las plantillas predefinidas que aparecerán al enviar un reporte por correo.</p>
                            </div>
                            <PlantillasEmailPanel />
                        </div>
                    )}
                    {activeTab === 'reportes_suscriptores' && (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-base font-semibold text-brand-dark">Reportes Automáticos</h3>
                                <p className="text-sm text-muted-foreground mt-1">Destinatarios del reporte semanal de RRHH (contrataciones, desvinculaciones, faltas y aniversarios). Se envía automáticamente los lunes a las 08:00.</p>
                            </div>
                            <ReporteSuscriptoresPanel />
                        </div>
                    )}
                    {activeTab === 'avisos' && (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-base font-semibold text-brand-dark">Avisos de Novedades</h3>
                                <p className="text-sm text-muted-foreground mt-1">Resumen automático por email cada mañana con las novedades del día anterior (trabajadores, roles/permisos, inventario, vehículos, obras). Configura qué se vigila, el umbral y a quién llega.</p>
                            </div>
                            <AvisosPanel />
                        </div>
                    )}
                    {activeTab === 'logs' && (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-base font-semibold text-brand-dark">Historial de Actividad</h3>
                                <p className="text-sm text-muted-foreground mt-1">Registro detallado de los cambios realizados en el sistema por todos los usuarios.</p>
                            </div>
                            <ActivityLogsPanel />
                        </div>
                    )}
                    {activeTab === 'seguridad' && (
                        <ChangePasswordForm />
                    )}
                    {activeTab === 'cat_inventario' && (
                        <CrudTable<CategoriaInventario>
                            endpoint="/categorias-inventario"
                            columns={[
                                { key: 'nombre', label: 'Nombre' },
                                { key: 'orden', label: 'Orden' },
                                {
                                    key: 'activo', label: 'Estado',
                                    render: (v) => (
                                        <Chip tone={v ? 'success' : 'danger'} label={v ? 'Activo' : 'Inactivo'} className="text-caption" />
                                    ),
                                },
                            ]}
                            entityName="Categoría"
                            entityNamePlural="Categorías de Inventario"
                            FormComponent={CategoriaInventarioForm}
                            searchPlaceholder="Buscar categoría..."
                            canCreate={hasPermission('inventario.crear')}
                            canEdit={hasPermission('inventario.editar')}
                            canDelete={hasPermission('inventario.eliminar')}
                            canExport={false}
                        />
                    )}
                    {activeTab === 'bodegas' && (
                        <CrudTable<Bodega>
                            reloadSignal={bodegasNonce}
                            endpoint="/bodegas"
                            columns={[
                                { key: 'nombre', label: 'Nombre' },
                                { key: 'direccion', label: 'Dirección', render: (v) => v || '—' },
                                { key: 'responsable_nombre', label: 'Responsable', render: (v) => v || '—' },
                                {
                                    key: 'activa', label: 'Estado',
                                    render: (v) => (
                                        <Chip tone={v ? 'success' : 'danger'} label={v ? 'Activa' : 'Inactiva'} className="text-caption" />
                                    ),
                                },
                            ]}
                            entityName="Bodega"
                            entityNamePlural="Bodegas"
                            FormComponent={BodegaForm}
                            searchPlaceholder="Buscar bodega..."
                            canCreate={hasPermission('inventario.crear')}
                            canEdit={hasPermission('inventario.editar')}
                            canDelete={hasPermission('inventario.eliminar')}
                            canExport={false}
                            renderActions={(row) => (
                                hasPermission('inventario.editar') ? (
                                    <div className="hidden sm:flex items-center gap-1 flex-wrap justify-end">
                                        <ParticipaToggle id={row.id} endpoint="/bodegas" field="participa_inventario" value={row.participa_inventario} label="Inv" onDone={() => setBodegasNonce(n => n + 1)} />
                                        <ParticipaToggle id={row.id} endpoint="/bodegas" field="participa_transferencias" value={row.participa_transferencias} label="Transf" onDone={() => setBodegasNonce(n => n + 1)} />
                                    </div>
                                ) : null
                            )}
                        />
                    )}
                    {activeTab === 'items_inventario' && (
                        <CrudTable<ItemInventario>
                            endpoint="/items-inventario"
                            columns={[
                                { key: 'nro_item', label: '#' },
                                { key: 'descripcion', label: 'Descripción' },
                                { key: 'categoria_nombre', label: 'Categoría' },
                                { key: 'm2', label: 'M2', render: (v) => v ? Number(v).toFixed(2) : '—' },
                                { key: 'valor_compra', label: 'V. Compra', render: (v) => v ? fmtMoney(v) : '—' },
                                { key: 'valor_arriendo', label: 'V. Arriendo', render: (v) => fmtMoney(v) },
                                { key: 'unidad', label: 'Unidad' },
                            ]}
                            entityName="Ítem"
                            entityNamePlural="Ítems de Inventario"
                            FormComponent={ItemInventarioForm}
                            searchPlaceholder="Buscar ítem..."
                            canCreate={hasPermission('inventario.crear')}
                            canEdit={hasPermission('inventario.editar')}
                            canDelete={hasPermission('inventario.eliminar')}
                            canExport={false}
                        />
                    )}
                </motion.div>
                </div>
            </div>

            {/* Modales de Permisos */}
            <Modal
                isOpen={rolPermsModal.open}
                onClose={() => setRolPermsModal({ open: false, rol: null })}
                title="Configuración de Permisos de Rol"
                size="full"
                noBodyPadding
            >
                {rolPermsModal.rol && (
                    <PermisosRolPanel 
                        rolId={rolPermsModal.rol.id}
                        rolNombre={rolPermsModal.rol.nombre}
                        onClose={() => setRolPermsModal({ open: false, rol: null })}
                    />
                )}
            </Modal>

            <Modal
                isOpen={userPermsModal.open}
                onClose={() => setUserPermsModal({ open: false, user: null })}
                title="Overrides de Permisos de Usuario"
                size="full"
                noBodyPadding
            >
                {userPermsModal.user && (
                    <PermisosUsuarioPanel 
                        usuarioId={userPermsModal.user.id}
                        usuarioNombre={userPermsModal.user.nombre}
                        rolId={userPermsModal.user.rol_id}
                        rolNombre={userPermsModal.user.rol_nombre || ''}
                        onClose={() => setUserPermsModal({ open: false, user: null })}
                    />
                )}
            </Modal>
        </div>
    );
};

export default SettingsPage;
