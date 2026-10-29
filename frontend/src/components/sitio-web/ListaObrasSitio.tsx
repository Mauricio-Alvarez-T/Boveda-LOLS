import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowDown, ArrowUp, Clock, Globe, Link2, SearchX } from 'lucide-react';
import api from '../../services/api';
import { IconButton } from '../ui/IconButton';
import { Chip } from '../ui/Chip';
import { StatusBadge } from '../ui/StatusBadge';
import { SearchBar } from '../ui/SearchBar';
import { EmptyState } from '../ui/EmptyState';
import { PestanasElasticas } from '../ui/PestanasElasticas';
import { BarraPaginada } from '../ui/BarraPaginada';
import { recargarPendientesSitioWeb } from '../../hooks/useSitioWebPendientes';
import { Miniatura } from './piezas';
import { AYUDA_ESTADO, codigoError, mensajeError } from './sitioWebConfig';
import { agruparPorEstado, contarFiltros, filtrarObras, mover, type FiltroObras } from './reglas';
import type { EstadoObra, ObraSitioLista } from './tipos';

interface Props {
    obras: ObraSitioLista[];
    filtro: FiltroObras;
    onFiltro: (f: FiltroObras) => void;
    puedeEditar: boolean;
    /** Abrir una obra; con fotos por aprobar, directo en su pestaña «Portada» (la acción en el lugar). */
    onAbrir: (id: number, tab?: 'fotos') => void;
    /** Después de reordenar: vuelve a pedir la lista. */
    onCambio: () => void;
}

const FILTROS: { key: FiltroObras; label: string }[] = [
    { key: 'todas', label: 'Todas' },
    { key: 'pendientes', label: 'Por publicar' },
    { key: 'faltan', label: 'Les faltan datos' },
    { key: 'fuera', label: 'Fuera del sitio' },
];

const CLASE_TAB = 'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 font-medium whitespace-nowrap';
const CLASE_INACTIVA = 'text-muted-foreground hover:bg-background hover:text-brand-dark';

/**
 * Las obras del sitio agrupadas como las muestra lols.cl (en construcción, en proyecto, terminadas) y, dentro, en su
 * orden: las flechas suben o bajan una obra dentro de su grupo (`PUT /obras/orden`). Solo con la lista completa a la
 * vista: con un filtro o una búsqueda, «subir» no diría respecto de qué. Filtros de un toque (§13) y buscador en el
 * cliente desde 7 obras.
 */
export const ListaObrasSitio: React.FC<Props> = ({ obras, filtro, onFiltro, puedeEditar, onAbrir, onCambio }) => {
    // Pocas obras (decenas): filtrar en cada tecla no cuesta nada, sin diferir ni memo de la lista (regla 13).
    const [texto, setTexto] = useState('');
    const [ordenando, setOrdenando] = useState<EstadoObra | null>(null);

    const conteo = useMemo(() => contarFiltros(obras), [obras]);
    const visibles = useMemo(() => filtrarObras(obras, filtro, texto), [obras, filtro, texto]);
    const grupos = useMemo(() => agruparPorEstado(visibles), [visibles]);
    const todos = useMemo(() => agruparPorEstado(obras), [obras]);
    const ordenable = puedeEditar && filtro === 'todas' && !texto.trim();

    const reordenar = async (estado: EstadoObra, id: number, delta: -1 | 1) => {
        const ids = todos.find(g => g.estado === estado)?.obras.map(o => o.id) || [];
        const nuevo = mover(ids, id, delta);
        if (!nuevo) return;
        setOrdenando(estado);
        try {
            await api.put('/sitio-web/obras/orden', { estado, ids: nuevo });
            onCambio();
            recargarPendientesSitioWeb();
        } catch (e) {
            toast.error(mensajeError(e, 'No se pudo cambiar el orden.'));
            if (codigoError(e) === 'SITIO_WEB_ORDEN_DESACTUALIZADO') onCambio();
        } finally {
            setOrdenando(null);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="flex min-w-0 items-center md:mr-auto">
                    <div className="flex w-fit min-w-0 max-w-full rounded-2xl border border-border bg-card p-1">
                        <BarraPaginada>{p => (
                            <PestanasElasticas estiloOpcion={p.estiloOpcion} revelar={p.revelar} opciones={FILTROS} activa={filtro} onCambiar={onFiltro}
                                aria-label="Filtrar obras" claseFila="gap-1" claseOpcion={CLASE_TAB} claseInactiva={CLASE_INACTIVA}
                                render={o => (<>{o.label}{o.key !== 'todas' && conteo[o.key] > 0 && <span className="ml-1 opacity-70 tabular-nums">{conteo[o.key]}</span>}</>)} />
                        )}</BarraPaginada>
                    </div>
                </div>
                {obras.length > 6 && (
                    <div className="md:w-64">
                        <SearchBar value={texto} onChange={setTexto} placeholder="Buscar obra o comuna…" />
                    </div>
                )}
            </div>

            {!grupos.length && (
                <EmptyState icon={SearchX} title={texto.trim() ? 'Ninguna obra con ese nombre' : 'Nada en este filtro'}
                    description={filtro === 'pendientes' ? 'No hay fotos por aprobar ni obras esperando la próxima publicación.' : undefined} />
            )}

            {grupos.map(g => {
                const idsGrupo = todos.find(t => t.estado === g.estado)?.obras.map(o => o.id) || [];
                return (
                    <section key={g.estado} className="flex flex-col gap-3" aria-label={g.etiqueta}>
                        <h2 className="text-sm font-semibold text-muted-foreground">
                            {g.etiqueta} <span className="tabular-nums opacity-70">· {g.obras.length}</span>
                        </h2>
                        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {g.obras.map(o => {
                                const i = idsGrupo.indexOf(o.id);
                                return (
                                    <li key={o.id} className="flex min-w-0 items-stretch gap-1 rounded-card border border-border bg-card transition-colors hover:border-muted-foreground/30">
                                        {/* eslint-disable-next-line no-restricted-syntax -- tarjeta de obra (portada, nombre, estado y avisos); Button no soporta este layout */}
                                        <button type="button" onClick={() => onAbrir(o.id, o.fotos_por_aprobar > 0 ? 'fotos' : undefined)}
                                            className="flex min-w-0 flex-1 items-start gap-3 rounded-card p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                                            <Miniatura fotoId={o.portada_id} referencia={o.referencia} estado={o.estado} className="h-16 w-20" alt="" />
                                            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                                                <span className="text-base font-semibold leading-snug text-brand-dark">{o.nombre}</span>
                                                <span className="truncate text-xs text-muted-foreground">
                                                    {o.comuna || 'Sin comuna'}{o.vinculada && <><Link2 className="ml-1 inline h-3 w-3" aria-hidden="true" /><span className="sr-only"> (vinculada a una obra de la Bóveda)</span></>}
                                                </span>
                                                <span className="flex flex-wrap gap-1.5">
                                                    <span title={AYUDA_ESTADO[o.estadoDerivado]}><StatusBadge domain="sitioWeb" status={o.estadoDerivado} showIcon /></span>
                                                    {o.faltantes.length > 0 && (
                                                        <Chip tone="warning" icon={<AlertTriangle className="h-3 w-3" />} label={`Faltan ${o.faltantes.length}`} />
                                                    )}
                                                    {o.fotos_por_aprobar > 0 && (
                                                        <Chip tone="warning" icon={<Clock className="h-3 w-3" />} label={`${o.fotos_por_aprobar} foto${o.fotos_por_aprobar === 1 ? '' : 's'} por aprobar`} />
                                                    )}
                                                </span>
                                            </span>
                                        </button>
                                        {ordenable && idsGrupo.length > 1 && (
                                            <span className="flex shrink-0 flex-col justify-center border-l border-border px-0.5">
                                                <IconButton icon={<ArrowUp className="h-4 w-4" />} aria-label={`Subir ${o.nombre}`} title="Subir"
                                                    disabled={i <= 0 || ordenando !== null} onClick={() => reordenar(o.estado, o.id, -1)} />
                                                <IconButton icon={<ArrowDown className="h-4 w-4" />} aria-label={`Bajar ${o.nombre}`} title="Bajar"
                                                    disabled={i < 0 || i >= idsGrupo.length - 1 || ordenando !== null} onClick={() => reordenar(o.estado, o.id, 1)} />
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                );
            })}
            {puedeEditar && !ordenable && obras.length > 1 && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Globe className="h-3.5 w-3.5" /> Para cambiar el orden, vuelve a «Todas» y borra la búsqueda.</p>
            )}
        </div>
    );
};

export default ListaObrasSitio;
