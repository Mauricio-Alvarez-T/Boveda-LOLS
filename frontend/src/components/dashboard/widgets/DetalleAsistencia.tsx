import React from 'react';
import { cn } from '../../../utils/cn';
import { NumeroRodante } from '../../ui/NumeroRodante';
import { SkeletonText } from '../../ui/Skeleton';
import AsistenciaPendiente from './AsistenciaPendiente';
import { FichasReiterados } from './FichasReiterados';
import { DescuentosMes, FaltasPorObra, HorasExtraObras, PatronFinde, ProximosDias, TendenciaMeses } from './DetalleAsistenciaMes';
import type { DetalleAsistenciaApi } from './resumenAsistenciaDetalle';
import { ordenarReiterados, type FaltasMesData } from './resumenFaltasMes';
import { colorEstado, gruposAusentes, ID_SECCION, type AusentesHoy, type ObrasHoy } from './resumenAsistenciaHoy';

const CARD = 'rounded-3xl bg-card p-6 text-foreground shadow-[var(--shadow-md)]';
const ROTULO = 'text-label font-bold uppercase tracking-[0.08em] text-muted-foreground';
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

interface Props {
    faltas: FaltasMesData | null;
    ausentes: AusentesHoy | null;
    obras: ObrasHoy | null;
    mesNombre: string;
    anio: number;
    mes: number;
    hoyDia: number;
    cargando: boolean;
    /** Fase 2 (GET /dashboard/asistencia): próximos 14 días, descuentos y horas extra; null mientras carga o si falló. */
    mesExtra: DetalleAsistenciaApi | null;
    cargandoMes: boolean;
    /** El perfil ve descuentos u horas extra (para no mostrar un esqueleto que luego desaparece). */
    verMes: boolean;
    onTrabajador: (rut: string) => void;
    onAsistencia: () => void;
    /** Tendencia, actividades y ranking de obras (lo que ya existía), al final. */
    children?: React.ReactNode;
}

/**
 * Detalle «Asistencia» del Inicio, variante «Por urgencia» (dueño 2026-10-20, elegida en el lienzo de
 * bocetos): primero lo que exige acción (reiterados del Art. 160 con su mes en una tira; los cuatro
 * números clave del boceto se quitaron porque repetían la tarjeta, dueño 2026-10-20), luego el día de hoy (ausentes por motivo y obras sin guardar) junto a lo que viene en 14 días,
 * después el mes para remuneraciones (descuentos y horas extra, según permisos) y al final tendencia y obras.
 */
const DetalleAsistencia: React.FC<Props> = ({
    faltas, ausentes, obras, mesNombre, anio, mes, hoyDia, cargando, mesExtra, cargandoMes, verMes, onTrabajador, onAsistencia, children,
}) => {
    const reiterados = faltas ? ordenarReiterados(faltas.lista) : [];
    const grupos = ausentes ? gruposAusentes(ausentes) : [];

    if (cargando) return <div className={CARD}><SkeletonText lines={6} /></div>;

    return (
        <div className="space-y-8">
            <section id={ID_SECCION.reiterados} className="scroll-mt-6 space-y-3" aria-labelledby={`${ID_SECCION.reiterados}-t`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 id={`${ID_SECCION.reiterados}-t`} className={ROTULO}>Requiere acción · faltas reiteradas de {mesNombre}</h3>
                    <span className="text-xs text-muted-foreground">Art. 160 N°3: 2 días seguidos, 2 lunes o 3 días en el mes</span>
                </div>
                {reiterados.length === 0 ? (
                    <p className={cn(CARD, 'text-sm text-muted-foreground')}>Nadie con faltas reiteradas en {mesNombre}.</p>
                ) : (
                    <FichasReiterados lista={reiterados} onTrabajador={onTrabajador} anio={anio} mes={mes} hoyDia={hoyDia}
                        hoyIso={`${anio}-${String(mes).padStart(2, '0')}-${String(hoyDia).padStart(2, '0')}`} />
                )}
                {faltas && faltas.reiterados > faltas.lista.length && (
                    <p className="text-xs text-muted-foreground">
                        Mostrando {faltas.lista.length} de {faltas.reiterados}. El resto, en Asistencia.
                    </p>
                )}
                {mesExtra?.patronFinde && <PatronFinde datos={mesExtra.patronFinde} onTrabajador={onTrabajador} />}
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <section id={ID_SECCION.hoy} className="min-w-0 scroll-mt-6 space-y-3" aria-labelledby={`${ID_SECCION.hoy}-t`}>
                    <h3 id={`${ID_SECCION.hoy}-t`} className={ROTULO}>Hoy · ausentes por motivo</h3>
                    <div className={CARD}>
                        <div className="mb-4 flex items-baseline gap-2">
                            <NumeroRodante value={ausentes?.total ?? 0} className="text-4xl font-bold leading-none tracking-tight text-foreground" />
                            <span className="text-sm text-muted-foreground">{plural(ausentes?.total ?? 0, 'ausente', 'ausentes')} hoy</span>
                        </div>
                        {grupos.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nadie ha faltado hoy en las asistencias guardadas.</p>
                        ) : (
                            <>
                                <div role="img" aria-label={grupos.map(g => `${g.nombre} ${g.n}`).join(', ')}
                                    className="mb-2 flex h-3 gap-0.5 overflow-hidden rounded-full">
                                    {grupos.map(g => <span key={g.codigo} className={colorEstado(g.codigo)} style={{ width: g.ancho }} />)}
                                </div>
                                <ul>
                                    {grupos.map(g => (
                                        <li key={g.codigo} className="flex items-start gap-3 border-t border-border py-2.5 first:border-t-0">
                                            <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-[3px]', colorEstado(g.codigo))} aria-hidden />
                                            <span className="w-36 shrink-0 text-sm font-semibold">{g.nombre}</span>
                                            <span className="min-w-0 flex-1 text-section text-muted-foreground"
                                                title={g.personas.map(p => `${p.apellido_paterno} ${p.nombres}${p.obra ? ` (${p.obra})` : ''}`).join(', ')}>
                                                <span className="line-clamp-2">{g.personas.map(p => `${p.apellido_paterno} ${p.nombres.split(' ')[0]}`).join(', ')}</span>
                                            </span>
                                            <span className="text-base font-bold tabular-nums">{g.n}</span>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>
                    {obras && obras.total > 0 && !obras.finDeSemana && obras.sinGuardar.length > 0 && (
                        <div className={CARD}>
                            <AsistenciaPendiente sinGuardar={obras.sinGuardar} total={obras.total} onNavigate={onAsistencia} />
                        </div>
                    )}
                </section>

                {(cargandoMes || mesExtra?.proximos) && (
                    <section className="min-w-0 space-y-3" aria-labelledby="inicio-asistencia-proximos-t">
                        <h3 id="inicio-asistencia-proximos-t" className={ROTULO}>Próximos 14 días</h3>
                        {mesExtra?.proximos
                            ? <ProximosDias datos={mesExtra.proximos} hoy={mesExtra.hoy} />
                            : <div className={CARD}><SkeletonText lines={5} /></div>}
                    </section>
                )}
            </div>

            {((cargandoMes && !mesExtra && verMes) || mesExtra?.descuentos || mesExtra?.horasExtra) && (
                <section className="space-y-3" aria-labelledby="inicio-asistencia-mes-t">
                    <h3 id="inicio-asistencia-mes-t" className={ROTULO}>{`Este mes · ${mesNombre}`}</h3>
                    {cargandoMes && !mesExtra ? (
                        <div className={CARD}><SkeletonText lines={6} /></div>
                    ) : (
                        <div className={cn('grid grid-cols-1 gap-6',
                            mesExtra?.descuentos && mesExtra?.horasExtra && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]')}>
                            {mesExtra?.descuentos && (
                                <DescuentosMes datos={mesExtra.descuentos} onTrabajador={onTrabajador} onAsistencia={onAsistencia} />
                            )}
                            {mesExtra?.horasExtra && <HorasExtraObras datos={mesExtra.horasExtra} mesNombre={mesNombre} />}
                        </div>
                    )}
                </section>
            )}

            {(mesExtra?.tendencia || mesExtra?.faltasObra || cargandoMes || children) && (
                <section className="space-y-3" aria-labelledby="inicio-asistencia-tendencia-t">
                    <h3 id="inicio-asistencia-tendencia-t" className={ROTULO}>Tendencia y obras</h3>
                    {cargandoMes && !mesExtra ? (
                        <div className={CARD}><SkeletonText lines={6} /></div>
                    ) : (mesExtra?.tendencia || mesExtra?.faltasObra) && (
                        <div className={cn('grid grid-cols-1 gap-6',
                            mesExtra?.tendencia && mesExtra?.faltasObra && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]')}>
                            {mesExtra?.tendencia && <TendenciaMeses meses={mesExtra.tendencia} />}
                            {mesExtra?.faltasObra && <FaltasPorObra obras={mesExtra.faltasObra} mesNombre={mesNombre} />}
                        </div>
                    )}
                    {children}
                </section>
            )}
        </div>
    );
};

export default DetalleAsistencia;
