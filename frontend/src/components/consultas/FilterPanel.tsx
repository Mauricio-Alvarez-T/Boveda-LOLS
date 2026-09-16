/**
 * Campos del panel de filtros de la grilla de Trabajadores.
 *
 * Rediseño 2026-09-16: de grid horizontal de 3 columnas a COLUMNA ÚNICA AGRUPADA, para vivir en el rail
 * vertical (`FiltrosRail`) y en la hoja móvil. El motivo lo dio el dueño: la pantalla se lee en vertical
 * (una fila = un trabajador), así que el panel no puede comerse el alto de la lista cada vez que se abre.
 *
 * Doce controles seguidos no se leen: van en cinco grupos plegables con contador, el patrón que coinciden
 * en recomendar Baymard, Pencil & Paper y Helios para filtros laterales. La estructura y el conteo están en
 * `filtrosPanel.ts` (puro, con test); acá solo se pintan.
 */
import React from 'react';
import {
    Building2, Briefcase, Users, UserCheck, FileText, CalendarPlus, CalendarMinus,
    ClipboardX, IdCard, CalendarClock, ChevronDown,
} from 'lucide-react';

import { FilterSelect, FilterToggle } from '../ui/Filters';
import { Button } from '../ui/Button';
import { cn } from '../../utils/cn';
import { GRUPOS, type GrupoFiltroId } from './filtrosPanel';

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
    /** Grupos desplegados y su contador de filtros puestos (los calcula `filtrosPanel.ts`). */
    abiertos: readonly GrupoFiltroId[];
    onToggleGrupo: (id: GrupoFiltroId) => void;
    conteos: Record<GrupoFiltroId, number>;
}

const INPUT_FECHA = "w-full border rounded-xl p-2.5 text-sm transition-all outline-none min-w-0 " +
    "bg-card border-border hover:border-brand-primary/40 text-brand-dark " +
    "focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary";

/** Rango de fechas apilado: dos date pickers nativos lado a lado no caben en una columna de 320px. */
const RangoFechas: React.FC<{
    icono: React.ReactNode;
    titulo: string;
    desde: string;
    hasta: string;
    setDesde: (v: string) => void;
    setHasta: (v: string) => void;
    ariaDesde: string;
    ariaHasta: string;
}> = ({ icono, titulo, desde, hasta, setDesde, setHasta, ariaDesde, ariaHasta }) => (
    <div className="space-y-2">
        <span className={cn(
            "text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors",
            (desde || hasta) ? "text-brand-primary" : "text-muted-foreground/60"
        )}>
            {icono} {titulo}
        </span>
        {([
            { valor: desde, set: setDesde, aria: ariaDesde, rotulo: 'Desde' },
            { valor: hasta, set: setHasta, aria: ariaHasta, rotulo: 'Hasta' },
        ] as const).map(({ valor, set, aria, rotulo }) => (
            <label key={aria} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-caption font-semibold uppercase tracking-wider text-muted-foreground">{rotulo}</span>
                <input
                    type="date"
                    aria-label={aria}
                    value={valor}
                    onChange={(e) => set(e.target.value)}
                    className={cn(INPUT_FECHA, valor && "bg-brand-primary/[0.03] border-brand-primary ring-1 ring-brand-primary/20 text-brand-primary font-semibold")}
                />
            </label>
        ))}
    </div>
);

/** Cabecera plegable de un grupo, con el número de controles puestos adentro. */
const CabeceraGrupo: React.FC<{ titulo: string; abierto: boolean; conteo: number; onClick: () => void }> = ({ titulo, abierto, conteo, onClick }) => (
    <Button
        variant="ghost"
        size="sm"
        onClick={onClick}
        aria-expanded={abierto}
        className="w-full justify-between rounded-xl px-2 h-9 text-caption font-bold uppercase tracking-wider text-muted-foreground hover:text-brand-dark"
        rightIcon={<ChevronDown className={cn("h-4 w-4 transition-transform", abierto && "rotate-180")} />}
    >
        <span className="flex items-center gap-2 min-w-0">
            <span className="truncate">{titulo}</span>
            {conteo > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-primary px-1 text-micro font-bold text-white">
                    {conteo}
                </span>
            )}
        </span>
    </Button>
);

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
    filterSalidaHasta, setFilterSalidaHasta,
    abiertos, onToggleGrupo, conteos,
}) => {
    const contenido: Record<GrupoFiltroId, React.ReactNode> = {
        trabajo: (<>
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
        </>),

        situacion: (<>
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
            {/* Antes era un toggle dibujado a mano acá; ahora usa la primitiva del DS. */}
            <FilterToggle
                label="Ausentes hoy"
                checked={filterAusentes}
                onChange={setFilterAusentes}
            />
        </>),

        papeles: (<>
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
        </>),

        ficha: (
            /* Qué dato bloquea una gestión concreta. NO dice "listo para emitir": el contrato
               exige además representante de la empresa y sueldo del cargo, que no se pueden
               mirar desde este endpoint sin romper el gate de cargos.sueldo.ver. */
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
        ),

        fechas: (<>
            <RangoFechas
                icono={<CalendarPlus className="h-4 w-4" />}
                titulo="Entró entre"
                desde={filterIngresoDesde} hasta={filterIngresoHasta}
                setDesde={setFilterIngresoDesde} setHasta={setFilterIngresoHasta}
                ariaDesde="Ingreso desde" ariaHasta="Ingreso hasta"
            />
            {/* Bajas del período. Además acota "finiquito pendiente" para que la lista sea manejable. */}
            <RangoFechas
                icono={<CalendarMinus className="h-4 w-4" />}
                titulo="Salió entre"
                desde={filterSalidaDesde} hasta={filterSalidaHasta}
                setDesde={setFilterSalidaDesde} setHasta={setFilterSalidaHasta}
                ariaDesde="Salida desde" ariaHasta="Salida hasta"
            />
        </>),
    };

    return (
        <div className="flex flex-col gap-1">
            {GRUPOS.map(grupo => {
                const abierto = abiertos.includes(grupo.id);
                return (
                    <div key={grupo.id} className="border-b border-border/60 last:border-b-0 pb-1">
                        <CabeceraGrupo
                            titulo={grupo.titulo}
                            abierto={abierto}
                            conteo={conteos[grupo.id]}
                            onClick={() => onToggleGrupo(grupo.id)}
                        />
                        {abierto && (
                            <div className="flex flex-col gap-4 px-1 pt-1 pb-4">
                                {contenido[grupo.id]}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
