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
    Mail
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../utils/cn';
import { useAuth } from '../context/AuthContext';

import { CrudTable } from '../components/ui/CrudTable';
import type { ColumnDef } from '../components/ui/CrudTable';
import { EmpresaForm } from '../components/settings/EmpresaForm';
import { ObraForm } from '../components/settings/ObraForm';
import { CargoForm } from '../components/settings/CargoForm';
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

type TabKey = 'empresas' | 'obras' | 'cargos' | 'tipos_doc' | 'usuarios' | 'roles' | 'estados_asistencia' | 'tipos_ausencia' | 'horarios' | 'feriados' | 'mi_correo' | 'plantillas' | 'logs' | 'seguridad';

interface TabDef {
    key: TabKey;
    label: string;
    icon: React.ElementType;
}

interface TabGroup {
    title: string;
    items: TabDef[];
}

const tabGroups: TabGroup[] = [
    {
        title: "Organización",
        items: [
            { key: 'empresas', label: 'Empresas', icon: Building2 },
            { key: 'obras', label: 'Obras', icon: HardHat },
            { key: 'cargos', label: 'Cargos', icon: Briefcase },
        ]
    },
    {
        title: "Personal & Documentos",
        items: [
            { key: 'usuarios', label: 'Usuarios', icon: Users },
            { key: 'roles', label: 'Roles', icon: Shield },
            { key: 'tipos_doc', label: 'Tipos de Documento', icon: FileText },
        ]
    },
    {
        title: "Asistencia",
        items: [
            { key: 'estados_asistencia', label: 'Estados Asist.', icon: CheckSquare },
            { key: 'tipos_ausencia', label: 'Tipos Ausencia', icon: AlertTriangle },
            { key: 'horarios', label: 'Horarios Laborales', icon: Clock },
            { key: 'feriados', label: 'Feriados', icon: CheckSquare }, // Reusing an icon for simplicity
        ]
    },
    {
        title: "Sistema & Correo",
        items: [
            { key: 'mi_correo', label: 'Mi Correo', icon: Mail },
            { key: 'plantillas', label: 'Plantillas Email', icon: FileText },
            { key: 'logs', label: 'Historial de Actividad', icon: Clock },
            { key: 'seguridad', label: 'Seguridad', icon: Shield },
        ]
    }
];

// Column definitions for each entity
const empresaCols: ColumnDef<any>[] = [
    { key: 'rut', label: 'RUT' },
    { key: 'razon_social', label: 'Razón Social' },
    { key: 'direccion', label: 'Dirección', render: (v) => v || '—' },
    { key: 'telefono', label: 'Teléfono', render: (v) => v || '—' },
    {
        key: 'activo', label: 'Estado',
        render: (v) => (
            <span className={cn(
                "text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider",
                v ? "bg-brand-accent/10 text-brand-accent border border-brand-accent/20"
                    : "bg-destructive/10 text-destructive border border-destructive/20"
            )}>
                {v ? 'Activo' : 'Finiquitado'}
            </span>
        ),
    },
];

const obraCols: ColumnDef<any>[] = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'direccion', label: 'Dirección', render: (v) => v || '—' },
    {
        key: 'activa', label: 'Estado',
        render: (v) => (
            <span className={cn(
                "text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider",
                v ? "bg-brand-accent/10 text-brand-accent border border-brand-accent/20"
                    : "bg-destructive/10 text-destructive border border-destructive/20"
            )}>
                {v ? 'Activa' : 'Inactiva'}
            </span>
        ),
    },
];

const cargoCols: ColumnDef<any>[] = [
    { key: 'nombre', label: 'Nombre' },
    {
        key: 'activo', label: 'Estado',
        render: (v) => (
            <span className={cn(
                "text-[10px] font-semibold px-2.5 py-0.5 rounded-full",
                v ? "bg-brand-accent/10 text-brand-accent"
                    : "bg-destructive/10 text-destructive"
            )}>
                {v ? 'Activo' : 'Finiquitado'}
            </span>
        ),
    },
];

const tipoDocCols: ColumnDef<any>[] = [
    { key: 'nombre', label: 'Nombre' },
    {
        key: 'dias_vigencia', label: 'Vigencia',
        render: (v) => v ? `${v} días` : 'Sin vencimiento'
    },
    {
        key: 'obligatorio', label: 'Obligatorio',
        render: (v) => (
            <span className={cn(
                "text-[10px] font-semibold px-2.5 py-0.5 rounded-full",
                v ? "bg-warning/10 text-warning"
                    : "bg-muted/10 text-muted"
            )}>
                {v ? 'Sí' : 'No'}
            </span>
        ),
    },
];

const usuarioCols: ColumnDef<any>[] = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'rol_nombre', label: 'Rol', render: (v) => v || '—' },
    { key: 'obra_nombre', label: 'Obra', render: (v) => v || 'Oficina Central' },
    {
        key: 'activo', label: 'Estado',
        render: (v) => (
            <span className={cn(
                "text-[10px] font-semibold px-2.5 py-0.5 rounded-full",
                v ? "bg-brand-accent/10 text-brand-accent"
                    : "bg-destructive/10 text-destructive"
            )}>
                {v ? 'Activo' : 'Finiquitado'}
            </span>
        ),
    },
];

const rolCols: ColumnDef<any>[] = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'descripcion', label: 'Descripción', render: (v) => v || '—' },
];

const estadoAsistenciaCols: ColumnDef<any>[] = [
    { key: 'nombre', label: 'Nombre' },
    {
        key: 'codigo', label: 'Código', render: (v) => (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-background">{v}</span>
        )
    },
    {
        key: 'color', label: 'Color', render: (v) => (
            <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full border border-[#E8E8ED]" style={{ backgroundColor: v }} />
                <span className="text-[10px] text-muted-foreground">{v}</span>
            </div>
        )
    },
    {
        key: 'es_presente', label: 'Cuenta como Presente', render: (v) => (
            <span className={cn(
                "text-[10px] font-semibold px-2.5 py-0.5 rounded-full",
                v ? "bg-brand-accent/10 text-brand-accent" : "bg-muted/10 text-muted"
            )}>{v ? 'Sí' : 'No'}</span>
        )
    },
];

const tipoAusenciaCols: ColumnDef<any>[] = [
    { key: 'nombre', label: 'Nombre' },
    {
        key: 'es_justificada', label: 'Justificada', render: (v) => (
            <span className={cn(
                "text-[10px] font-semibold px-2.5 py-0.5 rounded-full",
                v ? "bg-brand-accent/10 text-brand-accent" : "bg-destructive/10 text-destructive"
            )}>{v ? 'Sí' : 'No'}</span>
        )
    },
    {
        key: 'activo', label: 'Estado',
        render: (v) => (
            <span className={cn(
                "text-[10px] font-semibold px-2.5 py-0.5 rounded-full",
                v ? "bg-brand-accent/10 text-brand-accent" : "bg-destructive/10 text-destructive"
            )}>{v ? 'Activo' : 'Finiquitado'}</span>
        ),
    },
];

const SettingsPage: React.FC = () => {
    const { checkPermission } = useAuth();
    const [activeTab, setActiveTab] = useState<TabKey>('empresas');

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
        <div className="h-[calc(100vh-116px)] md:h-[calc(100vh-132px)] flex flex-col gap-3 md:gap-4 lg:gap-5 p-0 overflow-hidden w-full">
            {/* Top Navigation - Category Tabs */}
            <div className="flex-none bg-white/80 backdrop-blur-xl rounded-2xl border border-[#E8E8ED] p-1.5 md:p-2 flex items-center gap-1 overflow-x-auto scrollbar-none shadow-sm">
                    {tabGroups.map((group, idx) => {
                        const isActive = activeGroup.title === group.title;
                        return (
                            <button
                                key={idx}
                                onClick={() => setActiveTab(group.items[0].key)}
                                className={cn(
                                    "flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap shrink-0 relative overflow-hidden group",
                                    isActive
                                        ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/25 translate-y-[-1px]"
                                        : "text-muted-foreground hover:bg-background hover:text-brand-dark"
                                )}
                            >
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

            {/* Main Content Area (Full Width) */}
            <div className="flex-1 min-h-0 flex flex-col bg-white border border-[#E2E2E7] rounded-3xl shadow-[0_10px_40px_rgb(0,0,0,0.08)] overflow-hidden relative">
                
                {/* Internal Header: Sub-Tabs */}
                <div className="h-[60px] border-b border-[#F0F0F5] bg-white/50 px-3 lg:px-5 flex items-center shrink-0 overflow-x-auto scrollbar-none gap-2">
                    {activeGroup.items.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all border whitespace-nowrap shrink-0",
                                activeTab === tab.key
                                    ? "bg-white border-brand-primary text-brand-primary shadow-sm ring-4 ring-brand-primary/5"
                                    : "bg-white/50 border-[#E8E8ED] text-muted-foreground hover:border-brand-primary/30 hover:text-brand-primary"
                            )}
                        >
                            <tab.icon className={cn("h-4 w-4", activeTab === tab.key ? "text-brand-primary" : "text-muted-foreground/60")} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Inner Content Area - Scrollable */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#F9F9FB] p-4 md:p-6 lg:p-8">
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
                            canCreate={checkPermission('empresas', 'puede_crear')}
                            canEdit={checkPermission('empresas', 'puede_editar')}
                            canDelete={checkPermission('empresas', 'puede_eliminar')}
                            canExport={false}
                        />
                    )}
                    {activeTab === 'obras' && (
                        <CrudTable
                            endpoint="/obras"
                            columns={obraCols}
                            entityName="Obra"
                            entityNamePlural="Obras"
                            FormComponent={ObraForm}
                            queryParams={{ activo: true }}
                            canCreate={checkPermission('obras', 'puede_crear')}
                            canEdit={checkPermission('obras', 'puede_editar')}
                            canDelete={checkPermission('obras', 'puede_eliminar')}
                            canExport={false}
                        />
                    )}
                    {activeTab === 'cargos' && (
                        <CrudTable
                            endpoint="/cargos"
                            columns={cargoCols}
                            entityName="Cargo"
                            entityNamePlural="Cargos"
                            FormComponent={CargoForm}
                            queryParams={{ activo: true }}
                            canCreate={checkPermission('cargos', 'puede_crear')}
                            canEdit={checkPermission('cargos', 'puede_editar')}
                            canDelete={checkPermission('cargos', 'puede_eliminar')}
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
                            canCreate={checkPermission('documentos', 'puede_crear')}
                            canEdit={checkPermission('documentos', 'puede_editar')}
                            canDelete={checkPermission('documentos', 'puede_eliminar')}
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
                            canCreate={checkPermission('usuarios', 'puede_crear')}
                            canEdit={checkPermission('usuarios', 'puede_editar')}
                            canDelete={checkPermission('usuarios', 'puede_eliminar')}
                            canExport={false}
                        />
                    )}
                    {activeTab === 'roles' && (
                        <CrudTable
                            endpoint="/usuarios/roles/list"
                            columns={rolCols}
                            entityName="Rol"
                            entityNamePlural="Roles"
                            FormComponent={RolForm}
                            canCreate={checkPermission('usuarios', 'puede_crear')}
                            canEdit={checkPermission('usuarios', 'puede_editar')}
                            canDelete={checkPermission('usuarios', 'puede_eliminar')}
                            canExport={false}
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
                            canCreate={checkPermission('asistencia', 'puede_crear')}
                            canEdit={checkPermission('asistencia', 'puede_editar')}
                            canDelete={checkPermission('asistencia', 'puede_eliminar')}
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
                            canCreate={checkPermission('asistencia', 'puede_crear')}
                            canEdit={checkPermission('asistencia', 'puede_editar')}
                            canDelete={checkPermission('asistencia', 'puede_eliminar')}
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
                </motion.div>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
