import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { Trabajador } from '../../../types/entities';

interface Props {
    workers: Trabajador[];
    selected: Set<number>;
    onToggle: (workerId: number) => void;
    /** ID de la obra "anfitriona". Si un trabajador tiene obra_id distinta, se marca como "externo" */
    obraAnfitrionaId?: number | null;
}

/**
 * Lista de trabajadores con checkbox, agrupados por cargo (alfabético).
 * Cada item muestra apellido + nombre + RUT. Los externos a la obra
 * anfitriona aparecen con un badge "Otra obra".
 *
 * Memoizada con React.memo: re-renderiza solo si cambia `workers`,
 * `selected` (referencia, no contenido) o el callback `onToggle`. El
 * caller debe envolver `onToggle` con useCallback y `selected` con
 * useMemo cuando aplique.
 */
const WorkerCheckListImpl: React.FC<Props> = ({ workers, selected, onToggle, obraAnfitrionaId }) => {
    const grupos = useMemo(() => {
        const map: Record<string, Trabajador[]> = {};
        workers.forEach(w => {
            const cargo = w.cargo_nombre || 'Sin Cargo';
            (map[cargo] = map[cargo] || []).push(w);
        });
        return Object.keys(map)
            .sort((a, b) => a.localeCompare(b, 'es'))
            .map(cargo => ({
                cargo,
                workers: map[cargo].sort((a, b) =>
                    `${a.apellido_paterno}${a.nombres}`.localeCompare(`${b.apellido_paterno}${b.nombres}`, 'es')
                ),
            }));
    }, [workers]);

    if (workers.length === 0) {
        return (
            <div className="py-6 text-center text-xs text-muted-foreground">
                No hay trabajadores activos en esta obra.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {grupos.map(({ cargo, workers: ws }) => {
                const selectedInGroup = ws.filter(w => selected.has(w.id)).length;
                return (
                    <div key={cargo} className="border border-[#E8E8ED] rounded-xl overflow-hidden">
                        <div className="bg-[#F5F5F7] px-3 py-2 flex items-center justify-between">
                            <span className="text-[11px] font-black uppercase tracking-wider text-brand-dark">
                                {cargo}
                            </span>
                            <span className="text-[10px] font-semibold text-muted-foreground">
                                {selectedInGroup} / {ws.length}
                            </span>
                        </div>
                        <div className="divide-y divide-[#F0F0F5]">
                            {ws.map(w => {
                                const isSelected = selected.has(w.id);
                                const isExterno = obraAnfitrionaId !== undefined &&
                                    obraAnfitrionaId !== null &&
                                    w.obra_id !== null &&
                                    w.obra_id !== obraAnfitrionaId;
                                return (
                                    <button
                                        key={w.id}
                                        type="button"
                                        onClick={() => onToggle(w.id)}
                                        className={cn(
                                            'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                                            isSelected ? 'bg-brand-primary/5' : 'hover:bg-[#F9F9FB]'
                                        )}
                                    >
                                        <div className={cn(
                                            'h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
                                            isSelected
                                                ? 'bg-brand-primary border-brand-primary'
                                                : 'bg-white border-[#D0D0D5]'
                                        )}>
                                            {isSelected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-brand-dark truncate">
                                                    {w.apellido_paterno}{w.apellido_materno ? ` ${w.apellido_materno}` : ''} {w.nombres}
                                                </span>
                                                {isExterno && (
                                                    <span className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                                                        Otra obra
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground font-medium">
                                                {w.rut}
                                                {isExterno && w.obra_nombre && ` · ${w.obra_nombre}`}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const WorkerCheckList = React.memo(WorkerCheckListImpl);
export default WorkerCheckList;
