import React, { useState, useRef, useEffect } from 'react';
import { Send, Save, MoreHorizontal, FileDown, CalendarRange, CopyPlus, Plus, Building2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import RequirePermission from '../../auth/RequirePermission';
import { cn } from '../../../utils/cn';

interface AttendanceHeaderActionsProps {
    handleShareWhatsApp: () => void;
    handleExportExcel: () => void;
    toggleFeriado: () => void;
    handleSave: () => void;
    saving: boolean;
    loading: boolean;
    hasWorkers: boolean;
    hasPermission: (p: string) => boolean;
    isFeriado: boolean;
    isWeekend: boolean;
    selectedEmpresaId: number | null;
    setSelectedEmpresaId: (val: number | null) => void;
    availableEmpresas: { id: number, nombre: string }[];
    repetirDiaAnterior?: () => void;
    repeating?: boolean;
}

/**
 * Header actions for the Attendance page.
 *
 * Layout strategy by breakpoint:
 *   - Mobile (<md):    Filtros (+) + Enviar WhatsApp + Guardar (solo iconos).
 *                      El "+" abre un popover con el selector de empresa.
 *   - Tablet (md-lg):  Overflow "..." menu (holds WhatsApp/Excel/Repeat/Feriado/Empresa) + Save
 *   - Desktop (lg+):   Inline empresa filter + all action buttons + Save
 *
 * El buscador vive en <AttendanceSummaryRow /> para md+ y como FAB en mobile.
 */
export const AttendanceHeaderActions: React.FC<AttendanceHeaderActionsProps> = ({
    handleShareWhatsApp,
    handleExportExcel,
    toggleFeriado,
    handleSave,
    saving,
    loading,
    hasWorkers,
    hasPermission,
    isFeriado,
    isWeekend,
    selectedEmpresaId,
    setSelectedEmpresaId,
    availableEmpresas,
    repetirDiaAnterior,
    repeating = false
}) => {
    const isSaveDisabled = saving || loading || !hasWorkers || !hasPermission('asistencia.guardar') || isFeriado || isWeekend;
    const isRepeatDisabled = repeating || saving || loading || !hasWorkers || !hasPermission('asistencia.guardar') || isFeriado || isWeekend || !repetirDiaAnterior;

    return (
        <div className="flex items-center gap-2">
            {/* ═══════════════════════════════════════════ */}
            {/*  MOBILE (<md): Filtros (+) + Enviar + Guardar      */}
            {/*  Resto (Excel, Feriado, Repetir) viven en la       */}
            {/*  pestaña "Más" del header de tabs.                 */}
            {/* ═══════════════════════════════════════════ */}
            <div className="flex md:hidden items-center gap-1.5 h-full">
                <MobileFilterMenu
                    selectedEmpresaId={selectedEmpresaId}
                    setSelectedEmpresaId={setSelectedEmpresaId}
                    availableEmpresas={availableEmpresas}
                />

                <Button
                    onClick={handleShareWhatsApp}
                    disabled={!hasPermission('asistencia.enviar_whatsapp')}
                    className={cn(
                        "h-9 w-9 p-0 justify-center rounded-xl bg-brand-primary text-white shadow-md active:scale-95 transition-all flex items-center shrink-0",
                        !hasPermission('asistencia.enviar_whatsapp') && "opacity-40 grayscale pointer-events-none"
                    )}
                    title="Enviar por WhatsApp"
                >
                    <Send className="h-4 w-4" fill="currentColor" />
                </Button>

                <Button
                    onClick={handleSave}
                    isLoading={saving}
                    disabled={isSaveDisabled}
                    className={cn(
                        "h-9 w-9 p-0 justify-center rounded-xl bg-brand-primary text-white shadow-md active:scale-95 transition-all flex items-center shrink-0",
                        isSaveDisabled && "opacity-40 grayscale pointer-events-none"
                    )}
                    title="Guardar"
                >
                    <Save className="h-4 w-4" />
                </Button>
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/*  DESKTOP (lg+): filtro empresa              */}
            {/*  (Buscador ahora vive en AttendanceSummaryRow) */}
            {/* ═══════════════════════════════════════════ */}
            <div className="hidden lg:flex items-center gap-2 shrink-0">
                {/* Filtro empresa — caja propia */}
                <div className="bg-white/50 backdrop-blur-sm border border-[#E8E8ED] rounded-xl shadow-sm overflow-hidden shrink-0">
                    <select
                        value={selectedEmpresaId || ""}
                        onChange={(e) => setSelectedEmpresaId(e.target.value ? parseInt(e.target.value) : null)}
                        className="h-9 bg-transparent text-[10px] font-black uppercase text-muted-foreground/80 px-3 pr-8 min-w-[140px] appearance-none cursor-pointer outline-none focus:text-brand-primary"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundPosition: 'right 10px center', backgroundRepeat: 'no-repeat' }}
                    >
                        <option value="">Todas las Empresas</option>
                        {availableEmpresas.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="h-8 w-px bg-border/40 mx-0.5 hidden lg:block" />

            {/* ═══════════════════════════════════════════ */}
            {/*  DESKTOP (md+): action buttons             */}
            {/* ═══════════════════════════════════════════ */}
            <div className="hidden md:flex items-center gap-1">
                {/* Inline actions — visible only at lg+ */}
                <Button
                    onClick={handleShareWhatsApp}
                    variant="glass"
                    disabled={!hasPermission('asistencia.enviar_whatsapp')}
                    className={cn(
                        "hidden lg:flex h-9 w-9 p-0 items-center justify-center rounded-xl bg-white border border-[#E8E8ED] text-brand-primary shadow-sm",
                        hasPermission('asistencia.enviar_whatsapp') ? "hover:bg-brand-primary/5" : "opacity-40 grayscale pointer-events-none"
                    )}
                    title="Compartir por WhatsApp"
                >
                    <Send className="h-4 w-4" fill="currentColor" />
                </Button>
                <Button
                    onClick={handleExportExcel}
                    variant="glass"
                    disabled={!hasPermission('asistencia.exportar_excel')}
                    className={cn(
                        "hidden lg:flex h-9 w-9 p-0 items-center justify-center rounded-xl bg-white border border-[#E8E8ED] text-muted-foreground shadow-sm",
                        hasPermission('asistencia.exportar_excel') ? "hover:bg-background" : "opacity-40 grayscale pointer-events-none"
                    )}
                    title="Reporte Mensual"
                >
                    <FileDown className="h-4 w-4" />
                </Button>
                {repetirDiaAnterior && (
                    <Button
                        onClick={repetirDiaAnterior}
                        isLoading={repeating}
                        variant="glass"
                        disabled={isRepeatDisabled}
                        className={cn(
                            "hidden lg:flex h-9 px-3 items-center justify-center gap-1.5 rounded-xl bg-white border border-[#E8E8ED] text-brand-primary shadow-sm transition-all",
                            isRepeatDisabled ? "opacity-40 grayscale pointer-events-none" : "hover:bg-brand-primary/5"
                        )}
                        title="Copiar el último día laboral registrado a este día (sin guardar)"
                    >
                        <CopyPlus className="h-4 w-4" />
                        <span className="hidden xl:inline text-[10px] font-black uppercase tracking-wider">Repetir día ant.</span>
                    </Button>
                )}
                <RequirePermission permiso="asistencia.feriado.gestionar">
                    <Button
                        onClick={toggleFeriado}
                        variant={isFeriado ? "outline" : "glass"}
                        className={cn(
                            "hidden lg:flex h-9 w-9 p-0 items-center justify-center rounded-xl transition-all shadow-sm border",
                            isFeriado 
                                ? "bg-destructive text-white border-transparent" 
                                : "bg-white border-[#E8E8ED] text-muted-foreground hover:text-brand-primary"
                        )}
                        title={isFeriado ? "Quitar Feriado" : "Marcar Feriado"}
                    >
                        <CalendarRange className="h-4 w-4" />
                    </Button>
                </RequirePermission>

                {/* Overflow menu — visible at md only (below lg) */}
                <DesktopOverflowMenu
                    handleShareWhatsApp={handleShareWhatsApp}
                    handleExportExcel={handleExportExcel}
                    toggleFeriado={toggleFeriado}
                    repetirDiaAnterior={repetirDiaAnterior}
                    hasPermission={hasPermission}
                    isFeriado={isFeriado}
                    isRepeatDisabled={!!isRepeatDisabled}
                    repeating={repeating}
                    selectedEmpresaId={selectedEmpresaId}
                    setSelectedEmpresaId={setSelectedEmpresaId}
                    availableEmpresas={availableEmpresas}
                />

                <Button
                    onClick={handleSave}
                    isLoading={saving}
                    disabled={isSaveDisabled}
                    className={cn(
                        "h-9 px-3 lg:px-4 rounded-xl font-black text-[10px] uppercase tracking-wider shadow-lg shadow-brand-primary/20",
                        isSaveDisabled && "opacity-40 grayscale pointer-events-none"
                    )}
                >
                    <Save className="h-4 w-4 lg:mr-1" />
                    <span className="hidden lg:inline underline decoration-white/30 active:translate-y-px transition-all">Guardar</span>
                </Button>
            </div>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/*  Overflow menu for md-only (below lg) — holds actions + filters    */
/*  that are inline at lg+ but need to collapse to save space.        */
/* ------------------------------------------------------------------ */
interface DesktopOverflowMenuProps {
    handleShareWhatsApp: () => void;
    handleExportExcel: () => void;
    toggleFeriado: () => void;
    repetirDiaAnterior?: () => void;
    hasPermission: (p: string) => boolean;
    isFeriado: boolean;
    isRepeatDisabled: boolean;
    repeating: boolean;
    selectedEmpresaId: number | null;
    setSelectedEmpresaId: (val: number | null) => void;
    availableEmpresas: { id: number; nombre: string }[];
}

const DesktopOverflowMenu: React.FC<DesktopOverflowMenuProps> = ({
    handleShareWhatsApp, handleExportExcel, toggleFeriado,
    repetirDiaAnterior, hasPermission, isFeriado, isRepeatDisabled, repeating,
    selectedEmpresaId, setSelectedEmpresaId, availableEmpresas
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent | TouchEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div ref={ref} className="relative lg:hidden">
            <button
                onClick={() => setOpen(v => !v)}
                className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl border transition-all",
                    open
                        ? "bg-brand-primary text-white border-transparent shadow-lg"
                        : "bg-white text-muted-foreground border-[#E8E8ED] shadow-sm hover:border-brand-primary/30"
                )}
            >
                <MoreHorizontal className="h-5 w-5" />
            </button>

            {open && (
                <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl border border-[#E8E8ED] shadow-xl z-[200] py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                    {/* Empresa selector — only shown here below lg */}
                    <div className="px-3 py-2 border-b border-[#E8E8ED]">
                        <label className="text-[9px] font-black uppercase text-muted-foreground/60 tracking-wider block mb-1">Empresa</label>
                        <select
                            value={selectedEmpresaId || ""}
                            onChange={(e) => { setSelectedEmpresaId(e.target.value ? parseInt(e.target.value) : null); }}
                            className="w-full h-8 bg-background border border-border rounded-lg text-[11px] font-bold text-brand-dark px-2 outline-none focus:border-brand-primary cursor-pointer"
                        >
                            <option value="">Todas las Empresas</option>
                            {availableEmpresas.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={() => { handleShareWhatsApp(); setOpen(false); }}
                        disabled={!hasPermission('asistencia.enviar_whatsapp')}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-brand-dark hover:bg-background transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    >
                        <Send className="h-4 w-4 text-brand-primary" fill="currentColor" />
                        Compartir WhatsApp
                    </button>
                    <button
                        onClick={() => { handleExportExcel(); setOpen(false); }}
                        disabled={!hasPermission('asistencia.exportar_excel')}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-brand-dark hover:bg-background transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    >
                        <FileDown className="h-4 w-4 text-muted-foreground" />
                        Reporte Mensual
                    </button>
                    {repetirDiaAnterior && (
                        <button
                            onClick={() => { repetirDiaAnterior(); setOpen(false); }}
                            disabled={isRepeatDisabled}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-brand-dark hover:bg-background transition-colors disabled:opacity-40 disabled:pointer-events-none"
                        >
                            <CopyPlus className="h-4 w-4 text-brand-primary" />
                            {repeating ? 'Copiando...' : 'Repetir día anterior'}
                        </button>
                    )}
                    {hasPermission('asistencia.feriado.gestionar') && (
                        <button
                            onClick={() => { toggleFeriado(); setOpen(false); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-brand-dark hover:bg-background transition-colors"
                        >
                            <CalendarRange className={cn("h-4 w-4", isFeriado ? "text-destructive" : "text-muted-foreground")} />
                            {isFeriado ? 'Quitar Feriado' : 'Marcar Feriado'}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

/* ------------------------------------------------------------------ */
/*  MobileFilterMenu — botón "+" visible solo en mobile (<md).        */
/*  Despliega un popover con el selector de empresa, sin navegar      */
/*  a la pestaña "Más".                                               */
/* ------------------------------------------------------------------ */
interface MobileFilterMenuProps {
    selectedEmpresaId: number | null;
    setSelectedEmpresaId: (val: number | null) => void;
    availableEmpresas: { id: number; nombre: string }[];
}

const MobileFilterMenu: React.FC<MobileFilterMenuProps> = ({
    selectedEmpresaId, setSelectedEmpresaId, availableEmpresas
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent | TouchEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const hasActiveFilter = selectedEmpresaId !== null;
    const empresaActiva = hasActiveFilter
        ? availableEmpresas.find(e => e.id === selectedEmpresaId)?.nombre
        : null;

    return (
        <div ref={ref} className="relative md:hidden">
            <button
                onClick={() => setOpen(v => !v)}
                className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl border transition-all shrink-0 relative",
                    open
                        ? "bg-brand-dark text-white border-transparent shadow-lg"
                        : hasActiveFilter
                            ? "bg-brand-primary text-white border-transparent shadow-md"
                            : "bg-white text-brand-primary border-[#E8E8ED] shadow-sm hover:border-brand-primary/30"
                )}
                title="Filtros"
            >
                <Plus className={cn("h-5 w-5 transition-transform duration-200", open && "rotate-45")} />
                {hasActiveFilter && !open && (
                    <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-brand-accent rounded-full border-2 border-white" />
                )}
            </button>

            {open && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl border border-[#E8E8ED] shadow-xl z-[200] py-2 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-3 pt-1 pb-2">
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <Building2 className="h-3 w-3 text-muted-foreground/60" />
                            <label className="text-[9px] font-black uppercase text-muted-foreground/60 tracking-wider">Filtrar por empresa</label>
                        </div>
                        <select
                            value={selectedEmpresaId || ""}
                            onChange={(e) => { setSelectedEmpresaId(e.target.value ? parseInt(e.target.value) : null); }}
                            className="w-full h-10 bg-background border border-border rounded-lg text-xs font-bold text-brand-dark px-3 outline-none focus:border-brand-primary cursor-pointer"
                        >
                            <option value="">Todas las empresas</option>
                            {availableEmpresas.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                            ))}
                        </select>
                        {empresaActiva && (
                            <div className="flex items-center justify-between mt-2 px-2 py-1 bg-brand-primary/5 rounded-md border border-brand-primary/10">
                                <span className="text-[10px] font-bold text-brand-primary truncate">{empresaActiva}</span>
                                <button
                                    onClick={() => setSelectedEmpresaId(null)}
                                    className="text-[9px] font-black uppercase text-brand-primary/70 hover:text-brand-primary tracking-wider shrink-0 ml-2"
                                >
                                    Quitar
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
