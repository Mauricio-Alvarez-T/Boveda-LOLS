import React, { useMemo } from 'react';
import {
    FileDown, CalendarRange, CopyPlus, Building2, ChevronLeft, MoreHorizontal
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useObra } from '../../context/ObraContext';
import { useSetPageHeader } from '../../context/PageHeaderContext';
import { useAttendanceData, useAttendanceActions, useAttendanceExport } from '../../hooks/attendance';
import RequirePermission from '../auth/RequirePermission';
import { cn } from '../../utils/cn';

interface Props {
    /** Callback para volver al tab de la lista de asistencia */
    onBack: () => void;
}

/**
 * Tab "Más" — sólo se muestra en mobile (oculto en md+ via className en
 * Attendance.tsx). Concentra las acciones secundarias que antes estaban en el
 * menú "..." y en los iconos del header de mobile, dejando el header limpio
 * con sólo Enviar (WhatsApp) y Guardar.
 *
 * Acciones disponibles aquí:
 *   - Repetir día anterior
 *   - Exportar Excel del mes
 *   - Marcar/Quitar feriado del día
 *   - Filtro por empresa (afecta la vista de la lista)
 *
 * Las acciones reusan los mismos hooks que `AttendanceDailyTab` — al cambiar
 * de tab los hooks remontan, lo que implica una segunda fetch. Aceptable
 * porque este tab es esporádico (no se navega seguido).
 */
const AttendanceExtrasMobileTab: React.FC<Props> = ({ onBack }) => {
    const { selectedObra } = useObra();
    const { hasPermission } = useAuth();

    const data = useAttendanceData();
    const {
        date, workers, attendance, feriadoActual, fetchAttendanceInfo, updateAttendance,
        availableEmpresas, selectedEmpresaId, setSelectedEmpresaId,
        estados, reportMonth, setReportMonth, reportYear, setReportYear,
        isSaturday, isSunday,
    } = data;

    const { toggleFeriado, repetirDiaAnterior, repeating, saving } = useAttendanceActions({
        date, workers, attendance, feriadoActual, fetchAttendanceInfo, updateAttendance,
    });

    const { handleExportExcel } = useAttendanceExport({
        date, workers, attendance, estados, reportMonth, reportYear,
    });

    const isFeriado = !!feriadoActual;
    const isWeekend = isSaturday || isSunday;
    const isRepeatDisabled = repeating || saving || workers.length === 0
        || !hasPermission('asistencia.guardar') || isFeriado || isWeekend;

    // Header — sólo título, sin actions (el header siempre visible)
    const headerTitle = useMemo(() => (
        <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary shadow-sm border border-brand-primary/20 shrink-0">
                <MoreHorizontal className="h-5 w-5" />
            </div>
            <div className="min-w-0">
                <h1 className="text-sm font-black text-brand-dark tracking-tighter leading-tight uppercase">
                    Más Acciones
                </h1>
                <p className="text-[10px] text-muted-foreground font-bold truncate opacity-80">
                    {selectedObra ? selectedObra.nombre : 'Asistencia'}
                </p>
            </div>
        </div>
    ), [selectedObra]);
    useSetPageHeader(headerTitle, null);

    const triggerRepeat = () => {
        if (!repetirDiaAnterior) return;
        if (window.confirm('¿Copiar el último día laboral en todos los trabajadores visibles? Los cambios se sobrescribirán, pero no se guardarán hasta que aprietes Guardar.')) {
            repetirDiaAnterior();
            // Volver a la lista para que vea los cambios aplicados
            setTimeout(onBack, 200);
        }
    };

    return (
        <div className="flex flex-col gap-3 pb-8">
            {/* Volver — link superior */}
            <button
                onClick={onBack}
                className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-primary self-start px-1 py-1 rounded-lg active:scale-95 transition-all"
            >
                <ChevronLeft className="h-4 w-4" />
                <span>Volver a la lista</span>
            </button>

            {/* ═══ Filtros ═══ */}
            <section className="bg-white rounded-2xl border border-[#E8E8ED] shadow-sm overflow-hidden">
                <header className="px-4 py-3 border-b border-[#F0F0F5] bg-[#FAFAFA]">
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Filtros</p>
                </header>
                <div className="p-4 space-y-3">
                    <label className="block">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1.5 flex items-center gap-1.5">
                            <Building2 className="h-3 w-3" /> Empresa
                        </span>
                        <select
                            value={selectedEmpresaId || ''}
                            onChange={(e) => setSelectedEmpresaId(e.target.value ? parseInt(e.target.value) : null)}
                            className="w-full h-11 bg-background border border-border rounded-xl text-sm font-medium text-brand-dark px-3 outline-none focus:border-brand-primary cursor-pointer"
                        >
                            <option value="">Todas las empresas</option>
                            {availableEmpresas.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                            ))}
                        </select>
                    </label>
                </div>
            </section>

            {/* ═══ Acciones del día ═══ */}
            <section className="bg-white rounded-2xl border border-[#E8E8ED] shadow-sm overflow-hidden">
                <header className="px-4 py-3 border-b border-[#F0F0F5] bg-[#FAFAFA]">
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Acciones del día</p>
                </header>

                <div className="divide-y divide-[#F0F0F5]">
                    <button
                        onClick={triggerRepeat}
                        disabled={isRepeatDisabled || !repetirDiaAnterior}
                        className={cn(
                            "w-full flex items-center gap-4 px-4 py-4 text-left active:bg-slate-50 transition-colors",
                            (isRepeatDisabled || !repetirDiaAnterior) && "opacity-40 grayscale pointer-events-none"
                        )}
                    >
                        <div className="h-11 w-11 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary shrink-0">
                            <CopyPlus className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-brand-dark">Repetir día anterior</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Copia el último día laboral en todos los trabajadores visibles.</p>
                        </div>
                    </button>

                    <RequirePermission permiso="asistencia.feriado.gestionar">
                        <button
                            onClick={toggleFeriado}
                            className="w-full flex items-center gap-4 px-4 py-4 text-left active:bg-slate-50 transition-colors"
                        >
                            <div className={cn(
                                "h-11 w-11 rounded-xl flex items-center justify-center shrink-0",
                                isFeriado ? "bg-destructive/10 text-destructive" : "bg-purple-50 text-purple-600"
                            )}>
                                <CalendarRange className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-brand-dark">{isFeriado ? 'Quitar Feriado' : 'Marcar como Feriado'}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {isFeriado ? `Hoy está marcado: ${feriadoActual?.nombre || 'Feriado'}.` : 'Bloquea la toma de asistencia del día actual.'}
                                </p>
                            </div>
                        </button>
                    </RequirePermission>
                </div>
            </section>

            {/* ═══ Reporte mensual ═══ */}
            <section className="bg-white rounded-2xl border border-[#E8E8ED] shadow-sm overflow-hidden">
                <header className="px-4 py-3 border-b border-[#F0F0F5] bg-[#FAFAFA]">
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Reporte mensual</p>
                </header>
                <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Mes</span>
                            <select
                                value={reportMonth}
                                onChange={(e) => setReportMonth(e.target.value)}
                                className="w-full h-11 bg-background border border-border rounded-xl text-sm font-medium text-brand-dark px-3 outline-none focus:border-brand-primary cursor-pointer"
                            >
                                {[
                                    ['01', 'Enero'], ['02', 'Febrero'], ['03', 'Marzo'], ['04', 'Abril'],
                                    ['05', 'Mayo'], ['06', 'Junio'], ['07', 'Julio'], ['08', 'Agosto'],
                                    ['09', 'Septiembre'], ['10', 'Octubre'], ['11', 'Noviembre'], ['12', 'Diciembre'],
                                ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Año</span>
                            <select
                                value={reportYear}
                                onChange={(e) => setReportYear(e.target.value)}
                                className="w-full h-11 bg-background border border-border rounded-xl text-sm font-medium text-brand-dark px-3 outline-none focus:border-brand-primary cursor-pointer"
                            >
                                {['2024', '2025', '2026', '2027'].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </label>
                    </div>
                    <button
                        onClick={() => handleExportExcel(false)}
                        disabled={!hasPermission('asistencia.exportar_excel')}
                        className={cn(
                            "w-full h-12 rounded-xl bg-brand-primary text-white font-black uppercase tracking-wider text-xs shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2",
                            !hasPermission('asistencia.exportar_excel') && "opacity-40 grayscale pointer-events-none"
                        )}
                    >
                        <FileDown className="h-4 w-4" />
                        Exportar Excel
                    </button>
                </div>
            </section>
        </div>
    );
};

export default AttendanceExtrasMobileTab;
