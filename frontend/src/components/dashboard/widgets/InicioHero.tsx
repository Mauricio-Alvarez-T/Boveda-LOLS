import React from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Button } from '../../ui/Button';
import { NumeroRodante } from '../../ui/NumeroRodante';
import type { ResumenDia } from '../../../utils/resumenInicio';

/**
 * Tarjeta verde del Inicio (propuesta H «Marca LOLS», elegida por el dueño 2026-10-16; diseno.md
 * §9.14). Cuenta el día en una frase y deja a la vista las cifras que antes vivían en tarjetas
 * sueltas (faltas reiteradas, ausentes).
 *
 * Es la ÚNICA superficie grande verde de la app: excepción explícita a la regla 1 del DS. El verde
 * es `green-700` (no el `brand-primary` #029E4D) porque con letra blanca chica el de marca no pasa
 * AA; en oscuro baja a `green-900` para no encandilar.
 */
interface Props {
    resumen: ResumenDia;
    /** «Viernes 16 de octubre». */
    fecha: string;
    /** «Todas las obras» u «Obra Demo Centro». */
    ambito: string;
    /** % de presentes entre lo ya guardado hoy (null = sin permiso de asistencia). */
    presentesPct: number | null;
    ausentes: number | null;
    /** Trabajadores con faltas reiteradas este mes (null = sin permiso). */
    faltas: number | null;
    actualizado: string | null;
    cargando: boolean;
    onActualizar: () => void;
    onAsistencia?: () => void;
    /** Solo si hay vencimientos y permiso de vehículos. */
    onVehiculos?: () => void;
}

const Dato: React.FC<{ etiqueta: string; valor: number; sufijo?: string; alerta?: boolean }> = ({ etiqueta, valor, sufijo, alerta }) => (
    <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-green-50">{etiqueta}</span>
        <span className={cn('font-bold tabular-nums', alerta ? 'rounded-md bg-white px-2 text-red-700' : 'text-white')}>
            <NumeroRodante value={valor} />{sufijo}
        </span>
    </div>
);

const InicioHero: React.FC<Props> = ({
    resumen, fecha, ambito, presentesPct, ausentes, faltas, actualizado, cargando, onActualizar, onAsistencia, onVehiculos,
}) => {
    const { total, guardadas, finDeSemana, sinGuardar } = resumen;
    const pct = total > 0 ? Math.round((guardadas / total) * 100) : 0;
    const mostrarAsistencia = !!onAsistencia && !finDeSemana && sinGuardar.length > 0;

    return (
        <section
            aria-label="Resumen del día"
            className="rounded-3xl bg-green-700 dark:bg-green-900 text-white p-6 md:p-10 flex flex-wrap items-end justify-between gap-8"
        >
            <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-green-100">
                    {fecha} · {ambito}
                </p>
                <h2 className="text-3xl md:text-4xl font-bold leading-tight tracking-tight">{resumen.titulo}</h2>
                <p className="text-base text-green-50">{resumen.detalle}</p>
                {(mostrarAsistencia || onVehiculos) && (
                    <div className="flex flex-wrap gap-2.5 pt-2">
                        {mostrarAsistencia && (
                            <Button
                                onClick={onAsistencia}
                                rightIcon={<ArrowRight className="h-4 w-4" />}
                                className="bg-white text-green-800 hover:bg-green-50 active:bg-green-100 shadow-none"
                            >
                                Ir a Asistencia
                            </Button>
                        )}
                        {onVehiculos && (
                            <Button
                                variant="ghost"
                                onClick={onVehiculos}
                                className="bg-white/15 text-white hover:bg-white/25"
                            >
                                Ver vehículos
                            </Button>
                        )}
                    </div>
                )}
            </div>

            <div className="flex w-full flex-[0_1_340px] flex-col gap-3">
                {total > 0 && (
                    <>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="text-green-50">Obras con asistencia guardada</span>
                            <span className="font-bold tabular-nums"><NumeroRodante value={guardadas} /> de {total}</span>
                        </div>
                        <div
                            className="h-3 overflow-hidden rounded-full bg-white/20"
                            role="progressbar"
                            aria-label="Obras con asistencia guardada"
                            aria-valuemin={0}
                            aria-valuemax={total}
                            aria-valuenow={guardadas}
                        >
                            <div className="h-3 rounded-full bg-white" style={{ width: `${pct}%` }} />
                        </div>
                    </>
                )}
                <div className="flex flex-col gap-2 pt-1">
                    {presentesPct !== null && guardadas > 0 && <Dato etiqueta="Presentes en lo guardado" valor={presentesPct} sufijo="%" />}
                    {ausentes !== null && <Dato etiqueta="Ausentes hoy" valor={ausentes} />}
                    {faltas !== null && <Dato etiqueta="Faltas reiteradas este mes" valor={faltas} alerta={faltas > 0} />}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-white/20 pt-3 text-xs text-green-100">
                    <span className="tabular-nums">{actualizado ? `Actualizado ${actualizado}` : ' '}</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onActualizar}
                        leftIcon={<RefreshCw className={cn('h-3.5 w-3.5', cargando && 'motion-safe:animate-spin')} />}
                        className="text-white hover:bg-white/15"
                    >
                        Actualizar
                    </Button>
                </div>
            </div>
        </section>
    );
};

export default InicioHero;
