import React, { useState } from 'react';
import {
    Settings,
    Building2,
    HardHat,
    Briefcase,
    FileText,
    Users,
    Shield
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../utils/cn';

import { CrudTable } from '../components/ui/CrudTable';
import type { ColumnDef } from '../components/ui/CrudTable';
import { EmpresaForm } from '../components/settings/EmpresaForm';
import { ObraForm } from '../components/settings/ObraForm';
import { CargoForm } from '../components/settings/CargoForm';
import { TipoDocumentoForm } from '../components/settings/TipoDocumentoForm';
import { UsuarioForm } from '../components/settings/UsuarioForm';
import { RolForm } from '../components/settings/RolForm';

type TabKey = 'empresas' | 'obras' | 'cargos' | 'tipos_doc' | 'usuarios' | 'roles';

interface TabDef {
    key: TabKey;
    label: string;
    icon: React.ElementType;
}

const tabs: TabDef[] = [
    { key: 'empresas', label: 'Empresas', icon: Building2 },
    { key: 'obras', label: 'Obras', icon: HardHat },
    { key: 'cargos', label: 'Cargos', icon: Briefcase },
    { key: 'tipos_doc', label: 'Tipos Doc.', icon: FileText },
    { key: 'usuarios', label: 'Usuarios', icon: Users },
    { key: 'roles', label: 'Roles', icon: Shield },
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
                "text-[10px] font-bold px-2 py-0.5 rounded-full",
                v ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
            )}>
                {v ? 'Activo' : 'Inactivo'}
            </span>
        ),
    },
];

const obraCols: ColumnDef<any>[] = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'empresa_nombre', label: 'Empresa', render: (v) => v || '—' },
    { key: 'direccion', label: 'Dirección', render: (v) => v || '—' },
    {
        key: 'activa', label: 'Estado',
        render: (v) => (
            <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full",
                v ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
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
                "text-[10px] font-bold px-2 py-0.5 rounded-full",
                v ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
            )}>
                {v ? 'Activo' : 'Inactivo'}
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
                "text-[10px] font-bold px-2 py-0.5 rounded-full",
                v ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
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
                "text-[10px] font-bold px-2 py-0.5 rounded-full",
                v ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
            )}>
                {v ? 'Activo' : 'Inactivo'}
            </span>
        ),
    },
];

const rolCols: ColumnDef<any>[] = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'descripcion', label: 'Descripción', render: (v) => v || '—' },
];

const SettingsPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabKey>('empresas');

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                    <Settings className="h-8 w-8 text-brand-primary" />
                    Configuración
                </h1>
                <p className="text-muted-foreground mt-1">
                    Administra los catálogos maestros del sistema.
                </p>
            </div>

            {/* Tabs */}
            <div className="premium-card p-1.5 flex gap-1 overflow-x-auto">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={cn(
                            "relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap",
                            activeTab === tab.key
                                ? "text-white"
                                : "text-muted-foreground hover:text-white hover:bg-white/5"
                        )}
                    >
                        {activeTab === tab.key && (
                            <motion.div
                                layoutId="settings-tab"
                                className="absolute inset-0 bg-violet-500/15 border border-violet-500/20 rounded-xl"
                            />
                        )}
                        <tab.icon className="h-4 w-4 relative z-10" />
                        <span className="relative z-10">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
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
                    />
                )}
                {activeTab === 'obras' && (
                    <CrudTable
                        endpoint="/obras"
                        columns={obraCols}
                        entityName="Obra"
                        entityNamePlural="Obras"
                        FormComponent={ObraForm}
                    />
                )}
                {activeTab === 'cargos' && (
                    <CrudTable
                        endpoint="/cargos"
                        columns={cargoCols}
                        entityName="Cargo"
                        entityNamePlural="Cargos"
                        FormComponent={CargoForm}
                    />
                )}
                {activeTab === 'tipos_doc' && (
                    <CrudTable
                        endpoint="/documentos/tipos"
                        columns={tipoDocCols}
                        entityName="Tipo de Documento"
                        entityNamePlural="Tipos de Documento"
                        FormComponent={TipoDocumentoForm}
                    />
                )}
                {activeTab === 'usuarios' && (
                    <CrudTable
                        endpoint="/usuarios"
                        columns={usuarioCols}
                        entityName="Usuario"
                        entityNamePlural="Usuarios"
                        FormComponent={UsuarioForm}
                    />
                )}
                {activeTab === 'roles' && (
                    <CrudTable
                        endpoint="/usuarios/roles/list"
                        columns={rolCols}
                        entityName="Rol"
                        entityNamePlural="Roles"
                        FormComponent={RolForm}
                        canDelete={false}
                    />
                )}
            </motion.div>
        </div>
    );
};

export default SettingsPage;
