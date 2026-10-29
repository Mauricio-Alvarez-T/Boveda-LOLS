import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ChevronLeft, ExternalLink, Globe, History, MinusCircle, PlusCircle, RotateCcw, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import { EmptyState } from '../ui/EmptyState';
import { PestanasElasticas } from '../ui/PestanasElasticas';
import { BarraPaginada } from '../ui/BarraPaginada';
import { Aviso } from '../costos/piezas';
import { fmtFechaHora } from '../../utils/fechas';
import { recargarPendientesSitioWeb } from '../../hooks/useSitioWebPendientes';
import { protegerSalida } from '../../utils/salidaProtegida';
import { ConfirmarModal } from './piezas';
import { borrarBorrador, guardarBorrador, leerBorrador, ofrecerBorrador, type BorradorObra } from './borradorObra';
import { EditorObra } from './EditorObra';
import { FotoPortada } from './FotoPortada';
import { VistaPreviaFicha } from './VistaPreviaFicha';
import { AYUDA_ESTADO, codigoError, datosError, mensajeError } from './sitioWebConfig';
import { formDesdeObra, formIguales, formVacio, urlObraEnSitio, type FormObra } from './reglas';
import type { ConfigSitio, DetalleObraSitio, Faltante } from './tipos';

export type PestanaObra = 'datos' | 'fotos' | 'vista' | 'historial';

interface Props {
    /** null = obra nueva. */
    id: number | null;
    pestana: PestanaObra;
    config: ConfigSitio;
    permisos: { editar: boolean; publicar: boolean; obrasVer: boolean };
    onPestana: (p: PestanaObra) => void;
    onVolver: () => void;
    /** Recién creada: abrirla. */
    onCreada: (id: number) => void;
}

const CLASE_TAB = 'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 font-medium whitespace-nowrap';
const CLASE_INACTIVA = 'text-muted-foreground hover:bg-background hover:text-brand-dark';

/**
 * Una obra del sitio (plan 4.8, `?obra=ID&tab=datos|fotos|vista|historial`; `?obra=nueva` para crear). Arriba su
 * estado respecto del sitio y las acciones de la obra (incluir o quitar del sitio, borrar un borrador); abajo los
 * datos, la portada, la vista previa y el historial. El formulario vive aquí (no en la pestaña): cambiar de pestaña
 * no pierde lo escrito, y la vista previa lo muestra aunque no esté guardado.
 */
export const ObraSitio: React.FC<Props> = ({ id, pestana, config, permisos, onPestana, onVolver, onCreada }) => {
    const nueva = id === null;
    const navigate = useNavigate();
    const [detalle, setDetalle] = useState<DetalleObraSitio | null>(null);
    const [falla, setFalla] = useState<string | null>(null);
    // Lo cargado y lo escrito van juntos: al recargar se decide con los dos a la vez si se respeta lo escrito.
    const [edicion, setEdicion] = useState<{ base: FormObra; form: FormObra }>(() => ({ base: formVacio(), form: formVacio() }));
    const { base, form } = edicion;
    const sucio = !formIguales(form, base);
    const setForm = useCallback<React.Dispatch<React.SetStateAction<FormObra>>>(
        upd => setEdicion(e => ({ ...e, form: typeof upd === 'function' ? upd(e.form) : upd })), []);

    // Lo escrito sin guardar de la vez anterior (Atrás, el gesto del teléfono, un enlace): se lee ANTES de cualquier
    // efecto, se ofrece recuperarlo cuando la obra carga y, mientras tanto, no se pisa.
    const [borradorPrevio] = useState(() => leerBorrador(id));
    const [recuperable, setRecuperable] = useState<BorradorObra | null>(null);
    const [borradorRevisado, setBorradorRevisado] = useState(false);

    const proteger = sucio && permisos.editar;
    const protegerRef = useRef(proteger);
    protegerRef.current = proteger;
    /** Sin cambios pendientes (lo escrito pasa a ser lo cargado): la protección deja salir y el borrador se va. */
    const soltar = () => {
        protegerRef.current = false;
        borrarBorrador(id);
        setEdicion(e => ({ ...e, base: e.form }));
    };

    const [confirmar, setConfirmar] = useState<'quitar' | 'borrar' | null>(null);
    /** «Salir sin guardar»: `destino` = a dónde iba (el menú lateral); null = la lista de obras. */
    const [salida, setSalida] = useState<{ destino: string | null } | null>(null);
    const [trabajando, setTrabajando] = useState(false);
    const [faltanParaIncluir, setFaltanParaIncluir] = useState<Faltante[] | null>(null);

    /** `forzar` = después de guardar o al recargar: el formulario vuelve a lo del servidor. Si no, se respeta lo escrito. */
    const cargar = useCallback((forzar = false) => {
        if (id === null) return Promise.resolve();
        return api.get<{ data: DetalleObraSitio }>(`/sitio-web/obras/${id}`)
            .then(res => {
                const d = res.data.data;
                setDetalle(d);
                setFalla(null);
                const f = formDesdeObra(d.obra);
                setEdicion(e => (forzar || formIguales(e.form, e.base) ? { base: f, form: f } : e));
            })
            .catch(e => setFalla(mensajeError(e, 'No se pudo abrir la obra.')));
    }, [id]);

    useEffect(() => { cargar(true); }, [cargar]);

    // Con la obra cargada (o al abrir una nueva), ¿hay algo escrito de antes que valga la pena ofrecer?
    const cargada = nueva || !!detalle;
    useEffect(() => {
        if (borradorRevisado || !cargada) return;
        const cargado = detalle ? formDesdeObra(detalle.obra) : formVacio();
        if (ofrecerBorrador(borradorPrevio, cargado)) setRecuperable(borradorPrevio);
        else borrarBorrador(id);
        setBorradorRevisado(true);
    }, [borradorRevisado, cargada, detalle, borradorPrevio, id]);

    // Mientras haya cambios, lo escrito queda en la pestaña del navegador; sin cambios (y nada por recuperar), se va.
    const versionCargada = detalle?.obra.updated_at ?? null;
    useEffect(() => {
        if (!borradorRevisado) return;
        if (proteger) guardarBorrador(id, { updated_at: versionCargada, form });
        else if (!recuperable) borrarBorrador(id);
    }, [borradorRevisado, proteger, form, id, versionCargada, recuperable]);

    // Cambios sin guardar: el navegador pregunta antes de recargar o cerrar la pestaña (en cualquier pestaña de la
    // obra). No es `useFormDirtyProtection`: ese además marca el body para que CUALQUIER Modal pregunte al cerrarse, y
    // aquí el formulario es de la página (los modales de confirmar preguntarían dos veces).
    useEffect(() => {
        if (!proteger) return;
        const antes = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', antes);
        return () => window.removeEventListener('beforeunload', antes);
    }, [proteger]);

    // El menú lateral (y su número) pregunta aquí antes de navegar (utils/salidaProtegida).
    useEffect(() => (proteger ? protegerSalida(destino => setSalida({ destino })) : undefined), [proteger]);

    // Lo que la pantalla no puede frenar (Atrás, el gesto de volver del teléfono): al salir con cambios, se avisa al
    // tiro con un botón para volver; lo escrito quedó en el borrador y al volver se ofrece recuperarlo.
    const salirRef = useRef({ navigate, nombre: '' });
    salirRef.current = { navigate, nombre: form.nombre.trim() || detalle?.obra.nombre || 'la obra nueva' };
    useEffect(() => {
        const sigue = protegerRef;
        const al = salirRef;
        return () => {
            if (!sigue.current) return;
            const url = `/sitio-web?obra=${id ?? 'nueva'}&tab=datos`;
            toast.warning(`Quedaron cambios sin guardar en «${al.current.nombre}». Siguen guardados en esta pestaña del navegador.`, {
                duration: 12000, action: { label: 'Volver a la obra', onClick: () => al.current.navigate(url) },
            });
        };
    }, [id]);

    const recuperar = () => {
        if (!recuperable) return;
        setEdicion(e => ({ ...e, form: recuperable.form }));
        setRecuperable(null);
        if (pestana !== 'datos') onPestana('datos');
    };
    const descartarBorrador = () => {
        borrarBorrador(id);
        setRecuperable(null);
    };

    const alGuardar = ({ id: nuevoId, nueva: eraNueva }: { id: number; nueva: boolean }) => {
        if (eraNueva) {
            // Sin cambios pendientes: que la protección no pregunte al saltar a la obra creada.
            soltar();
            onCreada(nuevoId);
            return;
        }
        borrarBorrador(id);
        cargar(true);
        recargarPendientesSitioWeb();
    };

    const volver = () => (proteger ? setSalida({ destino: null }) : onVolver());
    const salirSinGuardar = () => {
        const destino = salida?.destino ?? null;
        setSalida(null);
        soltar();
        if (destino) navigate(destino);
        else onVolver();
    };
    const cambiarIncluir = async (incluir: boolean) => {
        if (!detalle) return;
        setTrabajando(true);
        setFaltanParaIncluir(null);
        try {
            await api.put(`/sitio-web/obras/${detalle.obra.id}/incluir`, { incluir });
            toast.success(incluir ? 'Incluida: sale al sitio en la próxima publicación.' : 'Quitada: se retira del sitio en la próxima publicación.');
            setConfirmar(null);
            await cargar();
            recargarPendientesSitioWeb();
        } catch (e) {
            if (codigoError(e) === 'SITIO_WEB_FALTAN_DATOS') setFaltanParaIncluir(datosError<Faltante[]>(e, 'faltantes') || []);
            else toast.error(mensajeError(e, 'No se pudo cambiar.'));
            setConfirmar(null);
        } finally {
            setTrabajando(false);
        }
    };

    const borrar = async () => {
        if (!detalle) return;
        setTrabajando(true);
        try {
            await api.delete(`/sitio-web/obras/${detalle.obra.id}`);
            toast.success('Obra borrada');
            soltar();
            onVolver();
        } catch (e) {
            toast.error(mensajeError(e, 'No se pudo borrar la obra.'));
            setConfirmar(null);
        } finally {
            setTrabajando(false);
        }
    };

    if (!nueva && falla && !detalle) {
        return (
            <EmptyState icon={Globe} title="No se pudo abrir la obra" description={falla}
                action={<Button variant="glass" onClick={onVolver}>Volver a las obras</Button>} />
        );
    }
    if (!nueva && !detalle) return <div className="h-96 rounded-card border border-border bg-card" />;

    const obra = detalle?.obra ?? null;
    const vigente = detalle?.fotos.find(f => f.vigente) ?? null;
    const porAprobar = (detalle?.fotos || []).filter(f => f.estado === 'por_aprobar' || f.estado === 'sin_confirmar').length;
    const estado = detalle?.estadoDerivado ?? 'borrador';
    const enSitio = !!obra?.publicado_at && estado !== 'retiro_pendiente';

    const pestanas: { key: PestanaObra; label: string }[] = [
        { key: 'datos', label: 'Datos' },
        { key: 'fotos', label: 'Portada' },
        { key: 'vista', label: 'Vista previa' },
        { key: 'historial', label: 'Historial' },
    ];
    const activa: PestanaObra = nueva ? 'datos' : pestana;

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
            <div className="flex flex-col gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={volver} leftIcon={<ChevronLeft className="h-4 w-4" />} className="h-11 md:h-9 -ml-2 shrink-0">Obras</Button>
                    <h2 className="min-w-0 flex-1 break-words text-lg font-bold leading-snug tracking-headline text-brand-dark">{nueva ? 'Nueva obra' : obra?.nombre}</h2>
                    {!nueva && <span title={AYUDA_ESTADO[estado]}><StatusBadge domain="sitioWeb" status={estado} showIcon /></span>}
                </div>
                {!nueva && obra && (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <p className="text-sm text-muted-foreground sm:mr-auto">{AYUDA_ESTADO[estado]}</p>
                        <div className="flex flex-wrap gap-2">
                            {enSitio && (
                                <a href={urlObraEnSitio(config.urlSitio, obra.slug)} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium text-brand-dark transition-colors hover:bg-background md:h-9">
                                    <ExternalLink className="h-4 w-4" /> Ver en el sitio
                                </a>
                            )}
                            {permisos.editar && (obra.incluir ? (
                                <Button variant="secondary" size="sm" className="h-11 md:h-9" onClick={() => setConfirmar('quitar')} leftIcon={<MinusCircle className="h-4 w-4" />}>Quitar del sitio</Button>
                            ) : (
                                <Button size="sm" className="h-11 md:h-9" onClick={() => cambiarIncluir(true)} isLoading={trabajando && !confirmar} disabled={sucio}
                                    title={sucio ? 'Guarda los cambios primero' : undefined} leftIcon={<PlusCircle className="h-4 w-4" />}>
                                    Incluir en el sitio
                                </Button>
                            ))}
                            {permisos.editar && !obra.incluir && !obra.publicado_at && (
                                <Button variant="destructive" size="sm" className="h-11 md:h-9" onClick={() => setConfirmar('borrar')} leftIcon={<Trash2 className="h-4 w-4" />}>Borrar</Button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {faltanParaIncluir && (
                <Aviso icon={AlertTriangle}>
                    <p className="font-semibold">Todavía no puede salir al sitio. Le falta:</p>
                    <ul className="mt-1 list-disc pl-4">{faltanParaIncluir.map((f, i) => <li key={`${f.campo}-${i}`}>{f.mensaje}</li>)}</ul>
                </Aviso>
            )}
            {recuperable && permisos.editar && (
                <Aviso icon={RotateCcw}>
                    <p className="font-semibold">Quedaron cambios sin guardar de la última vez que editaste {nueva ? 'esta obra nueva' : 'esta obra'}.</p>
                    {!nueva && recuperable.updated_at !== versionCargada && (
                        <p>Ojo: después alguien guardó la obra. Si los recuperas, revisa todo antes de guardar.</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" className="h-11 md:h-9" onClick={recuperar} leftIcon={<RotateCcw className="h-4 w-4" />}>Recuperar lo que escribiste</Button>
                        <Button size="sm" variant="ghost" className="h-11 md:h-9" onClick={descartarBorrador}>Descartar</Button>
                    </div>
                </Aviso>
            )}
            {sucio && !nueva && permisos.editar && !obra?.incluir && (
                <p className="text-xs text-muted-foreground">Guarda los cambios antes de incluirla en el sitio.</p>
            )}

            {!nueva && <div className="flex min-w-0 items-center">
                <div className="flex w-fit min-w-0 max-w-full rounded-2xl border border-border bg-card p-1">
                    <BarraPaginada>{p => (
                        <PestanasElasticas estiloOpcion={p.estiloOpcion} revelar={p.revelar} opciones={pestanas} activa={activa} onCambiar={onPestana}
                            aria-label="Secciones de la obra" claseFila="gap-1" claseOpcion={CLASE_TAB} claseInactiva={CLASE_INACTIVA}
                            render={o => (<>{o.label}{o.key === 'fotos' && porAprobar > 0 && <span className="ml-1 opacity-70 tabular-nums">{porAprobar}</span>}{o.key === 'datos' && sucio && <><span aria-hidden="true" className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-warning" /><span className="sr-only"> (sin guardar)</span></>}</>)}
                        />
                    )}</BarraPaginada>
                </div>
            </div>}

            {activa === 'datos' && (
                <EditorObra obra={obra} form={form} setForm={setForm} base={base} vigente={vigente} porAprobar={porAprobar}
                    puedeEditar={permisos.editar} obrasVer={permisos.obrasVer} onGuardada={alGuardar} onRecargar={() => cargar(true)}
                    onIrPortada={() => onPestana('fotos')} />
            )}
            {activa === 'fotos' && detalle && obra && (
                <FotoPortada obraId={obra.id} nombreObra={obra.nombre} estado={obra.estado} fotos={detalle.fotos} referencia={obra.referencia}
                    puedeEditar={permisos.editar} puedePublicar={permisos.publicar} onCambio={() => cargar()} />
            )}
            {activa === 'vista' && detalle && obra && (
                <VistaPreviaFicha form={form} portada={vigente ? { id: vigente.id, alt: vigente.alt } : null} referencia={obra.referencia}
                    urlSitio={config.urlSitio} enSitio={enSitio} sucio={sucio} json={detalle.json} />
            )}
            {activa === 'historial' && detalle && (
                detalle.historial.length ? (
                    <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
                        {detalle.historial.map(h => (
                            <li key={h.id} className="flex flex-col gap-0.5 px-4 py-3">
                                <span className="text-sm text-brand-dark">{h.resumen}</span>
                                <span className="text-xs text-muted-foreground">{fmtFechaHora(h.created_at)}{h.usuario_nombre ? ` · ${h.usuario_nombre}` : ''}</span>
                            </li>
                        ))}
                    </ul>
                ) : <EmptyState icon={History} title="Sin movimientos todavía" />
            )}

            {salida && (
                <ConfirmarModal titulo="Salir sin guardar" textoAccion="Salir sin guardar" peligro onConfirmar={salirSinGuardar}
                    onClose={() => setSalida(null)}>
                    <p>Tienes cambios sin guardar en los datos de la obra. Si sales, se pierden.</p>
                </ConfirmarModal>
            )}
            {confirmar === 'quitar' && obra && (
                <ConfirmarModal titulo="Quitar del sitio" textoAccion="Quitar del sitio" tono="aviso" icon={MinusCircle} cargando={trabajando}
                    onConfirmar={() => cambiarIncluir(false)} onClose={() => setConfirmar(null)}>
                    <p>«{obra.nombre}» se retira del sitio en la próxima publicación (su ficha y sus fotos). Queda aquí como borrador y se puede volver a incluir.</p>
                </ConfirmarModal>
            )}
            {confirmar === 'borrar' && obra && (
                <ConfirmarModal titulo="Borrar la obra" textoAccion="Borrar" peligro icon={Trash2} cargando={trabajando}
                    onConfirmar={borrar} onClose={() => setConfirmar(null)}>
                    <p>Se borra «{obra.nombre}» de la Bóveda, con sus fotos. No está en el sitio, así que el sitio no cambia.</p>
                </ConfirmarModal>
            )}
        </div>
    );
};

export default ObraSitio;
