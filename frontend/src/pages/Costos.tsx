import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Calculator, ChevronLeft, Building2, AlertTriangle, Plus, Sparkles, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useStandardHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { SearchBar } from '../components/ui/SearchBar';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { PestanasElasticas } from '../components/ui/PestanasElasticas';
import { BarraPaginada } from '../components/ui/BarraPaginada';
import { fmtMoney, fmtFechaCorta } from '../utils/format';
import api from '../services/api';
import { BarraAvance, PctGastado, Aviso } from '../components/costos/piezas';
import { mensajeError } from '../components/costos/costosConfig';
import { ResumenObra } from '../components/costos/ResumenObra';
import { PresupuestoObra } from '../components/costos/PresupuestoObra';
import { GastosObra, type FiltroGastos } from '../components/costos/GastosObra';
import { CobrosObra } from '../components/costos/CobrosObra';
import { CierreObra } from '../components/costos/CierreObra';
import { HistorialObra } from '../components/costos/HistorialObra';
import { GastoModal } from '../components/costos/GastoModal';
import { CobroModal } from '../components/costos/CobroModal';
import { PartidaModal } from '../components/costos/PartidaModal';
import { PorcentajesModal } from '../components/costos/PorcentajesModal';
import { ImportarExcelModal } from '../components/costos/ImportarExcelModal';
import { AgregarObraModal } from '../components/costos/AgregarObraModal';
import { FotoGastoViewer } from '../components/costos/FotoGastoViewer';
import { FlujoCaja } from '../components/costos/FlujoCaja';
import { CompararObras } from '../components/costos/CompararObras';
import { DetalleCostos, type VistaDetalle, type AccionesDetalle } from '../components/costos/DetalleCostos';
import type { CostoCategoria, CostoCobro, CostoDetalleObra, CostoGasto, CostoObraLista, CostoPartida } from '../types/entities';

/**
 * «Lo que viene» (prototipo con datos inventados para la reunión con Rodrigo) existe solo en test.
 * Import diferido detrás de la constante: en el build de producción la rama queda muerta y el
 * prototipo ni siquiera entra al paquete.
 */
const ES_STAGING = import.meta.env.VITE_ENTORNO === 'staging';
const PropuestaCostos = ES_STAGING ? lazy(() => import('../components/costos/propuesta/PropuestaCostos')) : null;

type Vista = 'obras' | 'flujo' | 'comparar';
const VISTAS: { key: Vista; label: string }[] = [
    { key: 'obras', label: 'Obras' },
    { key: 'flujo', label: 'Flujo de caja' },
    { key: 'comparar', label: 'Comparar obras' },
];

type Pestana = 'resumen' | 'presupuesto' | 'gastos' | 'cobros' | 'historial' | 'cierre';
const PESTANAS: { key: Pestana; label: string }[] = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'presupuesto', label: 'Presupuesto' },
    { key: 'gastos', label: 'Gastos' },
    { key: 'cobros', label: 'Cobros' },
    { key: 'historial', label: 'Historial' },
    { key: 'cierre', label: 'Cierre' },
];

type Modal =
    | { tipo: 'gasto'; gasto: CostoGasto | null; partidaInicial?: number | null; categoriaInicial?: CostoCategoria | null }
    | { tipo: 'foto'; gasto: CostoGasto }
    | { tipo: 'cobro'; cobro: CostoCobro | null }
    | { tipo: 'partida'; partida: CostoPartida | null; capituloInicial?: string }
    | { tipo: 'porcentajes' }
    | { tipo: 'importar' }
    | null;

const CLASE_TAB = 'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 font-medium whitespace-nowrap';
const CLASE_INACTIVA = 'text-muted-foreground hover:bg-background hover:text-brand-dark';

/**
 * Presupuestos y costos de obra (migs 122 y 123, docs/reglas/costos.md). Pedido de Rodrigo para
 * él, don Luis y el arquitecto: presupuesto por partidas, gastos con foto, cobros al mandante,
 * historial y cierre de cada obra; además el flujo de caja y la comparación por m² entre obras.
 * Permiso `costos.gestionar`.
 */
const CostosPage: React.FC = () => {
    const { hasPermission } = useAuth();
    const puede = hasPermission('costos.gestionar');
    const [params, setParams] = useSearchParams();
    const obraId = Number(params.get('obra')) || null;

    useStandardHeader({ title: 'Presupuestos y costos', icon: Calculator });

    if (!puede) {
        return <EmptyState icon={Calculator} title="Sin acceso" description="Presupuestos y costos es solo para quienes administran la plata de las obras." />;
    }

    if (PropuestaCostos && params.get('vista') === 'propuesta') {
        return (
            <Suspense fallback={<div className="h-96 rounded-card border border-border bg-card" />}>
                <PropuestaCostos onVolver={() => setParams({})} />
            </Suspense>
        );
    }

    if (obraId) return <ObraCostos key={obraId} obraId={obraId} params={params} setParams={setParams} />;

    const vistaParam = params.get('vista') as Vista | null;
    const vista: Vista = VISTAS.some(v => v.key === vistaParam) ? vistaParam! : 'obras';
    return (
        <Portada
            vista={vista}
            onVista={v => setParams(v === 'obras' ? {} : { vista: v }, { replace: true })}
            onAbrir={(id, tab, extra) => setParams({ obra: String(id), ...(tab ? { tab } : {}), ...(extra || {}) })}
            onPropuesta={ES_STAGING ? () => setParams({ vista: 'propuesta' }) : undefined}
        />
    );
};

// ─── Portada: obras, flujo de caja y comparación ─────────────────────────────

const Portada: React.FC<{
    vista: Vista;
    onVista: (v: Vista) => void;
    onAbrir: (id: number, tab?: Pestana, extra?: Record<string, string>) => void;
    onPropuesta?: () => void;
}> = ({ vista, onVista, onAbrir, onPropuesta }) => {
    const [obras, setObras] = useState<CostoObraLista[] | null>(null);

    useEffect(() => {
        api.get<{ data: CostoObraLista[] }>('/costos/obras')
            .then(res => setObras(res.data.data || []))
            .catch(() => { toast.error('No se pudieron cargar las obras'); setObras([]); });
    }, []);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center min-w-0">
                <div className="flex w-fit min-w-0 max-w-full rounded-2xl border border-border bg-card p-1">
                <BarraPaginada>{p => (
                    <PestanasElasticas estiloOpcion={p.estiloOpcion} revelar={p.revelar} opciones={VISTAS} activa={vista} onCambiar={onVista} aria-label="Presupuestos"
                        claseFila="gap-1" claseOpcion={CLASE_TAB} claseInactiva={CLASE_INACTIVA} render={o => o.label} />
                )}</BarraPaginada>
                </div>
            </div>
            {vista === 'obras' && <ListaObras obras={obras} onAbrir={id => onAbrir(id)} onPropuesta={onPropuesta} />}
            {vista === 'flujo' && (obras
                ? <FlujoCaja obras={obras} onIrObra={(id, tab) => onAbrir(id, tab, tab === 'gastos' ? { filtro: 'pagar' } : undefined)} />
                : <div className="h-96 rounded-card border border-border bg-card" />)}
            {vista === 'comparar' && <CompararObras onIrObra={id => onAbrir(id)} />}
        </div>
    );
};

const ListaObras: React.FC<{ obras: CostoObraLista[] | null; onAbrir: (id: number) => void; onPropuesta?: () => void }> = ({ obras, onAbrir, onPropuesta }) => {
    const [busqueda, setBusqueda] = useState('');
    const [agregando, setAgregando] = useState(false);

    const { enCurso, finalizadas } = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        const lista = (obras || []).filter(o => !q || o.obra_nombre.toLowerCase().includes(q));
        return { enCurso: lista.filter(o => !o.finalizada), finalizadas: lista.filter(o => o.finalizada) };
    }, [obras, busqueda]);

    if (!obras) {
        return (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map(i => <div key={i} className="h-40 rounded-card border border-border bg-card" />)}
            </div>
        );
    }
    const modalAgregar = agregando && <AgregarObraModal onClose={() => setAgregando(false)} onAgregada={onAbrir} />;
    const botonAgregar = (
        <Button onClick={() => setAgregando(true)} leftIcon={<Plus className="h-4 w-4" />} className="md:shrink-0">Agregar obra</Button>
    );
    // Solo en test: el prototipo de lo que viene, con datos inventados.
    const botonPropuesta = onPropuesta && (
        <Button variant="glass" onClick={onPropuesta} leftIcon={<Sparkles className="h-4 w-4" />} className="md:shrink-0">Lo que viene (ejemplo)</Button>
    );

    if (!obras.length) {
        return (
            <>
                <EmptyState icon={Building2} title="Todavía no hay obras en Presupuestos"
                    description="Agrega la obra a la que le vas a llevar presupuesto y gastos. Solo aparecen aquí las obras que se agregan."
                    action={<div className="flex flex-wrap justify-center gap-2">{botonAgregar}{botonPropuesta}</div>} />
                {modalAgregar}
            </>
        );
    }

    const tarjetas = (lista: CostoObraLista[]) => (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {lista.map(o => (
                // eslint-disable-next-line no-restricted-syntax -- tarjeta de obra (nombre, montos, avance y avisos); Button no soporta este layout
                <button key={o.obra_id} type="button" onClick={() => onAbrir(o.obra_id)}
                    className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-card p-4 text-left transition-colors hover:border-muted-foreground/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                    <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-base font-semibold text-brand-dark leading-snug">{o.obra_nombre}</span>
                        {o.finalizada && <Chip label="Finalizada" />}
                    </span>
                    {o.tiene_presupuesto ? (
                        <span className="flex flex-col gap-1.5">
                            <span className="flex items-baseline justify-between gap-2">
                                <span className="text-xs text-muted-foreground tabular-nums">{fmtMoney(o.gastado_neto) || '$0'} de {fmtMoney(o.costo_presupuestado)}</span>
                                <PctGastado presupuestado={o.costo_presupuestado} gastado={o.gastado_neto} />
                            </span>
                            <BarraAvance presupuestado={o.costo_presupuestado} gastado={o.gastado_neto} />
                        </span>
                    ) : (
                        <span className="text-xs text-muted-foreground">
                            Sin presupuesto cargado{o.gastos ? ` · ${fmtMoney(o.gastado_neto)} en ${o.gastos} gasto${o.gastos === 1 ? '' : 's'}` : ''}
                        </span>
                    )}
                    {(o.por_completar > 0 || o.por_pagar > 0) && (
                        <span className="flex flex-wrap gap-1.5">
                            {o.por_completar > 0 && <Chip tone="warning" icon={<AlertTriangle className="h-3 w-3" />} label={`${o.por_completar} por completar`} />}
                            {o.por_pagar > 0 && <Chip tone="warning" label={`Por pagar ${fmtMoney(o.por_pagar)}`} />}
                        </span>
                    )}
                </button>
            ))}
        </div>
    );

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <p className="text-sm text-muted-foreground md:mr-auto">Elige una obra para ver su presupuesto, cargar gastos y cobros, y cerrarla al terminar.</p>
                {obras.length > 6 && (
                    <div className="md:w-64">
                        <SearchBar value={busqueda} onChange={setBusqueda} placeholder="Buscar obra…" />
                    </div>
                )}
                {botonPropuesta}
                {botonAgregar}
            </div>
            {!enCurso.length && !finalizadas.length && <EmptyState icon={Building2} title="Ninguna obra con ese nombre" />}
            {enCurso.length > 0 && tarjetas(enCurso)}
            {finalizadas.length > 0 && (
                <div className="flex flex-col gap-3">
                    <h2 className="text-sm font-semibold text-muted-foreground">Finalizadas</h2>
                    {tarjetas(finalizadas)}
                </div>
            )}
            {modalAgregar}
        </div>
    );
};

// ─── Una obra ────────────────────────────────────────────────────────────────

const ObraCostos: React.FC<{
    obraId: number;
    params: URLSearchParams;
    setParams: ReturnType<typeof useSearchParams>[1];
}> = ({ obraId, params, setParams }) => {
    const [detalle, setDetalle] = useState<CostoDetalleObra | null>(null);
    const [falla, setFalla] = useState(false);
    const [version, setVersion] = useState(0);
    const [modal, setModal] = useState<Modal>(null);
    /** Detalle abierto desde el Resumen; queda abierto debajo mientras se carga o edita algo encima. */
    const [vistaDetalle, setVistaDetalle] = useState<VistaDetalle | null>(null);

    const pestanaParam = params.get('tab') as Pestana | null;
    const pestana: Pestana = PESTANAS.some(p => p.key === pestanaParam) ? pestanaParam! : 'resumen';
    const filtroParam = params.get('filtro') as FiltroGastos | null;
    const filtro: FiltroGastos = filtroParam === 'completar' || filtroParam === 'pagar' || filtroParam === 'estimados' ? filtroParam : 'todos';

    const ir = useCallback((tab: Pestana, extra: Record<string, string> = {}) => {
        setParams({ obra: String(obraId), tab, ...extra }, { replace: true });
    }, [obraId, setParams]);

    const cargar = useCallback(() => {
        api.get<{ data: CostoDetalleObra }>(`/costos/obras/${obraId}`)
            .then(res => { setDetalle(res.data.data); setFalla(false); })
            .catch(() => setFalla(true));
    }, [obraId]);

    useEffect(() => { cargar(); }, [cargar, version]);

    const alGuardar = () => { setModal(null); setVersion(v => v + 1); };

    const quitar = async () => {
        if (!window.confirm(`¿Quitar ${detalle?.obra.nombre || 'la obra'} de Presupuestos? No tiene partidas ni gastos; se puede volver a agregar cuando quieras.`)) return;
        try {
            await api.delete(`/costos/obras/${obraId}`);
            toast.success('Obra quitada de Presupuestos');
            setParams({});
        } catch (e) {
            toast.error(mensajeError(e, 'No se pudo quitar la obra.'));
        }
    };

    const capitulos = useMemo(() => [...new Set((detalle?.partidas || []).map(p => p.capitulo))], [detalle]);
    const gastosPorPartida = useMemo(() => {
        const m = new Map<number, number>();
        for (const g of detalle?.gastos || []) if (g.partida_id) m.set(g.partida_id, (m.get(g.partida_id) || 0) + 1);
        return m;
    }, [detalle]);

    if (falla && !detalle) {
        return (
            <EmptyState icon={Building2} title="No se pudo abrir la obra" description="Puede que ya no exista o que se haya cortado la conexión."
                action={<Button variant="glass" onClick={() => setParams({})}>Volver a las obras</Button>} />
        );
    }
    if (!detalle) return <div className="h-96 rounded-card border border-border bg-card" />;

    const acciones: AccionesDetalle = {
        cargarFactura: ({ partidaId = null, categoria = null }) => setModal({ tipo: 'gasto', gasto: null, partidaInicial: partidaId, categoriaInicial: categoria }),
        editarGasto: g => setModal({ tipo: 'gasto', gasto: g }),
        verFoto: g => setModal({ tipo: 'foto', gasto: g }),
        editarPartida: p => setModal({ tipo: 'partida', partida: p }),
        agregarPartida: capitulo => setModal({ tipo: 'partida', partida: null, capituloInicial: capitulo }),
    };

    // Cerrada: montos congelados (el backend responde 409); acá solo se ve y se corrige la superficie.
    const bloqueada = !!detalle.cierre;
    const conteo: Partial<Record<Pestana, number>> = { presupuesto: detalle.partidas.length, gastos: detalle.gastos.length, cobros: detalle.cobros.length };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setParams({})} leftIcon={<ChevronLeft className="h-4 w-4" />} className="-ml-2 shrink-0">
                        Obras
                    </Button>
                    <h2 className="min-w-0 truncate text-lg font-bold tracking-headline text-brand-dark">{detalle.obra.nombre}</h2>
                    {bloqueada ? <Chip icon={<Lock className="h-3 w-3" />} label="Cerrada" /> : detalle.obra.finalizada && <Chip label="Finalizada" />}
                </div>
                {!bloqueada && (
                    <Button onClick={() => setModal({ tipo: 'gasto', gasto: null })} leftIcon={<Plus className="h-4 w-4" />} className="md:shrink-0">
                        Cargar gasto
                    </Button>
                )}
            </div>

            {bloqueada && pestana !== 'cierre' && (
                <Aviso icon={Lock} tono="neutro">
                    Obra cerrada el {fmtFechaCorta(detalle.cierre!.cerrado_at)}: los montos quedaron congelados.{' '}
                    <Button variant="link" size="sm" className="text-xs" onClick={() => ir('cierre')}>Ver el cierre</Button>
                </Aviso>
            )}

            <div className="flex items-center min-w-0">
                <div className="flex w-fit min-w-0 max-w-full rounded-2xl border border-border bg-card p-1">
                <BarraPaginada>{p => (
                    <PestanasElasticas estiloOpcion={p.estiloOpcion} revelar={p.revelar}
                        opciones={PESTANAS}
                        activa={pestana}
                        onCambiar={k => ir(k)}
                        aria-label="Secciones de la obra"
                        claseFila="gap-1"
                        claseOpcion={CLASE_TAB}
                        claseInactiva={CLASE_INACTIVA}
                        render={o => (<>{o.key === 'cierre' && bloqueada && <Lock className="h-3.5 w-3.5" />}{o.label}{conteo[o.key] !== undefined && <span className="ml-1 opacity-70 tabular-nums">{conteo[o.key]}</span>}</>)}
                    />
                )}</BarraPaginada>
                </div>
            </div>

            {pestana === 'resumen' && (
                <ResumenObra
                    detalle={detalle}
                    onImportar={() => setModal({ tipo: 'importar' })}
                    onAgregarPartida={() => setModal({ tipo: 'partida', partida: null })}
                    onIr={(tab, f) => ir(tab, f && f !== 'todos' ? { filtro: f } : {})}
                    onDetalle={setVistaDetalle}
                    onQuitar={quitar}
                />
            )}
            {pestana === 'presupuesto' && (
                <PresupuestoObra
                    detalle={detalle}
                    bloqueada={bloqueada}
                    onImportar={() => setModal({ tipo: 'importar' })}
                    onAgregarPartida={() => setModal({ tipo: 'partida', partida: null })}
                    onEditarPartida={p => setModal({ tipo: 'partida', partida: p })}
                    onPorcentajes={() => setModal({ tipo: 'porcentajes' })}
                />
            )}
            {pestana === 'gastos' && (
                <GastosObra
                    gastos={detalle.gastos}
                    filtro={filtro}
                    onFiltro={f => ir('gastos', f === 'todos' ? {} : { filtro: f })}
                    onNuevo={() => { if (!bloqueada) setModal({ tipo: 'gasto', gasto: null }); }}
                    onAbrir={g => {
                        if (!bloqueada) setModal({ tipo: 'gasto', gasto: g });
                        else if (g.tiene_foto) setModal({ tipo: 'foto', gasto: g });
                    }}
                />
            )}
            {pestana === 'cobros' && (
                <CobrosObra
                    cobros={detalle.cobros}
                    resumen={detalle.resumen.cobros}
                    bloqueada={bloqueada}
                    onNuevo={() => setModal({ tipo: 'cobro', cobro: null })}
                    onAbrir={c => setModal({ tipo: 'cobro', cobro: c })}
                />
            )}
            {pestana === 'historial' && <HistorialObra obraId={obraId} version={version} partidas={detalle.partidas} />}
            {pestana === 'cierre' && <CierreObra detalle={detalle} onCambio={() => setVersion(v => v + 1)} />}

            {vistaDetalle && (
                <DetalleCostos detalle={detalle} vista={vistaDetalle} bloqueada={bloqueada} acciones={acciones} onClose={() => setVistaDetalle(null)} />
            )}
            {modal?.tipo === 'gasto' && (
                <GastoModal obraId={obraId} gasto={modal.gasto} partidas={detalle.partidas}
                    partidaInicial={modal.partidaInicial} categoriaInicial={modal.categoriaInicial}
                    proveedores={[...new Set(detalle.gastos.map(g => g.proveedor).filter((p): p is string => !!p))]}
                    onClose={() => setModal(null)} onGuardado={alGuardar} />
            )}
            {modal?.tipo === 'foto' && <FotoGastoViewer gasto={modal.gasto} onClose={() => setModal(null)} />}
            {modal?.tipo === 'cobro' && (
                <CobroModal obraId={obraId} cobro={modal.cobro} glosas={detalle.cobros.map(c => c.glosa)} onClose={() => setModal(null)} onGuardado={alGuardar} />
            )}
            {modal?.tipo === 'partida' && (
                <PartidaModal obraId={obraId} partida={modal.partida} capitulos={capitulos} capituloInicial={modal.capituloInicial} hayPartidas={detalle.partidas.length > 0}
                    gastosAsignados={modal.partida ? gastosPorPartida.get(modal.partida.id) || 0 : 0}
                    onClose={() => setModal(null)} onGuardado={alGuardar} />
            )}
            {modal?.tipo === 'porcentajes' && (
                <PorcentajesModal obraId={obraId} presupuesto={detalle.presupuesto} costoDirecto={detalle.resumen.costo_directo} bloqueada={bloqueada}
                    onClose={() => setModal(null)} onGuardado={alGuardar} />
            )}
            {modal?.tipo === 'importar' && (
                <ImportarExcelModal obraId={obraId} partidasActuales={detalle.partidas.length} onClose={() => setModal(null)} onImportado={alGuardar} />
            )}
        </div>
    );
};

export default CostosPage;
