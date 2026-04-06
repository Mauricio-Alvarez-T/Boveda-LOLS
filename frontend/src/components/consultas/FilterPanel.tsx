import React from 'react';
import { Building2, Briefcase, Users, UserCheck, FileText, UserX } from 'lucide-react';
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
    filterAusentes, setFilterAusentes
}) => (
    <div className="p-4 md:p-5 bg-white border border-[#E8E8ED] rounded-2xl shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end max-h-[65vh] overflow-y-auto md:overflow-visible md:max-h-none custom-scrollbar">
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
            label={<><FileText className="h-4 w-4" /> Documentación</>}
            options={[
                { value: '100', label: 'Al día (100%)' },
                { value: 'faltantes', label: 'Con pendientes' }
            ]}
            value={filterCompletitud}
            onChange={(e) => setFilterCompletitud(e.target.value)}
            placeholder="Cualquier estado"
        />

        <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-brand-dark px-1 flex items-center gap-1.5 opacity-60 uppercase tracking-wider">
                <UserX className="h-3.5 w-3.5" /> Asistencia
            </label>
            <div 
                onClick={() => setFilterAusentes(!filterAusentes)}
                className={cn(
                    "h-10 px-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all",
                    filterAusentes 
                        ? "bg-brand-primary/10 border-brand-primary/30 text-brand-primary font-bold shadow-sm" 
                        : "bg-white border-border text-brand-dark hover:bg-background"
                )}
            >
                <span className="text-sm">Ausentes Hoy</span>
                <div className={cn(
                    "w-4 h-4 rounded-full border flex items-center justify-center transition-all",
                    filterAusentes ? "bg-brand-primary border-brand-primary text-white" : "border-border text-transparent"
                )}>
                    {filterAusentes && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />}
                </div>
            </div>
        </div>
    </div>
);
