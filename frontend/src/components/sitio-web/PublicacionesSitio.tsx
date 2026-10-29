import React, { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ChevronRight, Download, DownloadCloud, ExternalLink, History, RefreshCcw } from 'lucide-react';
import api from '../../services/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import { EmptyState } from '../ui/EmptyState';
import { FormError } from '../ui/FormError';
import { Aviso } from '../costos/piezas';
import { descargarArchivo } from '../../utils/descargarArchivo';
import { fmtFechaHora } from '../../utils/fechas';
import { cn } from '../../utils/cn';
import { Casilla, ListaObras } from './piezas';
import { EstadoPublicacion } from './EstadoPublicacion';
import { useEstadoPublicacion } from './useEstadoPublicacion';
import { TEXTO_CODIGO, TIMEOUT_PUBLICAR_MS, mensajeError } from './sitioWebConfig';
import type { ConfigSitio, PublicacionSitio, ResultadoResincronizar } from './tipos';

interface Props {
    config: ConfigSitio;
    publicaciones: PublicacionSitio[] | null;
    puedePublicar: boolean;
    /** «Ver como» no publica, ni importa, ni resincroniza. */
    verComo: boolean;
    onImportar: () => void;
    /** Después de resincronizar: vuelve a pedir obras y publicaciones. */
    onCambio: () => void;
}

/** Cómo quedó en el sitio una publicación real (lo que se sabe sin abrirla). */
function enSitio(p: PublicacionSitio): { texto: string; clase: string } | null {
    if (p.modo !== 'publicar' || p.estado !== 'ok') return null;
    if (p.build_estado === 'fallo') return { texto: 'No llegó al sitio', clase: 'text-red-700 dark:text-red-300' };
    if (p.en_linea_at) return { texto: 'Ya se ve en el sitio', clase: 'text-green-700 dark:text-green-300' };
    if (p.build_estado === 'reemplazada') return { texto: 'Reemplazada por una posterior', clase: 'text-muted-foreground' };
    return { texto: 'El sitio se está actualizando', clase: 'text-blue-700 dark:text-blue-300' };
}

/** Estado + modo. Una importación (o resincronización) no publica nada: es la base con la que se compara. */
const BadgesPublicacion: React.FC<{ modo: PublicacionSitio['modo']; estado: PublicacionSitio['estado'] }> = ({ modo, estado }) => (
    modo === 'importacion' && estado === 'ok'
        ? <StatusBadge tone="neutral" label="Base del sitio" />
        : (
            <>
                <StatusBadge domain="sitioWebPublicacion" status={estado} showIcon />
                {modo === 'simulacion' && <StatusBadge tone="neutral" label="Simulación" />}
            </>
        )
);

/**
 * Publicaciones (plan 4.8, `?vista=publicaciones`): las últimas 20, con su estado y, al abrir una, sus pasos y lo que
 * cambió. Para quien publica, además: importar las obras del sitio (una vez) y resincronizar tras un cambio a mano en
 * el repositorio (plan 7.2).
 */
export const PublicacionesSitio: React.FC<Props> = ({ config, publicaciones, puedePublicar, verComo, onImportar, onCambio }) => {
    const [abierta, setAbierta] = useState<number | null>(null);
    const [resincronizando, setResincronizando] = useState(false);
    const herramientas = puedePublicar && !verComo;
    const hayReal = (publicaciones || []).some(p => p.modo === 'publicar' && p.estado === 'ok');

    return (
        <div className="flex flex-col gap-5">
            {publicaciones === null ? (
                <div className="flex flex-col gap-2">{[0, 1, 2].map(i => <div key={i} className="h-20 rounded-card border border-border bg-card" />)}</div>
            ) : !publicaciones.length ? (
                <EmptyState icon={History} title="Todavía no hay publicaciones"
                    description="Cada vez que alguien publica (o simula) queda aquí, con lo que cambió y si ya se ve en el sitio." />
            ) : (
                <ul className="flex flex-col gap-2">
                    {publicaciones.map(p => {
                        const sitio = enSitio(p);
                        return (
                            <li key={p.id}>
                                {/* eslint-disable-next-line no-restricted-syntax -- fila de publicación (estado, fecha, resumen y error); Button no soporta este layout */}
                                <button type="button" onClick={() => setAbierta(p.id)}
                                    className="flex w-full min-w-0 items-start gap-3 rounded-card border border-border bg-card p-4 text-left transition-colors hover:border-muted-foreground/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                                        <span className="flex flex-wrap items-center gap-1.5">
                                            <BadgesPublicacion modo={p.modo} estado={p.estado} />
                                            <span className="text-xs text-muted-foreground tabular-nums">#{p.id} · {fmtFechaHora(p.created_at)}{p.usuario_nombre ? ` · ${p.usuario_nombre}` : ''}</span>
                                        </span>
                                        {p.resumen && <span className="text-sm text-brand-dark">{p.resumen}</span>}
                                        {p.estado === 'error' && (
                                            <span className="text-xs text-red-700 dark:text-red-300">{(p.error_codigo && TEXTO_CODIGO[p.error_codigo]) || p.error_mensaje}</span>
                                        )}
                                        {sitio && <span className={cn('text-xs font-semibold', sitio.clase)}>{sitio.texto}</span>}
                                    </span>
                                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {herramientas && (
                <section className="flex flex-col gap-4 rounded-card border border-border bg-card p-4 md:p-5">
                    <h3 className="text-sm font-semibold text-foreground">Herramientas</h3>
                    {!hayReal && (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-muted-foreground">
                                <strong className="text-brand-dark">Importar obras del sitio.</strong> Trae las obras que hoy muestra lols.cl (una vez; las que ya están no se repiten).
                            </p>
                            <Button variant="glass" onClick={onImportar} leftIcon={<DownloadCloud className="h-4 w-4" />} className="sm:shrink-0">Importar</Button>
                        </div>
                    )}
                    {config.modo === 'publicar' && (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-muted-foreground">
                                <strong className="text-brand-dark">Resincronizar.</strong> Solo si alguien cambió las obras a mano en el repositorio del sitio (la publicación avisa «cambiaron a mano»).
                            </p>
                            <Button variant="glass" onClick={() => setResincronizando(true)} leftIcon={<RefreshCcw className="h-4 w-4" />} className="sm:shrink-0">Resincronizar</Button>
                        </div>
                    )}
                    {hayReal && config.modo !== 'publicar' && <p className="text-sm text-muted-foreground">Nada que hacer aquí en este entorno.</p>}
                </section>
            )}

            {abierta !== null && (
                <DetallePublicacionModal id={abierta} urlSitio={config.urlSitio} puedePublicar={puedePublicar} onClose={() => setAbierta(null)} />
            )}
            {resincronizando && (
                <ResincronizarModal repo={config.repo} onClose={() => setResincronizando(false)} onHecho={onCambio} />
            )}
        </div>
    );
};

/* ──────────────── una publicación ──────────────── */

const DetallePublicacionModal: React.FC<{ id: number; urlSitio: string; puedePublicar: boolean; onClose: () => void }> = ({ id, urlSitio, puedePublicar, onClose }) => {
    const { datos, error } = useEstadoPublicacion(id);
    const [bajando, setBajando] = useState(false);
    const d = datos?.detalle;
    const bajar = async () => {
        setBajando(true);
        await descargarArchivo(api, `/sitio-web/publicaciones/${id}/paquete`, {
            nombre: `lols-cl-simulacion-${id}.zip`, modo: 'download', fallbackError: 'No se pudo descargar el paquete.',
        });
        setBajando(false);
    };
    return (
        <Modal isOpen onClose={onClose} size="md" icon={History} title={`Publicación #${id}`}
            description={datos ? `${fmtFechaHora(datos.created_at)}${datos.usuario_nombre ? ` · ${datos.usuario_nombre}` : ''}` : undefined}
            footer={
                <div className="flex w-full justify-end gap-2">
                    {datos?.tiene_paquete && puedePublicar && (
                        <Button variant="glass" onClick={bajar} isLoading={bajando} leftIcon={<Download className="h-4 w-4" />}>Descargar paquete</Button>
                    )}
                    <Button onClick={onClose}>Cerrar</Button>
                </div>
            }>
            {!datos ? (error ? <FormError message={error} /> : <div className="h-48 rounded-xl bg-muted/50" aria-busy="true" />) : (
                <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <BadgesPublicacion modo={datos.modo} estado={datos.estado} />
                        <span className="text-xs text-muted-foreground">{datos.obras_incluidas} obra{datos.obras_incluidas === 1 ? '' : 's'} en el sitio</span>
                    </div>
                    {datos.resumen && <p className="text-sm text-brand-dark">{datos.resumen}</p>}
                    {datos.error_mensaje && (
                        <Aviso icon={AlertTriangle} tono={datos.estado === 'error' ? 'peligro' : 'aviso'}>
                            {datos.error_codigo && TEXTO_CODIGO[datos.error_codigo] && <p className="font-semibold">{TEXTO_CODIGO[datos.error_codigo]}</p>}
                            <p>{datos.error_mensaje}</p>
                        </Aviso>
                    )}
                    {datos.pasos.length > 0 && (
                        <div className="rounded-xl border border-border p-4"><EstadoPublicacion id={id} urlSitio={urlSitio} /></div>
                    )}
                    {datos.url_commit && !datos.pasos.length && (
                        <a href={datos.url_commit} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline dark:text-green-300">
                            Ver el cambio en GitHub <ExternalLink className="h-3 w-3" />
                        </a>
                    )}
                    {d && (
                        <>
                            <ListaObras titulo="Nuevas" obras={d.nuevas || []} />
                            <ListaObras titulo="Con cambios" obras={d.cambiadas || []} />
                            <ListaObras titulo="Retiradas" tono="aviso" obras={d.retiradas || []} />
                            <ListaObras titulo="Mantuvieron la versión publicada" tono="aviso" obras={d.mantienen || []} />
                            <ListaObras titulo="Quedaron fuera" tono="aviso" obras={d.excluidas || []} />
                            {(d.escribir?.length || d.borrar?.length) ? (
                                <details className="rounded-xl border border-border px-4 py-3">
                                    <summary className="cursor-pointer text-sm font-semibold text-brand-dark">
                                        Archivos: {d.escribir?.length || 0} escritos, {d.borrar?.length || 0} borrados
                                    </summary>
                                    <ul className="mt-2 flex flex-col gap-0.5 break-all text-xs text-muted-foreground">
                                        {(d.escribir || []).map(r => <li key={`e-${r}`}>+ {r}</li>)}
                                        {(d.borrar || []).map(r => <li key={`b-${r}`} className="text-red-700 dark:text-red-300">− {r}</li>)}
                                    </ul>
                                </details>
                            ) : null}
                        </>
                    )}
                </div>
            )}
        </Modal>
    );
};

/* ──────────────── resincronizar (plan 7.2) ──────────────── */

const ResincronizarModal: React.FC<{ repo: string; onClose: () => void; onHecho: () => void }> = ({ repo, onClose, onHecho }) => {
    const [confirmo, setConfirmo] = useState(false);
    const [trabajando, setTrabajando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [r, setR] = useState<ResultadoResincronizar | null>(null);

    const resincronizar = async () => {
        setTrabajando(true);
        setError(null);
        try {
            const res = await api.post<{ data: ResultadoResincronizar }>('/sitio-web/publicaciones/resincronizar', { confirmo: true }, { timeout: TIMEOUT_PUBLICAR_MS });
            setR(res.data.data);
            toast.success('Resincronizado con el repositorio del sitio');
            onHecho();
        } catch (e) {
            setError(mensajeError(e, 'No se pudo resincronizar.'));
        } finally {
            setTrabajando(false);
        }
    };

    return (
        <Modal isOpen onClose={trabajando ? () => { /* espera la respuesta */ } : onClose} size="md" icon={RefreshCcw} title="Resincronizar con el sitio"
            description={repo}
            footer={r ? <div className="flex w-full justify-end"><Button onClick={onClose}>Listo</Button></div> : (
                <div className="flex w-full justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={trabajando}>Cancelar</Button>
                    <Button onClick={resincronizar} isLoading={trabajando} disabled={!confirmo} leftIcon={<RefreshCcw className="h-4 w-4" />}>Resincronizar</Button>
                </div>
            )}>
            {r ? (
                <div className="flex flex-col gap-3">
                    <p className="text-sm text-brand-dark">
                        Listo: {r.actualizadas.length} obra{r.actualizadas.length === 1 ? '' : 's'} al día, {r.quitadas.length} quitada{r.quitadas.length === 1 ? '' : 's'} y {r.fotos_rechazadas.length} foto{r.fotos_rechazadas.length === 1 ? '' : 's'} rechazada{r.fotos_rechazadas.length === 1 ? '' : 's'}.
                    </p>
                    {r.avisos.length > 0 && <Aviso icon={AlertTriangle}><ul className="list-disc pl-4">{r.avisos.map(a => <li key={a}>{a}</li>)}</ul></Aviso>}
                    <ListaObras titulo="Quedaron como en el sitio" obras={r.actualizadas} />
                    <ListaObras titulo="Estaban en el sitio y no aquí: quedaron importadas (revísalas)" tono="aviso" obras={r.importadas || []} />
                    <ListaObras titulo="Ya no están en el sitio: quedaron fuera" tono="aviso" obras={r.quitadas} />
                </div>
            ) : (
                <div className="flex flex-col gap-3 text-sm text-brand-dark">
                    <p>Para después de un cambio a mano en el repositorio (por ejemplo, un retiro de emergencia sin la Bóveda). Lo que tiene el repositorio pasa a ser «lo publicado»:</p>
                    <ul className="list-disc pl-5 text-muted-foreground">
                        <li>cada obra queda con la versión del sitio (si es distinta de la de aquí, queda «cambios sin publicar»);</li>
                        <li>una obra que ya no está en el sitio queda fuera, para revisarla antes de volver a incluirla;</li>
                        <li>las fotos que se sacaron del sitio quedan rechazadas.</li>
                    </ul>
                    <Casilla checked={confirmo} onChange={setConfirmo}>Entiendo: el repositorio del sitio pasa a ser la base</Casilla>
                    <FormError message={error} />
                </div>
            )}
        </Modal>
    );
};

export default PublicacionesSitio;
