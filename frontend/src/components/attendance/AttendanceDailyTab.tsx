import React, { useState, useMemo } from 'react';
import {
    CheckSquare, Users, CalendarDays, CalendarRange, ChevronDown,
    AlertTriangle, FileDown, Search, X, Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '../ui/Button';
import { TimeStepperInput } from '../ui/TimeStepperInput';
import { WorkerCalendarModal } from './WorkerCalendarModal';
import { TrasladoObraModal } from './TrasladoObraModal';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { WorkerForm } from '../workers/WorkerForm';
import WorkerLink from '../workers/WorkerLink';
import { EmpresaBadge } from './ui/EmpresaBadge';
import WorkerQuickView from '../workers/WorkerQuickView';

import { cn } from '../../utils/cn';
import { useObra } from '../../context/ObraContext';
import { flagOff } from '../../utils/flags';
import { useSetPageHeader } from '../../context/PageHeaderContext';
import { useAuth } from '../../context/AuthContext';
import { WorkerDocsContent } from './modals/WorkerDocsContent';

// Nuevos hooks y componentes modulares
import { useAttendanceData, useAttendanceActions, useAttendanceExport } from '../../hooks/attendance';
import { AttendanceHeaderActions, AttendanceSummaryRow } from './ui';

import type { Trabajador, Asistencia } from '../../types/entities';

/**
 * Tab "Asistencia Diaria" — contiene toda la funcionalidad original de la
 * página Attendance.tsx antes del refactor a tabs (commit 03c1a7d). Sin
 * cambios funcionales: solo se relocó como sub-componente para permitir
 * la coexistencia con el tab "Sábados Extra".
 */
interface DailyTabProps {
    /** Si se pasa, muestra el ícono de Sábados Extra en la barra de búsqueda. */
    onGoSabados?: () => void;
}

const AttendanceDailyTab: React.FC<DailyTabProps> = ({ onGoSabados }) => {
    const { selectedObra, obras, setSelectedObra } = useObra();
    // Picker propio de Asistencia: solo obras con participa_asistencia (mig 075).
    const obrasAsistencia = useMemo(() => obras.filter(o => !flagOff(o.participa_asistencia)), [obras]);
    const { hasPermission } = useAuth();
    const canTakeGlobal = hasPermission('asistencia.tomar.global');
    // Gate financiero: HE es insumo de pago. Sin este permiso se ocultan los
    // 3 inputs de horas extra (compact lg, compact md, expanded detail).
    const verHorasExtra = hasPermission('asistencia.horas_extra.ver');

    // Hooks Segregados
    const attendanceData = useAttendanceData();
    const {
        date, setDate, navigateDate, loading, workers, filteredWorkers, availableEmpresas,
        attendance, updateAttendance, horariosObra, estados, feriadoActual,
        searchQuery, setSearchQuery, selectedEmpresaId, setSelectedEmpresaId,
        statusFilter, setStatusFilter, alertasFaltas, periodosMap,
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

    /**
     * Etiqueta de un período activo (V/LM/etc.) con su rango y días, ej:
     * "(V) 01/01/2026 - 15/01/2026 (15 días)". El rango viene de `periodosMap`
     * (mismo endpoint que el export). Si no hay período registrado (caso legacy
     * asignado por día), cae a solo el código "(V)".
     */
    const fmtPeriodo = (s: string) => String(s).split('T')[0].split('-').reverse().join('/');
    const periodoLabel = (workerId: number, est: { id: number; codigo: string }): string => {
        const p = periodosMap[`${workerId}_${est.id}`];
        if (!p) return `(${est.codigo})`;
        const fi = String(p.fecha_inicio).split('T')[0];
        const ff = String(p.fecha_fin).split('T')[0];
        const dias = Math.floor((new Date(ff + 'T00:00:00').getTime() - new Date(fi + 'T00:00:00').getTime()) / 86400000) + 1;
        return dias <= 1
            ? `(${est.codigo}) ${fmtPeriodo(fi)} (1 día)`
            : `(${est.codigo}) ${fmtPeriodo(fi)} - ${fmtPeriodo(ff)} (${dias} días)`;
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
    }, [selectedObra, canTakeGlobal, handleShareWhatsApp, handleExportExcel, toggleFeriado, handleSave, saving, loading, workers.length, hasPermission, feriadoActual, isSunday, isSaturday, selectedEmpresaId, setSelectedEmpresaId, availableEmpresas, repetirDiaAnterior, repeating]);

    useSetPageHeader(headerTitle, headerActionsRef);

    if (!selectedObra && !canTakeGlobal) {
        return (
            <div className="h-[50dvh] flex flex-col items-center justify-center text-center p-8">
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

    // Guard: la obra seleccionada (vía selector global) no participa en Asistencia.
    // Picker propio filtrado para cambiar a una obra válida sin tomar asistencia aquí.
    if (selectedObra && flagOff(selectedObra.participa_asistencia)) {
        return (
            <div className="h-[50dvh] flex flex-col items-center justify-center text-center p-8">
                <div className="h-14 w-14 bg-amber-100 dark:bg-amber-950/40 rounded-full flex items-center justify-center mb-4">
                    <CheckSquare className="h-7 w-7 text-amber-600 dark:text-amber-300" />
                </div>
                <h2 className="text-lg font-semibold text-brand-dark">"{selectedObra.nombre}" no participa en Asistencia</h2>
                <p className="text-muted-foreground mt-2 mb-6 max-w-md text-sm">
                    Esta obra está deshabilitada para Asistencia en Configuración. Elige otra obra para registrar asistencia.
                </p>
                <select
                    value=""
                    onChange={(e) => { const o = obrasAsistencia.find(x => x.id === Number(e.target.value)); if (o) setSelectedObra(o); }}
                    className="w-full max-w-sm h-11 px-3 text-sm border border-border rounded-xl bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none"
                >
                    <option value="" disabled>Selecciona una obra...</option>
                    {obrasAsistencia.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
            </div>
        );
    }

    return (
        <div className="h-[calc(100dvh-116px)] md:h-[calc(100dvh-120px)] flex flex-col gap-2 p-0 overflow-hidden w-full">
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
                                className="w-full h-11 pl-11 pr-10 bg-card border border-border rounded-xl text-sm font-medium focus:outline-none focus:border-brand-primary/40 focus:ring-4 focus:ring-brand-primary/5 shadow-sm transition-all"
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
                        <div key={i} className="h-20 w-full bg-card rounded-2xl border border-border flex items-center p-4 gap-4 animate-pulse shadow-sm">
                            <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-muted shrink-0" />
                            <div className="flex-1 space-y-2"><div className="h-4 w-1/3 bg-slate-100 dark:bg-muted rounded" /><div className="h-3 w-1/4 bg-slate-50 dark:bg-muted rounded" /></div>
                        </div>
                    ))}
                </div>
            ) : workers.length === 0 ? (
                <div className="bg-card rounded-2xl border border-border py-20 text-center">
                    <Users className="h-10 w-10 text-muted mx-auto mb-4 opacity-40" />
                    <p className="text-muted-foreground text-sm">No hay trabajadores asignados a esta obra.</p>
                </div>
            ) : (
                <div className="flex-1 min-h-0 flex flex-col bg-card border border-border rounded-3xl shadow-[0_10px_40px_rgb(0,0,0,0.08)] overflow-hidden relative">

                    <AttendanceSummaryRow
                        date={date}
                        setDate={setDate}
                        navigateDate={navigateDate}
                        summary={summary}
                        hasActiveContext={!!selectedObra || canTakeGlobal}
                        statusFilter={statusFilter}
                        onStatusFilter={setStatusFilter}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        onGoSabados={onGoSabados}
                    />

                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-muted/80 p-2 md:p-4 flex flex-col gap-2 relative">
                        <AnimatePresence>
                            {(isSaturday || isSunday || !!feriadoActual) && (
                                <motion.div initial={{ opacity: 0, scale: 0.95, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -10 }} className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-4 rounded-2xl flex items-center gap-4 mb-2 shadow-sm shrink-0">
                                    <div className="h-10 w-10 flex-shrink-0 bg-amber-100 dark:bg-amber-950/40 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/50"><CalendarRange className="h-5 w-5" /></div>
                                    <div className="min-w-0">
                                        <h3 className="text-[11px] font-black text-amber-900 dark:text-amber-200 uppercase tracking-wider mb-0.5">Día No Laboral</h3>
                                        <p className="text-xs text-amber-800 dark:text-amber-300 font-bold opacity-80 decoration-amber-300">
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
                                // Tinte pálido de la card según el estado activo (A/sin estado → blanco).
                                // color-mix se adapta solo a claro/oscuro (mezcla con var(--card)).
                                // La alerta de faltas tiene prioridad (mantiene su rojo).
                                const cardTint = currentEstado && currentEstado.codigo !== 'A' && currentEstado.color && !workerAlerta
                                    ? `color-mix(in srgb, ${currentEstado.color} 10%, var(--card))`
                                    : undefined;

                                return (
                                    // Perf: sin motion.div + whileInView en el row. Con 183 workers
                                    // y AnimatePresence padre, cada keystroke disparaba IntersectionObserver
                                    // sobre todas las filas → input se pegaba y omitía caracteres.
                                    // Trade-off: pierde fade-in stagger. Velocidad > animación.
                                    <div
                                        key={`${worker.id}-${date}`}
                                        title={workerAlerta ? `⚠️ ${workerAlerta.alertas.map(a => a.mensaje).join(' | ')}` : undefined}
                                        style={cardTint ? { backgroundColor: cardTint } : undefined}
                                        className={cn(
                                            "transition-all duration-200 bg-card rounded-2xl border border-border shadow-[0_4px_12px_rgb(0,0,0,0.05)] hover:shadow-lg hover:border-brand-primary/30 group relative",
                                            markedRows.has(idx) && "ring-2 ring-brand-primary/20 border-brand-primary bg-brand-primary/[0.02]",
                                            (isNotPresent || isOutOfRange) && !markedRows.has(idx) && "bg-card/90",
                                            feriadoActual && "bg-destructive/[0.02]",
                                            workerAlerta && "bg-red-50/80 dark:bg-red-950/30 border-red-300/60 dark:border-red-900/60 ring-1 ring-red-200/50 dark:ring-red-900/40 shadow-[0_4px_16px_rgb(239,68,68,0.10)]"
                                        )}
                                    >
                                        <div className="md:hidden p-3 pb-4">
                                            <div className="flex items-center gap-3 mb-3">
                                                <button onClick={() => toggleMarkedRow(idx)} className={cn("h-10 w-10 rounded-xl flex items-center justify-center font-black text-[10px] transition-all border shrink-0", markedRows.has(idx) ? "bg-brand-dark text-white border-brand-dark shadow-lg scale-110" : "bg-slate-50 dark:bg-muted text-slate-500 dark:text-muted-foreground border-slate-200 dark:border-border")}>{(idx + 1).toString().padStart(2, '0')}</button>
                                                <div className="flex-1 min-w-0">
                                                    <WorkerLink workerId={worker.id} onClick={setQuickViewId} className="w-full text-left truncate block leading-tight">
                                                        <span className="text-[12px] font-black text-brand-dark uppercase tracking-tight">{worker.apellido_paterno} {worker.apellido_materno || ''}</span>
                                                        <span className="text-[11px] font-semibold text-brand-dark/65 ml-1.5 lowercase first-letter:uppercase">{worker.nombres}</span>
                                                    </WorkerLink>
                                                    <p className="text-[10px] text-muted-foreground font-medium mt-0.5"><EmpresaBadge empresaNombre={worker.empresa_nombre} className="mr-1 align-middle" />{worker.rut}{worker.cargo_nombre && <> · <span className="text-brand-primary font-bold">{worker.cargo_nombre}</span></>}</p>
                                                    {workerAlerta && (
                                                        <div className="flex items-center gap-1 mt-1 px-1.5 py-0.5 bg-red-100 dark:bg-red-950/40 border border-red-200/60 dark:border-red-900/60 rounded-lg w-fit"><AlertTriangle className="h-3 w-3 text-red-500 dark:text-red-400 shrink-0" /><span className="text-[9px] font-bold text-red-600 dark:text-red-300 leading-tight truncate max-w-[180px]">{workerAlerta.alertas[0].mensaje}</span></div>
                                                    )}
                                                </div>
                                                <button onClick={() => setCalendarWorker(worker)} className="h-10 w-10 rounded-xl bg-card flex items-center justify-center text-brand-primary border border-brand-primary/20 shadow-sm active:scale-90 transition-all shrink-0" title="Ver Calendario"><CalendarDays className="h-5 w-5" /></button>
                                            </div>

                                            <div className="flex gap-1.5 items-stretch min-h-[3rem]">
                                                {(() => {
                                                    const activeSecondary = estados.find(e => e.id === state.estado_id && !['A', 'F', 'JI', 'TO', 'AT'].includes(e.codigo));
                                                    if (activeSecondary) {
                                                        // Período del calendario: pill SOLO-LECTURA con rango (reemplaza los botones).
                                                        return (
                                                            <div className="flex-1 rounded-xl text-[10px] font-black uppercase text-white text-center leading-tight px-2 py-1.5 flex items-center justify-center shadow-md" style={{ backgroundColor: activeSecondary.color }} title={activeSecondary.nombre}>{periodoLabel(worker.id, activeSecondary)}</div>
                                                        );
                                                    }
                                                    return ['A', 'F', 'JI', 'TO'].map(code => {
                                                        const est = estados.find(e => e.codigo === code);
                                                        if (!est) return null;
                                                        const isActive = state.estado_id === est.id;
                                                        return (
                                                            <button key={est.id} onClick={() => applyStatusChange(worker, est)} disabled={isOutOfRange || !hasPermission('asistencia.guardar') || !!feriadoActual || isSunday || isSaturday} className={cn("flex-1 rounded-xl text-xs font-black uppercase transition-all border shrink-0 active:scale-95", isActive ? "text-white border-transparent shadow-md" : "bg-card border-border text-muted-foreground/60")} style={isActive ? { backgroundColor: est.color } : undefined}>{est.codigo}</button>
                                                        );
                                                    });
                                                })()}
                                            </div>
                                            <button onClick={() => setExpandedWorkerId(isExpanded ? null : worker.id)} disabled={isOutOfRange || !!feriadoActual || isSunday || isSaturday} className={cn("mt-2 flex items-center justify-center gap-1.5 w-full py-2 text-[10px] text-brand-primary font-bold uppercase tracking-tight rounded-xl bg-slate-50/50 dark:bg-muted/40 border border-slate-100 dark:border-border transition-all active:scale-98", (!!feriadoActual || isSunday || isSaturday || isOutOfRange) && "opacity-50 cursor-not-allowed grayscale")}>
                                                <span>{isExpanded ? 'Cerrar' : 'Detalle'}</span><ChevronDown className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-180")} />
                                            </button>
                                        </div>

                                        {/* ===== DESKTOP: Two-row compact layout (md) → single-row grid (lg+) ===== */}
                                        <div className={cn("hidden md:block px-4 lg:px-6 py-3 lg:py-4 group", markedRows.has(idx) && "bg-brand-primary/5 rounded-2xl")}>
                                            {/* ── lg+: original 5-column grid ── */}
                                            <div className="hidden lg:grid grid-cols-[50px_minmax(180px,280px)_1fr_140px_56px] gap-3 items-center">
                                                <div className="flex justify-center"><button onClick={() => toggleMarkedRow(idx)} className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black transition-all border", markedRows.has(idx) ? "bg-brand-dark text-white border-brand-dark shadow-md scale-110" : "bg-slate-50 dark:bg-muted text-slate-500 dark:text-muted-foreground border-slate-200 dark:border-border hover:border-brand-primary/30 hover:bg-card hover:text-brand-primary active:scale-95")}>{(idx + 1).toString().padStart(2, '0')}</button></div>
                                                <div className="flex items-center gap-3 min-w-0 border-l border-border/40 pl-3 group-hover:border-brand-primary/30 transition-colors">
                                                    <div className="min-w-0">
                                                        <WorkerLink workerId={worker.id} onClick={setQuickViewId} className="text-[12px] truncate block font-bold text-slate-700 dark:text-slate-200 hover:text-brand-primary transition-colors">{worker.apellido_paterno} {worker.apellido_materno || ''} {worker.nombres}</WorkerLink>
                                                        <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1.5 mt-0.5"><EmpresaBadge empresaNombre={worker.empresa_nombre} /><span className="bg-slate-100 dark:bg-muted px-1 rounded uppercase tracking-tighter">{worker.rut}</span>{worker.cargo_nombre && <span className="text-brand-primary/80 font-bold border-l border-slate-200 dark:border-border pl-1.5">{worker.cargo_nombre}</span>}</p>
                                                        {workerAlerta && (<div className="flex items-center gap-1.5 mt-1"><AlertTriangle className="h-3 w-3 text-red-500 dark:text-red-400 shrink-0" /><span className="text-[10px] font-bold text-red-600 dark:text-red-300 leading-tight">{workerAlerta.alertas.map(a => a.mensaje).join(' · ')}</span></div>)}
                                                    </div>
                                                </div>
                                                <div className="flex justify-center">
                                                    {(() => {
                                                        const activeSecondary = estados.find(e => e.id === state.estado_id && !['A', 'F', 'JI', 'TO', 'AT'].includes(e.codigo));
                                                        if (activeSecondary) {
                                                            // Período del calendario: pill SOLO-LECTURA con rango (reemplaza los botones).
                                                            return (
                                                                <div className="h-8 px-3.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center text-white shadow-md whitespace-nowrap" style={{ backgroundColor: activeSecondary.color }} title={activeSecondary.nombre}>{periodoLabel(worker.id, activeSecondary)}</div>
                                                            );
                                                        }
                                                        return (
                                                            <div className="flex gap-1 p-1 bg-slate-100/50 dark:bg-muted/50 rounded-2xl border border-slate-200/50 dark:border-border shadow-inner max-w-fit transition-all group-hover:bg-brand-primary/5 group-hover:border-brand-primary/20">
                                                                {['A', 'F', 'JI', 'TO'].map(code => {
                                                                    const est = estados.find(e => e.codigo === code);
                                                                    if (!est) return null;
                                                                    const isActive2 = state.estado_id === est.id;
                                                                    return (<button key={est.id} onClick={() => applyStatusChange(worker, est)} disabled={isOutOfRange || !hasPermission('asistencia.guardar') || !!feriadoActual || isSunday || isSaturday} className={cn("h-8 px-3 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap border shrink-0 flex items-center justify-center min-w-[36px]", isActive2 ? "text-white border-transparent shadow-md scale-105" : "bg-card border-slate-200 dark:border-border text-slate-400 dark:text-muted-foreground hover:border-slate-300 dark:hover:border-[var(--border-hover)] hover:text-slate-600 dark:hover:text-foreground active:scale-95")} style={isActive2 ? { backgroundColor: est.color, borderColor: est.color } : undefined}>{est.codigo}</button>);
                                                                })}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="flex items-center justify-end gap-2">
                                                    <div className="flex-1"><button onClick={() => setExpandedWorkerId(isExpanded ? null : worker.id)} disabled={isOutOfRange || !!feriadoActual || isSunday || isSaturday} title={isOutOfRange ? (isPreContrato ? "Bloqueado: Aún no contratado" : "Bloqueado por Finiquito") : "Ver detalle"} className={cn("text-[10px] text-brand-primary font-medium hover:underline w-full text-center", (isOutOfRange || !!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed no-underline grayscale")}>{isExpanded ? 'Cerrar' : 'Detalle'}</button></div>
                                                    <button onClick={() => setCalendarWorker(worker)} disabled={!!feriadoActual || isSunday || isSaturday} className={cn("p-1.5 rounded-full text-muted-foreground border border-border hover:bg-background hover:text-brand-primary transition-colors flex-shrink-0", (!!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed")} title="Ver Calendario / Asignar Período"><CalendarDays className="h-4 w-4" /></button>
                                                </div>
                                                {verHorasExtra && (
                                                    <div className="w-[56px]">
                                                        <input type="number" min="0" max="24" step="any" placeholder="0" disabled={!!feriadoActual || isSunday || isSaturday} inputMode="decimal" className={cn("w-full bg-background border border-border rounded-lg px-2 py-1.5 text-[10px] text-center text-brand-dark focus:outline-none focus:border-brand-primary", (!!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed")} value={state.horas_extra || ''} onChange={(e) => updateAttendance(worker.id, { horas_extra: parseFloat(e.target.value) || 0 })} />
                                                    </div>
                                                )}
                                            </div>

                                            {/* ── md only (768–1023px): compact 2-row card ── */}
                                            <div className="lg:hidden flex flex-col gap-2">
                                                {/* Row 1: Number + Name/Info + Action buttons */}
                                                <div className="flex items-center gap-2.5">
                                                    <button onClick={() => toggleMarkedRow(idx)} className={cn("w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-black transition-all border shrink-0", markedRows.has(idx) ? "bg-brand-dark text-white border-brand-dark shadow-md" : "bg-slate-50 dark:bg-muted text-slate-500 dark:text-muted-foreground border-slate-200 dark:border-border hover:border-brand-primary/30 active:scale-95")}>{(idx + 1).toString().padStart(2, '0')}</button>
                                                    <div className="flex-1 min-w-0">
                                                        <WorkerLink workerId={worker.id} onClick={setQuickViewId} className="text-[11px] truncate block font-bold text-slate-700 dark:text-slate-200 hover:text-brand-primary transition-colors leading-tight">{worker.apellido_paterno} {worker.apellido_materno || ''} {worker.nombres}</WorkerLink>
                                                        <p className="text-[9px] text-muted-foreground font-medium flex items-center gap-1 mt-0.5"><EmpresaBadge empresaNombre={worker.empresa_nombre} /><span className="bg-slate-100 dark:bg-muted px-0.5 rounded uppercase tracking-tighter">{worker.rut}</span>{worker.cargo_nombre && <span className="text-brand-primary/80 font-bold border-l border-slate-200 dark:border-border pl-1">{worker.cargo_nombre}</span>}</p>
                                                        {workerAlerta && (<div className="flex items-center gap-1 mt-0.5"><AlertTriangle className="h-2.5 w-2.5 text-red-500 dark:text-red-400 shrink-0" /><span className="text-[9px] font-bold text-red-600 dark:text-red-300 leading-tight truncate">{workerAlerta.alertas[0]?.mensaje}</span></div>)}
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button onClick={() => setExpandedWorkerId(isExpanded ? null : worker.id)} disabled={isOutOfRange || !!feriadoActual || isSunday || isSaturday} className={cn("text-[9px] text-brand-primary font-bold px-2 py-1 rounded-md hover:bg-brand-primary/5 transition-colors", (isOutOfRange || !!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed grayscale")}>{isExpanded ? 'Cerrar' : 'Detalle'}</button>
                                                        <button onClick={() => setCalendarWorker(worker)} disabled={!!feriadoActual || isSunday || isSaturday} className={cn("p-1 rounded-md text-muted-foreground border border-border hover:bg-background hover:text-brand-primary transition-colors", (!!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed")} title="Ver Calendario / Asignar Período"><CalendarDays className="h-3.5 w-3.5" /></button>
                                                    </div>
                                                </div>
                                                {/* Row 2: Status buttons + Horas extra */}
                                                <div className="flex items-center gap-2 pl-[34px]">
                                                    {(() => {
                                                        const activeSecondary = estados.find(e => e.id === state.estado_id && !['A', 'F', 'JI', 'TO', 'AT'].includes(e.codigo));
                                                        if (activeSecondary) {
                                                            // Período del calendario: pill SOLO-LECTURA con rango (reemplaza los botones).
                                                            return (
                                                                <div className="flex-1 min-w-0 rounded-lg text-[9px] font-black uppercase text-white text-center leading-tight px-2 py-1 flex items-center justify-center shadow-md" style={{ backgroundColor: activeSecondary.color }} title={activeSecondary.nombre}>{periodoLabel(worker.id, activeSecondary)}</div>
                                                            );
                                                        }
                                                        return (
                                                            <div className="flex gap-0.5 p-0.5 bg-slate-100/50 dark:bg-muted/50 rounded-xl border border-slate-200/50 dark:border-border shadow-inner flex-1 min-w-0 transition-all group-hover:bg-brand-primary/5 group-hover:border-brand-primary/20">
                                                                {['A', 'F', 'JI', 'TO'].map(code => {
                                                                    const est = estados.find(e => e.codigo === code);
                                                                    if (!est) return null;
                                                                    const isActive2 = state.estado_id === est.id;
                                                                    return (<button key={est.id} onClick={() => applyStatusChange(worker, est)} disabled={isOutOfRange || !hasPermission('asistencia.guardar') || !!feriadoActual || isSunday || isSaturday} className={cn("h-7 px-2 rounded-lg text-[9px] font-black uppercase transition-all whitespace-nowrap border shrink-0 flex items-center justify-center min-w-[28px]", isActive2 ? "text-white border-transparent shadow-md" : "bg-card border-slate-200 dark:border-border text-slate-400 dark:text-muted-foreground hover:border-slate-300 dark:hover:border-[var(--border-hover)] hover:text-slate-600 dark:hover:text-foreground active:scale-95")} style={isActive2 ? { backgroundColor: est.color, borderColor: est.color } : undefined}>{est.codigo}</button>);
                                                                })}
                                                            </div>
                                                        );
                                                    })()}
                                                    {verHorasExtra && (
                                                        <input type="number" min="0" max="24" step="any" placeholder="0" disabled={!!feriadoActual || isSunday || isSaturday} inputMode="decimal" className={cn("w-[48px] bg-background border border-border rounded-lg px-1.5 py-1 text-[9px] text-center text-brand-dark focus:outline-none focus:border-brand-primary shrink-0", (!!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed")} value={state.horas_extra || ''} onChange={(e) => updateAttendance(worker.id, { horas_extra: parseFloat(e.target.value) || 0 })} />
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <AnimatePresence>
                                            {isExpanded && (
                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden bg-muted">
                                                    <div className="px-3 md:px-5 pb-4 pt-2 grid grid-cols-2 md:grid-cols-5 gap-3">
                                                        <TimeStepperInput disabled={!!feriadoActual || isSunday || isSaturday} label="Entrada" value={state.hora_entrada || ''} onChange={(val) => updateAttendance(worker.id, { hora_entrada: val || null })} />
                                                        <TimeStepperInput disabled={!!feriadoActual || isSunday || isSaturday} label="Salida" value={state.hora_salida || ''} onChange={(val) => updateAttendance(worker.id, { hora_salida: val || null })} />
                                                        <TimeStepperInput disabled={!!feriadoActual || isSunday || isSaturday} label="Colación Ini." value={state.hora_colacion_inicio || ''} onChange={(val) => updateAttendance(worker.id, { hora_colacion_inicio: val || null })} />
                                                        <TimeStepperInput disabled={!!feriadoActual || isSunday || isSaturday} label="Colación Fin" value={state.hora_colacion_fin || ''} onChange={(val) => updateAttendance(worker.id, { hora_colacion_fin: val || null })} />
                                                        <div className={cn("col-span-2 md:col-span-1 grid gap-3", verHorasExtra ? "grid-cols-2" : "grid-cols-1")}>
                                                            {verHorasExtra && (
                                                                <div>
                                                                    <label className="text-[9px] font-semibold text-muted-foreground uppercase block mb-1">H. Extra</label>
                                                                    <input type="number" min="0" max="24" step="any" placeholder="0" disabled={!!feriadoActual || isSunday || isSaturday} inputMode="decimal" className={cn("w-full h-10 md:h-10 bg-card border border-border rounded-xl px-3 text-sm text-center text-brand-dark focus:outline-none focus:border-brand-primary", (!!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed bg-background")} value={state.horas_extra || ''} onChange={(e) => updateAttendance(worker.id, { horas_extra: parseFloat(e.target.value) || 0 })} />
                                                                </div>
                                                            )}
                                                            <div>
                                                                <label className="text-[9px] font-semibold text-muted-foreground uppercase block mb-1">Nota</label>
                                                                <input type="text" placeholder="..." disabled={!!feriadoActual || isSunday || isSaturday} className={cn("w-full h-10 md:h-10 bg-card border border-border rounded-xl px-3 text-sm text-brand-dark focus:outline-none focus:border-brand-primary", (!!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed bg-background")} value={state.observacion || ''} onChange={(e) => updateAttendance(worker.id, { observacion: e.target.value })} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )
                            })}
                        </AnimatePresence>
                    </div>

                    <div className="h-9 bg-muted border-t border-border flex items-center justify-between px-5 text-[11px] font-bold text-muted-foreground shrink-0 uppercase tracking-widest rounded-b-3xl">
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
                // En modo "Reporte Global" (sin obra seleccionada) selectedObra es null;
                // caer a la obra del propio trabajador para que el panel "Asignar Período"
                // siga disponible (mismo criterio que WorkerQuickView). Sin esto, el modal
                // abierto desde la fila en modo global salía sin el panel de asignación.
                obraId={selectedObra?.id ?? calendarWorker?.obra_id ?? undefined}
                onSuccess={fetchAttendanceInfo}
            />

            <TrasladoObraModal
                isOpen={!!trasladoWorker}
                onClose={() => setTrasladoWorker(null)}
                worker={trasladoWorker}
                obraActualId={selectedObra?.id || null}
                obraActualNombre={selectedObra?.nombre || ''}
                obras={obrasAsistencia}
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
                headerAction={
                    modalType === 'form' ? (
                        <Button
                            type="submit"
                            form="worker-form"
                            size="sm"
                            leftIcon={<Save className="h-3.5 w-3.5" />}
                        >
                            Guardar
                        </Button>
                    ) : undefined
                }
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

export default AttendanceDailyTab;
