import React from 'react';
import { ClipboardList, FileDown } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';
import { EmptyState } from '../../ui/EmptyState';
import { SkeletonText } from '../../ui/Skeleton';
import { useAuth } from '../../../context/AuthContext';
import { useInformeActividades } from '../../../hooks/attendance/useInformeActividades';
import { fmtSemana } from '../../../utils/semanas';

/**
 * Inicio / Gestiones — "Asistencia a actividades sugeridas".
 *
 * Cuántos trabajadores de cada cargo asistieron en una semana + botón para bajar el
 * informe Excel (dos hojas: por cargo y por obra). Pedido del dueño 2026-09-21:
 * Paula paga por cargo, así que el resumen de arriba es por cargo.
 *
 * A diferencia de los otros widgets del Inicio este trae sus datos: el selector de
 * semana refetchea solo este bloque, sin recargar el resumen del dashboard.
 */
const ActividadesSemana: React.FC = () => {
    const { hasPermission } = useAuth();
    const { resumen, loading, descargando, setSemana, descargarExcel } = useInformeActividades();
    const puedeDescargar = hasPermission('asistencia.actividades_sugeridas.informe');

    const header = (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted shrink-0">
                    <ClipboardList className="h-5 w-5 text-muted-foreground" />
                </span>
                <h3 className="text-sm font-semibold text-foreground truncate">Asistencia a actividades sugeridas</h3>
            </div>
            {!!resumen?.semanas_disponibles?.length && (
                <div className="w-full sm:w-64">
                    <Select
                        aria-label="Semana del informe"
                        options={resumen.semanas_disponibles.map(s => ({ value: s, label: fmtSemana(s) }))}
                        value={resumen.semana ?? ''}
                        onChange={(e) => setSemana(e.target.value)}
                        disabled={loading}
                    />
                </div>
            )}
        </div>
    );

    if (loading && !resumen) {
        return <div>{header}<SkeletonText lines={4} /></div>;
    }

    if (!resumen || !resumen.semana || resumen.por_cargo.length === 0) {
        return (
            <div>
                {header}
                <EmptyState
                    className="py-8"
                    icon={ClipboardList}
                    title="Sin asistencias registradas"
                    description="Cuando se guarde la asistencia de una lista, acá verás cuántos trabajadores de cada cargo asistieron."
                />
            </div>
        );
    }

    return (
        <div>
            {header}

            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 items-start">
                {/* Cargo → cuántos asistieron */}
                <div>
                    {resumen.por_cargo.map(({ cargo_nombre, asistieron }) => (
                        <div key={cargo_nombre} className="flex items-center justify-between gap-3 py-2.5 border-t border-border">
                            <p className="min-w-0 truncate text-sm text-foreground">{cargo_nombre}</p>
                            <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground tabular-nums">
                                {asistieron}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Totales + descarga */}
                <div className="rounded-xl border border-border bg-background p-4">
                    <p className="text-caption text-muted-foreground font-semibold uppercase tracking-wider">Total asistieron</p>
                    <p className="text-3xl font-semibold text-foreground tabular-nums leading-tight mt-0.5">{resumen.total_asistieron}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        {resumen.listas} lista{resumen.listas === 1 ? '' : 's'} · {resumen.obras} obra{resumen.obras === 1 ? '' : 's'}
                    </p>
                    <p className="text-caption text-muted-foreground mt-1">{resumen.semana_label}</p>

                    {puedeDescargar && (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={descargarExcel}
                            isLoading={descargando}
                            leftIcon={<FileDown className="h-3.5 w-3.5" />}
                            className="w-full mt-3"
                        >
                            Descargar informe Excel
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ActividadesSemana;
