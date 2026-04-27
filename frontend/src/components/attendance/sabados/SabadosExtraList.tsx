import React, { useEffect } from 'react';
import { Plus, Calendar, ChevronLeft, ChevronRight, Users, CheckCircle2, Clock, Ban } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cn } from '../../../utils/cn';
import { useObra } from '../../../context/ObraContext';
import { useAuth } from '../../../context/AuthContext';
import { useSabadosExtra } from '../../../hooks/attendance/useSabadosExtra';

interface Props {
    onSelect: (id: number) => void;
    onCreate: () => void;
}

const MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/**
 * Vista de listado mensual de citaciones de Sábado Extra.
 * Filtra por la obra seleccionada en el contexto. Si no hay obra,
 * muestra todas las del mes.
 */
const SabadosExtraList: React.FC<Props> = ({ onSelect, onCreate }) => {
    const { selectedObra } = useObra();
    const { hasPermission } = useAuth();
    const { list, loading, month, year, setMonth, setYear, fetchList } = useSabadosExtra();
    const canCrear = hasPermission('asistencia.sabados_extra.crear');

    useEffect(() => {
        fetchList(selectedObra?.id);
    }, [fetchList, selectedObra]);

    const navigateMonth = (offset: number) => {
        let m = month + offset;
        let y = year;
        if (m < 1) { m = 12; y--; }
        else if (m > 12) { m = 1; y++; }
        setMonth(m);
        setYear(y);
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Header con navegación de mes */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigateMonth(-1)}
                        className="h-9 w-9 rounded-xl bg-white border border-[#E8E8ED] flex items-center justify-center hover:bg-[#F5F5F7]"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="px-4 h-9 bg-white border border-[#E8E8ED] rounded-xl flex items-center gap-2 text-sm font-bold text-brand-dark min-w-[180px] justify-center">
                        <Calendar className="h-4 w-4 text-brand-primary" />
                        {MESES_ES[month - 1]} {year}
                    </div>
                    <button
                        onClick={() => navigateMonth(1)}
                        className="h-9 w-9 rounded-xl bg-white border border-[#E8E8ED] flex items-center justify-center hover:bg-[#F5F5F7]"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>

                {canCrear && selectedObra && (
                    <Button variant="primary" onClick={onCreate} leftIcon={<Plus className="h-4 w-4" />}>
                        Nueva citación
                    </Button>
                )}
            </div>

            {!selectedObra && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                    Mostrando todas las obras del mes. Para crear una nueva citación selecciona una obra en el header.
                </div>
            )}

            {loading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Cargando...</div>
            ) : list.length === 0 ? (
                <div className="bg-white border border-[#E8E8ED] rounded-2xl p-12 text-center">
                    <Calendar className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm font-bold text-brand-dark">No hay citaciones este mes</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        {canCrear
                            ? 'Crea una nueva citación con el botón superior.'
                            : 'No tienes permisos para crear citaciones.'}
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {list.map(s => {
                        const fechaStr = s.fecha.split('-').reverse().join('-');
                        return (
                            <button
                                key={s.id}
                                onClick={() => onSelect(s.id)}
                                className="text-left bg-white border border-[#E8E8ED] rounded-2xl p-4 hover:border-brand-primary/40 hover:shadow-md transition-all flex flex-wrap items-center gap-4"
                            >
                                <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-brand-primary/10 text-brand-primary shrink-0">
                                    <span className="text-[9px] font-bold uppercase">SÁB</span>
                                    <span className="text-lg font-black leading-none">{s.fecha.split('-')[2]}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-sm font-bold text-brand-dark truncate">
                                            {s.obra_nombre}
                                        </span>
                                        <span className={cn(
                                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase border',
                                            s.estado === 'citada' && 'bg-amber-50 border-amber-200 text-amber-800',
                                            s.estado === 'realizada' && 'bg-emerald-50 border-emerald-200 text-emerald-800',
                                            s.estado === 'cancelada' && 'bg-gray-50 border-gray-200 text-gray-600',
                                        )}>
                                            {s.estado === 'citada' && <Clock className="h-2.5 w-2.5" />}
                                            {s.estado === 'realizada' && <CheckCircle2 className="h-2.5 w-2.5" />}
                                            {s.estado === 'cancelada' && <Ban className="h-2.5 w-2.5" />}
                                            {s.estado}
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-muted-foreground font-medium">
                                        {fechaStr} · solicitado por {s.creado_por_nombre || '—'}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <div className="text-center">
                                        <div className="flex items-center gap-1 text-xs font-bold text-brand-dark">
                                            <Users className="h-3.5 w-3.5 text-brand-primary" />
                                            {s.total_citados}
                                        </div>
                                        <div className="text-[9px] text-muted-foreground uppercase font-bold">Citados</div>
                                    </div>
                                    {s.estado !== 'citada' && (
                                        <div className="text-center">
                                            <div className="text-xs font-bold text-emerald-700">
                                                {s.total_asistio}
                                            </div>
                                            <div className="text-[9px] text-muted-foreground uppercase font-bold">Asistió</div>
                                        </div>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default SabadosExtraList;
