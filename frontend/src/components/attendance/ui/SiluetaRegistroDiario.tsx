import React from 'react';
import { CheckSquare, ChevronLeft, ChevronRight, Calendar, Search, ClipboardList, Users, BarChart3 } from 'lucide-react';
import { Cargando, Skeleton, SkeletonCirculo } from '../../ui/Skeleton';

interface Props {
    /** Fecha visible: no viene del servidor, se dibuja de verdad (al cambiar de día no "salta"). */
    date: string;
    /** Columna de horas extra (permiso asistencia.horas_extra.ver), igual que la grilla real. */
    horasExtra: boolean;
    /** Ícono de Actividades sugeridas junto al buscador. */
    conActividades: boolean;
}

// Anchos del nombre por fila: literales completos (Tailwind v4 JIT).
const ANCHO_NOMBRE = ['w-3/5', 'w-1/2', 'w-2/3', 'w-2/5'];
const ANCHO_CHIP = ['w-14', 'w-14', 'w-14', 'w-14'];
// Sobre la franja gris del pie la silueta común no se ve: va con el color del texto, translúcido.
const SOBRE_GRIS: React.CSSProperties = { backgroundColor: 'color-mix(in srgb, currentColor 25%, transparent)' };

/** La fecha tal como la pinta el `<input type="date">` real, pero sin poder tocarla mientras carga. */
const FechaFija: React.FC<{ date: string; className: string }> = ({ date, className }) => (
    <input type="date" value={date} readOnly tabIndex={-1} className={className} />
);

/**
 * Silueta del Registro Diario mientras llegan los trabajadores del día: la misma tarjeta, con su barra
 * (título, fecha y buscador de verdad; cifras y chips de estado en gris), las filas de trabajadores y el pie.
 */
export const SiluetaRegistroDiario: React.FC<Props> = ({ date, horasExtra, conActividades }) => (
    <Cargando
        que="la asistencia del día"
        className="flex-1 min-h-0 flex flex-col bg-card border border-border rounded-3xl shadow-[var(--shadow-md)] overflow-hidden relative"
    >
        {/* Teléfono: fecha + chips */}
        <div aria-hidden="true" className="md:hidden flex flex-col gap-2 px-4 pt-4 pb-3 bg-card border-b border-border shrink-0">
            <div className="flex items-center justify-between bg-card rounded-2xl p-1 border border-border shadow-sm">
                <span className="h-10 w-10 flex items-center justify-center text-muted-foreground shrink-0"><ChevronLeft className="h-5 w-5" /></span>
                <div className="flex-1 flex items-center justify-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-brand-primary/60" />
                    <FechaFija date={date} className="pointer-events-none bg-transparent text-sm text-brand-dark font-black focus:outline-none text-center uppercase tracking-tight" />
                </div>
                <span className="h-10 w-10 flex items-center justify-center text-muted-foreground shrink-0"><ChevronRight className="h-5 w-5" /></span>
            </div>
            <div className="flex items-center gap-2 overflow-hidden pb-0.5">
                {/* «Total» es rótulo fijo: solo la cifra va en gris. Los chips de estado vienen del servidor. */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-dark/5 rounded-xl border border-brand-dark/10 shrink-0">
                    <div className="flex items-center h-4"><Skeleton className="h-3 w-5" /></div>
                    <span className="text-micro font-bold text-brand-dark/40 uppercase tracking-tighter">Total</span>
                </div>
                {ANCHO_CHIP.map((w, i) => <Skeleton key={i} className={`h-[30px] shrink-0 rounded-xl ${w}`} />)}
            </div>
        </div>

        {/* Computador: título, fecha, cifras, buscador y chips */}
        <div aria-hidden="true" className="min-h-[48px] border-b border-border bg-card/50 px-4 lg:px-5 py-2 shrink-0 hidden md:flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 shrink-0 flex-wrap">
                <div className="flex items-center gap-3 shrink-0">
                    <div className="h-7 w-7 lg:h-8 lg:w-8 rounded-xl bg-muted flex items-center justify-center">
                        <CheckSquare className="h-3.5 w-3.5 lg:h-4 lg:w-4 text-muted-foreground" />
                    </div>
                    <h2 className="text-xs lg:text-sm font-bold text-brand-dark whitespace-nowrap">Registro Diario</h2>
                </div>
                <div className="flex items-center bg-card/50 border border-border rounded-xl p-0.5 shadow-sm shrink-0">
                    <span className="h-7 w-7 lg:h-8 lg:w-8 flex items-center justify-center text-muted-foreground shrink-0"><ChevronLeft className="h-4 w-4" /></span>
                    <div className="flex items-center px-0.5">
                        <FechaFija date={date} className="pointer-events-none w-[105px] lg:w-[115px] bg-transparent text-caption lg:text-label text-brand-dark font-black focus:outline-none text-center" />
                    </div>
                    <span className="h-7 w-7 lg:h-8 lg:w-8 flex items-center justify-center text-muted-foreground shrink-0"><ChevronRight className="h-4 w-4" /></span>
                </div>
                {/* Total y %: chip, ícono y rótulo de verdad; solo la cifra en gris (alto de línea fijo = mismo alto de chip). */}
                <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
                    <div className="flex items-center gap-1 px-2 lg:px-3 py-1 bg-brand-dark/5 rounded-lg lg:rounded-xl border border-brand-dark/10 shrink-0">
                        <Users className="h-3 w-3 lg:h-3.5 lg:w-3.5 text-brand-dark/60" />
                        <div className="flex items-center h-4 lg:h-5"><Skeleton className="h-3 w-5 lg:h-3.5" /></div>
                        <span className="text-micro font-bold text-brand-dark/40 uppercase tracking-tighter hidden lg:inline">Total</span>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 bg-brand-dark/5 rounded-lg lg:rounded-xl border border-brand-dark/10 shrink-0">
                        <BarChart3 className="h-3 w-3 lg:h-3.5 lg:w-3.5 text-brand-dark/60" />
                        <div className="flex items-center gap-px h-4 lg:h-5 text-label lg:text-section font-black text-brand-dark"><Skeleton className="h-3 w-5 lg:h-3.5" />%</div>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    <div className="relative h-7 lg:h-8 w-[150px] lg:w-[200px] pl-8 flex items-center bg-card/50 border border-border rounded-lg lg:rounded-xl shadow-sm text-caption lg:text-label font-medium text-muted-foreground">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                        Buscar...
                    </div>
                    {conActividades && (
                        <span className="h-7 lg:h-8 w-7 lg:w-8 flex items-center justify-center bg-card/50 border border-border rounded-lg lg:rounded-xl shadow-sm text-muted-foreground">
                            <ClipboardList className="h-3.5 w-3.5" />
                        </span>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-1.5 lg:gap-2 flex-wrap min-w-0 justify-end">
                {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[26px] w-12 lg:h-[30px] lg:w-14 rounded-lg lg:rounded-xl" />)}
            </div>
        </div>

        {/* Filas de trabajadores (mismo fondo y separación que la lista real) */}
        <div aria-hidden="true" className="flex-1 min-h-0 overflow-hidden bg-muted/80 p-2 md:p-4 flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="shrink-0 bg-card rounded-2xl border border-border shadow-[var(--shadow-sm)]">
                    {/* Teléfono: nº + nombre + calendario; A/F/JI/TO; Detalle */}
                    <div className="md:hidden p-3 pb-4">
                        <div className="flex items-center gap-3 mb-3">
                            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                            <div className="flex-1 min-w-0 space-y-1.5">
                                <Skeleton className={`h-3.5 ${ANCHO_NOMBRE[i % 4]}`} />
                                <Skeleton className="h-3 w-2/5" />
                            </div>
                            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                        </div>
                        <div className="flex gap-1.5">
                            {[0, 1, 2, 3].map(k => <Skeleton key={k} className="h-12 flex-1 rounded-xl" />)}
                        </div>
                        <Skeleton className="mt-2 h-10 w-full rounded-xl" />
                    </div>

                    <div className="hidden md:block px-4 lg:px-6 py-3 lg:py-4">
                        {/* lg+: la grilla de 5 columnas */}
                        <div className="hidden lg:grid grid-cols-[50px_minmax(180px,280px)_1fr_140px_56px] gap-3 items-center">
                            <div className="flex justify-center"><Skeleton className="h-7 w-7 rounded-lg" /></div>
                            <div className="min-w-0 space-y-1.5 border-l border-border/40 pl-3">
                                <Skeleton className={`h-3.5 ${ANCHO_NOMBRE[i % 4]}`} />
                                <Skeleton className="h-3 w-1/2" />
                            </div>
                            <div className="flex justify-center"><Skeleton className="h-10 w-44 rounded-2xl" /></div>
                            <div className="flex items-center justify-end gap-2">
                                <div className="flex flex-1 justify-center"><Skeleton className="h-4 w-14" /></div>
                                <SkeletonCirculo className="h-7 w-7" />
                            </div>
                            {horasExtra && <Skeleton className="h-9 w-full rounded-lg" />}
                        </div>
                        {/* md (768–1023 px): tarjeta compacta de dos filas */}
                        <div className="lg:hidden flex flex-col gap-2">
                            <div className="flex items-center gap-2.5">
                                <Skeleton className="h-6 w-6 shrink-0 rounded-md" />
                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <Skeleton className={`h-3.5 ${ANCHO_NOMBRE[i % 4]}`} />
                                    <Skeleton className="h-2.5 w-2/5" />
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <Skeleton className="h-6 w-14" />
                                    <Skeleton className="h-6 w-6 rounded-md" />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 pl-[34px]">
                                <Skeleton className="h-8 min-w-0 flex-1 rounded-xl" />
                                {horasExtra && <Skeleton className="h-8 w-[48px] shrink-0 rounded-lg" />}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>

        {/* Pie: la cantidad de trabajadores */}
        <div aria-hidden="true" className="h-9 bg-muted border-t border-border flex items-center px-5 text-label font-bold text-muted-foreground shrink-0 uppercase tracking-widest rounded-b-3xl">
            <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-brand-primary/40" />
                <span className="flex items-center gap-1"><Skeleton className="h-3 w-6" style={SOBRE_GRIS} />trabajadores</span>
            </div>
        </div>
    </Cargando>
);
