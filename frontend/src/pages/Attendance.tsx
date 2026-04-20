import React, { useState, useMemo } from 'react';
import {
    CheckSquare, Users, CalendarDays, CalendarRange, ChevronDown, 
    AlertTriangle, FileDown, Search, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '../components/ui/Button';
import { TimeStepperInput } from '../components/ui/TimeStepperInput';
import { WorkerCalendarModal } from '../components/attendance/WorkerCalendarModal';
import { PeriodAssignModal } from '../components/attendance/PeriodAssignModal';
import { TrasladoObraModal } from '../components/attendance/TrasladoObraModal';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { WorkerForm } from '../components/workers/WorkerForm';
import WorkerLink from '../components/workers/WorkerLink';
import WorkerQuickView from '../components/workers/WorkerQuickView';

import { cn } from '../utils/cn';
import { useObra } from '../context/ObraContext';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { useAuth } from '../context/AuthContext';
import { WorkerDocsContent } from '../components/attendance/modals/WorkerDocsContent';

// Nuevos hooks y componentes modulares
import { useAttendanceData, useAttendanceActions, useAttendanceExport } from '../hooks/attendance';
import { AttendanceHeaderActions, AttendanceSummaryRow } from '../components/attendance/ui';

import type { Trabajador, Asistencia } from '../types/entities';

const AttendancePage: React.FC = () => {
    const { selectedObra, obras } = useObra();
    const { hasPermission } = useAuth();
    const canTakeGlobal = hasPermission('asistencia.tomar.global');

    // Hooks Segregados
    const attendanceData = useAttendanceData();
    const {
        date, setDate, navigateDate, loading, workers, filteredWorkers, availableEmpresas,
        attendance, updateAttendance, horariosObra, estados, feriadoActual,
        searchQuery, setSearchQuery, selectedEmpresaId, setSelectedEmpresaId,
        statusFilter, setStatusFilter, alertasFaltas,
        reportMonth, setReportMonth, reportYear, setReportYear, fetchAttendanceInfo,
        summary, isSaturday, isSunday
    } = attendanceData;

    const { handleSave, saving, toggleFeriado, repetirDiaAnterior, repeating } = useAttendanceActions({
        date, workers, attendance, feriadoActual, fetchAttendanceInfo, updateAttendance
    });

    const { handleExportExcel, handleShareWhatsApp } = useAttendanceExport({
        date, workers, attendance, estados, reportMonth, reportYear
    });

    // Estados Locales de UI
    const [expandedWorkerId, setExpandedWorkerId] = useState<number | null>(null);
    const [calendarWorker, setCalendarWorker] = useState<Trabajador | null>(null);
    const [quickViewId, setQuickViewId] = useState<number | null>(null);
    const [modalType, setModalType] = useState<'form' | 'docs' | null>(null);
    const [selectedWorker, setSelectedWorker] = useState<Trabajador | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [markedRows, setMarkedRows] = useState<Set<number>>(new Set());
    const [periodSelection, setPeriodSelection] = useState<{ start: string; end: string } | null>(null);
    const [periodModalWorker, setPeriodModalWorker] = useState<Trabajador | null>(null);
    const [trasladoWorker, setTrasladoWorker] = useState<Trabajador | null>(null);
    const [showSearchBox, setShowSearchBox] = useState(false);

    const toggleMarkedRow = (index: number) => {
        setMarkedRows(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    /**
     * Aplica el cambio de estado a un trabajador desde el selector de estado
     * (primario o secundario). Única fuente de verdad — consumida por las
     * variantes mobile y desktop para evitar divergencias de lógica.
     *
     * - Si se marca 'TO' (Traslado de Obra), abre el modal correspondiente.
     * - Si el nuevo estado es "presente", limpia tipo_ausencia_id y rellena
     *   horarios desde la config de la obra si aún no hay.
     * - Si el estado es ausencia, auto-expande el panel de detalle para que
     *   el usuario complete la info sin clicks extra.
     */
    const applyStatusChange = (
        worker: Trabajador,
        est: { id: number; codigo: string; es_presente: boolean }
    ) => {
        if (est.codigo === 'TO') {
            setTrasladoWorker(worker);
            return;
        }
        const state = attendance[worker.id] || {};
        const updates: Partial<Asistencia> = {
            estado_id: est.id,
            tipo_ausencia_id: est.es_presente ? null : state.tipo_ausencia_id,
        };
        if (est.es_presente && (!state.hora_entrada || state.hora_entrada === '')) {
            const dayStr = (['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'] as const)[
                new Date(date + 'T12:00:00').getDay()
            ];
            const currentSchedule = horariosObra.find(h => h.dia_semana === dayStr);
            if (currentSchedule) {
                updates.hora_entrada = currentSchedule.hora_entrada.substring(0, 5);
                updates.hora_salida = currentSchedule.hora_salida.substring(0, 5);
                updates.hora_colacion_inicio = currentSchedule.hora_colacion_inicio.substring(0, 5);
                updates.hora_colacion_fin = currentSchedule.hora_colacion_fin.substring(0, 5);
            }
        }
        updateAttendance(worker.id, updates);
        if (!est.es_presente && expandedWorkerId !== worker.id) {
            setExpandedWorkerId(worker.id);
        }
    };

    // Global Header (Contexto)
    const headerTitle = useMemo(() => (
        <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary shadow-sm border border-brand-primary/20 shrink-0">
                <CheckSquare className="h-5 w-5" />
            </div>
            <div className="min-w-0">
                <h1 className="text-sm font-black text-brand-dark tracking-tighter leading-tight uppercase">
                    {selectedObra ? 'Asistencia' : 'Reporte Global'}
                </h1>
                <p className="text-[10px] text-muted-foreground font-bold truncate opacity-80">
                    {selectedObra ? selectedObra.nombre : 'Consolidado'}
                </p>
            </div>
        </div>
    ), [selectedObra]);

    const headerActionsRef = useMemo(() => {
        const isGlobalActive = !selectedObra && canTakeGlobal;
        if (!(selectedObra || isGlobalActive)) return null;
        return (
            <AttendanceHeaderActions
                handleShareWhatsApp={handleShareWhatsApp}
                handleExportExcel={() => handleExportExcel(false)}
                toggleFeriado={toggleFeriado}
                handleSave={handleSave}
                saving={saving}
                loading={loading}
                hasWorkers={workers.length > 0}
                hasPermission={hasPermission}
                isFeriado={!!feriadoActual}
                isWeekend={isSunday || isSaturday}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                selectedEmpresaId={selectedEmpresaId}
                setSelectedEmpresaId={setSelectedEmpresaId}
                availableEmpresas={availableEmpresas}
                repetirDiaAnterior={() => {
                    if (window.confirm('¿Copiar el último día laboral en todos los trabajadores visibles? Los cambios se sobrescribirán, pero no se guardarán hasta que aprietes Guardar.')) {
                        repetirDiaAnterior();
                    }
                }}
                repeating={repeating}
            />
        );
    }, [selectedObra, canTakeGlobal, handleShareWhatsApp, handleExportExcel, toggleFeriado, handleSave, saving, loading, workers.length, hasPermission, feriadoActual, isSunday, isSaturday, searchQuery, setSearchQuery, selectedEmpresaId, setSelectedEmpresaId, availableEmpresas, repetirDiaAnterior, repeating]);

    useSetPageHeader(headerTitle, headerActionsRef);

    if (!selectedObra && !canTakeGlobal) {
        return (
            <div className="h-[50vh] flex flex-col items-center justify-center text-center p-8">
                <div className="h-14 w-14 bg-background rounded-full flex items-center justify-center mb-4">
                    <CheckSquare className="h-7 w-7 text-muted-foreground" />
                </div>
                <h2 className="text-lg font-semibold text-brand-dark">Reporte Global de Asistencia</h2>
                <p className="text-muted-foreground mt-2 mb-8 max-w-md text-sm">
                    Selecciona el período para descargar el reporte consolidado de todas las obras y trabajadores.
                </p>

                <div className="w-full max-w-sm space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <Select
                            label="Mes"
                            value={reportMonth}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setReportMonth(e.target.value)}
                            options={[
                                { value: '01', label: 'Enero' }, { value: '02', label: 'Febrero' }, { value: '03', label: 'Marzo' },
                                { value: '04', label: 'Abril' }, { value: '05', label: 'Mayo' }, { value: '06', label: 'Junio' },
                                { value: '07', label: 'Julio' }, { value: '08', label: 'Agosto' }, { value: '09', label: 'Septiembre' },
                                { value: '10', label: 'Octubre' }, { value: '11', label: 'Noviembre' }, { value: '12', label: 'Diciembre' }
                            ]}
                        />
                        <Select
                            label="Año"
                            value={reportYear}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setReportYear(e.target.value)}
                            options={[
                                { value: '2024', label: '2024' }, { value: '2025', label: '2025' }, { value: '2026', label: '2026' }
                            ]}
                        />
                    </div>
                    <Button
                        onClick={() => handleExportExcel(false)}
                        disabled={!hasPermission('asistencia.exportar_excel')}
                        variant="primary"
                        className={cn("w-full h-12 shadow-lg shadow-brand-primary/20", !hasPermission('asistencia.exportar_excel') && "opacity-40 grayscale pointer-events-none")}
                        leftIcon={<FileDown className="h-5 w-5" />}
                    >
                        Exportar Reporte Global
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-116px)] md:h-[calc(100vh-132px)] flex flex-col gap-4 lg:gap-5 p-0 overflow-hidden w-full">
            <AnimatePresence>
                {showSearchBox && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="md:hidden space-y-2 overflow-hidden pb-2">
                        <div className="relative group">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-50" />
                            <input
                                type="text"
                                autoFocus
                                placeholder="Buscar trabajador..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-11 pl-11 pr-10 bg-white border border-border rounded-xl text-sm font-medium focus:outline-none focus:border-brand-primary/40 focus:ring-4 focus:ring-brand-primary/5 shadow-sm transition-all"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground hover:bg-muted-foreground/20 active:scale-90 transition-all">
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {loading ? (
                <div className="flex flex-col gap-3 p-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="h-20 w-full bg-white rounded-2xl border border-border flex items-center p-4 gap-4 animate-pulse shadow-sm">
                            <div className="h-10 w-10 rounded-xl bg-slate-100 shrink-0" />
                            <div className="flex-1 space-y-2"><div className="h-4 w-1/3 bg-slate-100 rounded" /><div className="h-3 w-1/4 bg-slate-50 rounded" /></div>
                        </div>
                    ))}
                </div>
            ) : workers.length === 0 ? (
                <div className="bg-white rounded-2xl border border-border py-20 text-center">
                    <Users className="h-10 w-10 text-muted mx-auto mb-4 opacity-40" />
                    <p className="text-muted-foreground text-sm">No hay trabajadores asignados a esta obra.</p>
                </div>
            ) : (
                <div className="flex-1 min-h-0 flex flex-col bg-white border border-[#E2E2E7] rounded-3xl shadow-[0_10px_40px_rgb(0,0,0,0.08)] overflow-hidden relative">
                    
                    <AttendanceSummaryRow
                        date={date}
                        setDate={setDate}
                        navigateDate={navigateDate}
                        summary={summary}
                        hasActiveContext={!!selectedObra || canTakeGlobal}
                        statusFilter={statusFilter}
                        onStatusFilter={setStatusFilter}
                    />

                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#F1F1F4]/80 p-2 md:p-4 flex flex-col gap-2 relative">
                        <AnimatePresence>
                            {(isSaturday || isSunday || !!feriadoActual) && (
                                <motion.div initial={{ opacity: 0, scale: 0.95, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -10 }} className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-4 mb-2 shadow-sm shrink-0">
                                    <div className="h-10 w-10 flex-shrink-0 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 border border-amber-200/50"><CalendarRange className="h-5 w-5" /></div>
                                    <div className="min-w-0">
                                        <h3 className="text-[11px] font-black text-amber-900 uppercase tracking-wider mb-0.5">Día No Laboral</h3>
                                        <p className="text-xs text-amber-800 font-bold opacity-80 decoration-amber-300">
                                            {feriadoActual ? `Hoy es Feriado (${feriadoActual.nombre}). No se registra asistencia.` : `Hoy es ${isSunday ? 'Domingo' : 'Sábado'}. No se registra asistencia los fines de semana.`}
                                        </p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <AnimatePresence>
                            {filteredWorkers.map((worker, idx) => {
                                const state = attendance[worker.id] || {};
                                const currentEstado = estados.find(e => e.id === state.estado_id);
                                const isExpanded = expandedWorkerId === worker.id;
                                const isNotPresent = currentEstado && !currentEstado.es_presente;
                                const fIngreso = worker.fecha_ingreso ? String(worker.fecha_ingreso).split('T')[0] : null;
                                const fDesvinc = worker.fecha_desvinculacion ? String(worker.fecha_desvinculacion).split('T')[0] : null;
                                const isDesvinculado = fDesvinc ? date > fDesvinc : false;
                                const isPreContrato = fIngreso ? date < fIngreso : false;
                                const isOutOfRange = isDesvinculado || isPreContrato;
                                const workerAlerta = alertasFaltas.find(a => a.trabajador_id === worker.id);

                                return (
                                    <motion.div
                                        key={`${worker.id}-${date}`}
                                        initial={{ opacity: 0, y: 10 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        title={workerAlerta ? `⚠️ ${workerAlerta.alertas.map(a => a.mensaje).join(' | ')}` : undefined}
                                        className={cn(
                                            "transition-all duration-200 bg-white rounded-2xl border border-[#E8E8ED] shadow-[0_4px_12px_rgb(0,0,0,0.05)] hover:shadow-lg hover:border-brand-primary/30 group relative",
                                            markedRows.has(idx) && "ring-2 ring-brand-primary/20 border-brand-primary bg-brand-primary/[0.02]",
                                            (isNotPresent || isOutOfRange) && !markedRows.has(idx) && "bg-white/90",
                                            feriadoActual && "bg-destructive/[0.02]",
                                            workerAlerta && "bg-red-50/80 border-red-300/60 ring-1 ring-red-200/50 shadow-[0_4px_16px_rgb(239,68,68,0.10)]"
                                        )}
                                    >
                                        <div className="md:hidden p-3 pb-4">
                                            <div className="flex items-center gap-3 mb-3">
                                                <button onClick={() => toggleMarkedRow(idx)} className={cn("h-10 w-10 rounded-xl flex items-center justify-center font-black text-[10px] transition-all border shrink-0", markedRows.has(idx) ? "bg-brand-dark text-white border-brand-dark shadow-lg scale-110" : "bg-slate-50 text-slate-500 border-slate-200")}>{(idx + 1).toString().padStart(2, '0')}</button>
                                                <div className="flex-1 min-w-0">
                                                    <WorkerLink workerId={worker.id} onClick={setQuickViewId} className="w-full text-left truncate block leading-tight">
                                                        <span className="text-[12px] font-black text-brand-dark uppercase tracking-tight">{worker.apellido_paterno} {worker.apellido_materno || ''}</span>
                                                        <span className="text-[11px] font-semibold text-brand-dark/65 ml-1.5 lowercase first-letter:uppercase">{worker.nombres}</span>
                                                    </WorkerLink>
                                                    <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{worker.rut}{worker.cargo_nombre && <> · <span className="text-brand-primary font-bold">{worker.cargo_nombre}</span></>}</p>
                                                    {workerAlerta && (
                                                        <div className="flex items-center gap-1 mt-1 px-1.5 py-0.5 bg-red-100 border border-red-200/60 rounded-lg w-fit"><AlertTriangle className="h-3 w-3 text-red-500 shrink-0" /><span className="text-[9px] font-bold text-red-600 leading-tight truncate max-w-[180px]">{workerAlerta.alertas[0].mensaje}</span></div>
                                                    )}
                                                </div>
                                                <button onClick={() => setCalendarWorker(worker)} className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-brand-primary border border-brand-primary/20 shadow-sm active:scale-90 transition-all shrink-0" title="Ver Calendario"><CalendarDays className="h-5 w-5" /></button>
                                            </div>

                                            <div className="flex gap-1.5 items-stretch h-12">
                                                {['A', 'F', 'JI', 'TO'].map(code => {
                                                    const est = estados.find(e => e.codigo === code);
                                                    if (!est) return null;
                                                    const isActive = state.estado_id === est.id;
                                                    return (
                                                        <button key={est.id} onClick={() => applyStatusChange(worker, est)} disabled={isOutOfRange || !hasPermission('asistencia.guardar') || !!feriadoActual || isSunday || isSaturday} className={cn("flex-1 rounded-xl text-xs font-black uppercase transition-all border shrink-0 active:scale-95", isActive ? "text-white border-transparent shadow-md" : "bg-white border-[#E8E8ED] text-muted-foreground/60")} style={isActive ? { backgroundColor: est.color } : undefined}>{est.codigo}</button>
                                                    );
                                                })}
                                                <div className="relative flex-1">
                                                    {(() => {
                                                        const secondary = estados.filter(e => !['A', 'F', 'JI', 'TO', 'AT'].includes(e.codigo));
                                                        const activeSecondary = secondary.find(e => e.id === state.estado_id);
                                                        return (
                                                            <select className={cn("w-full h-full rounded-xl text-[10px] font-black uppercase appearance-none text-center px-1 border transition-all truncate bg-white outline-none active:scale-95", activeSecondary ? "text-white border-transparent shadow-md" : "bg-white border-[#E8E8ED] text-muted-foreground/60")} style={activeSecondary ? { backgroundColor: activeSecondary.color } : undefined} value={activeSecondary?.id || ""} disabled={isOutOfRange || !hasPermission('asistencia.guardar') || !!feriadoActual || isSunday || isSaturday} onChange={(e) => {
                                                                    const estId = parseInt(e.target.value);
                                                                    const est = estados.find(x => x.id === estId);
                                                                    if (est) applyStatusChange(worker, est);
                                                                }}><option value="" disabled>{activeSecondary ? activeSecondary.nombre : 'MÁS'}</option>
                                                                {secondary.map(est => (<option key={est.id} value={est.id}>{est.codigo} - {est.nombre}</option>))}
                                                            </select>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                            <button onClick={() => setExpandedWorkerId(isExpanded ? null : worker.id)} disabled={isOutOfRange || !!feriadoActual || isSunday || isSaturday} className={cn("mt-2 flex items-center justify-center gap-1.5 w-full py-2 text-[10px] text-brand-primary font-bold uppercase tracking-tight rounded-xl bg-slate-50/50 border border-slate-100 transition-all active:scale-98", (!!feriadoActual || isSunday || isSaturday || isOutOfRange) && "opacity-50 cursor-not-allowed grayscale")}>
                                                <span>{isExpanded ? 'Cerrar' : 'Detalle'}</span><ChevronDown className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-180")} />
                                            </button>
                                        </div>

                                        <div className={cn("hidden md:grid grid-cols-[60px_minmax(200px,280px)_1fr_160px_60px] gap-4 px-6 py-4 items-center group", markedRows.has(idx) && "bg-brand-primary/5 rounded-2xl")}>
                                            <div className="flex justify-center"><button onClick={() => toggleMarkedRow(idx)} className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black transition-all border", markedRows.has(idx) ? "bg-brand-dark text-white border-brand-dark shadow-md scale-110" : "bg-slate-50 text-slate-500 border-slate-200 hover:border-brand-primary/30 hover:bg-white hover:text-brand-primary active:scale-95")}>{(idx + 1).toString().padStart(2, '0')}</button></div>
                                            <div className="flex items-center gap-3 min-w-0 border-l border-[#E8E8ED]/40 pl-4 group-hover:border-brand-primary/30 transition-colors">
                                                <div className="min-w-0">
                                                    <WorkerLink workerId={worker.id} onClick={setQuickViewId} className="text-[13px] truncate block font-bold text-slate-700 hover:text-brand-primary transition-colors">{worker.apellido_paterno} {worker.apellido_materno || ''} {worker.nombres}</WorkerLink>
                                                    <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1.5 mt-0.5"><span className="bg-slate-100 px-1 rounded uppercase tracking-tighter">{worker.rut}</span>{worker.cargo_nombre && <span className="text-brand-primary/80 font-bold border-l border-slate-200 pl-1.5">{worker.cargo_nombre}</span>}</p>
                                                    {workerAlerta && (<div className="flex items-center gap-1.5 mt-1"><AlertTriangle className="h-3 w-3 text-red-500 shrink-0" /><span className="text-[10px] font-bold text-red-600 leading-tight">{workerAlerta.alertas.map(a => a.mensaje).join(' · ')}</span></div>)}
                                                </div>
                                            </div>

                                            <div className="flex justify-center">
                                                <div className="flex gap-1 p-1 bg-slate-100/50 rounded-2xl border border-slate-200/50 shadow-inner max-w-fit transition-all group-hover:bg-brand-primary/5 group-hover:border-brand-primary/20">
                                                    {['A', 'F', 'JI', 'TO'].map(code => {
                                                        const est = estados.find(e => e.codigo === code);
                                                        if (!est) return null;
                                                        const isActive = state.estado_id === est.id;
                                                        return (<button key={est.id} onClick={() => applyStatusChange(worker, est)} disabled={isOutOfRange || !hasPermission('asistencia.guardar') || !!feriadoActual || isSunday || isSaturday} className={cn("h-8 px-3 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap border shrink-0 flex items-center justify-center min-w-[36px]", isActive ? "text-white border-transparent shadow-md scale-105" : "bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 active:scale-95")} style={isActive ? { backgroundColor: est.color, borderColor: est.color } : undefined}>{est.codigo}</button>);
                                                    })}
                                                    <div className="relative min-w-[90px] flex-shrink-0">
                                                        {(() => {
                                                            const secondary = estados.filter(e => !['A', 'F', 'JI', 'TO', 'AT'].includes(e.codigo));
                                                            const activeSecondary = secondary.find(e => e.id === state.estado_id);
                                                            return (
                                                                <div className="relative h-8 group/select">
                                                                    <select className={cn("h-full w-full pl-3 pr-7 rounded-xl text-[10px] font-black uppercase appearance-none border transition-all truncate bg-white outline-none cursor-pointer", activeSecondary ? "text-white border-transparent shadow-md" : "border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600")} style={activeSecondary ? { backgroundColor: activeSecondary.color, borderColor: activeSecondary.color } : undefined} value={activeSecondary?.id || ""} disabled={isOutOfRange || !hasPermission('asistencia.guardar') || !!feriadoActual || isSunday || isSaturday} onChange={(e) => {
                                                                            const estId = parseInt(e.target.value);
                                                                            const est = estados.find(x => x.id === estId);
                                                                            if (est) applyStatusChange(worker, est);
                                                                        }}><option value="" disabled>{activeSecondary ? activeSecondary.codigo : 'OTRO'}</option>
                                                                        {secondary.map(est => (<option key={est.id} value={est.id}>{est.codigo} - {est.nombre}</option>))}
                                                                    </select>
                                                                    <div className={cn("absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none transition-colors", activeSecondary ? "text-white/70" : "text-slate-300 group-hover/select:text-slate-400")}><ChevronDown className="h-3 w-3" /></div>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-end gap-2">
                                                <div className="flex-1"><button onClick={() => setExpandedWorkerId(isExpanded ? null : worker.id)} disabled={isOutOfRange || !!feriadoActual || isSunday || isSaturday} title={isOutOfRange ? (isPreContrato ? "Bloqueado: Aún no contratado" : "Bloqueado por Finiquito") : "Ver detalle"} className={cn("text-[10px] text-brand-primary font-medium hover:underline w-full text-center", (isOutOfRange || !!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed no-underline grayscale")}>{isExpanded ? 'Cerrar' : 'Detalle'}</button></div>
                                                <button onClick={() => setCalendarWorker(worker)} disabled={!!feriadoActual || isSunday || isSaturday} className={cn("p-1.5 rounded-full text-muted-foreground border border-border hover:bg-background hover:text-brand-primary transition-colors flex-shrink-0", (!!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed")} title="Ver Calendario"><CalendarDays className="h-4 w-4" /></button>
                                                <button onClick={() => setPeriodModalWorker(worker)} disabled={!!feriadoActual || isSunday || isSaturday} className={cn("p-1.5 rounded-full text-brand-primary border border-brand-primary/30 hover:bg-brand-primary/10 hover:text-[#027A3B] transition-colors flex-shrink-0", (!!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed")} title="Asignar Período de Ausencia"><CalendarRange className="h-4 w-4" /></button>
                                            </div>
                                            <div className="w-[60px]">
                                                <input type="number" min="0" max="24" step="any" placeholder="0" disabled={!!feriadoActual || isSunday || isSaturday} inputMode="decimal" className={cn("w-full bg-background border border-border rounded-lg px-2 py-1.5 text-[10px] text-center text-brand-dark focus:outline-none focus:border-brand-primary", (!!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed")} value={state.horas_extra || ''} onChange={(e) => updateAttendance(worker.id, { horas_extra: parseFloat(e.target.value) || 0 })} />
                                            </div>
                                        </div>

                                        <AnimatePresence>
                                            {isExpanded && (
                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden bg-[#FAFAFA]">
                                                    <div className="px-3 md:px-5 pb-4 pt-2 grid grid-cols-2 md:grid-cols-5 gap-3">
                                                        <TimeStepperInput disabled={!!feriadoActual || isSunday || isSaturday} label="Entrada" value={state.hora_entrada || ''} onChange={(val) => updateAttendance(worker.id, { hora_entrada: val || null })} />
                                                        <TimeStepperInput disabled={!!feriadoActual || isSunday || isSaturday} label="Salida" value={state.hora_salida || ''} onChange={(val) => updateAttendance(worker.id, { hora_salida: val || null })} />
                                                        <TimeStepperInput disabled={!!feriadoActual || isSunday || isSaturday} label="Colación Ini." value={state.hora_colacion_inicio || ''} onChange={(val) => updateAttendance(worker.id, { hora_colacion_inicio: val || null })} />
                                                        <TimeStepperInput disabled={!!feriadoActual || isSunday || isSaturday} label="Colación Fin" value={state.hora_colacion_fin || ''} onChange={(val) => updateAttendance(worker.id, { hora_colacion_fin: val || null })} />
                                                        <div className="col-span-2 md:col-span-1 grid grid-cols-2 gap-3">
                                                            <div>
                                                                <label className="text-[9px] font-semibold text-muted-foreground uppercase block mb-1">H. Extra</label>
                                                                <input type="number" min="0" max="24" step="any" placeholder="0" disabled={!!feriadoActual || isSunday || isSaturday} inputMode="decimal" className={cn("w-full h-10 md:h-10 bg-white border border-border rounded-xl px-3 text-sm text-center text-brand-dark focus:outline-none focus:border-brand-primary", (!!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed bg-background")} value={state.horas_extra || ''} onChange={(e) => updateAttendance(worker.id, { horas_extra: parseFloat(e.target.value) || 0 })} />
                                                            </div>
                                                            <div>
                                                                <label className="text-[9px] font-semibold text-muted-foreground uppercase block mb-1">Nota</label>
                                                                <input type="text" placeholder="..." disabled={!!feriadoActual || isSunday || isSaturday} className={cn("w-full h-10 md:h-10 bg-white border border-border rounded-xl px-3 text-sm text-brand-dark focus:outline-none focus:border-brand-primary", (!!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed bg-background")} value={state.observacion || ''} onChange={(e) => updateAttendance(worker.id, { observacion: e.target.value })} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                )
                            })}
                        </AnimatePresence>
                    </div>

                    <div className="h-9 bg-[#F8F8FA] border-t border-[#E8E8ED] flex items-center justify-between px-5 text-[11px] font-bold text-muted-foreground shrink-0 uppercase tracking-widest rounded-b-3xl">
                        <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-brand-primary/40" />
                            <span>{filteredWorkers.length} {filteredWorkers.length === 1 ? 'trabajador' : 'trabajadores'}</span>
                        </div>
                    </div>
                </div>
            )}

            <WorkerCalendarModal
                isOpen={!!calendarWorker}
                onClose={() => setCalendarWorker(null)}
                worker={calendarWorker}
                estados={estados}
                obraId={selectedObra?.id}
                onAssignPeriod={() => {
                    setCalendarWorker(null);
                    setPeriodModalWorker(calendarWorker);
                }}
                onSelectRange={(start, end) => {
                    setPeriodSelection({ start, end });
                    setCalendarWorker(null);
                    setPeriodModalWorker(calendarWorker);
                }}
                onPeriodDeleted={fetchAttendanceInfo}
            />

            <PeriodAssignModal
                isOpen={!!periodModalWorker}
                onClose={() => { setPeriodModalWorker(null); setPeriodSelection(null); }}
                worker={periodModalWorker}
                obraId={selectedObra?.id || null}
                estados={estados}
                initialDates={periodSelection}
                onSuccess={() => fetchAttendanceInfo()}
            />

            <TrasladoObraModal
                isOpen={!!trasladoWorker}
                onClose={() => setTrasladoWorker(null)}
                worker={trasladoWorker}
                obraActualId={selectedObra?.id || null}
                obraActualNombre={selectedObra?.nombre || ''}
                obras={obras}
                fecha={date}
                onSuccess={(obraDestinoNombre) => {
                    const toEstado = estados.find(e => e.codigo === 'TO');
                    if (toEstado && trasladoWorker) {
                        updateAttendance(trasladoWorker.id, { estado_id: toEstado.id, observacion: `Traslado a: ${obraDestinoNombre}` });
                    }
                    fetchAttendanceInfo();
                }}
            />

            <WorkerQuickView
                workerId={quickViewId}
                onClose={() => setQuickViewId(null)}
                onEditWorker={(id) => {
                    setQuickViewId(null);
                    const w = workers.find(w => w.id === id);
                    if (w) { setSelectedWorker(w); setModalType('form'); }
                }}
                onViewDocuments={(id) => {
                    setQuickViewId(null);
                    const w = workers.find(w => w.id === id);
                    if (w) { setSelectedWorker(w); setModalType('docs'); }
                }}
            />

            <Modal
                isOpen={modalType !== null}
                onClose={() => { setModalType(null); setIsUploading(false); }}
                title={modalType === 'form' ? "Editar Trabajador" : `Documentos: ${selectedWorker?.apellido_paterno} ${selectedWorker?.apellido_materno || ''} ${selectedWorker?.nombres}`}
                size={modalType === 'docs' ? 'dynamic' : 'md'}
            >
                {modalType === 'form' && selectedWorker && (
                    <WorkerForm initialData={selectedWorker} onSuccess={() => { setModalType(null); fetchAttendanceInfo(); }} onCancel={() => setModalType(null)} />
                )}
                {modalType === 'docs' && selectedWorker && (
                    <WorkerDocsContent worker={selectedWorker} isUploading={isUploading} setIsUploading={setIsUploading} hasPermission={hasPermission} onSuccess={() => fetchAttendanceInfo()} />
                )}
            </Modal>

            <div className="md:hidden fixed bottom-6 right-5 z-[900]">
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => { setShowSearchBox(prev => !prev); if (showSearchBox && searchQuery) setSearchQuery(''); }}
                    className={cn("h-12 w-12 rounded-full flex items-center justify-center shadow-lg transition-colors duration-200", showSearchBox ? "bg-brand-dark text-white shadow-brand-dark/30" : "bg-brand-primary text-white shadow-brand-primary/30")}
                >
                    <AnimatePresence mode="wait">
                        {showSearchBox ? (
                            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}><X className="h-5 w-5" /></motion.div>
                        ) : (
                            <motion.div key="search" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}><Search className="h-5 w-5" /></motion.div>
                        )}
                    </AnimatePresence>
                    {!showSearchBox && searchQuery && (<span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 bg-red-500 rounded-full border-2 border-white" />)}
                </motion.button>
            </div>
        </div>
    );
};

export default AttendancePage;
