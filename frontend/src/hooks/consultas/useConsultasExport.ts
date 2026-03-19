import { useState, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'sonner';
import type { TrabajadorAvanzado } from './useConsultasData';

export const useConsultasExport = (workers: TrabajadorAvanzado[], selectedWorkers: Set<number>) => {
    const [exporting, setExporting] = useState(false);

    const handleExportExcel = useCallback(async (exportAll: boolean) => {
        const dataToExport = exportAll ? workers : workers.filter(w => selectedWorkers.has(w.id));
        
        if (dataToExport.length === 0) {
            toast.warning('No hay datos para exportar');
            return;
        }

        setExporting(true);
        toast.info('Generando reporte Excel...', { id: 'excel-export' });

        try {
            const response = await api.post('/fiscalizacion/exportar-excel', {
                trabajadores: dataToExport
            }, { responseType: 'blob' });

            const url = window.URL.createObjectURL(new Blob([response.data as any]));
            const link = document.createElement('a');
            link.href = url;
            const timeString = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
            link.setAttribute('download', `Consultas_${new Date().toISOString().split('T')[0]}_${timeString}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            toast.success('Reporte Excel descargado', { id: 'excel-export' });
        } catch (err) {
            toast.error('Error al generar Excel', { id: 'excel-export' });
        } finally {
            setExporting(false);
        }
    }, [workers, selectedWorkers]);

    return {
        exporting,
        handleExportExcel
    };
};
