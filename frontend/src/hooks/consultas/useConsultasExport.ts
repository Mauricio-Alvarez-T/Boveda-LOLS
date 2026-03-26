import { useState, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

interface ExportFilters {
    obra_id?: string;
    empresa_id?: string;
    cargo_id?: string;
    categoria_reporte?: string;
    activo?: string;
    q?: string;
}

export const useConsultasExport = (filters: ExportFilters) => {
    const { hasPermission } = useAuth();
    const [exporting, setExporting] = useState(false);

    const handleExportExcel = useCallback(async (trabajador_ids?: number[]) => {
        if (!hasPermission('reportes.exportar')) {
            toast.error('No tienes permiso para exportar reportes');
            return;
        }

        setExporting(true);
        toast.info('Generando reporte mensual de asistencia...', { id: 'excel-export' });

        try {
            // Obtener mes y año actual para el reporte mensual por defecto
            const now = new Date();
            const year = now.getFullYear();
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            const firstDay = `${year}-${month}-01`;
            const lastDay = new Date(year, now.getMonth() + 1, 0).toISOString().split('T')[0];

            const params = new URLSearchParams();
            params.append('fecha_inicio', firstDay);
            params.append('fecha_fin', lastDay);

            if (filters.obra_id) params.append('obra_id', filters.obra_id);
            if (filters.empresa_id) params.append('empresa_id', filters.empresa_id);
            if (filters.cargo_id) params.append('cargo_id', filters.cargo_id);
            if (filters.categoria_reporte) params.append('categoria_reporte', filters.categoria_reporte);
            if (filters.activo) params.append('activo', filters.activo);
            if (filters.q) params.append('q', filters.q);
            
            if (trabajador_ids && trabajador_ids.length > 0) {
                params.append('trabajador_ids', trabajador_ids.join(','));
            }

            const response = await api.get(`/asistencias/exportar/excel?${params.toString()}`, {
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data as any]));
            const link = document.createElement('a');
            link.href = url;
            
            const fileName = `Reporte_Asistencia_${year}_${month}.xlsx`;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            toast.success('Reporte Excel descargado', { id: 'excel-export' });
        } catch (err) {
            console.error('Error exportando Excel:', err);
            toast.error('Error al generar Excel', { id: 'excel-export' });
        } finally {
            setExporting(false);
        }
    }, [filters]);

    return {
        exporting,
        handleExportExcel
    };
};
