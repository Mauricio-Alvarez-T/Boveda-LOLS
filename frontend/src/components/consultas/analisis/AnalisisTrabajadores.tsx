/**
 * Gestiones → «Análisis» (pedido RR.HH. 2026-11-27, mig 163): tablero de trabajadores tipo Power BI.
 * Filtros arriba (rango de meses + empresa, obra, cargo, categoría), pestañas Dotación · Rotación ·
 * Asistencia · Perfil y papeles · Costos (esta solo con «Ver sueldos por cargo»), KPIs y gráficos, «ir al
 * detalle» hacia la grilla de Trabajadores y Excel de la pestaña visible.
 * Reglas: docs/reglas/rrhh-trabajadores.md § Análisis de trabajadores.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, Download, RotateCcw } from 'lucide-react';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { cn } from '../../../utils/cn';
import { hoyChile } from '../../../utils/fechaChile';
import { fmtMoney } from '../../../utils/format';
import { useAparecer } from '../../../hooks/useAparecer';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { PestanasElasticas } from '../../ui/PestanasElasticas';
import { BarraPaginada } from '../../ui/BarraPaginada';
import { Cargando, Skeleton } from '../../ui/Skeleton';
import { toast } from 'sonner';
import {
    PESTANAS, RANGOS, destinoGrilla, etiquetaCategoria, filtrosActivos, filtrosIniciales, fmtDuracion, fmtNum, fmtPct,
    mesCorto, paramsApi, rangoActivo, sumarMeses, rangoRapido, tablasDe, textoRango,
    type AsistenciaApi, type CostosApi, type DatosPorPestana, type Dimension, type DotacionApi, type FiltrosAnalisis,
    type Grupo, type GrupoCosto, type PerfilApi, type PestanaAnalisis, type RotacionApi, type Tabla,
} from './analisis';
import { BarrasH, FilaKpis, Kpi, SerieMeses, Tarjeta, type Barra, type TablaVista } from './graficos';

interface Opcion { value: string | number; label: string }

interface Props {
    obras: Opcion[];
    empresas: Opcion[];
    cargos: Opcion[];
    /** Abre la grilla de Trabajadores con esos filtros (mismo camino que los atajos de la portada). */
    onVerTrabajadores: (params: Record<string, string>) => void;
}

const CATEGORIAS: Opcion[] = [
    { value: 'obra', label: 'Obra' }, { value: 'operaciones', label: 'Operaciones' }, { value: 'rotativo', label: 'Rotativo' },
];

const CLASE_CAMPO = 'h-10 w-full min-w-0 rounded-xl border border-input bg-card px-3 text-ui text-brand-dark focus:outline-none focus:ring-2 focus:ring-ring';

const aBarras = (xs: Grupo[]): Barra[] => xs.map(g => ({ id: g.id, etiqueta: g.etiqueta, valor: g.n, nota: g.finalizada ? 'Obra finalizada' : undefined }));
const aBarrasCosto = (xs: GrupoCosto[]): Barra[] => xs.map(g => ({ id: g.id, etiqueta: g.etiqueta, valor: g.monto, nota: `${fmtNum(g.trabajadores)} trabajadores` }));
const vista = (t: Tabla | undefined, formato?: TablaVista['formato']): TablaVista | undefined =>
    (t ? { columnas: t.columnas.map((c, i) => c || (i === 0 ? t.nombre : '')), filas: t.filas, formato } : undefined);

export const AnalisisTrabajadores: React.FC<Props> = ({ obras, empresas, cargos, onVerTrabajadores }) => {
    const { hasPermission } = useAuth();
    const verCostos = hasPermission('cargos.sueldo.ver');
    const hoy = useMemo(() => hoyChile(), []);
    const [filtros, setFiltros] = useState<FiltrosAnalisis>(() => filtrosIniciales(hoy));
    const [pestana, setPestana] = useState<PestanaAnalisis>('dotacion');
    const [cache, setCache] = useState<Record<string, unknown>>({});
    const [error, setError] = useState<string | null>(null);
    const [exportando, setExportando] = useState(false);
    const pedido = useRef(0);

    const pestanas = useMemo(() => PESTANAS.filter(p => p.key !== 'costos' || verCostos), [verCostos]);
    const params = useMemo(() => paramsApi(filtros), [filtros]);
    const clave = `${pestana}|${JSON.stringify(params)}`;
    const datos = cache[clave] as DatosPorPestana[PestanaAnalisis] | undefined;
    const cargando = !datos && !error;
    const aparecer = useAparecer(cargando);

    const cargar = useCallback(async () => {
        const id = ++pedido.current;
        setError(null);
        try {
            const r = await api.get<{ data: unknown }>(`/analisis-trabajadores/${pestana}`, { params });
            if (id === pedido.current) setCache(c => ({ ...c, [clave]: r.data.data }));
        } catch (e) {
            if (id !== pedido.current) return;
            const status = (e as { response?: { status?: number } })?.response?.status;
            setError(status === 403
                ? 'Tu sesión no tiene este permiso. Si te lo acaban de dar, cierra sesión y vuelve a entrar.'
                : 'No se pudo cargar el análisis. Revisa tu conexión e inténtalo otra vez.');
        }
    }, [pestana, params, clave]);

    useEffect(() => { if (!cache[clave]) cargar(); }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps -- solo al cambiar filtros o pestaña; el caché evita recargar

    const cambiar = (patch: Partial<FiltrosAnalisis>) => setFiltros(f => {
        const n = { ...f, ...patch };
        if (n.desde > n.hasta) { if (patch.desde) n.hasta = n.desde; else n.desde = n.hasta; }
        return n;
    });
    const rango = rangoActivo(filtros, hoy);
    const textoFiltros = useMemo(() => {
        const nombre = (ops: Opcion[], v: string) => ops.find(o => String(o.value) === v)?.label ?? `#${v}`;
        return [
            textoRango(filtros.desde, filtros.hasta),
            filtros.empresa_id && `Empresa: ${nombre(empresas, filtros.empresa_id)}`,
            filtros.obra_id && `Obra: ${nombre(obras, filtros.obra_id)}`,
            filtros.cargo_id && `Cargo: ${nombre(cargos, filtros.cargo_id)}`,
            filtros.categoria && `Categoría: ${etiquetaCategoria(filtros.categoria)}`,
        ].filter(Boolean).join(' · ');
    }, [filtros, obras, empresas, cargos]);

    /** Ir a la grilla: los filtros del análisis (empresa/obra/cargo/categoría) viajan con la barra elegida. */
    const ver = useCallback((extra: Record<string, string> | null) => {
        if (!extra) return;
        const base: Record<string, string> = {};
        if (filtros.empresa_id) base.empresa_id = filtros.empresa_id;
        if (filtros.obra_id) base.obra_id = filtros.obra_id;
        if (filtros.cargo_id) base.cargo_id = filtros.cargo_id;
        if (filtros.categoria) base.categoria = filtros.categoria;
        onVerTrabajadores({ ...base, ...extra });
    }, [filtros, onVerTrabajadores]);
    const verDim = (dim: Dimension, salidas = false) => (b: Barra) =>
        ver(destinoGrilla(dim, b.id ?? null, salidas ? { salidas: { desde: filtros.desde + '-01', hasta: hoyFin(filtros.hasta, hoy) } } : {}));

    const exportar = async () => {
        if (!datos) return;
        setExportando(true);
        try {
            const { descargarExcelAnalisis } = await import('./excelAnalisis');
            const titulo = `Análisis de trabajadores · ${PESTANAS.find(p => p.key === pestana)?.label}`;
            await descargarExcelAnalisis(tablasDe(pestana, datos as never), {
                titulo,
                subtitulo: `${textoFiltros} · Generado el ${new Date().toLocaleString('es-CL')}${pestana === 'costos' ? ' · Montos ESTIMADOS por sueldo del cargo' : ''}`,
                archivo: `Analisis_${pestana}_${filtros.desde}_${filtros.hasta}`,
            });
        } catch {
            toast.error('No se pudo generar el Excel');
        } finally {
            setExportando(false);
        }
    };

    return (
        <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 pb-8">
                {/* Filtros */}
                <section aria-label="Filtros del análisis" className="rounded-3xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center gap-2">
                        {RANGOS.map(r => (
                            <Button key={r.key} size="sm" variant={rango === r.key ? 'primary' : 'glass'} aria-pressed={rango === r.key}
                                onClick={() => cambiar(rangoRapido(r.key, hoy))}>{r.label}</Button>
                        ))}
                        {/* En el celular desde/hasta van en su propia fila y se reparten el ancho (a 360 px no caben fijos). */}
                        <div className="flex w-full items-center gap-2 sm:w-auto">
                            <label className="sr-only" htmlFor="an-desde">Desde</label>
                            <input id="an-desde" type="month" value={filtros.desde} max={filtros.hasta}
                                onChange={e => e.target.value && cambiar({ desde: e.target.value })} className={cn(CLASE_CAMPO, 'h-9 flex-1 sm:w-[11.5rem] sm:flex-none')} />
                            <span className="text-caption text-muted-foreground">a</span>
                            <label className="sr-only" htmlFor="an-hasta">Hasta</label>
                            <input id="an-hasta" type="month" value={filtros.hasta} max={hoy.slice(0, 7)}
                                onChange={e => e.target.value && cambiar({ hasta: e.target.value })} className={cn(CLASE_CAMPO, 'h-9 flex-1 sm:w-[11.5rem] sm:flex-none')} />
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            {filtrosActivos(filtros) > 0 && (
                                <Button size="sm" variant="ghost" leftIcon={<RotateCcw className="h-4 w-4" />}
                                    onClick={() => cambiar({ empresa_id: '', obra_id: '', cargo_id: '', categoria: '' })}>Limpiar</Button>
                            )}
                            <Button size="sm" variant="glass" leftIcon={<Download className="h-4 w-4" />} isLoading={exportando}
                                disabled={!datos} onClick={exportar} title="Excel con las tablas de esta pestaña y los filtros usados">Excel</Button>
                        </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                        <SelectFiltro id="an-empresa" label="Empresa" value={filtros.empresa_id} opciones={empresas} todas="Todas las empresas" onChange={v => cambiar({ empresa_id: v })} />
                        <SelectFiltro id="an-obra" label="Obra" value={filtros.obra_id} opciones={obras} todas="Todas las obras" onChange={v => cambiar({ obra_id: v })} />
                        <SelectFiltro id="an-cargo" label="Cargo" value={filtros.cargo_id} opciones={cargos} todas="Todos los cargos" onChange={v => cambiar({ cargo_id: v })} />
                        <SelectFiltro id="an-categoria" label="Categoría" value={filtros.categoria} opciones={CATEGORIAS} todas="Todas las categorías" onChange={v => cambiar({ categoria: v })} />
                    </div>
                </section>

                {/* Pestañas */}
                <div className="flex max-w-full min-w-0 items-center self-start rounded-2xl bg-muted p-1">
                    <BarraPaginada fondo="muted">{p => (
                        <PestanasElasticas
                            opciones={pestanas}
                            activa={pestana}
                            onCambiar={setPestana}
                            aria-label="Tema del análisis"
                            claseFila="gap-1"
                            claseOpcion="flex h-9 shrink-0 items-center justify-center rounded-xl px-3 text-section font-semibold whitespace-nowrap"
                            claseInactiva="text-muted-foreground hover:text-brand-dark"
                            estiloOpcion={p.estiloOpcion}
                            revelar={p.revelar}
                            render={o => o.label}
                        />
                    )}</BarraPaginada>
                </div>

                {error ? (
                    <EmptyState icon={AlertTriangle} title="No se pudo cargar" description={error}
                        action={<Button variant="glass" onClick={cargar}>Reintentar</Button>} />
                ) : cargando ? (
                    <Cargando que="el análisis" className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
                        </div>
                        <Skeleton className="h-72 rounded-3xl" />
                        <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-64 rounded-3xl" /><Skeleton className="h-64 rounded-3xl" /></div>
                    </Cargando>
                ) : datos ? (
                    <div className={cn('flex flex-col gap-4', aparecer)}>
                        {pestana === 'dotacion' && <PanelDotacion d={datos as DotacionApi} verDim={verDim} ver={ver} />}
                        {pestana === 'rotacion' && <PanelRotacion d={datos as RotacionApi} verDim={verDim} ver={ver} filtros={filtros} hoy={hoy} />}
                        {pestana === 'asistencia' && <PanelAsistencia d={datos as AsistenciaApi} verDim={verDim} />}
                        {pestana === 'perfil' && <PanelPerfil d={datos as PerfilApi} ver={ver} />}
                        {pestana === 'costos' && verCostos && <PanelCostos d={datos as CostosApi} verDim={verDim} />}
                    </div>
                ) : (
                    <EmptyState icon={BarChart3} title="Sin datos" />
                )}
            </div>
        </div>
    );
};

/** Último día del mes `hasta` (o hoy si es el mes en curso), para el filtro de salidas de la grilla. */
function hoyFin(hasta: string, hoy: string): string {
    if (hasta === hoy.slice(0, 7)) return hoy;
    const [y, m] = hasta.split('-').map(Number);
    return `${hasta}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

const SelectFiltro: React.FC<{ id: string; label: string; value: string; opciones: Opcion[]; todas: string; onChange: (v: string) => void }> = ({ id, label, value, opciones, todas, onChange }) => (
    <div className="min-w-0">
        <label htmlFor={id} className="mb-1 block text-caption font-semibold text-muted-foreground">{label}</label>
        <select id={id} value={value} onChange={e => onChange(e.target.value)} className={CLASE_CAMPO}>
            <option value="">{todas}</option>
            {/* Los catálogos de Gestiones traen su propio «Todas las …» con valor vacío: no repetirlo. */}
            {opciones.filter(o => String(o.value) !== '').map(o => <option key={o.value} value={String(o.value)}>{o.label}</option>)}
        </select>
    </div>
);

type VerDim = (dim: Dimension, salidas?: boolean) => (b: Barra) => void;
type Ver = (extra: Record<string, string> | null) => void;
const Rejilla: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="grid gap-4 md:grid-cols-2">{children}</div>;
const signo = (n: number) => (n > 0 ? `+${fmtNum(n)}` : fmtNum(n));

// ─── Dotación ───

const PanelDotacion: React.FC<{ d: DotacionApi; verDim: VerDim; ver: Ver }> = ({ d, verDim, ver }) => {
    const t = tablasDe('dotacion', d);
    const ingresos = d.serie.reduce((s, m) => s + m.ingresos, 0);
    const reingresos = d.serie.reduce((s, m) => s + m.reingresos, 0);
    const cambio = d.variacion.hasta - d.variacion.desde;
    return (<>
        <FilaKpis>
            <Kpi label="Activos hoy" n={d.activos} onVer={() => ver({ activo: 'true' })} />
            <Kpi label="Cambio en el rango" texto={signo(cambio)}
                detalle={`${fmtNum(d.variacion.desde)} al cierre de ${mesCorto(sumarMeses(d.filtros.desde, -1))} → ${fmtNum(d.variacion.hasta)} ${d.serie[d.serie.length - 1]?.parcial ? 'hoy' : `al cierre de ${mesCorto(d.filtros.hasta)}`}`} />
            <Kpi label="Ingresos del rango" n={ingresos} detalle={reingresos ? `${fmtNum(reingresos)} fueron reingresos` : 'Ninguno fue reingreso'} />
            <Kpi label="En obra finalizada" n={d.en_obra_finalizada} tono="aviso" detalle="Activos cuya obra ya cerró" />
        </FilaKpis>
        <Tarjeta titulo="Dotación al cierre de cada mes" subtitulo="Personas con contrato vigente el último día del mes (el mes en curso, a hoy)." tabla={vista(t[0])}>
            <SerieMeses datos={d.serie} series={[{ clave: 'dotacion', nombre: 'Dotación', tipo: 'linea' }]} />
        </Tarjeta>
        <Rejilla>
            <Tarjeta titulo="Activos por obra" subtitulo="Clic en una barra para ver a esas personas.">
                <BarrasH datos={aBarras(d.por_obra)} onElegir={verDim('obra')} />
            </Tarjeta>
            <Tarjeta titulo="Activos por cargo">
                <BarrasH datos={aBarras(d.por_cargo)} onElegir={verDim('cargo')} />
            </Tarjeta>
            <Tarjeta titulo="Activos por empresa">
                <BarrasH datos={aBarras(d.por_empresa)} onElegir={verDim('empresa')} />
            </Tarjeta>
            <Tarjeta titulo="Activos por categoría">
                <BarrasH datos={aBarras(d.por_categoria).map(b => ({ ...b, etiqueta: etiquetaCategoria(b.etiqueta) }))} onElegir={verDim('categoria')} />
            </Tarjeta>
        </Rejilla>
    </>);
};

// ─── Rotación ───

const PanelRotacion: React.FC<{ d: RotacionApi; verDim: VerDim; ver: Ver; filtros: FiltrosAnalisis; hoy: string }> = ({ d, verDim, ver, filtros, hoy }) => {
    const t = tablasDe('rotacion', d);
    const salidasRango = { activo: '', salida_desde: `${filtros.desde}-01`, salida_hasta: hoyFin(filtros.hasta, hoy) };
    return (<>
        <FilaKpis>
            <Kpi label="Ingresos" n={d.ingresos} detalle={d.reingresos ? `${fmtNum(d.reingresos)} reingresos` : 'Sin reingresos'} />
            <Kpi label="Salidas" n={d.salidas} onVer={() => ver(salidasRango)} />
            <Kpi label="Rotación del rango" texto={fmtPct(d.tasa_rango)} detalle="Salidas ÷ dotación promedio" />
            <Kpi label="Permanencia (mediana)" texto={fmtDuracion(d.permanencia.mediana_dias)}
                detalle={d.permanencia.con_dato ? `Promedio ${fmtDuracion(d.permanencia.promedio_dias)} · ${fmtNum(d.permanencia.con_dato)} salidas` : 'Sin salidas con fecha de ingreso'} />
            <Kpi label="Se fueron antes de 30 días" n={d.salidas_antes_30} tono="aviso" detalle={`${fmtNum(d.salidas_antes_90)} antes de 90 días`} />
            <Kpi label="Marcados «No recontratar»" n={d.no_recontratar} onVer={d.no_recontratar ? () => ver({ ...salidasRango, no_recontratar: 'true' }) : undefined} />
            <Kpi label="Ya volvieron" n={d.volvieron} detalle="Salidas del rango que luego reingresaron" />
        </FilaKpis>
        <Tarjeta titulo="Ingresos y salidas por mes" subtitulo="Un reingreso cuenta como ingreso." tabla={vista(t[0], (v, c) => (c === 5 ? fmtPct(v as number | null) : typeof v === 'number' ? fmtNum(v) : String(v ?? '—')))}>
            <SerieMeses datos={d.serie} series={[
                { clave: 'ingresos', nombre: 'Ingresos', tipo: 'barra' },
                { clave: 'salidas', nombre: 'Salidas', tipo: 'barra' },
            ]} />
        </Tarjeta>
        <Tarjeta titulo="Rotación mensual" subtitulo="Salidas del mes ÷ dotación promedio del mes.">
            <SerieMeses datos={d.serie.map(m => ({ ...m, tasa: m.tasa ?? 0 }))} series={[{ clave: 'tasa', nombre: 'Rotación', tipo: 'linea' }]}
                formato={n => fmtPct(n)} alto={200} />
        </Tarjeta>
        <Rejilla>
            <Tarjeta titulo="Causales de salida">
                <BarrasH datos={d.causales.map(c => ({ etiqueta: c.etiqueta, valor: c.n }))} />
            </Tarjeta>
            <Tarjeta titulo="Salidas por obra" subtitulo="Obra donde estaba al irse.">
                <BarrasH datos={aBarras(d.por_obra)} onElegir={verDim('obra', true)} />
            </Tarjeta>
            <Tarjeta titulo="Salidas por cargo">
                <BarrasH datos={aBarras(d.por_cargo)} onElegir={verDim('cargo', true)} />
            </Tarjeta>
            <Tarjeta titulo="Salidas por empresa">
                <BarrasH datos={aBarras(d.por_empresa)} onElegir={verDim('empresa', true)} />
            </Tarjeta>
        </Rejilla>
    </>);
};

// ─── Asistencia ───

const PanelAsistencia: React.FC<{ d: AsistenciaApi; verDim: VerDim }> = ({ d, verDim }) => {
    const t = tablasDe('asistencia', d);
    const pct = (xs: AsistenciaApi['por_obra']): Barra[] => xs
        .filter(x => x.registros > 0)
        .map(x => ({ id: x.id, etiqueta: x.etiqueta, valor: x.ausentismo ?? 0, nota: `${fmtNum(x.ausencias)} ausencias · ${fmtNum(x.faltas)} faltas de ${fmtNum(x.registros)} días` }));
    return (<>
        <FilaKpis>
            <Kpi label="Ausentismo" texto={fmtPct(d.ausentismo)} detalle={`${fmtNum(d.ausencias)} ausencias en ${fmtNum(d.registros)} días`} />
            <Kpi label="Faltas" n={d.faltas} tono="aviso" detalle="Días marcados F (lun. a vie.)" />
            <Kpi label="Días registrados" n={d.registros} detalle="Lunes a viernes" />
            {d.horas_extra
                ? <Kpi label="Horas extra" texto={fmtNum(d.horas_extra.total)} detalle="Suma del rango" />
                : <Kpi label="Estados distintos" n={d.estados.length} />}
        </FilaKpis>
        <Tarjeta titulo="Ausentismo por mes" subtitulo="Ausencias (todo lo que no es presente, salvo vacaciones) ÷ días registrados de lunes a viernes."
            tabla={vista(t[0], (v, c) => (c === 4 ? fmtPct(v as number | null) : typeof v === 'number' ? fmtNum(v) : String(v ?? '—')))}>
            <SerieMeses datos={d.serie.map(m => ({ ...m, ausentismo: m.ausentismo ?? 0 }))} series={[{ clave: 'ausentismo', nombre: 'Ausentismo', tipo: 'linea' }]}
                formato={n => fmtPct(n)} alto={220} />
        </Tarjeta>
        <Rejilla>
            <Tarjeta titulo="Días por estado">
                <BarrasH datos={d.estados.map(e => ({ etiqueta: `${e.codigo} · ${e.nombre}`, valor: e.n }))} />
            </Tarjeta>
            <Tarjeta titulo="Más faltas en el rango" subtitulo="Las 10 personas con más días F.">
                {d.top_faltas.length ? (
                    <ol className="divide-y divide-border">
                        {d.top_faltas.map((p, i) => (
                            <li key={p.trabajador_id} className="flex items-center justify-between gap-3 py-2 text-ui">
                                <span className="min-w-0 truncate text-brand-dark"><span className="mr-2 tabular-nums text-muted-foreground">{i + 1}.</span>{p.nombre}</span>
                                <span className="shrink-0 font-semibold tabular-nums">{fmtNum(p.faltas)}</span>
                            </li>
                        ))}
                    </ol>
                ) : <p className="py-8 text-center text-caption text-muted-foreground">Nadie con faltas en el rango</p>}
            </Tarjeta>
            <Tarjeta titulo="Ausentismo por obra" subtitulo="Clic para ver a los activos de esa obra.">
                <BarrasH datos={pct(d.por_obra)} formato={n => fmtPct(n)} onElegir={verDim('obra')} />
            </Tarjeta>
            <Tarjeta titulo="Ausentismo por cargo">
                <BarrasH datos={pct(d.por_cargo)} formato={n => fmtPct(n)} onElegir={verDim('cargo')} />
            </Tarjeta>
        </Rejilla>
        {d.horas_extra && (
            <Rejilla>
                <Tarjeta titulo="Horas extra por mes">
                    <SerieMeses datos={d.horas_extra.serie} series={[{ clave: 'horas', nombre: 'Horas extra', tipo: 'barra' }]} alto={200} />
                </Tarjeta>
                <Tarjeta titulo="Horas extra por obra">
                    <BarrasH datos={aBarras(d.horas_extra.por_obra)} />
                </Tarjeta>
            </Rejilla>
        )}
    </>);
};

// ─── Perfil y papeles ───

const PanelPerfil: React.FC<{ d: PerfilApi; ver: Ver }> = ({ d, ver }) => {
    const barras = (xs: { etiqueta: string; n: number }[]): Barra[] => xs.map(x => ({ etiqueta: x.etiqueta, valor: x.n }));
    const sol = d.solicitudes;
    return (<>
        <p className="text-caption text-muted-foreground">
            Solo cifras de los {fmtNum(d.activos)} activos con estos filtros: este apartado no muestra nombres ni datos personales.
        </p>
        <FilaKpis>
            <Kpi label="Sin datos del contrato" n={d.fichas_incompletas.contrato} tono="aviso" onVer={() => ver({ activo: 'true', falta_dato: 'contrato' })} />
            <Kpi label="Sin datos de pago" n={d.fichas_incompletas.pago} tono="aviso" onVer={() => ver({ activo: 'true', falta_dato: 'pago' })} />
            <Kpi label="Sin tallas" n={d.fichas_incompletas.tallas} tono="aviso" onVer={() => ver({ activo: 'true', falta_dato: 'tallas' })} />
            <Kpi label="Documentos vencidos" n={d.documentos.vencidos} tono="aviso" onVer={() => ver({ activo: 'true', doc_vigencia: 'vencido' })} />
            <Kpi label={`Vencen en ${d.documentos.dias_por_vencer} días`} n={d.documentos.por_vencer} onVer={() => ver({ activo: 'true', doc_vigencia: '30' })} />
            <Kpi label="Contratos a plazo por vencer" n={d.contratos_vencen} detalle="Terminan en los próximos 30 días" />
            <Kpi label="Solicitudes de ingreso" n={sol.total}
                detalle={`${fmtNum(sol.aprobada)} aprobadas · ${fmtNum(sol.rechazada)} rechazadas · ${fmtNum(sol.pendiente)} pendientes`} />
            <Kpi label="Tiempo hasta aprobar" texto={sol.horas_aprobacion == null ? '—' : sol.horas_aprobacion < 48 ? `${fmtNum(sol.horas_aprobacion)} h` : `${fmtNum(Math.round(sol.horas_aprobacion / 24))} días`}
                detalle="Promedio de las aprobadas en el rango" />
        </FilaKpis>
        <Tarjeta titulo="Documentos obligatorios completos por obra" subtitulo={`Activos con los ${fmtNum(d.documentos.obligatorios)} tipos obligatorios cargados. Clic para ver a quién le falta.`}>
            <BarrasH datos={d.documentos.por_obra.map(o => ({ id: o.id, etiqueta: o.etiqueta, valor: o.porcentaje ?? 0, nota: `${fmtNum(o.completos)} de ${fmtNum(o.trabajadores)}` }))}
                formato={n => fmtPct(n)} onElegir={b => ver(b.id == null ? null : { activo: 'true', obra_id: String(b.id), completitud: 'faltantes' })} />
        </Tarjeta>
        <Rejilla>
            <Tarjeta titulo="Edad"><BarrasH datos={barras(d.edad)} /></Tarjeta>
            <Tarjeta titulo="Antigüedad en el contrato actual"><BarrasH datos={barras(d.antiguedad)} /></Tarjeta>
            <Tarjeta titulo="Nacionalidad"><BarrasH datos={barras(d.nacionalidad)} /></Tarjeta>
            <Tarjeta titulo="Comuna" subtitulo="Las 10 con más trabajadores."><BarrasH datos={barras(d.comunas)} /></Tarjeta>
            <Tarjeta titulo="AFP"><BarrasH datos={barras(d.afp)} /></Tarjeta>
            <Tarjeta titulo="Salud"><BarrasH datos={barras(d.salud)} /></Tarjeta>
            <Tarjeta titulo="Estado civil"><BarrasH datos={barras(d.estado_civil)} /></Tarjeta>
            <Tarjeta titulo="Cargas familiares"><BarrasH datos={barras(d.cargas)} /></Tarjeta>
        </Rejilla>
    </>);
};

// ─── Costos (estimado) ───

const PanelCostos: React.FC<{ d: CostosApi; verDim: VerDim }> = ({ d, verDim }) => (<>
    <div className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-caption text-brand-dark">
        <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p><strong>Estimado mensual</strong>: sueldo base + colación + movilización del cargo × trabajadores activos hoy. No es la liquidación
            (no incluye horas extra, bonos personales ni leyes sociales). El rango de meses no cambia esta cifra.</p>
    </div>
    <FilaKpis>
        <Kpi label="Costo mensual estimado" texto={fmtMoney(d.total_mensual)} detalle={`Solo sueldos base: ${fmtMoney(d.sueldo_base_total)}`} />
        <Kpi label="Promedio por trabajador" texto={d.promedio_por_trabajador == null ? '—' : fmtMoney(d.promedio_por_trabajador)} />
        <Kpi label="Con sueldo del cargo" n={d.trabajadores_con_sueldo} />
        <Kpi label="Sin sueldo cargado" n={d.sin_dato} tono="aviso" detalle="Su cargo no tiene sueldo en Configuración" />
    </FilaKpis>
    <Rejilla>
        <Tarjeta titulo="Por obra"><BarrasH datos={aBarrasCosto(d.por_obra)} formato={fmtMoney} margenDerecho={112} onElegir={verDim('obra')} /></Tarjeta>
        <Tarjeta titulo="Por cargo"><BarrasH datos={aBarrasCosto(d.por_cargo)} formato={fmtMoney} margenDerecho={112} onElegir={verDim('cargo')} /></Tarjeta>
        <Tarjeta titulo="Por empresa"><BarrasH datos={aBarrasCosto(d.por_empresa)} formato={fmtMoney} margenDerecho={112} onElegir={verDim('empresa')} /></Tarjeta>
        <Tarjeta titulo="Cargos sin sueldo cargado" subtitulo="Personas activas cuyo cargo no tiene sueldo: no entran al total.">
            <BarrasH datos={aBarras(d.cargos_sin_dato)} onElegir={verDim('cargo')} vacio="Todos los cargos tienen sueldo" />
        </Tarjeta>
    </Rejilla>
</>);

export default AnalisisTrabajadores;
