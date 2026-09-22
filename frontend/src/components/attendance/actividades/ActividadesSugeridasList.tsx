import React, { useEffect } from 'react';
import { Plus, Calendar, ChevronLeft, ChevronRight, Users, ClipboardList } from 'lucide-react';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { StatusBadge } from '../../ui/StatusBadge';
import { EmptyState } from '../../ui/EmptyState';
import { useObra } from '../../../context/ObraContext';
import { useAuth } from '../../../context/AuthContext';
import { useActividadesSugeridas } from '../../../hooks/attendance/useActividadesSugeridas';
import { fmtSemana, fmtSemanaCorta } from '../../../utils/semanas';

interface Props {
    onSelect: (id: number) => void;
    onCreate: () => void;
}

const MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/**
 * Listas de trabajadores en actividades sugeridas del mes (por el lunes de su
 * semana). Filtra por la obra seleccionada en el contexto; sin obra muestra
 * todas las del mes.
 */
const ActividadesSugeridasList: React.FC<Props> = ({ onSelect, onCreate }) => {
    const { selectedObra } = useObra();
    const { hasPermission } = useAuth();
    const { list, loading, month, year, setMonth, setYear, fetchList } = useActividadesSugeridas();
    const canCrear = hasPermission('asistencia.actividades_sugeridas.crear');

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
                    <IconButton
                        onClick={() => navigateMonth(-1)}
                        aria-label="Mes anterior"
                        className="bg-card border border-border rounded-xl hover:bg-muted"
                        icon={<ChevronLeft className="h-4 w-4" />}
                    />
                    <div className="px-4 h-9 bg-card border border-border rounded-xl flex items-center gap-2 text-sm font-bold text-brand-dark min-w-[180px] justify-center">
                        <Calendar className="h-4 w-4 text-brand-primary" />
                        {MESES_ES[month - 1]} {year}
                    </div>
                    <IconButton
                        onClick={() => navigateMonth(1)}
                        aria-label="Mes siguiente"
                        className="bg-card border border-border rounded-xl hover:bg-muted"
                        icon={<ChevronRight className="h-4 w-4" />}
                    />
                </div>

                {canCrear && selectedObra && (
                    <Button variant="primary" onClick={onCreate} leftIcon={<Plus className="h-4 w-4" />}>
                        Nueva lista
                    </Button>
                )}
            </div>

            {!selectedObra && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300">
                    Mostrando todas las obras del mes. Para armar una lista nueva selecciona una obra en el header.
                </div>
            )}

            {loading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Cargando...</div>
            ) : list.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl">
                    <EmptyState
                        icon={ClipboardList}
                        title="No hay listas este mes"
                        description={canCrear
                            ? 'Arma una lista nueva con el botón superior.'
                            : 'No tienes permisos para armar listas.'}
                    />
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {list.map(s => (
                        // eslint-disable-next-line no-restricted-syntax -- card seleccionable full-width (caja semana + info + contadores, left-align); Button centra y rompe la card
                        <button
                            key={s.id}
                            onClick={() => onSelect(s.id)}
                            className="text-left bg-card border border-border rounded-2xl p-4 hover:border-brand-primary/40 hover:shadow-md transition-all flex flex-wrap items-center gap-4"
                        >
                            <div className="flex flex-col items-center justify-center min-w-14 h-14 px-2 rounded-xl bg-brand-primary/10 text-brand-primary shrink-0">
                                <span className="text-micro font-bold uppercase">Semana</span>
                                <span className="text-xs font-black leading-tight whitespace-nowrap">{fmtSemanaCorta(s.semana)}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-sm font-bold text-brand-dark truncate">
                                        {s.obra_nombre}
                                    </span>
                                    <StatusBadge domain="actividadEstado" status={s.estado} showIcon />
                                </div>
                                <div className="text-label text-muted-foreground font-medium">
                                    {fmtSemana(s.semana)} · solicitado por {s.creado_por_nombre || '—'}
                                </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <div className="text-center">
                                    <div className="flex items-center gap-1 text-xs font-bold text-brand-dark">
                                        <Users className="h-3.5 w-3.5 text-brand-primary" />
                                        {s.total_citados}
                                    </div>
                                    <div className="text-micro text-muted-foreground uppercase font-bold">En lista</div>
                                </div>
                                {s.estado !== 'citada' && (
                                    <div className="text-center">
                                        <div className="text-xs font-bold text-brand-dark">
                                            {s.total_asistio}
                                        </div>
                                        <div className="text-micro text-muted-foreground uppercase font-bold">Asistió</div>
                                    </div>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ActividadesSugeridasList;
