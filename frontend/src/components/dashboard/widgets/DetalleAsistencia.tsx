import React from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Chip } from '../../ui/Chip';
import { NumeroRodante } from '../../ui/NumeroRodante';
import { SkeletonText } from '../../ui/Skeleton';
import AsistenciaPendiente from './AsistenciaPendiente';
import { TiraMes } from './TiraMes';
import { DescuentosMes, HorasExtraObras, ProximosDias } from './DetalleAsistenciaMes';
import type { DetalleAsistenciaApi } from './resumenAsistenciaDetalle';
import { ordenarReiterados, reglasDe, REGLA_FALTA, type FaltasMesData } from './resumenFaltasMes';
import { colorEstado, contarEstado, gruposAusentes, ID_SECCION, type AusentesHoy, type ObrasHoy, type SeccionAsistencia } from './resumenAsistenciaHoy';

const CARD = 'rounded-3xl bg-card p-6 text-foreground shadow-[var(--shadow-md)]';
const ROTULO = 'text-label font-bold uppercase tracking-[0.08em] text-muted-foreground';
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

interface Kpi {
    etiqueta: string;
    valor: number;
    pie: string;
    tono: 'rojo' | 'ambar' | 'neutro';
    onClick: () => void;
}

const CIFRA_KPI: Record<Kpi['tono'], string> = {
    rojo: 'text-red-700 dark:text-red-300',
    ambar: 'text-amber-700 dark:text-amber-300',
    neutro: 'text-foreground',
};

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
 * bocetos): cuatro números clave, luego lo que exige acción (reiterados del Art. 160 con su mes en una
 * tira), luego el día de hoy (ausentes por motivo y obras sin guardar) junto a lo que viene en 14 días,
 * después el mes para remuneraciones (descuentos y horas extra, según permisos) y al final tendencia y obras.
 */
const DetalleAsistencia: React.FC<Props> = ({
    faltas, ausentes, obras, mesNombre, anio, mes, hoyDia, cargando, mesExtra, cargandoMes, verMes, onTrabajador, onAsistencia, children,
}) => {
    const reiterados = faltas ? ordenarReiterados(faltas.lista) : [];
    const graves = reiterados.filter(t => t.alertas.some(a => a.tipo === 'consecutivas')).length;
    const pendientesObras = obras && !obras.finDeSemana ? obras.sinGuardar.length : 0;
    const licencias = contarEstado(ausentes, 'LM');
    const grupos = ausentes ? gruposAusentes(ausentes) : [];
    const irA = (s: SeccionAsistencia) => document.getElementById(ID_SECCION[s])?.scrollIntoView({
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start',
    });

    const kpis: Kpi[] = [
        {
            etiqueta: 'Faltas reiteradas', valor: faltas?.reiterados ?? 0, tono: (faltas?.reiterados ?? 0) > 0 ? 'rojo' : 'neutro',
            pie: graves > 0 ? `${graves} con días seguidos` : `en ${mesNombre}`, onClick: () => irA('reiterados'),
        },
        {
            etiqueta: 'Ausentes hoy', valor: ausentes?.total ?? 0, tono: 'neutro',
            pie: grupos.length ? `${grupos.length} ${plural(grupos.length, 'motivo', 'motivos')}` : 'nadie ha faltado', onClick: () => irA('hoy'),
        },
        {
            etiqueta: 'Licencias médicas hoy', valor: licencias, tono: 'neutro',
            pie: licencias > 0 ? 'trabajadores con LM' : 'ninguna activa', onClick: () => irA('hoy'),
        },
        {
            etiqueta: 'Obras sin guardar hoy', valor: pendientesObras, tono: pendientesObras > 0 ? 'ambar' : 'neutro',
            pie: obras?.finDeSemana ? 'fin de semana' : obras ? `de ${obras.total} ${plural(obras.total, 'obra', 'obras')}` : '—',
            onClick: onAsistencia,
        },
    ];

    if (cargando) return <div className={CARD}><SkeletonText lines={6} /></div>;

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {kpis.map(k => (
                    // eslint-disable-next-line no-restricted-syntax -- tile del resumen (todo el bloque navega)
                    <button key={k.etiqueta} type="button" onClick={k.onClick}
                        className="flex flex-col gap-2 rounded-[20px] bg-card p-5 text-left shadow-[var(--shadow-sm)] transition-shadow duration-150 hover:shadow-[var(--shadow-md)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                        <span className="text-xs font-medium text-muted-foreground">{k.etiqueta}</span>
                        <NumeroRodante value={k.valor} className={cn('text-4xl font-bold leading-none tracking-tight', CIFRA_KPI[k.tono])} />
                        <span className="truncate text-xs text-muted-foreground">{k.pie}</span>
                    </button>
                ))}
            </div>

            <section id={ID_SECCION.reiterados} className="scroll-mt-6 space-y-3" aria-labelledby={`${ID_SECCION.reiterados}-t`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 id={`${ID_SECCION.reiterados}-t`} className={ROTULO}>Requiere acción · faltas reiteradas de {mesNombre}</h3>
                    <span className="text-xs text-muted-foreground">Art. 160 N°3: 2 días seguidos, 2 lunes o 3 días en el mes</span>
                </div>
                <div className="overflow-x-auto rounded-3xl bg-card shadow-[var(--shadow-md)]">
                    {reiterados.length === 0 ? (
                        <p className="p-6 text-sm text-muted-foreground">Nadie con faltas reiteradas en {mesNombre}.</p>
                    ) : (
                        <table className="w-full min-w-[820px] text-sm">
                            <thead>
                                <tr className="text-left text-label font-semibold uppercase tracking-wide text-muted-foreground">
                                    <th scope="col" className="px-6 py-3.5 font-semibold">Trabajador</th>
                                    <th scope="col" className="px-3 py-3.5 font-semibold">Obra</th>
                                    <th scope="col" className="px-3 py-3.5 font-semibold">Regla</th>
                                    <th scope="col" className="px-3 py-3.5 font-semibold capitalize">{mesNombre}</th>
                                    <th scope="col" className="px-3 py-3.5 text-right font-semibold">Faltas</th>
                                    <th scope="col" className="px-6 py-3.5"><span className="sr-only">Acción</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {reiterados.map(t => (
                                    <tr key={t.trabajador_id} className="border-t border-border transition-colors hover:bg-muted/40">
                                        <td className="px-6 py-3">
                                            <span className="block font-semibold">{t.apellido_paterno} {t.nombres}</span>
                                            <span className="block text-xs tabular-nums text-muted-foreground">{t.rut}</span>
                                        </td>
                                        <td className="px-3 py-3 text-section text-muted-foreground">{t.obra_nombre ?? '—'}</td>
                                        <td className="px-3 py-3">
                                            <span className="flex flex-wrap gap-1">
                                                {reglasDe(t).map(r => <Chip key={r} tone={REGLA_FALTA[r].grave ? 'danger' : 'warning'} label={REGLA_FALTA[r].texto} />)}
                                            </span>
                                        </td>
                                        <td className="w-60 px-3 py-3">
                                            <TiraMes fechas={t.fechas} anio={anio} mes={mes} hoyDia={hoyDia} tamano="md" />
                                        </td>
                                        <td className="px-3 py-3 text-right text-xl font-bold tabular-nums text-red-700 dark:text-red-300">{t.total_faltas}</td>
                                        <td className="whitespace-nowrap px-6 py-3 text-right">
                                            {/* eslint-disable-next-line no-restricted-syntax -- enlace de fila */}
                                            <button type="button" onClick={() => onTrabajador(t.rut)}
                                                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-1 text-section font-semibold text-green-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 dark:text-green-300">
                                                Ver en asistencia<ArrowRight className="h-3.5 w-3.5" aria-hidden />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    {faltas && faltas.reiterados > faltas.lista.length && (
                        <p className="border-t border-border px-6 py-3 text-xs text-muted-foreground">
                            Mostrando {faltas.lista.length} de {faltas.reiterados}. El resto, en Asistencia.
                        </p>
                    )}
                </div>
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

            {children && (
                <section className="space-y-3" aria-label="Tendencia y obras">
                    <h3 className={ROTULO}>Tendencia y obras</h3>
                    {children}
                </section>
            )}
        </div>
    );
};

export default DetalleAsistencia;
