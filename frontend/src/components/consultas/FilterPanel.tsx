import React from 'react';
import { Building2, Briefcase, Users, UserCheck, FileText, UserX, CalendarPlus, CalendarMinus, ClipboardX, IdCard, CalendarClock } from 'lucide-react';
import { FilterSelect } from '../ui/Filters';
import { cn } from '../../utils/cn';

interface SelectOption {
    value: string | number;
    label: string;
}

interface FilterPanelProps {
    obras: SelectOption[];
    empresas: SelectOption[];
    cargos: SelectOption[];
    filterObra: string;
    setFilterObra: (val: string) => void;
    filterEmpresa: string;
    setFilterEmpresa: (val: string) => void;
    filterCargo: string;
    setFilterCargo: (val: string) => void;
    filterCategoria: string;
    setFilterCategoria: (val: string) => void;
    filterActivo: string;
    setFilterActivo: (val: string) => void;
    filterCompletitud: string;
    setFilterCompletitud: (val: string) => void;
    filterAusentes: boolean;
    setFilterAusentes: (val: boolean) => void;
    filterIngresoDesde: string;
    setFilterIngresoDesde: (val: string) => void;
    filterIngresoHasta: string;
    setFilterIngresoHasta: (val: string) => void;
    /** Tipos de documento obligatorios y activos, para "le falta este documento". */
    tiposObligatorios: SelectOption[];
    filterFaltaDato: string;
    setFilterFaltaDato: (val: string) => void;
    filterDocTipoFalta: string;
    setFilterDocTipoFalta: (val: string) => void;
    filterDocVigencia: string;
    setFilterDocVigencia: (val: string) => void;
    filterSalidaDesde: string;
    setFilterSalidaDesde: (val: string) => void;
    filterSalidaHasta: string;
    setFilterSalidaHasta: (val: string) => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
    obras,
    empresas,
    cargos,
    filterObra, setFilterObra,
    filterEmpresa, setFilterEmpresa,
    filterCargo, setFilterCargo,
    filterCategoria, setFilterCategoria,
    filterActivo, setFilterActivo,
    filterCompletitud, setFilterCompletitud,
    filterAusentes, setFilterAusentes,
    filterIngresoDesde, setFilterIngresoDesde,
    filterIngresoHasta, setFilterIngresoHasta,
    tiposObligatorios,
    filterFaltaDato, setFilterFaltaDato,
    filterDocTipoFalta, setFilterDocTipoFalta,
    filterDocVigencia, setFilterDocVigencia,
    filterSalidaDesde, setFilterSalidaDesde,
    filterSalidaHasta, setFilterSalidaHasta
}) => (
    <div className="p-4 md:p-5 bg-card border border-border rounded-2xl shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end max-h-[65vh] overflow-y-auto md:overflow-visible md:max-h-none custom-scrollbar">
        <FilterSelect
            label={<><Building2 className="h-4 w-4" /> Obra / Proyecto</>}
            options={obras}
            value={filterObra}
            onChange={(e) => setFilterObra(e.target.value)}
            placeholder="Todas las Obras"
        />
        <FilterSelect
            label={<><Building2 className="h-4 w-4" /> Empresa</>}
            options={empresas}
            value={filterEmpresa}
            onChange={(e) => setFilterEmpresa(e.target.value)}
            placeholder="Todas las Empresas"
        />
        <FilterSelect
            label={<><Briefcase className="h-4 w-4" /> Cargo</>}
            options={cargos}
            value={filterCargo}
            onChange={(e) => setFilterCargo(e.target.value)}
            placeholder="Todos los Cargos"
        />
        <FilterSelect
            label={<><Users className="h-4 w-4" /> Categoría</>}
            options={[
                { value: 'obra', label: 'Personal de Obra' },
                { value: 'operaciones', label: 'Operaciones' },
                { value: 'rotativo', label: 'Personal Rotativo' }
            ]}
            value={filterCategoria}
            onChange={(e) => setFilterCategoria(e.target.value)}
            placeholder="Todas las Categorías"
        />
        <FilterSelect
            label={<><UserCheck className="h-4 w-4" /> Estado Contractual</>}
            options={[
                { value: 'true', label: 'Solo Activos' },
                { value: 'false', label: 'Solo Finiquitados' }
            ]}
            value={filterActivo}
            onChange={(e) => setFilterActivo(e.target.value)}
            placeholder="Todos los Estados"
        />
        <FilterSelect
            label={<><FileText className="h-4 w-4" /> Papeles obligatorios</>}
            options={[
                { value: '100', label: 'Completos' },
                { value: 'faltantes', label: 'Le faltan alguno' }
            ]}
            value={filterCompletitud}
            onChange={(e) => setFilterCompletitud(e.target.value)}
            placeholder="Cualquier estado"
        />

        {/* ── Tanda 2026-09-15 ── */}

        {/* Qué dato bloquea una gestión concreta. NO dice "listo para emitir": el contrato
            exige además representante de la empresa y sueldo del cargo, que no se pueden
            mirar desde este endpoint sin romper el gate de cargos.sueldo.ver. */}
        <FilterSelect
            label={<><IdCard className="h-4 w-4" /> Falta en la ficha</>}
            value={filterFaltaDato}
            onChange={(e) => setFilterFaltaDato(e.target.value)}
            options={[
                { value: '', label: 'No filtrar' },
                { value: 'contrato', label: 'Datos personales del contrato' },
                { value: 'pago', label: 'Datos para transferir' },
                { value: 'tallas', label: 'Tallas de EPP' },
            ]}
            placeholder="No filtrar"
        />

        {/* "Le faltan papeles" no es una tarea; "le falta LA ODI" sí. */}
        <FilterSelect
            label={<><ClipboardX className="h-4 w-4" /> Le falta este documento</>}
            value={filterDocTipoFalta}
            onChange={(e) => setFilterDocTipoFalta(e.target.value)}
            options={[{ value: '', label: 'Cualquiera' }, ...tiposObligatorios]}
            placeholder="Cualquiera"
        />

        {/* Vigencia ≠ completitud: "¿está el papel?" y "¿sirve el papel?" son dos preguntas.
            Cubre cualquier tipo con vigencia configurada, igual que la alerta del Inicio. */}
        <FilterSelect
            label={<><CalendarClock className="h-4 w-4" /> Vigencia de papeles</>}
            value={filterDocVigencia}
            onChange={(e) => setFilterDocVigencia(e.target.value)}
            options={[
                { value: '', label: 'No filtrar' },
                { value: 'vencido', label: 'Con alguno vencido' },
                { value: '30', label: 'Vence en 30 días' },
                { value: '60', label: 'Vence en 60 días' },
                { value: '90', label: 'Vence en 90 días' },
            ]}
            placeholder="No filtrar"
        />

        {/* Rango de fecha de ingreso: "contrataciones del período". Extremos opcionales. */}
        <div className="space-y-2">
            <label className={cn(
                "text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors",
                (filterIngresoDesde || filterIngresoHasta) ? "text-brand-primary" : "text-muted-foreground/60"
            )}>
                <CalendarPlus className="h-4 w-4" /> Entró entre
            </label>
            <div className="grid grid-cols-2 gap-2">
                {([
                    { value: filterIngresoDesde, set: setFilterIngresoDesde, aria: 'Ingreso desde' },
                    { value: filterIngresoHasta, set: setFilterIngresoHasta, aria: 'Ingreso hasta' },
                ] as const).map(({ value, set, aria }) => (
                    <input
                        key={aria}
                        type="date"
                        aria-label={aria}
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        className={cn(
                            "w-full border rounded-xl p-2.5 text-sm transition-all outline-none min-w-0",
                            "bg-card border-border hover:border-brand-primary/40 text-brand-dark",
                            "focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary",
                            value && "bg-brand-primary/[0.03] border-brand-primary ring-1 ring-brand-primary/20 text-brand-primary font-semibold"
                        )}
                    />
                ))}
            </div>
        </div>

        {/* Rango de fecha de desvinculación: bajas del período. Además acota "finiquito
            pendiente" para que la lista sea manejable. */}
        <div className="space-y-2">
            <label className={cn(
                "text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors",
                (filterSalidaDesde || filterSalidaHasta) ? "text-brand-primary" : "text-muted-foreground/60"
            )}>
                <CalendarMinus className="h-4 w-4" /> Salió entre
            </label>
            <div className="grid grid-cols-2 gap-2">
                {([
                    { value: filterSalidaDesde, set: setFilterSalidaDesde, aria: 'Salida desde' },
                    { value: filterSalidaHasta, set: setFilterSalidaHasta, aria: 'Salida hasta' },
                ] as const).map(({ value, set, aria }) => (
                    <input
                        key={aria}
                        type="date"
                        aria-label={aria}
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        className={cn(
                            "w-full border rounded-xl p-2.5 text-sm transition-all outline-none min-w-0",
                            "bg-card border-border hover:border-brand-primary/40 text-brand-dark",
                            "focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary",
                            value && "bg-brand-primary/[0.03] border-brand-primary ring-1 ring-brand-primary/20 text-brand-primary font-semibold"
                        )}
                    />
                ))}
            </div>
        </div>

        <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-brand-dark px-1 flex items-center gap-1.5 opacity-60 uppercase tracking-wider">
                <UserX className="h-3.5 w-3.5" /> Asistencia
            </label>
            <div 
                onClick={() => setFilterAusentes(!filterAusentes)}
                className={cn(
                    "h-10 px-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all",
                    filterAusentes 
                        ? "bg-brand-primary/10 border-brand-primary/30 text-green-700 dark:text-green-300 font-bold shadow-sm"
                        : "bg-card border-border text-brand-dark hover:bg-background"
                )}
            >
                <span className="text-sm">Ausentes Hoy</span>
                <div className={cn(
                    "w-4 h-4 rounded-full border flex items-center justify-center transition-all",
                    filterAusentes ? "bg-brand-primary border-brand-primary text-white" : "border-border text-transparent"
                )}>
                    {filterAusentes && <div className="w-1.5 h-1.5 rounded-full bg-card shadow-sm" />}
                </div>
            </div>
        </div>
    </div>
);
