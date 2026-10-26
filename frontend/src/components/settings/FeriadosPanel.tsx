import React, { useState } from 'react';
import { CrudTable } from '../ui/CrudTable';
import type { ColumnDef } from '../ui/CrudTable';
import { FeriadosForm } from './FeriadosForm';
import { RefreshCw } from 'lucide-react';
import { cn } from '../../utils/cn';
import api from '../../services/api';
import RequirePermission from '../auth/RequirePermission';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import { showApiError } from '../../utils/toastUtils';
import { resumenSync, type ResultadoSync } from './feriadosSync';

interface FeriadoFila {
    id: number;
    activo?: boolean;
    fecha: string;
    nombre: string;
    tipo: string;
    irrenunciable: boolean | number;
}

const feriadosCols: ColumnDef<FeriadoFila>[] = [
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
                "text-caption font-semibold px-2.5 py-0.5 rounded-full",
                v ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
            )}>{v ? 'Sí' : 'No'}</span>
        )
    },
];

export const FeriadosPanel: React.FC = () => {
    const { hasPermission } = useAuth();
    const [isSyncing, setIsSyncing] = useState(false);
    // Key que cambia para forzar el re-render de la tabla tras sincronizar
    const [tableKey, setTableKey] = useState(0);
    // Año actual o el siguiente: desde octubre conviene dejar listo el año que viene.
    const anioActual = new Date().getFullYear();
    const [anio, setAnio] = useState(anioActual);

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const { data } = await api.post<ResultadoSync>('/feriados/sync', { year: anio });
            const r = resumenSync(data);
            if (r.tono === 'aviso') toast.warning(r.titulo, { description: r.detalle, duration: 12000 });
            else toast.success(r.titulo, { description: r.detalle });
            // Incrementar la key hace que CrudTable se desmonte y vuelva a montar, recargando los datos
            setTableKey(prev => prev + 1);
        } catch (error) {
            showApiError(error, `No se pudieron sincronizar los feriados de ${anio}.`);
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h3 className="text-base font-semibold text-brand-dark">Gestión de Feriados</h3>
                    <p className="text-sm text-muted-foreground mt-1">Configura los días feriados o festivos de la obra y sincroniza los nacionales.</p>
                </div>
                <RequirePermission permiso="asistencia.feriado.gestionar">
                    <div className="flex items-center gap-2">
                        <Select
                            aria-label="Año a sincronizar"
                            className="h-10 w-28"
                            value={anio}
                            onChange={e => setAnio(Number(e.target.value))}
                            disabled={isSyncing}
                            options={[anioActual, anioActual + 1].map(y => ({ value: y, label: String(y) }))}
                        />
                        <Button
                            variant="outline"
                            onClick={handleSync}
                            disabled={isSyncing}
                            leftIcon={<RefreshCw className={cn('h-4 w-4', isSyncing && 'animate-spin')} />}
                        >
                            {isSyncing ? 'Sincronizando…' : 'Sincronizar feriados nacionales'}
                        </Button>
                    </div>
                </RequirePermission>
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
                canCreate={hasPermission('asistencia.feriado.gestionar')}
                canEdit={hasPermission('asistencia.feriado.gestionar')}
                canDelete={hasPermission('asistencia.feriado.gestionar')}
                canExport={false}
            />
        </div>
    );
};
