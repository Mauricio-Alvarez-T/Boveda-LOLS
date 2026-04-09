import { useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useObra } from '../../context/ObraContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import type { Trabajador, Asistencia, EstadoAsistencia } from '../../types/entities';

interface UseAttendanceExportProps {
    date: string;
    workers: Trabajador[];
    attendance: Record<number, Partial<Asistencia>>;
    estados: EstadoAsistencia[];
    reportMonth: string;
    reportYear: string;
}

export function useAttendanceExport({
    date,
    workers,
    attendance,
    estados,
    reportMonth,
    reportYear
}: UseAttendanceExportProps) {
    const { selectedObra } = useObra();
    const { hasPermission } = useAuth();
    
    const latestData = useRef({ selectedObra, date, workers, attendance, estados, reportMonth, reportYear });
    useEffect(() => {
        latestData.current = { selectedObra, date, workers, attendance, estados, reportMonth, reportYear };
    }, [selectedObra, date, workers, attendance, estados, reportMonth, reportYear]);

    const handleExportExcel = useCallback(async (returnFile = false) => {
        if (!hasPermission('asistencia.exportar_excel')) {
            toast.error('No tienes permiso para exportar a Excel');
            return null;
        }
        
        const {
            selectedObra: currentObra,
            date: currentDate,
            reportMonth: currentMonth,
            reportYear: currentYear
        } = latestData.current;

        try {
            let year, month;
            if (!currentObra) {
                year = currentYear;
                month = currentMonth;
            } else {
                [year, month] = currentDate.split('-');
            }

            const firstDay = `${year}-${month}-01`;
            const lastDay = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];

            if (!returnFile) toast.info('Generando reporte Excel...', { id: 'excel-export' });

            const obraIdParam = currentObra ? `obra_id=${currentObra.id}` : 'obra_id=';
            const response = await api.get(`/asistencias/exportar/excel?${obraIdParam}&fecha_inicio=${firstDay}&fecha_fin=${lastDay}`, {
                responseType: 'blob'
            });

            const fileName = currentObra ? `Asistencia_${currentObra.nombre.replace(/\\s+/g, '_')}` : 'Asistencia_Todas_las_Obras';
            const finalFileName = `${fileName}_${year}_${month}.xlsx`;

            if (returnFile) {
                return new File([response.data as Blob], finalFileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            }

            const url = window.URL.createObjectURL(new Blob([response.data as any]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', finalFileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            toast.success('Reporte Excel descargado', { id: 'excel-export' });
            return null;
        } catch (error) {
            console.error('Error exportando Excel', error);
            if (!returnFile) toast.error('Error al generar el reporte', { id: 'excel-export' });
            return null;
        }
    }, [hasPermission]);

    const copyToClipboard = useCallback(async (text: string) => {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (e) { }

        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "0";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            return successful;
        } catch (err) {
            return false;
        }
    }, []);

    const handleShareWhatsApp = useCallback(async () => {
        if (!hasPermission('asistencia.enviar_whatsapp')) {
            toast.error('No tienes permiso para enviar por WhatsApp');
            return;
        }

        const { selectedObra: currentObra, date: currentDate, workers: currentWorkers, attendance: currentAttendance, estados: currentEstados } = latestData.current;
        if (!currentObra) return;

        toast.info('Preparando reporte...', { id: 'whatsapp-share', duration: 2000 });

        const dateStr = currentDate.split('-').reverse().join('-');
        let text = `Buenas tardes\n`;
        text += `Adjunto asistencia de ${currentObra.nombre} del día ${dateStr}.\n\n`;

        const total = currentWorkers.length;
        const counts: Record<string, number> = { A: 0, F: 0, JI: 0, TO: 0, V: 0, LM: 0, PL: 0 };

        currentWorkers.forEach(w => {
            const state = currentAttendance[w.id];
            if (!state || !state.estado_id) return;
            const est = currentEstados.find(e => e.id === state.estado_id);
            if (!est) return;

            let code = est.codigo;
            if (['NAC', 'DEF', 'MAT'].includes(code)) code = 'PL';
            if (code === 'AT') code = 'JI';

            if (counts[code] !== undefined) counts[code]++;
            else if (!est.es_presente) counts.PL++; 
        });

        text += `Total: ${total}\n`;
        ['A', 'F', 'JI', 'TO', 'V', 'LM', 'PL'].forEach(c => {
            text += `${c}: ${counts[c].toString().padStart(2, '0')}\n`;
        });
        text += `\n`;

        const categorias = [
            { key: 'obra', label: `Obra ${currentObra.nombre}:` },
            { key: 'operaciones', label: 'Operaciones:' },
            { key: 'rotativo', label: 'Personal rotativo:' }
        ];

        categorias.forEach(cat => {
            const presentWorkersInCat = currentWorkers.filter(w => {
                const isCat = (w.categoria_reporte || 'obra') === cat.key;
                if (!isCat) return false;
                const state = currentAttendance[w.id];
                if (!state || !state.estado_id) return false;
                const est = currentEstados.find(e => e.id === state.estado_id);
                return est && est.es_presente;
            });
            if (presentWorkersInCat.length === 0) return;
            text += `${cat.label}\n`;
            const cargoCounts: Record<string, number> = {};
            presentWorkersInCat.forEach(w => {
                const cargo = w.cargo_nombre || 'Sin Cargo';
                cargoCounts[cargo] = (cargoCounts[cargo] || 0) + 1;
            });
            Object.keys(cargoCounts).sort().forEach(cargo => {
                text += `${cargoCounts[cargo].toString().padStart(2, '0')} ${cargo}\n`;
            });
            text += `\n`;
        });

        const excepciones = currentWorkers.filter(w => {
            const state = currentAttendance[w.id];
            if (!state || !state.estado_id) return false;
            const est = currentEstados.find(e => e.id === state.estado_id);
            return est && !est.es_presente;
        });

        if (excepciones.length > 0) {
            text += `AUSENCIAS Y MOVIMIENTOS: ${excepciones.length.toString().padStart(2, '0')}\n`;
            excepciones.forEach(w => {
                const state = currentAttendance[w.id];
                const est = currentEstados.find(e => e.id === state?.estado_id);
                let line = `- ${w.apellido_paterno} ${w.nombres} (${est ? est.codigo : '?'})`;
                if (est?.codigo === 'TO' && state?.observacion) {
                    line += ` ${state.observacion}`;
                }
                text += line + '\n';
            });
            text += `\n`;
        }

        text += `Saludos cordiales\n\n`;
        text += `_Este mensaje se genero usando Bóveda lols_`;

        try {
            await copyToClipboard(text);

            toast.loading('Preparando link de reporte...', { id: 'whatsapp-share' });

            const { selectedObra: currentObra, date: currentDate, reportMonth, reportYear } = latestData.current;
            let year, month;
            if (!currentObra) {
                year = reportYear;
                month = reportMonth;
            } else {
                [year, month] = currentDate.split('-');
            }

            const obraIdParam = currentObra ? currentObra.id : '';
            const firstDay = `${year}-${month}-01`;
            const lastDay = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];

            const tokenRes = await api.get<{ data: { token: string } }>(
                `asistencias/public-report-token?obra_id=${obraIdParam}&fecha_inicio=${firstDay}&fecha_fin=${lastDay}`
            );
            const token = tokenRes.data.data.token;

            let baseUrl = api.defaults.baseURL || '';
            if (!baseUrl.startsWith('http')) {
                baseUrl = window.location.origin + (baseUrl.startsWith('/') ? baseUrl : '/' + baseUrl);
            }
            const publicUrl = `${baseUrl}/asistencias/d/${token}`;

            const finalMessage = `📊 *REPORTE DETALLADO (Excel):*\n${publicUrl}\n\n${text}`;

            toast.success('¡Reporte y link listos!', {
                id: 'whatsapp-share',
                description: 'Pulsa el botón para enviar por WhatsApp.',
                duration: 15000,
                action: {
                    label: 'ENVIAR AHORA',
                    onClick: async () => {
                        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

                        if (isMobile && navigator.share) {
                            try {
                                await navigator.share({
                                    text: finalMessage,
                                    title: `Asistencia ${currentObra?.nombre || 'Bóveda'}`
                                });
                            } catch (e: any) {
                                if (e.name !== 'AbortError') {
                                    window.open(`https://wa.me/?text=${encodeURIComponent(finalMessage)}`, '_blank');
                                }
                            }
                        } else {
                            const encodedText = encodeURIComponent(finalMessage);
                            window.open(`https://wa.me/?text=${encodedText}`, '_blank');
                        }
                    }
                }
            });

        } catch (error: any) {
            console.error('Error preparing WhatsApp link', error);
            const serverMsg = error.response?.data?.error || error.response?.data?.message;
            const errorDetail = serverMsg ? `: ${serverMsg}` : ` (${error.message})`;

            toast.error(`Error al generar link${errorDetail}`, { id: 'whatsapp-share', duration: 8000 });

            setTimeout(() => {
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
            }, 2000);
        }
    }, [copyToClipboard, hasPermission]);

    return {
        handleExportExcel,
        handleShareWhatsApp
    };
}
