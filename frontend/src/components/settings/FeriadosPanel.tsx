import React, { useState } from 'react';
import { CrudTable } from '../ui/CrudTable';
import type { ColumnDef } from '../ui/CrudTable';
import { FeriadosForm } from './FeriadosForm';
import { useAuth } from '../../context/AuthContext';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { cn } from '../../utils/cn';
import api from '../../services/api';

const feriadosCols: ColumnDef<any>[] = [
    {
        key: 'fecha', label: 'Fecha', render: (v) => {
            const date = new Date(v);
            // Formatear en zona UTC para evitar desfasaje de 1 día
            return date.toLocaleDateString('es-CL', { timeZone: 'UTC' });
        }
    },
    { key: 'nombre', label: 'Nombre' },
    {
        key: 'tipo', label: 'Tipo', render: (v) => (
            <span className="capitalize">{v}</span>
        )
    },
    {
        key: 'irrenunciable', label: 'Irrenunciable', render: (v) => (
            <span className={cn(
                "text-[10px] font-semibold px-2.5 py-0.5 rounded-full",
                v ? "bg-[#FF3B30]/10 text-[#FF3B30]" : "bg-[#A1A1A6]/10 text-[#A1A1A6]"
            )}>{v ? 'Sí' : 'No'}</span>
        )
    },
];

export const FeriadosPanel: React.FC = () => {
    const { checkPermission } = useAuth();
    const [isSyncing, setIsSyncing] = useState(false);
    // Key que cambia para forzar el re-render de la tabla tras sincronizar
    const [tableKey, setTableKey] = useState(0);

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const currentYear = new Date().getFullYear();
            await api.post('/feriados/sync', { year: currentYear });
            // Incrementar la key hace que CrudTable se desmonte y vuelva a montar, recargando los datos
            setTableKey(prev => prev + 1);
        } catch (error) {
            console.error('Error sincronizando feriados:', error);
            alert('Error al sincronizar feriados nacionales.');
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h3 className="text-base font-semibold text-[#1D1D1F]">Gestión de Feriados</h3>
                    <p className="text-sm text-[#6E6E73] mt-1">Configura los días feriados o festivos de la obra y sincroniza los nacionales.</p>
                </div>
                {checkPermission('asistencia', 'puede_editar') && (
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 bg-white border border-[#D2D2D7] rounded-xl text-sm font-semibold transition-all shadow-sm",
                            isSyncing ? "opacity-50 cursor-not-allowed" : "hover:border-[#029E4D] hover:text-[#029E4D]"
                        )}
                    >
                        <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
                        <span>Sincronizar Año Actual</span>
                    </button>
                )}
            </div>

            <CrudTable
                key={tableKey}
                endpoint="/feriados"
                columns={feriadosCols}
                entityName="Feriado"
                entityNamePlural="Feriados"
                FormComponent={FeriadosForm}
                searchPlaceholder="Buscar por nombre..."
                queryParams={{ activo: true }}
                canCreate={checkPermission('asistencia', 'puede_crear')}
                canEdit={checkPermission('asistencia', 'puede_editar')}
                canDelete={checkPermission('asistencia', 'puede_eliminar')}
                canExport={false}
            />
        </div>
    );
};
