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
    AlertTriangle
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
import { EstadoAsistenciaForm } from '../components/settings/EstadoAsistenciaForm';
import { TipoAusenciaForm } from '../components/settings/TipoAusenciaForm';

type TabKey = 'empresas' | 'obras' | 'cargos' | 'tipos_doc' | 'usuarios' | 'roles' | 'estados_asistencia' | 'tipos_ausencia';

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
    { key: 'estados_asistencia', label: 'Estados Asist.', icon: CheckSquare },
    { key: 'tipos_ausencia', label: 'Tipos Ausencia', icon: AlertTriangle },
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
                "text-[10px] font-semibold px-2.5 py-0.5 rounded-full",
                v ? "bg-[#34C759]/10 text-[#34C759]"
                    : "bg-[#FF3B30]/10 text-[#FF3B30]"
            )}>
                {v ? 'Activo' : 'Inactivo'}
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
                "text-[10px] font-semibold px-2.5 py-0.5 rounded-full",
                v ? "bg-[#34C759]/10 text-[#34C759]"
                    : "bg-[#FF3B30]/10 text-[#FF3B30]"
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
                v ? "bg-[#34C759]/10 text-[#34C759]"
                    : "bg-[#FF3B30]/10 text-[#FF3B30]"
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
                "text-[10px] font-semibold px-2.5 py-0.5 rounded-full",
                v ? "bg-[#FF9F0A]/10 text-[#FF9F0A]"
                    : "bg-[#A1A1A6]/10 text-[#A1A1A6]"
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
                v ? "bg-[#34C759]/10 text-[#34C759]"
                    : "bg-[#FF3B30]/10 text-[#FF3B30]"
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

const estadoAsistenciaCols: ColumnDef<any>[] = [
    { key: 'nombre', label: 'Nombre' },
    {
        key: 'codigo', label: 'Código', render: (v) => (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F5F5F7]">{v}</span>
        )
    },
    {
        key: 'color', label: 'Color', render: (v) => (
            <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full border border-[#E8E8ED]" style={{ backgroundColor: v }} />
                <span className="text-[10px] text-[#6E6E73]">{v}</span>
            </div>
        )
    },
    {
        key: 'es_presente', label: 'Cuenta como Presente', render: (v) => (
            <span className={cn(
                "text-[10px] font-semibold px-2.5 py-0.5 rounded-full",
                v ? "bg-[#34C759]/10 text-[#34C759]" : "bg-[#A1A1A6]/10 text-[#A1A1A6]"
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
                v ? "bg-[#34C759]/10 text-[#34C759]" : "bg-[#FF3B30]/10 text-[#FF3B30]"
            )}>{v ? 'Sí' : 'No'}</span>
        )
    },
    {
        key: 'activo', label: 'Estado',
        render: (v) => (
            <span className={cn(
                "text-[10px] font-semibold px-2.5 py-0.5 rounded-full",
                v ? "bg-[#34C759]/10 text-[#34C759]" : "bg-[#FF3B30]/10 text-[#FF3B30]"
            )}>{v ? 'Activo' : 'Inactivo'}</span>
        ),
    },
];

const SettingsPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabKey>('empresas');

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-[#1D1D1F] flex items-center gap-3">
                    <Settings className="h-7 w-7 text-[#0071E3]" />
                    Configuración
                </h1>
                <p className="text-[#6E6E73] mt-1 text-sm">
                    Administra los catálogos maestros del sistema.
                </p>
            </div>

            {/* Tabs — Apple Web Style (Pills) */}
            <div className="flex gap-3 overflow-x-auto pb-2">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={cn(
                            "relative flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all whitespace-nowrap",
                            activeTab === tab.key
                                ? "text-white"
                                : "text-[#1D1D1F] hover:bg-[#F5F5F7]"
                        )}
                    >
                        {activeTab === tab.key && (
                            <motion.div
                                layoutId="settings-tab"
                                className="absolute inset-0 bg-[#1D1D1F] rounded-full"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
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
                        queryParams={{ activo: true }}
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
                {activeTab === 'estados_asistencia' && (
                    <CrudTable
                        endpoint="/estados-asistencia"
                        columns={estadoAsistenciaCols}
                        entityName="Estado de Asistencia"
                        entityNamePlural="Estados de Asistencia"
                        FormComponent={EstadoAsistenciaForm}
                        queryParams={{ activo: true }}
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
                    />
                )}
            </motion.div>
        </div>
    );
};

export default SettingsPage;
