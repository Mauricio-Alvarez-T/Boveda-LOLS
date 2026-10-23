import React, { useMemo } from 'react';
import { cn } from '../../../utils/cn';
import { shareViaWhatsApp } from '../../../utils/whatsappShare';
import WhatsAppIcon from '../../ui/WhatsAppIcon';
import { EnlaceFicha, PieFicha } from './FichaInicio';
import { ariaFaltas, fraseFaltas, mensajeGrupoFaltas, reglasDe, REGLA_FALTA, semanasDelMes, type CeldaCalendario, type TrabajadorFaltas } from './resumenFaltasMes';

interface FechaMes {
    anio: number;
    /** 1-12. */
    mes: number;
    hoyDia: number;
    /** 'YYYY-MM-DD' de hoy (para marcar «(hoy)» en la frase). */
    hoyIso: string;
}

const LETRAS = ['L', 'M', 'M', 'J', 'V'];

/** Clases literales por tipo de celda (JIT de Tailwind). */
const CELDA: Record<CeldaCalendario['tipo'], string> = {
    falta: 'bg-red-600 dark:bg-red-500',
    habil: 'bg-muted',
    futuro: 'border border-dashed border-border bg-card',
    vacio: 'bg-transparent',
};

/** Mini calendario de lunes a viernes del mes: «2 lunes» se ve como columna, «2 seguidos» como celdas juntas. */
const MiniCalendario: React.FC<{ fechas?: string[] } & Omit<FechaMes, 'hoyIso'>> = ({ fechas, anio, mes, hoyDia }) => {
    const semanas = useMemo(() => semanasDelMes(fechas, anio, mes, hoyDia), [fechas, anio, mes, hoyDia]);
    return (
        <div role="img" aria-label={ariaFaltas(fechas)} className="shrink-0">
            <div className="mb-1 grid grid-cols-[repeat(5,16px)] gap-1" aria-hidden>
                {LETRAS.map((l, i) => (
                    <span key={i} className={cn('text-center text-micro', i === 0 ? 'font-bold text-foreground' : 'font-medium text-muted-foreground')}>{l}</span>
                ))}
            </div>
            <div className="grid grid-cols-[repeat(5,16px)] gap-1" aria-hidden>
                {semanas.flat().map((c, i) => (
                    <span key={i} className={cn('box-border h-4 w-4 rounded', CELDA[c.tipo],
                        c.hoy && 'ring-[1.5px] ring-foreground ring-offset-2 ring-offset-card')} />
                ))}
            </div>
        </div>
    );
};

const iniciales = (t: TrabajadorFaltas) =>
    `${t.apellido_paterno?.[0] ?? ''}${t.nombres?.[0] ?? ''}`.toUpperCase();

/**
 * «Requiere acción» del detalle de Asistencia como fichas por persona (dueño 2026-10-20, opción A del lienzo,
 * «tal cual»): iniciales en un círculo (rojo si tiene 2 días seguidos), nombre y obra, el total de faltas,
 * las fechas en una frase, las reglas en píldoras chicas y el mini calendario de lunes a viernes.
 */
export const FichasReiterados: React.FC<{ lista: TrabajadorFaltas[]; onTrabajador: (rut: string) => void } & FechaMes> = ({
    lista, onTrabajador, anio, mes, hoyDia, hoyIso,
}) => (
    <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {lista.map(t => {
            const reglas = reglasDe(t);
            const grave = reglas.includes('consecutivas');
            return (
                <li key={t.trabajador_id}
                    className="flex flex-col gap-3.5 rounded-[20px] bg-card p-5 text-foreground shadow-[var(--shadow-sm)]">
                    <div className="flex items-center gap-3">
                        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-section font-bold',
                            grave ? 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300' : 'bg-muted text-zinc-700 dark:text-zinc-300')}
                            aria-hidden>
                            {iniciales(t)}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-semibold">{t.apellido_paterno} {t.nombres}</p>
                            <p className="truncate text-xs text-muted-foreground">{t.obra_nombre ?? '—'}</p>
                        </div>
                        <div className="text-right">
                            <span className="block text-headline font-bold leading-none tracking-tight tabular-nums text-red-700 dark:text-red-300">
                                {t.total_faltas}
                            </span>
                            <span className="mt-0.5 block text-label text-muted-foreground">{t.total_faltas === 1 ? 'falta' : 'faltas'}</span>
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                            <p className="text-section leading-snug text-zinc-700 dark:text-zinc-300">{fraseFaltas(t.fechas, hoyIso)}</p>
                            <div className="flex flex-wrap gap-1.5">
                                {reglas.map(r => (
                                    <span key={r} className={cn('rounded-full px-2 py-0.5 text-label font-semibold',
                                        REGLA_FALTA[r].grave ? 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300' : 'bg-muted text-zinc-700 dark:text-zinc-300')}>
                                        {REGLA_FALTA[r].texto}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <MiniCalendario fechas={t.fechas} anio={anio} mes={mes} hoyDia={hoyDia} />
                    </div>
                    {/* La acción va donde se ve el problema (dueño 2026-10-23): preguntar al grupo de asistencia
                        qué pasó, con el mensaje ya escrito; WhatsApp se abre sin número y se elige el grupo. */}
                    <PieFicha>
                        <EnlaceFicha apagado onClick={() => { void shareViaWhatsApp(mensajeGrupoFaltas(t, hoyIso)); }}
                            icono={<WhatsAppIcon className="h-4 w-4 shrink-0 text-green-700 dark:text-green-300" />}>
                            Preguntar al grupo
                        </EnlaceFicha>
                        <EnlaceFicha onClick={() => onTrabajador(t.rut)}>Ver en asistencia</EnlaceFicha>
                    </PieFicha>
                </li>
            );
        })}
    </ul>
);
