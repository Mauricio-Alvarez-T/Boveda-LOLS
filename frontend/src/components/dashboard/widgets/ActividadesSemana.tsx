import React from 'react';
import { ClipboardList, FileDown } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';
import { Cargando, Skeleton } from '../../ui/Skeleton';
import { useAuth } from '../../../context/AuthContext';
import { useInformeActividades } from '../../../hooks/attendance/useInformeActividades';
import { fmtSemana } from '../../../utils/semanas';
import { cn } from '../../../utils/cn';
import { EncabezadoTarjeta, CifraTarjeta } from './EncabezadoTarjeta';
import { CifraTarjetaSilueta } from './SiluetasInicio';

/**
 * Inicio / Gestiones — "Asistencia a actividades sugeridas".
 *
 * Cuántos trabajadores de cada cargo asistieron en una semana + botón para bajar el
 * informe Excel (dos hojas: por cargo y por obra). Pedido del dueño 2026-09-21:
 * Paula paga por cargo, así que el resumen de arriba es por cargo.
 *
 * A diferencia de los otros widgets del Inicio este trae sus datos: el selector de
 * semana refetchea solo este bloque, sin recargar el resumen del dashboard.
 *
 * Estilo de tarjeta H (2026-10-16): círculo azul (dato informativo), total grande y una
 * barra por cargo relativa al cargo con más asistentes. El mismo diseño se ve en el
 * modal de Gestiones.
 */
const ActividadesSemana: React.FC = () => {
    const { hasPermission } = useAuth();
    const { resumen, loading, descargando, setSemana, descargarExcel } = useInformeActividades();
    const puedeDescargar = hasPermission('asistencia.actividades_sugeridas.informe');

    const selector = !!resumen?.semanas_disponibles?.length && (
        <div className="w-full sm:w-72">
            <Select
                aria-label="Semana del informe"
                options={resumen.semanas_disponibles.map(s => ({ value: s, label: fmtSemana(s) }))}
                value={resumen.semana ?? ''}
                onChange={(e) => setSemana(e.target.value)}
                disabled={loading}
            />
        </div>
    );
    const header = (
        <EncabezadoTarjeta icon={ClipboardList} tono="azul" titulo="Actividades sugeridas" subtitulo="Asistencia de la semana" extra={selector} />
    );

    if (loading && !resumen) {
        // Encabezado y «asistieron» de verdad; el selector de semana, la cifra y las barras por cargo, en gris.
        return (
            <div className="flex h-full flex-col">
                <EncabezadoTarjeta icon={ClipboardList} tono="azul" titulo="Actividades sugeridas" subtitulo="Asistencia de la semana"
                    extra={<Skeleton className="h-11 w-full rounded-control sm:w-72" />} />
                <Cargando que="las actividades de la semana">
                    <CifraTarjetaSilueta etiqueta="asistieron" className="mb-1" />
                    <Skeleton className="mb-4 h-3 w-48 max-w-full" />
                    <ul className="flex flex-col gap-2.5" aria-hidden="true">
                        {['w-2/5', 'w-1/3', 'w-1/2', 'w-1/4'].map(w => (
                            <li key={w} className="flex flex-col gap-1">
                                <div className="flex items-center justify-between gap-3"><Skeleton className={cn('h-4', w)} /><Skeleton className="h-4 w-6" /></div>
                                <Skeleton className="h-2 w-full rounded-full" />
                            </li>
                        ))}
                    </ul>
                </Cargando>
                {puedeDescargar && <div className="mt-auto pt-4"><Skeleton className="h-9 w-52 rounded-full" /></div>}
            </div>
        );
    }

    if (!resumen || !resumen.semana || resumen.por_cargo.length === 0) {
        return (
            <div>
                {header}
                <p className="text-sm text-muted-foreground">
                    Sin asistencias registradas. Cuando se guarde la asistencia de una lista, acá verás cuántos trabajadores de cada cargo asistieron.
                </p>
            </div>
        );
    }

    const maximo = Math.max(1, ...resumen.por_cargo.map(c => c.asistieron));

    return (
        <div className="flex h-full flex-col">
            {header}
            {/* Rueda al cambiar de semana: `resumen` sigue montado mientras recarga. */}
            <CifraTarjeta valor={resumen.total_asistieron} etiqueta="asistieron" tono="azul" className="mb-1" />
            <p className="mb-4 text-xs text-muted-foreground">
                {resumen.listas} lista{resumen.listas === 1 ? '' : 's'} · {resumen.obras} obra{resumen.obras === 1 ? '' : 's'} · {resumen.semana_label}
            </p>

            {/* Cargo → cuántos asistieron, con barra relativa al mayor */}
            <ul className="flex flex-col gap-2.5" aria-label="Asistieron por cargo">
                {resumen.por_cargo.map(({ cargo_nombre, asistieron }) => (
                    <li key={cargo_nombre} className="flex flex-col gap-1">
                        <span className="flex items-center justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate text-foreground">{cargo_nombre}</span>
                            <span className="shrink-0 font-semibold tabular-nums text-foreground">{asistieron}</span>
                        </span>
                        <span className="h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-500/15" aria-hidden>
                            <span className="block h-2 rounded-full bg-blue-600" style={{ width: `${Math.round((asistieron / maximo) * 100)}%` }} />
                        </span>
                    </li>
                ))}
            </ul>

            {puedeDescargar && (
                <div className="mt-auto pt-4">
                    <Button
                        variant="glass"
                        size="sm"
                        onClick={descargarExcel}
                        isLoading={descargando}
                        leftIcon={<FileDown className="h-3.5 w-3.5" />}
                    >
                        Descargar informe Excel
                    </Button>
                </div>
            )}
        </div>
    );
};

export default ActividadesSemana;
