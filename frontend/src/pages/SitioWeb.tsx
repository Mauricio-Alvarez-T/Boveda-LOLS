import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, DownloadCloud, ExternalLink, FlaskConical, Globe, KeyRound, Plus, RefreshCw, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useStandardHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { PestanasElasticas } from '../components/ui/PestanasElasticas';
import { BarraPaginada } from '../components/ui/BarraPaginada';
import { Aviso } from '../components/costos/piezas';
import { fmtFecha } from '../utils/format';
import api from '../services/api';
import { recargarPendientesSitioWeb } from '../hooks/useSitioWebPendientes';
import { ListaObrasSitio } from '../components/sitio-web/ListaObrasSitio';
import { ObraSitio, type PestanaObra } from '../components/sitio-web/ObraSitio';
import { PublicarModal } from '../components/sitio-web/PublicarModal';
import { ImportarObrasModal } from '../components/sitio-web/ImportarObrasModal';
import { PublicacionesSitio } from '../components/sitio-web/PublicacionesSitio';
import { SiluetaObras } from '../components/sitio-web/piezas';
import { TEXTO_CODIGO, codigoError, mensajeError } from '../components/sitio-web/sitioWebConfig';
import { TEXTO_MOTIVO, avisoToken, ultimaConProblema, type FiltroObras } from '../components/sitio-web/reglas';
import type { ConfigSitio, ObraSitioLista, PublicacionSitio } from '../components/sitio-web/tipos';

type Vista = 'obras' | 'publicaciones';
const PESTANAS_OBRA: PestanaObra[] = ['datos', 'fotos', 'vista', 'historial'];
const FILTROS: FiltroObras[] = ['todas', 'pendientes', 'faltan', 'fuera'];

const CLASE_TAB = 'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 font-medium whitespace-nowrap';
const CLASE_INACTIVA = 'text-muted-foreground hover:bg-background hover:text-brand-dark';

/**
 * Sitio web (mig 147, docs/reglas/sitio-web.md, plan 4.8): las obras de lols.cl se editan aquí y se publican con un
 * commit en el repositorio del sitio. Quién ve, edita y publica se da con permisos (`sitio_web.ver|editar|publicar`);
 * publicar es delicado y se marca a mano. En staging todo es simulación: no se publica nada.
 *
 * URL: `?obra=ID&tab=datos|fotos|vista|historial` (`?obra=nueva` para crear), `?vista=publicaciones`,
 * `?filtro=pendientes|faltan|fuera` (el número del menú lleva a «pendientes»).
 */
const SitioWebPage: React.FC = () => {
    const { hasPermission, verComo } = useAuth();
    useStandardHeader({ title: 'Sitio web', icon: Globe });

    const ver = hasPermission('sitio_web.ver') || hasPermission('sitio_web.editar') || hasPermission('sitio_web.publicar');
    if (!ver) {
        return <EmptyState icon={Globe} title="Sin acceso" description="Las obras del sitio web son para quienes las editan o publican en lols.cl." />;
    }
    const permisos = {
        editar: hasPermission('sitio_web.editar') || hasPermission('sitio_web.publicar'),
        publicar: hasPermission('sitio_web.publicar'),
        obrasVer: hasPermission('obras.ver'),
        verComo: !!verComo,
    };
    return <SitioWeb permisos={permisos} />;
};

type Permisos = { editar: boolean; publicar: boolean; obrasVer: boolean; verComo: boolean };

const SitioWeb: React.FC<{ permisos: Permisos }> = ({ permisos }) => {
    const [params, setParams] = useSearchParams();
    const [config, setConfig] = useState<ConfigSitio | null>(null);
    const [falla, setFalla] = useState<{ sinMigrar: boolean; mensaje: string } | null>(null);

    // GET /config es lo primero que se pide: sin la migración 147 responde 409 SITIO_WEB_SIN_MIGRAR.
    const cargarConfig = useCallback(() => {
        api.get<{ data: ConfigSitio }>('/sitio-web/config')
            .then(res => setConfig(res.data.data))
            .catch(e => setFalla({ sinMigrar: codigoError(e) === 'SITIO_WEB_SIN_MIGRAR', mensaje: mensajeError(e, 'No se pudo abrir el módulo.') }));
    }, []);
    useEffect(() => { cargarConfig(); }, [cargarConfig]);
    const sinInstalar = useCallback(() => setFalla({ sinMigrar: true, mensaje: '' }), []);

    if (falla) {
        return falla.sinMigrar
            ? <SinInstalar />
            : <EmptyState icon={Globe} title="No se pudo abrir Sitio web" description={falla.mensaje}
                action={<Button variant="glass" onClick={() => { setFalla(null); cargarConfig(); }} leftIcon={<RefreshCw className="h-4 w-4" />}>Reintentar</Button>} />;
    }
    if (!config) return <SiluetaObras conBarra />;

    // Lo que se ve de la lista (filtro y pestaña) viaja con la obra abierta: «Obras» vuelve a lo mismo.
    const lista: Record<string, string> = {};
    for (const k of ['filtro', 'vista']) { const v = params.get(k); if (v) lista[k] = v; }

    const obraParam = params.get('obra');
    if (obraParam) {
        const id = obraParam === 'nueva' ? null : Number(obraParam) || null;
        if (obraParam !== 'nueva' && !id) {
            return <EmptyState icon={Globe} title="Esa obra no existe" action={<Button variant="glass" onClick={() => setParams({})}>Volver a las obras</Button>} />;
        }
        const tabParam = params.get('tab') as PestanaObra | null;
        const pestana: PestanaObra = tabParam && PESTANAS_OBRA.includes(tabParam) ? tabParam : 'datos';
        return (
            <ObraSitio key={obraParam} id={id} pestana={pestana} config={config} permisos={permisos}
                onPestana={t => setParams({ ...lista, obra: obraParam, tab: t }, { replace: true })}
                onVolver={() => setParams(lista)}
                onCreada={nuevo => setParams({ ...lista, obra: String(nuevo), tab: 'datos' }, { replace: true })} />
        );
    }

    const vista: Vista = params.get('vista') === 'publicaciones' ? 'publicaciones' : 'obras';
    const filtroParam = params.get('filtro') as FiltroObras | null;
    const filtro: FiltroObras = filtroParam && FILTROS.includes(filtroParam) ? filtroParam : 'todas';
    return (
        <Portada config={config} permisos={permisos} vista={vista} filtro={filtro}
            onVista={v => setParams(v === 'obras' ? {} : { vista: v }, { replace: true })}
            onFiltro={f => setParams(f === 'todas' ? {} : { filtro: f }, { replace: true })}
            onAbrir={(id, tab) => setParams({ ...lista, obra: String(id), ...(tab ? { tab } : {}) })}
            onSinInstalar={sinInstalar} />
    );
};

// ─── Portada: obras y publicaciones ──────────────────────────────────────────

const Portada: React.FC<{
    config: ConfigSitio;
    permisos: Permisos;
    vista: Vista;
    filtro: FiltroObras;
    onVista: (v: Vista) => void;
    onFiltro: (f: FiltroObras) => void;
    onAbrir: (id: number | 'nueva', tab?: 'fotos') => void;
    /** /obras respondió SITIO_WEB_SIN_MIGRAR: la pantalla de «todavía no está instalado». */
    onSinInstalar: () => void;
}> = ({ config, permisos, vista, filtro, onVista, onFiltro, onAbrir, onSinInstalar }) => {
    const [obras, setObras] = useState<ObraSitioLista[] | null>(null);
    const [publicaciones, setPublicaciones] = useState<PublicacionSitio[] | null>(null);
    // Una carga que falló NO es una lista vacía (no ofrece importar ni esconde el aviso rojo): su error y «Reintentar».
    const [fallaObras, setFallaObras] = useState<string | null>(null);
    const [fallaPublicaciones, setFallaPublicaciones] = useState<string | null>(null);
    const [publicando, setPublicando] = useState(false);
    const [importando, setImportando] = useState(false);
    const cargarObras = useCallback(() => {
        api.get<{ data: ObraSitioLista[] }>('/sitio-web/obras')
            .then(res => { setObras(res.data.data || []); setFallaObras(null); })
            .catch(e => {
                if (codigoError(e) === 'SITIO_WEB_SIN_MIGRAR') { onSinInstalar(); return; }
                // Con la lista ya a la vista, no se borra: se avisa arriba de ella (con «Reintentar»).
                setFallaObras(mensajeError(e, 'No se pudieron cargar las obras.'));
            });
    }, [onSinInstalar]);
    const cargarPublicaciones = useCallback(() => {
        api.get<{ data: PublicacionSitio[] }>('/sitio-web/publicaciones')
            .then(res => { setPublicaciones(res.data.data || []); setFallaPublicaciones(null); })
            .catch(e => setFallaPublicaciones(mensajeError(e, 'No se pudieron cargar las publicaciones.')));
    }, []);
    const recargar = useCallback(() => { cargarObras(); cargarPublicaciones(); recargarPendientesSitioWeb(); }, [cargarObras, cargarPublicaciones]);
    useEffect(() => { cargarObras(); cargarPublicaciones(); }, [cargarObras, cargarPublicaciones]);

    const simulacion = config.modo !== 'publicar';
    const token = permisos.publicar ? avisoToken(config) : null;
    const problema = publicaciones ? ultimaConProblema(publicaciones) : null;
    const hayReal = (publicaciones || []).some(p => p.modo === 'publicar' && p.estado === 'ok');
    const hayBase = (publicaciones || []).some(p => p.estado === 'ok');
    const escribe = !permisos.verComo;
    // Sin saber qué publicaciones hay (cargando o falló), no se ofrece importar.
    const puedeImportar = permisos.publicar && escribe && !!publicaciones && !hayReal;

    const opciones: { key: Vista; label: string }[] = [
        { key: 'obras', label: 'Obras' },
        { key: 'publicaciones', label: 'Publicaciones' },
    ];

    const botonNueva = permisos.editar && (
        <Button variant={permisos.publicar && escribe ? 'glass' : 'primary'} onClick={() => onAbrir('nueva')} leftIcon={<Plus className="h-4 w-4" />}
            className="md:shrink-0">Nueva obra</Button>
    );
    const botonPublicar = permisos.publicar && escribe && (
        <Button onClick={() => setPublicando(true)} leftIcon={simulacion ? <FlaskConical className="h-4 w-4" /> : <Send className="h-4 w-4" />} className="md:shrink-0">
            {simulacion ? <><span className="sm:hidden">Simular</span><span className="hidden sm:inline">Simular publicación</span></> : 'Publicar'}
        </Button>
    );

    return (
        <div className="flex flex-col gap-4">
            {simulacion && (
                <Aviso icon={FlaskConical} tono="neutro">
                    <strong>Simulación:</strong> desde aquí no se publica nada en {config.urlSitio.replace(/^https?:\/\//, '')}. {config.motivo ? TEXTO_MOTIVO[config.motivo] : ''}
                </Aviso>
            )}
            {token && <Aviso icon={KeyRound} tono={token.tono}>{token.texto}</Aviso>}
            {problema && (
                <Aviso icon={AlertTriangle} tono="peligro">
                    {problema.estado === 'error' ? (
                        <>
                            <p className="font-semibold">La última publicación (#{problema.id}, {fmtFecha(problema.created_at)}) no se hizo: el sitio no cambió.</p>
                            <p>{(problema.error_codigo && TEXTO_CODIGO[problema.error_codigo]) || problema.error_mensaje}</p>
                        </>
                    ) : (
                        <>
                            <p className="font-semibold">La publicación #{problema.id} no llegó al sitio: sigue mostrando la versión anterior.</p>
                            <p>La compilación del sitio falló. Avisa a Mauricio.
                                {problema.build_url && (
                                    <> <a href={problema.build_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-red-700 hover:underline dark:text-red-300">
                                        Ver la compilación <ExternalLink className="h-3 w-3" /></a></>
                                )}
                            </p>
                        </>
                    )}
                    {vista !== 'publicaciones' && <Button variant="link" size="sm" className="mt-1 text-xs font-semibold text-green-700 dark:text-green-300" onClick={() => onVista('publicaciones')}>Ver publicaciones</Button>}
                </Aviso>
            )}

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="flex min-w-0 items-center md:mr-auto">
                    <div className="flex w-fit min-w-0 max-w-full rounded-2xl border border-border bg-card p-1">
                        <BarraPaginada>{p => (
                            <PestanasElasticas estiloOpcion={p.estiloOpcion} revelar={p.revelar} opciones={opciones} activa={vista} onCambiar={onVista} aria-label="Sitio web"
                                claseFila="gap-1" claseOpcion={CLASE_TAB} claseInactiva={CLASE_INACTIVA}
                                render={o => (<>{o.label}{o.key === 'obras' && obras && <span className="ml-1 opacity-70 tabular-nums">{obras.length}</span>}</>)} />
                        )}</BarraPaginada>
                    </div>
                </div>
                {(botonNueva || botonPublicar) && (
                    <div className="grid grid-cols-2 gap-2 md:flex">
                        {botonNueva}
                        {botonPublicar}
                    </div>
                )}
            </div>

            {fallaPublicaciones && (
                <Aviso icon={AlertTriangle} tono="peligro">
                    <p>{fallaPublicaciones} Sin ellas no se sabe si la última publicación falló.</p>
                    <Button variant="link" size="sm" className="mt-1 text-xs font-semibold text-green-700 dark:text-green-300" onClick={cargarPublicaciones}>Reintentar</Button>
                </Aviso>
            )}

            {vista === 'obras' && fallaObras && obras !== null && (
                <Aviso icon={AlertTriangle} tono="peligro">
                    <p>{fallaObras} Lo que ves puede no estar al día.</p>
                    <Button variant="link" size="sm" className="mt-1 text-xs font-semibold text-green-700 dark:text-green-300" onClick={cargarObras}>Reintentar</Button>
                </Aviso>
            )}
            {vista === 'obras' && (fallaObras && obras === null ? (
                <EmptyState icon={Globe} title="No se pudieron cargar las obras" description={fallaObras}
                    action={<Button variant="glass" onClick={() => { setFallaObras(null); cargarObras(); }} leftIcon={<RefreshCw className="h-4 w-4" />}>Reintentar</Button>} />
            ) : obras === null ? (
                <SiluetaObras />
            ) : !obras.length ? (
                <EmptyState icon={Globe} title="Todavía no hay obras del sitio aquí"
                    description={puedeImportar && !hayBase
                        ? 'Si lols.cl ya muestra obras, primero impórtalas: así no se duplican y se siguen editando desde aquí.'
                        : 'Agrega la primera obra que se va a mostrar en lols.cl.'}
                    action={(
                        <div className="flex flex-wrap justify-center gap-2">
                            {puedeImportar && !hayBase && (
                                <Button onClick={() => setImportando(true)} leftIcon={<DownloadCloud className="h-4 w-4" />}>Importar obras del sitio</Button>
                            )}
                            {permisos.editar && <Button variant="glass" onClick={() => onAbrir('nueva')} leftIcon={<Plus className="h-4 w-4" />}>Nueva obra</Button>}
                        </div>
                    )} />
            ) : (
                <ListaObrasSitio obras={obras} filtro={filtro} onFiltro={onFiltro} puedeEditar={permisos.editar} onAbrir={onAbrir} onCambio={cargarObras} />
            ))}

            {vista === 'publicaciones' && (
                <PublicacionesSitio config={config} publicaciones={publicaciones} puedePublicar={permisos.publicar} verComo={permisos.verComo}
                    onImportar={() => setImportando(true)} onCambio={recargar} />
            )}

            {publicando && (
                <PublicarModal modo={config.modo} urlSitio={config.urlSitio} onClose={() => setPublicando(false)} onPublicado={recargar}
                    onVerPublicaciones={() => { setPublicando(false); onVista('publicaciones'); }} />
            )}
            {importando && (
                <ImportarObrasModal modo={config.modo} repo={config.repo} onClose={() => setImportando(false)} onImportado={recargar} />
            )}
        </div>
    );
};

/** Sin la migración 147 (GET /config u /obras responden 409 SITIO_WEB_SIN_MIGRAR). */
const SinInstalar: React.FC = () => (
    <EmptyState icon={Globe} title="El módulo todavía no está instalado" description="Falta la actualización de la base de datos (migración 147). Avisa a Mauricio." />
);

export default SitioWebPage;
