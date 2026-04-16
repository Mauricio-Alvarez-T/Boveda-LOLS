import React, { useState } from 'react';
import { Send, Save, MoreHorizontal, FileDown, CalendarRange, Search, ChevronDown } from 'lucide-react';
import { Button } from '../../ui/Button';
import RequirePermission from '../../auth/RequirePermission';
import { cn } from '../../../utils/cn';
import { AttendanceMobileMenu } from './AttendanceMobileMenu';

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
    searchQuery: string;
    setSearchQuery: (val: string) => void;
    selectedEmpresaId: number | null;
    setSelectedEmpresaId: (val: number | null) => void;
    availableEmpresas: { id: number, nombre: string }[];
}

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
    searchQuery,
    setSearchQuery,
    selectedEmpresaId,
    setSelectedEmpresaId,
    availableEmpresas
}) => {
    const [showMobileMenu, setShowMobileMenu] = useState(false);

    const isSaveDisabled = saving || loading || !hasWorkers || !hasPermission('asistencia.guardar') || isFeriado || isWeekend;

    return (
        <div className="flex items-center gap-2">
            {/* Movil */}
            <div className="flex md:hidden items-center gap-1 h-full">
                <Button
                    onClick={handleShareWhatsApp}
                    disabled={!hasPermission('asistencia.enviar_whatsapp')}
                    className={cn(
                        "h-9 w-9 p-0 justify-center rounded-xl bg-brand-primary text-white shadow-md active:scale-95 transition-all flex items-center shrink-0",
                        !hasPermission('asistencia.enviar_whatsapp') && "opacity-40 grayscale pointer-events-none"
                    )}
                    title="Enviar"
                >
                    <Send className="h-4 w-4" fill="currentColor" />
                </Button>

                <Button
                    onClick={handleSave}
                    isLoading={saving}
                    disabled={isSaveDisabled}
                    className={cn(
                        "h-9 px-3 rounded-xl bg-brand-primary text-white shadow-md active:scale-95 transition-all flex items-center gap-1.5",
                        isSaveDisabled && "opacity-40 grayscale pointer-events-none"
                    )}
                >
                    <span className="text-[10px] font-black uppercase">Guardar</span>
                    <Save className="h-3.5 w-3.5" />
                </Button>

                <div className="relative">
                    <button
                        onClick={() => setShowMobileMenu(!showMobileMenu)}
                        className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-xl border transition-all active:scale-90",
                            showMobileMenu ? "bg-brand-primary text-white border-transparent shadow-lg" : "bg-white text-muted-foreground border-[#E8E8ED] shadow-sm"
                        )}
                    >
                        <MoreHorizontal className="h-5 w-5" />
                    </button>

                    <AttendanceMobileMenu
                        show={showMobileMenu}
                        onClose={() => setShowMobileMenu(false)}
                        onExportExcel={handleExportExcel}
                        onToggleFeriado={toggleFeriado}
                        hasPermission={hasPermission}
                        isFeriado={isFeriado}
                    />
                </div>
            </div>

            {/* Desktop */}
            <div className="hidden md:flex items-center gap-2 bg-white/50 backdrop-blur-sm border border-[#E8E8ED] rounded-xl p-0.5 shadow-sm overflow-hidden min-w-[300px] lg:min-w-[450px]">
                <div className="relative flex-1 group">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 transition-colors group-hover:text-brand-primary" />
                    <input
                        type="text"
                        placeholder="Buscar trabajador..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-8 pl-8 pr-3 bg-transparent text-xs font-medium focus:outline-none"
                    />
                </div>
                <div className="h-4 w-px bg-[#E8E8ED]" />
                <select
                    value={selectedEmpresaId || ""}
                    onChange={(e) => setSelectedEmpresaId(e.target.value ? parseInt(e.target.value) : null)}
                    className="h-8 bg-transparent text-[10px] font-black uppercase text-muted-foreground/80 px-3 pr-8 min-w-[140px] appearance-none cursor-pointer outline-none focus:text-brand-primary"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundPosition: 'right 10px center', backgroundRepeat: 'no-repeat' }}
                >
                    <option value="">Todas las Empresas</option>
                    {availableEmpresas.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                    ))}
                </select>
            </div>

            <div className="h-8 w-px bg-border/40 mx-1 hidden md:block" />

            <div className="hidden md:flex items-center gap-1">
                <Button
                    onClick={handleShareWhatsApp}
                    variant="glass"
                    disabled={!hasPermission('asistencia.enviar_whatsapp')}
                    className={cn(
                        "h-9 w-9 p-0 flex items-center justify-center rounded-xl bg-white border border-[#E8E8ED] text-brand-primary shadow-sm",
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
                        "h-9 w-9 p-0 flex items-center justify-center rounded-xl bg-white border border-[#E8E8ED] text-muted-foreground shadow-sm",
                        hasPermission('asistencia.exportar_excel') ? "hover:bg-background" : "opacity-40 grayscale pointer-events-none"
                    )}
                    title="Reporte Mensual"
                >
                    <FileDown className="h-4 w-4" />
                </Button>
                <RequirePermission permiso="asistencia.feriado.gestionar">
                    <Button
                        onClick={toggleFeriado}
                        variant={isFeriado ? "outline" : "glass"}
                        className={cn(
                            "h-9 w-9 p-0 flex items-center justify-center rounded-xl transition-all shadow-sm border",
                            isFeriado 
                                ? "bg-destructive text-white border-transparent" 
                                : "bg-white border-[#E8E8ED] text-muted-foreground hover:text-brand-primary"
                        )}
                        title={isFeriado ? "Quitar Feriado" : "Marcar Feriado"}
                    >
                        <CalendarRange className="h-4 w-4" />
                    </Button>
                </RequirePermission>
                <Button
                    onClick={handleSave}
                    isLoading={saving}
                    disabled={isSaveDisabled}
                    className={cn(
                        "h-9 px-4 rounded-xl font-black text-[10px] uppercase tracking-wider shadow-lg shadow-brand-primary/20",
                        isSaveDisabled && "opacity-40 grayscale pointer-events-none"
                    )}
                >
                    <span className="hidden lg:inline mr-2 underline decoration-white/30 active:translate-y-px transition-all">Guardar</span>
                    <Save className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
};
