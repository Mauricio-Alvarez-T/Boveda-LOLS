import { useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useObra } from '../../context/ObraContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { copyToClipboard, shareViaWhatsApp } from '../../utils/whatsappShare';
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
        // Contadores fijos siempre visibles + dinámico para otros códigos
        // (NAC/DF/MT mig 065 — RH pidió desglose individual, sin PL).
        const counts: Record<string, number> = {
            A: 0, F: 0, JI: 0, TO: 0, V: 0, LM: 0,
            NAC: 0, DF: 0, MT: 0, PSG: 0,
        };

        currentWorkers.forEach(w => {
            const state = currentAttendance[w.id];
            if (!state || !state.estado_id) return;
            const est = currentEstados.find(e => e.id === state.estado_id);
            if (!est) return;

            let code = est.codigo;
            // AT (atraso legacy) absorbido por JI. NAC/DF/MT NO consolidan.
            if (code === 'AT') code = 'JI';

            if (counts[code] !== undefined) counts[code]++;
        });

        text += `Total: ${total}\n`;
        // Mostrar siempre fijos. Códigos opcionales (NAC/DF/MT/PSG) solo si >0
        // para evitar contaminar mensaje con líneas en cero.
        ['A', 'F', 'JI', 'TO', 'V', 'LM'].forEach(c => {
            text += `${c}: ${counts[c].toString().padStart(2, '0')}\n`;
        });
        ['NAC', 'DF', 'MT', 'PSG'].forEach(c => {
            if (counts[c] > 0) {
                text += `${c}: ${counts[c].toString().padStart(2, '0')}\n`;
            }
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
            // Línea en blanco después del título para separarlo del listado
            // (mejora legibilidad en WhatsApp mobile).
            text += `${cat.label}\n\n`;
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

        // Enriquecimiento de líneas de ausencia con info de período: si el
        // trabajador tiene un período activo para el día del reporte (vacaciones,
        // licencia, permiso sin goce, etc.), se agrega "X días: DD/MM/YYYY →
        // DD/MM/YYYY" para que RRHH vea de un vistazo el rango de la ausencia.
        // Degrada sin enriquecer si el usuario no tiene permiso periodo.ver o
        // si la llamada falla. Key del map = `${trabajadorId}_${estadoId}` para
        // soportar el caso (raro) de varios períodos activos por trabajador.
        const periodMap = new Map<string, { fecha_inicio: string; fecha_fin: string; estado_id: number }>();
        if (currentObra) {
            try {
                const periodsRes = await api.get<{ data: Array<{ trabajador_id: number; estado_id: number; fecha_inicio: string; fecha_fin: string }> }>(
                    `/asistencias/periodos?obra_id=${currentObra.id}&fecha_inicio=${currentDate}&fecha_fin=${currentDate}&activo=true`
                );
                for (const p of (periodsRes.data?.data || [])) {
                    periodMap.set(`${p.trabajador_id}_${p.estado_id}`, p);
                }
            } catch {
                // Permiso faltante o error de red → seguimos sin enriquecer.
            }
        }

        if (excepciones.length > 0) {
            // Línea en blanco después del título para separarlo del listado
            // (mejora legibilidad en WhatsApp mobile).
            text += `AUSENCIAS Y MOVIMIENTOS: ${excepciones.length.toString().padStart(2, '0')}\n\n`;
            excepciones.forEach((w, idx) => {
                // Línea en blanco entre cada ausencia (excepto la primera) para
                // que en WhatsApp mobile cada trabajador quede visualmente
                // separado, sobre todo cuando la línea wrappea (V/LM/PSG con
                // rango de fechas suelen ocupar 2 líneas en pantallas chicas).
                if (idx > 0) text += '\n';

                const state = currentAttendance[w.id];
                const est = currentEstados.find(e => e.id === state?.estado_id);
                let line = `- ${w.apellido_paterno} ${w.nombres} (${est ? est.codigo : '?'})`;
                if (est?.codigo === 'TO' && state?.observacion) {
                    line += ` ${state.observacion}`;
                }
                // Anexar rango y días si hay un período activo que matchee el estado.
                // Aplica a V (vacaciones), LM (licencia médica), DF (defunción),
                // NAC (nacimiento), MT (matrimonio) y PSG (permiso sin goce).
                // Si el período es de 1 día se omite la flecha (queda "1 día: fecha"),
                // si son varios se muestra el rango completo "N días: ini → fin".
                // Fallback: si el estado es de tipo período pero NO hay período
                // registrado (caso típico: se asignó vía el dropdown "OTRO" de la
                // fila, no por PeriodAssignModal), igual mostramos "1 día: fecha
                // del reporte" para que RRHH no quede sin contexto del día.
                const PERIOD_CODES = ['V', 'LM', 'DF', 'NAC', 'MT', 'PSG'];
                const periodo = est ? periodMap.get(`${w.id}_${est.id}`) : undefined;
                if (periodo) {
                    const fi = String(periodo.fecha_inicio).split('T')[0];
                    const ff = String(periodo.fecha_fin).split('T')[0];
                    const fiMs = new Date(fi + 'T00:00:00').getTime();
                    const ffMs = new Date(ff + 'T00:00:00').getTime();
                    const dias = Math.floor((ffMs - fiMs) / 86400000) + 1;
                    const fiFmt = fi.split('-').reverse().join('/');
                    if (dias === 1) {
                        line += ` 1 día: ${fiFmt}`;
                    } else {
                        const ffFmt = ff.split('-').reverse().join('/');
                        line += ` ${dias} días: ${fiFmt} → ${ffFmt}`;
                    }
                } else if (est && PERIOD_CODES.includes(est.codigo)) {
                    const fiFmt = currentDate.split('-').reverse().join('/');
                    line += ` 1 día: ${fiFmt}`;
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
                        await shareViaWhatsApp(finalMessage, `Asistencia ${currentObra?.nombre || 'Bóveda'}`);
                    }
                }
            });

        } catch (error: any) {
            console.error('Error preparing WhatsApp link', error);
            const serverMsg = error.response?.data?.error || error.response?.data?.message;
            const errorDetail = serverMsg ? `: ${serverMsg}` : ` (${error.message})`;

            toast.error(`Error al generar link${errorDetail}`, { id: 'whatsapp-share', duration: 8000 });

            setTimeout(() => {
                shareViaWhatsApp(text, `Asistencia ${currentObra?.nombre || 'Bóveda'}`);
            }, 2000);
        }
    }, [hasPermission]);

    return {
        handleExportExcel,
        handleShareWhatsApp
    };
}
