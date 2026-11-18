import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, Globe, List, MousePointerClick, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Cargando, Skeleton } from '../../ui/Skeleton';
import { Aviso } from '../../costos/piezas';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { recargarPendientesSitioWeb } from '../../../hooks/useSitioWebPendientes';
import { protegerSalida } from '../../../utils/salidaProtegida';
import { cn } from '../../../utils/cn';
import { ConfirmarModal } from '../piezas';
import { PublicarModal } from '../PublicarModal';
import { useEstadoPublicacion } from '../useEstadoPublicacion';
import { pedirBlob } from '../useFotoUrl';
import api from '../../../services/api';
import { mensajeError } from '../sitioWebConfig';
import type { ConfigSitio, EstadoObra, ObraEditor, ResultadoPublicacion } from '../tipos';
import { BandejaFueraDelSitio } from './BandejaFueraDelSitio';
import { BarraEditor, BarraEditorAbajo, BarraEditorArriba, type PropsBarra } from './BarraEditor';
import { GuardarModal } from './GuardarModal';
import { MarcoSitio, type AnchoMarco, type Enviar, type EstadoMarco } from './MarcoSitio';
import { PanelSeleccion, type LugarObra } from './PanelSeleccion';
import {
    REGLA_PRINCIPAL, avisosDeLugar, cambiarEstado, cambioEstructura, camposTocados, contarCambios, crearNueva, descartarNueva, diferencias,
    erroresGuardar, esCampoTexto, estadoDe, faltantesDe, formActual, fueraDelSitio, idsDeLista, incluirDe, incluirEnSitio, mover, moverPaso,
    obraPorId, obraPorSlug, obrasParaPuente, puedeBorrar, puedeDeshacer, puedeRehacer, quitarDelSitio, respaldoDesactualizado, todas,
    type CambiosObra, type EstadoBorrador, type ResultadoOp,
} from './borradorSitio';
import { useBorradorSitio, type ResultadoEstructura, type Transicion } from './useBorradorSitio';
import {
    ESTADO_DE_REGLA, esCampoEnLugar, msgBorrador, msgCampo, msgFoto, msgModo, msgMostrar, rutaInterna, slugDeItem, validarCambio, validarMover,
    type MensajeBoveda, type MensajePuente, type MsgHola, type Regla,
} from './protocolo';

interface Props {
    config: ConfigSitio;
    permisos: { editar: boolean; publicar: boolean; verComo: boolean };
    /** La Lista (con la obra abierta, si viene): adonde ir si el sitio no responde al editor. */
    destinoLista: (id?: number) => string;
    /** Terminó una publicación: la portada vuelve a pedir obras, publicaciones y el número del menú. */
    onPublicado: (r: ResultadoPublicacion) => void;
    onVerPublicaciones: () => void;
}

/** Espera antes de mandar el borrador completo tras un cambio del panel en un dato formateado (tipo, superficie…). */
const DEMORA_BORRADOR_MS = 150;

/** La página del sitio donde está cada lista (para «Ver» una obra que quedó en otra página). */
const PAGINA_DE_REGLA: Record<Regla, string> = {
    'portada-en-obra': '/', 'portada-proximos': '/',
    'proyectos-en-curso': '/proyectos/', 'proyectos-contratados': '/proyectos/', 'proyectos-terminados': '/proyectos/',
};

/**
 * Editor visual del sitio (contrato con el sitio en `docs/editor-visual.md` de lols.cl): el sitio REAL en un iframe y,
 * encima, el borrador de la Bóveda. Se toca un título y se escribe; lo formateado y la portada, en el panel. Etapa A2:
 * la estructura también se arma aquí —«Nueva obra» (barra o la tarjeta «+ Nueva obra» del puente), estado, orden (◀ ▶
 * del panel o arrastrar en el sitio), quitar e incluir— y el borrador que recibe el puente es la verdad de qué obras hay,
 * dónde y en qué orden. Nada llega al sitio hasta «Guardar» (Bóveda) y después «Publicar cambios» (el flujo de siempre,
 * `sitio_web.publicar`). Todo lo que manda el iframe es una propuesta: zod + `validarCambio` / `validarMover`.
 */
export const EditorVisual: React.FC<Props> = ({ config, permisos, destinoLista, onPublicado, onVerPublicaciones }) => {
    const navigate = useNavigate();
    const escritorio = useMediaQuery('(min-width: 768px)');
    const puedeEditar = permisos.editar && !permisos.verComo;
    const puedePublicar = permisos.publicar && !permisos.verComo;

    const b = useBorradorSitio({ puedeEditar });
    const { estado, cambiar, operar, atras, adelante } = b;
    const estadoRef = useRef<EstadoBorrador | null>(estado);
    useLayoutEffect(() => { estadoRef.current = estado; });

    const [ruta, setRuta] = useState('/');
    const [anchoElegido, setAnchoElegido] = useState<AnchoMarco>('computador');
    const ancho: AnchoMarco = escritorio ? anchoElegido : 'celular';
    const [mirarElegido, setMirar] = useState(false);
    const mirar = mirarElegido || !puedeEditar;
    const [seleccion, setSeleccion] = useState<number | null>(null);
    // Teléfono: el panel es una hoja inferior. Tocar un texto del sitio NO la abre (taparía lo que se escribe): la abre
    // tocar la obra (foto, tarjeta, un dato formateado) o «Datos» en la barra de abajo.
    const [hoja, setHoja] = useState(false);
    const [marco, setMarco] = useState<EstadoMarco>('cargando');
    const [recarga, setRecarga] = useState(0);
    const [conexion, setConexion] = useState(0);
    const [hola, setHola] = useState<MsgHola | null>(null);
    const [guardando, setGuardando] = useState(false);
    const [publicando, setPublicando] = useState(false);
    const [vigilada, setVigilada] = useState<number | null>(null);
    const [salida, setSalida] = useState<{ destino: string } | null>(null);

    // ── Hablarle al puente ──
    const enviarRef = useRef<Enviar | null>(null);
    const enviar = useCallback((m: MensajeBoveda, transferir?: Transferable[]) => enviarRef.current?.(m, transferir), []);
    const mandarBorrador = useCallback((e: EstadoBorrador | null = estadoRef.current) => {
        if (e) enviar(msgBorrador(obrasParaPuente(e)));
    }, [enviar]);
    /** La portada nueva (aprobada y todavía no publicada) de cada obra, como bytes transferidos. */
    const mandarFotos = useCallback((e: EstadoBorrador | null, soloId?: number) => {
        for (const o of e?.obras ?? []) {
            const fotoId = o.meta.foto;
            if (!fotoId || (soloId !== undefined && o.meta.id !== soloId)) continue;
            pedirBlob(fotoId, 1600).catch(() => pedirBlob(fotoId, 'maestra'))
                .then(blob => blob.arrayBuffer())
                .then(bytes => enviar(msgFoto(o.json.slug, bytes), [bytes]))
                .catch(() => { /* sin la vista previa de la foto: el sitio muestra la publicada */ });
        }
    }, [enviar]);

    const timerBorrador = useRef<number | null>(null);
    const programarBorrador = useCallback(() => {
        if (timerBorrador.current !== null) window.clearTimeout(timerBorrador.current);
        timerBorrador.current = window.setTimeout(() => { timerBorrador.current = null; mandarBorrador(); }, DEMORA_BORRADOR_MS);
    }, [mandarBorrador]);
    useEffect(() => () => { if (timerBorrador.current !== null) window.clearTimeout(timerBorrador.current); }, []);

    /**
     * Después de un cambio que NO vino del sitio (panel, deshacer, recuperar): los textos van campo a campo (`campo`);
     * si cambió algo formateado (tipo, superficie, servicios, mandante, año), el borrador completo.
     */
    const sincronizar = useCallback((t: Transicion | null) => {
        if (!t || t.antes === t.despues) return;
        // Deshacer o rehacer algo estructural (nueva, orden, fuera/dentro): el puente rearma las listas con el borrador.
        if (cambioEstructura(t.antes, t.despues)) { mandarBorrador(t.despues); return; }
        const tocados = camposTocados(t.antes, t.despues);
        if (!tocados.length) return;
        if (!tocados.every(x => esCampoTexto(x.campo))) { programarBorrador(); return; }
        for (const x of tocados) {
            const o = obraPorId(t.despues, x.id);
            const f = formActual(t.despues, x.id);
            if (o && f && esCampoTexto(x.campo)) enviar(msgCampo(o.json.slug, `/${x.campo}`, f[x.campo]));
        }
    }, [enviar, programarBorrador, mandarBorrador]);

    // «Ver» una obra que está en otra página del sitio: se navega y, cuando esa página saluda, se le pide mostrarla.
    const mostrarAlCargar = useRef<string | null>(null);
    // Cada saludo (cada página que carga) y cuando llega el borrador: el estado completo, el modo y las fotos.
    const cargado = !!estado;
    useEffect(() => {
        if (!conexion || !cargado) return;
        mandarBorrador();
        mandarFotos(estadoRef.current);
        if (mostrarAlCargar.current) { enviar(msgMostrar(mostrarAlCargar.current)); mostrarAlCargar.current = null; }
    }, [conexion, cargado, mandarBorrador, mandarFotos, enviar]);
    useEffect(() => {
        if (conexion) enviar(msgModo(mirar ? 'mirar' : 'editar'));
    }, [conexion, mirar, enviar]);

    // ── Acciones ──
    const cambiarDesdePanel = useCallback((id: number, parcial: CambiosObra, grupo: string | null) => {
        if (!puedeEditar) return;
        sincronizar(cambiar(id, parcial, grupo));
    }, [puedeEditar, sincronizar, cambiar]);
    const hacerDeshacer = useCallback(() => sincronizar(atras()), [sincronizar, atras]);
    const hacerRehacer = useCallback(() => sincronizar(adelante()), [sincronizar, adelante]);

    const pendientes = estado ? contarCambios(estado) : 0;
    const abrirGuardar = useCallback(() => { if (puedeEditar && estadoRef.current && contarCambios(estadoRef.current) > 0) setGuardando(true); }, [puedeEditar]);

    // ── Estructura (A2) ──
    const holaRef = useRef<MsgHola | null>(null);
    useLayoutEffect(() => { holaRef.current = hola; });
    /**
     * Llevar una obra a la vista: si una lista de ESTA página la muestra, `mostrar`; si no, se abre la página de su lista
     * y se muestra cuando esa página salude.
     */
    const verObra = useCallback((id: number, e: EstadoBorrador | null = estadoRef.current) => {
        const o = e ? obraPorId(e, id) : undefined;
        if (!e || !o) return;
        setSeleccion(id);
        const enEstaPagina = (holaRef.current?.listas ?? []).some(l => (l.regla in PAGINA_DE_REGLA) && idsDeLista(e, l.regla as Regla).includes(id));
        if (enEstaPagina || !incluirDe(e, o) && !o.meta.nueva) { enviar(msgMostrar(o.json.slug)); return; }
        const pagina = PAGINA_DE_REGLA[REGLA_PRINCIPAL[estadoDe(e, o)]];
        mostrarAlCargar.current = o.json.slug;
        setRuta(pagina);
        setRecarga(n => n + 1);
    }, [enviar]);
    const avisarLugar = useCallback((antes: EstadoBorrador, despues: EstadoBorrador) => {
        for (const a of avisosDeLugar(antes, despues)) {
            toast(a.texto, { duration: 8000, action: a.regla ? { label: 'Ver', onClick: () => verObra(a.id) } : undefined });
        }
    }, [verObra]);
    /** Una operación de estructura: al borrador (un paso de deshacer), el puente rearma la página y se avisa dónde quedó. */
    const estructural = useCallback((fn: (e: EstadoBorrador) => ResultadoOp, { avisar = true } = {}): ResultadoEstructura => {
        if (!puedeEditar) return { ok: false, motivo: 'Para editar las obras del sitio se necesita «Editar obras del sitio».' };
        const r = operar(fn);
        if (r.ok && r.antes !== r.despues) {
            mandarBorrador(r.despues);
            if (avisar) avisarLugar(r.antes, r.despues);
        }
        return r;
    }, [puedeEditar, operar, mandarBorrador, avisarLugar]);
    /** «Nueva obra» (barra o la tarjeta del puente): al final de su lista, se muestra y el panel pide el nombre. */
    const crearNuevaEn = useCallback((estadoObra: EstadoObra) => {
        const r = estructural(e => crearNueva(e, estadoObra), { avisar: false });
        if (!r.ok || r.id === undefined) return;
        setHoja(true);
        verObra(r.id, r.despues);
    }, [estructural, verObra]);

    const alMensaje = useCallback((m: MensajePuente) => {
        const e = estadoRef.current;
        switch (m.tipo) {
            case 'seleccion': {
                const slug = slugDeItem(m.item);
                const o = e && slug ? obraPorSlug(e, slug) : undefined;
                if (o) {
                    setSeleccion(o.meta.id);
                    if (!esCampoEnLugar(m.campo)) setHoja(true);
                }
                return;
            }
            case 'cambio': {
                if (!puedeEditar || mirar || !e) return;
                const v = validarCambio(m, new Set(todas(e).map(o => o.json.slug)));
                if (!v.ok) return;   // propuesta inválida: el borrador no se toca
                const o = obraPorSlug(e, v.slug);
                if (!o) return;
                // No se le devuelve al sitio: el texto ya está ahí, mientras se escribe.
                cambiar(o.meta.id, { [v.clave]: m.valor }, `${o.meta.id}:${v.clave}`);
                setSeleccion(s => s ?? o.meta.id);
                return;
            }
            case 'navegar': {
                const r = rutaInterna(m.ruta);
                if (!r) return;
                setRuta(r);
                setRecarga(n => n + 1);
                return;
            }
            case 'atajo':
                if (m.accion === 'deshacer') hacerDeshacer();
                else if (m.accion === 'rehacer') hacerRehacer();
                else abrirGuardar();
                return;
            case 'nueva':
                if (puedeEditar && !mirar) crearNuevaEn(ESTADO_DE_REGLA[m.lista]);
                return;
            case 'mover': {
                // Una propuesta: se recalcula aquí y el puente recibe SIEMPRE el borrador (vuelve atrás si no se pudo).
                const v = e ? validarMover(m, new Set(todas(e).map(o => o.json.slug))) : null;
                if (!puedeEditar || mirar || !v || !v.ok) { mandarBorrador(); return; }
                const r = estructural(x => mover(x, m.lista, v.slug, m.indice));
                if (!r.ok) { toast.error(r.motivo); mandarBorrador(); } else if (r.antes === r.despues) mandarBorrador();
                return;
            }
            default:
                return;
        }
    }, [puedeEditar, mirar, cambiar, hacerDeshacer, hacerRehacer, abrirGuardar, crearNuevaEn, estructural, mandarBorrador]);

    const alListo = useCallback((fn: Enviar, h: MsgHola) => {
        enviarRef.current = fn;
        setHola(h);
        setConexion(n => n + 1);
    }, []);
    const alEstado = useCallback((s: EstadoMarco) => {
        if (s !== 'listo') enviarRef.current = null;
        setMarco(s);
    }, []);

    const irARuta = (r: string) => { setRuta(r); setRecarga(n => n + 1); setSeleccion(null); setHoja(false); };
    const mostrar = (id: number) => {
        const o = estado ? obraPorId(estado, id) : undefined;
        if (!o) return;
        setSeleccion(id);
        enviar(msgMostrar(o.json.slug));
    };

    // Atajos en la Bóveda (los del iframe llegan como `atajo`). Deshacer solo fuera de un campo: ahí es el del campo.
    useEffect(() => {
        const alTeclado = (ev: KeyboardEvent) => {
            if (!(ev.ctrlKey || ev.metaKey)) return;
            const k = ev.key.toLowerCase();
            if (k === 's') { ev.preventDefault(); abrirGuardar(); return; }
            const el = ev.target as HTMLElement | null;
            if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
            if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); hacerDeshacer(); } else if ((k === 'z' && ev.shiftKey) || k === 'y') { ev.preventDefault(); hacerRehacer(); }
        };
        window.addEventListener('keydown', alTeclado);
        return () => window.removeEventListener('keydown', alTeclado);
    }, [abrirGuardar, hacerDeshacer, hacerRehacer]);

    // ── Cambios sin guardar ──
    const proteger = puedeEditar && pendientes > 0;
    const protegerRef = useRef(proteger);
    useLayoutEffect(() => { protegerRef.current = proteger; });
    useEffect(() => {
        if (!proteger) return;
        const antes = (ev: BeforeUnloadEvent) => { ev.preventDefault(); ev.returnValue = ''; };
        window.addEventListener('beforeunload', antes);
        return () => window.removeEventListener('beforeunload', antes);
    }, [proteger]);
    // El menú lateral, su número y las pestañas de Sitio web preguntan aquí antes de salir (utils/salidaProtegida).
    useEffect(() => (proteger ? protegerSalida(destino => setSalida({ destino })) : undefined), [proteger]);
    // Lo que no se puede frenar (Atrás, el gesto del teléfono): aviso con «Volver al editor»; lo escrito quedó en la pestaña.
    const navigateRef = useRef(navigate);
    useLayoutEffect(() => { navigateRef.current = navigate; });
    useEffect(() => {
        const sigue = protegerRef;
        const nav = navigateRef;
        return () => {
            if (!sigue.current) return;
            toast.warning('Quedaron cambios sin guardar en el editor visual. Siguen guardados en esta pestaña del navegador.', {
                duration: 12000, action: { label: 'Volver al editor', onClick: () => nav.current('/sitio-web') },
            });
        };
    }, []);
    const irA = (destino: string) => (proteger ? setSalida({ destino }) : navigate(destino));
    const salirSinGuardar = () => {
        const destino = salida?.destino;
        setSalida(null);
        protegerRef.current = false;
        b.descartarTodo();
        if (destino) navigate(destino);
    };

    // ── Guardar ──
    const difs = useMemo(() => (estado ? diferencias(estado) : []), [estado]);
    const errs = useMemo(() => (estado ? erroresGuardar(estado) : []), [estado]);
    const guardar = async () => {
        const antes = estadoRef.current;
        const r = await b.guardar();
        if (!r.ok) return r;
        // La obra nueva abierta en el panel sigue abierta, ya con su id de verdad.
        if (seleccion !== null && seleccion < 0) {
            const tmp = antes ? obraPorId(antes, seleccion)?.json.slug : undefined;
            setSeleccion(tmp && r.mapa[tmp] ? r.mapa[tmp] : null);
        }
        mandarBorrador(r.despues);
        recargarPendientesSitioWeb();
        toast.success('Cambios guardados. El sitio no cambia hasta que se publiquen.');
        return { ok: true as const };
    };
    const recargarTrasChoque = async (ids: number[]) => {
        const t = await b.recargarTrasChoque(ids);
        if (t) mandarBorrador(t.despues);
        else toast.error('No se pudo recargar. Inténtalo de nuevo.');
    };

    // ── Foto ──
    const fotoCambiada = async () => {
        const antes = estadoRef.current;
        const nuevo = await b.cargar();
        if (!nuevo || seleccion === null) return;
        mandarBorrador(nuevo);
        const fotoAntes = antes ? obraPorId(antes, seleccion)?.meta.foto ?? null : null;
        const fotoAhora = obraPorId(nuevo, seleccion)?.meta.foto ?? null;
        if (fotoAhora && fotoAhora !== fotoAntes) mandarFotos(nuevo, seleccion);
        // La vista previa que el sitio tenía ya no corresponde (rechazada o volvió la publicada): la página de nuevo.
        else if (!fotoAhora && fotoAntes) setRecarga(n => n + 1);
        recargarPendientesSitioWeb();
    };

    // ── Lugar, incluir y borrar (panel y bandeja) ──
    function lugarDe(e: EstadoBorrador, o: ObraEditor): LugarObra {
        const regla = REGLA_PRINCIPAL[estadoDe(e, o)];
        const ids = idsDeLista(e, regla);
        const n = ids.indexOf(o.meta.id);
        const motivo = (r: ResultadoOp) => ('motivo' in r ? r.motivo : null);
        return {
            incluida: incluirDe(e, o),
            lista: n >= 0 ? { regla, n: n + 1, total: ids.length } : null,
            motivoAntes: motivo(moverPaso(e, o.meta.id, -1)),
            motivoDespues: motivo(moverPaso(e, o.meta.id, 1)),
            puedeBorrar: puedeBorrar(e, o),
        };
    }
    const incluir = (id: number) => {
        const r = estructural(e => incluirEnSitio(e, id));
        if (!r.ok) { toast.error(r.motivo); setSeleccion(id); setHoja(true); return; }
        const o = obraPorId(r.despues, id);
        if (o && r.antes !== r.despues) {
            toast.success('Vuelve al sitio al guardar y publicar.', { action: { label: 'Ver', onClick: () => verObra(id) } });
        }
    };
    /** Una nueva sin guardar se descarta (deshacer la trae); una guardada nunca publicada, DELETE de siempre. */
    const borrarObra = async (o: ObraEditor) => {
        if (o.meta.nueva) {
            const r = estructural(e => descartarNueva(e, o.meta.id), { avisar: false });
            if (r.ok) { setSeleccion(null); toast('Obra nueva descartada.', { action: { label: 'Deshacer', onClick: hacerDeshacer } }); }
            return;
        }
        try {
            await api.delete(`/sitio-web/obras/${o.meta.id}`);
        } catch (err) {
            toast.error(mensajeError(err, 'No se pudo borrar la obra.'));
            return;
        }
        setSeleccion(null);
        setHoja(false);
        toast.success(`«${o.json.nombre}» se borró.`);
        const nuevo = await b.cargar();
        if (nuevo) mandarBorrador(nuevo);
        recargarPendientesSitioWeb();
    };

    // ── Publicar ──
    const alPublicar = (r: ResultadoPublicacion) => {
        onPublicado(r);
        if (r.modo === 'publicar' && r.estado === 'ok' && r.commit_sha) setVigilada(r.id);
        b.cargar();
    };
    const enLinea = useCallback(() => {
        setVigilada(null);
        setRecarga(n => n + 1);
        toast.success('El sitio ya muestra lo publicado.');
    }, []);

    // ── Pantalla ──
    if (b.falla && !estado) {
        return b.falla.sinMigrar
            ? <EmptyState icon={Globe} title="El módulo todavía no está instalado" description="Falta la actualización de la base de datos (migración 147). Avisa a Mauricio." />
            : <EmptyState icon={Globe} title="No se pudo cargar el editor" description={b.falla.mensaje}
                action={<Button variant="glass" onClick={() => b.cargar()} leftIcon={<RefreshCw className="h-4 w-4" />}>Reintentar</Button>} />;
    }

    const obraSel = estado && seleccion !== null ? obraPorId(estado, seleccion) : undefined;
    const formSel = estado && obraSel ? formActual(estado, obraSel.meta.id) : null;
    const panel = obraSel && formSel ? (
        <PanelSeleccion key={obraSel.meta.id} obra={obraSel} form={formSel} faltantes={faltantesDe(estado!, obraSel.meta.id)}
            puedeEditar={puedeEditar} puedePublicar={puedePublicar}
            onCambiar={(p, g) => cambiarDesdePanel(obraSel.meta.id, p, g)}
            lugar={lugarDe(estado!, obraSel)}
            onCambiarEstado={(est, anio) => { const r = estructural(e => cambiarEstado(e, obraSel.meta.id, est, anio)); return r.ok ? null : r.motivo; }}
            onMover={(d) => { const r = estructural(e => moverPaso(e, obraSel.meta.id, d)); if (!r.ok) toast.error(r.motivo); }}
            onQuitar={() => {
                const r = estructural(e => quitarDelSitio(e, obraSel.meta.id));
                if (r.ok) toast('Queda fuera del sitio. Se retira al guardar y publicar.', { action: { label: 'Deshacer', onClick: hacerDeshacer } });
            }}
            onIncluir={() => incluir(obraSel.meta.id)}
            onBorrar={() => borrarObra(obraSel)}
            onFotoCambiada={fotoCambiada} onCerrar={() => (escritorio ? setSeleccion(null) : setHoja(false))} />
    ) : null;

    const fuera = estado ? fueraDelSitio(estado).map(o => ({
        id: o.meta.id, nombre: formActual(estado, o.meta.id)?.nombre.trim() || o.json.nombre, estado: estadoDe(estado, o),
        faltan: faltantesDe(estado, o.meta.id).length,
    })) : [];
    const bandeja = (
        <BandejaFueraDelSitio obras={fuera} puedeEditar={puedeEditar}
            onVer={(id) => { setSeleccion(id); setHoja(true); }} onIncluir={incluir} />
    );

    const propsBarra: PropsBarra = {
        ruta, onRuta: irARuta, ancho, onAncho: setAnchoElegido,
        puedeDeshacer: !!estado && puedeDeshacer(estado), puedeRehacer: !!estado && puedeRehacer(estado),
        onDeshacer: hacerDeshacer, onRehacer: hacerRehacer, mirar, onMirar: setMirar,
        pendientes, onGuardar: abrirGuardar, puedeEditar,
        puedePublicar, simulacion: config.modo !== 'publicar', onPublicar: () => setPublicando(true),
        onDatos: obraSel ? () => setHoja(true) : undefined,
        onNuevaObra: puedeEditar && !mirar ? crearNuevaEn : undefined,
    };

    const vista = (
        <div className={cn('relative min-w-0 overflow-hidden rounded-card border border-border bg-muted/40',
            escritorio ? 'h-full flex-1' : 'h-[calc(100dvh-13rem)] min-h-[24rem]')} data-estado-marco={marco}>
            <MarcoSitio urlSitio={config.urlSitio} ruta={ruta} ancho={ancho} recarga={recarga} onListo={alListo} onMensaje={alMensaje} onEstado={alEstado} />
            {(marco === 'cargando' || (!estado && marco === 'listo')) && (
                <Cargando que="el sitio" className="absolute inset-0 flex flex-col gap-3 bg-card p-4 md:p-6">
                    <Skeleton className="h-10 w-2/3 max-w-md" />
                    <Skeleton className="h-4 w-1/2 max-w-sm" />
                    <Skeleton className="mt-2 flex-1 rounded-xl" />
                </Cargando>
            )}
            {marco === 'sin_puente' && (
                <div className="absolute inset-0 flex items-center justify-center bg-card p-4">
                    <EmptyState icon={Globe} title="Esta página del sitio no se puede editar todavía"
                        description="El sitio no respondió al editor. Mientras tanto, las obras se editan en la Lista."
                        action={(
                            <div className="flex flex-wrap justify-center gap-2">
                                <Button onClick={() => irA(destinoLista())} leftIcon={<List className="h-4 w-4" />} className="h-11 md:h-9">Ir a la Lista</Button>
                                <Button variant="glass" onClick={() => setRecarga(n => n + 1)} leftIcon={<RefreshCw className="h-4 w-4" />} className="h-11 md:h-9">Reintentar</Button>
                            </div>
                        )} />
                </div>
            )}
        </div>
    );

    const enPagina = (() => {
        if (!estado || !hola) return [];
        const vistos = new Set<string>();
        return hola.listas.flatMap(l => l.items).filter(s => (vistos.has(s) ? false : (vistos.add(s), true)))
            .map(s => obraPorSlug(estado, s)).filter((o): o is NonNullable<typeof o> => !!o);
    })();
    const vacio = (
        <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{puedeEditar
                    ? 'Toca un texto del sitio y escribe, o toca una obra para ver todos sus datos, su portada y su lugar en el sitio. «Nueva obra» agrega una.'
                    : 'Toca una obra del sitio para ver sus datos.'}</p>
            </div>
            {enPagina.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">Obras en esta página</span>
                    <ul className="flex flex-col gap-1">
                        {enPagina.map(o => (
                            <li key={o.meta.id}>
                                <Button variant="ghost" className="h-11 w-full justify-start rounded-xl px-3 text-left text-sm md:h-9" onClick={() => mostrar(o.meta.id)}>
                                    <span className="truncate">{(formActual(estado!, o.meta.id)?.nombre.trim()) || o.json.nombre}</span>
                                </Button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <p className="text-caption text-muted-foreground">
                Lo que escribas queda como borrador hasta «Guardar». El sitio cambia recién al publicar.
            </p>
        </div>
    );

    const desactualizadas = b.recuperable && estado ? respaldoDesactualizado(b.recuperable, estado.obras) : [];

    return (
        <div className={cn('flex min-h-0 flex-col gap-3', !escritorio && puedeEditar && 'pb-20')}>
            {b.recuperable && puedeEditar && (
                <Aviso icon={RotateCcw}>
                    <p className="font-semibold">Quedaron cambios sin guardar de la última vez que usaste el editor.</p>
                    {desactualizadas.length > 0 && <p>Ojo: después alguien guardó {desactualizadas.map(o => `«${o.json.nombre}»`).join(', ')}. Si los recuperas, revisa todo antes de guardar.</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" className="h-11 md:h-9" onClick={() => { const t = b.recuperar(); if (t) mandarBorrador(t.despues); }} leftIcon={<RotateCcw className="h-4 w-4" />}>
                            Recuperar lo que escribiste
                        </Button>
                        <Button size="sm" variant="ghost" className="h-11 md:h-9" onClick={b.descartarRespaldo}>Descartar</Button>
                    </div>
                </Aviso>
            )}
            {b.falla && estado && (
                <Aviso icon={AlertTriangle} tono="peligro">
                    <p>{b.falla.mensaje} Lo que ves puede no estar al día.</p>
                    <Button variant="link" size="sm" className="mt-1 text-xs font-semibold" onClick={() => b.cargar()}>Reintentar</Button>
                </Aviso>
            )}

            {escritorio ? (
                <>
                    <BarraEditor {...propsBarra} />
                    <div className="flex h-[calc(100dvh-15rem)] min-h-[30rem] gap-3">
                        {vista}
                        <aside className="flex w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto overscroll-contain rounded-card border border-border bg-card p-4" aria-label="Obra seleccionada">
                            {panel ?? vacio}
                            {bandeja}
                        </aside>
                    </div>
                </>
            ) : (
                <>
                    <BarraEditorArriba {...propsBarra} />
                    {vista}
                    {bandeja}
                    <BarraEditorAbajo {...propsBarra} />
                    {panel && hoja && (
                        <div className="fixed inset-x-0 bottom-0 z-50 max-h-[65dvh] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-border bg-card px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg"
                            role="dialog" aria-label="Obra seleccionada">
                            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" aria-hidden="true" />
                            {panel}
                        </div>
                    )}
                </>
            )}

            {guardando && estado && (
                <GuardarModal diferencias={difs} errores={errs} onGuardar={guardar} onRecargar={recargarTrasChoque} onClose={() => setGuardando(false)} />
            )}
            {publicando && (
                <PublicarModal modo={config.modo} urlSitio={config.urlSitio} onClose={() => setPublicando(false)} onPublicado={alPublicar}
                    onVerPublicaciones={() => { setPublicando(false); onVerPublicaciones(); }} />
            )}
            {vigilada !== null && <VigiaPublicacion id={vigilada} onEnLinea={enLinea} onTermina={() => setVigilada(null)} />}
            {salida && (
                <ConfirmarModal titulo="Salir sin guardar" textoAccion="Salir sin guardar" peligro onConfirmar={salirSinGuardar} onClose={() => setSalida(null)}>
                    <p>Tienes {pendientes} cambio{pendientes === 1 ? '' : 's'} sin guardar en el editor visual. Si sales, se pierden.</p>
                </ConfirmarModal>
            )}
        </div>
    );
};

/**
 * Sigue la publicación hecha desde el editor hasta que el sitio la muestra (`useEstadoPublicacion`, cada 10 s) y
 * entonces recarga la vista: el sitio de verdad ya trae lo publicado. Si la compilación falla, deja de mirar.
 */
const VigiaPublicacion: React.FC<{ id: number; onEnLinea: () => void; onTermina: () => void }> = ({ id, onEnLinea, onTermina }) => {
    const { datos } = useEstadoPublicacion(id);
    const enLinea = datos?.pasos.find(p => p.clave === 'en_linea')?.estado === 'ok';
    const terminada = !!datos?.terminada;
    useEffect(() => {
        if (enLinea) onEnLinea();
        else if (terminada) onTermina();
    }, [enLinea, terminada, onEnLinea, onTermina]);
    return null;
};

export default EditorVisual;
