import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../services/api';
import { codigoError, mensajeError } from '../sitioWebConfig';
import type { Faltante, ObraEditor, ResultadoGuardarEditor } from '../tipos';
import {
    aplicar, borrarRespaldo, crearBorrador, deshacer, guardarRespaldo, hayAlgo, leerRespaldo, ofrecerRespaldo, payloadGuardar, rebasar,
    recargarConChoques, recuperarRespaldo, rehacer, type CambiosObra, type EstadoBorrador, type Respaldo, type ResultadoOp,
} from './borradorSitio';

/** Antes y después de un cambio (el editor decide con los dos qué avisarle al puente). */
export interface Transicion { antes: EstadoBorrador; despues: EstadoBorrador }

/** Una operación de estructura (A2): hecha, con antes y después, o no, con el porqué. */
export type ResultadoEstructura =
    | (Transicion & { ok: true; id?: number })
    | { ok: false; motivo: string; faltantes?: Faltante[] };

export type ResultadoGuardar =
    /** `mapa` = slug provisorio de cada obra nueva (`~n1`) → su id real. */
    | { ok: true; despues: EstadoBorrador; mapa: Record<string, number> }
    | { ok: false; choques: { id: number; nombre: string | null }[]; mensaje: string }
    /** `recargable`: el orden cambió en el servidor (otra persona creó o movió una obra): recargar y volver a guardar. */
    | { ok: false; choques: null; mensaje: string; recargable?: boolean };

const pedirObras = () => api.get<{ data: ObraEditor[] }>('/sitio-web/editor/borrador').then(res => res.data.data || []);

/**
 * El borrador del editor visual con su servidor: carga `GET /editor/borrador`, aplica lo escrito (en el sitio o en el
 * panel) y lo estructural (A2: obras nuevas, estado, orden, fuera/dentro del sitio), deshace/rehace, guarda todo junto
 * (`POST /editor/guardar`, todo o nada) y deja lo hecho en la pestaña del navegador mientras no se guarde
 * (`borradorSitio` respaldo: al volver se ofrece «Recuperar lo que escribiste»). Cada acción devuelve el estado de antes
 * y el de después en el acto (un ref los lleva al día), para que el editor le diga al puente qué cambió sin esperar
 * otro render.
 */
export function useBorradorSitio({ puedeEditar }: { puedeEditar: boolean }) {
    const [estado, setEstado] = useState<EstadoBorrador | null>(null);
    const ref = useRef<EstadoBorrador | null>(null);
    const [falla, setFalla] = useState<{ mensaje: string; sinMigrar: boolean } | null>(null);
    const poner = useCallback((e: EstadoBorrador) => { ref.current = e; setEstado(e); }, []);

    // Lo escrito la vez anterior (Atrás, un enlace, una recarga): se lee antes de cualquier efecto y se ofrece al cargar.
    const [respaldoPrevio] = useState<Respaldo | null>(() => leerRespaldo());
    const [recuperable, setRecuperable] = useState<Respaldo | null>(null);
    const [revisado, setRevisado] = useState(false);

    const puedeEditarRef = useRef(puedeEditar);
    useEffect(() => { puedeEditarRef.current = puedeEditar; });
    const revisadoRef = useRef(false);

    const cargar = useCallback(() => pedirObras()
        .then((obras) => {
            const previo = ref.current;
            // Una recarga (Reintentar, después de una foto o de borrar una obra) no pierde lo hecho.
            const nuevo = previo
                ? { ...crearBorrador(obras, previo.cambios, { nuevas: previo.nuevas, estructura: previo.estructura }), pasado: previo.pasado, futuro: previo.futuro }
                : crearBorrador(obras);
            poner(nuevo);
            setFalla(null);
            // La primera vez que llegan las obras: ¿quedó algo de antes que valga la pena ofrecer?
            if (!revisadoRef.current) {
                revisadoRef.current = true;
                if (puedeEditarRef.current && ofrecerRespaldo(respaldoPrevio, obras)) setRecuperable(respaldoPrevio);
                else borrarRespaldo();
                setRevisado(true);
            }
            return nuevo;
        })
        .catch((e) => {
            setFalla({ mensaje: mensajeError(e, 'No se pudo cargar el sitio para editarlo.'), sinMigrar: codigoError(e) === 'SITIO_WEB_SIN_MIGRAR' });
            return null;
        }), [poner, respaldoPrevio]);
    useEffect(() => { cargar(); }, [cargar]);

    // Mientras haya algo hecho (escrito, obras nuevas, orden, fuera/dentro), queda en la pestaña; sin nada (y nada por
    // recuperar), se va.
    const cambios = estado?.cambios;
    const nuevas = estado?.nuevas;
    const estructura = estado?.estructura;
    useEffect(() => {
        if (!revisado || !ref.current || !cambios || !nuevas || !estructura) return;
        if (hayAlgo({ cambios, nuevas, estructura })) guardarRespaldo(ref.current);
        else if (!recuperable) borrarRespaldo();
    }, [revisado, cambios, nuevas, estructura, recuperable]);

    const transicion = useCallback((fn: (e: EstadoBorrador) => EstadoBorrador): Transicion | null => {
        const antes = ref.current;
        if (!antes) return null;
        const despues = fn(antes);
        if (despues !== antes) poner(despues);
        return { antes, despues };
    }, [poner]);

    const cambiar = useCallback((id: number, parcial: CambiosObra, grupo: string | null = null) =>
        transicion(e => aplicar(e, id, parcial, { t: Date.now(), grupo })), [transicion]);
    const atras = useCallback(() => transicion(deshacer), [transicion]);
    const adelante = useCallback(() => transicion(rehacer), [transicion]);
    /** Crear, mover, cambiar de estado, quitar, incluir o descartar (borradorSitio): un paso de deshacer. */
    const operar = useCallback((fn: (e: EstadoBorrador) => ResultadoOp): ResultadoEstructura => {
        const antes = ref.current;
        if (!antes) return { ok: false, motivo: 'Todavía no se cargan las obras.' };
        const r = fn(antes);
        if ('motivo' in r) return { ok: false, motivo: r.motivo, faltantes: r.faltantes };
        if (r.e !== antes) poner(r.e);
        return { ok: true, antes, despues: r.e, id: r.id };
    }, [poner]);

    const recuperar = useCallback(() => {
        if (!recuperable) return null;
        setRecuperable(null);
        return transicion(e => recuperarRespaldo(e, recuperable));
    }, [recuperable, transicion]);
    const descartarRespaldo = useCallback(() => { borrarRespaldo(); setRecuperable(null); }, []);
    /** «Salir sin guardar»: lo hecho se va (también de la pestaña del navegador). */
    const descartarTodo = useCallback(() => {
        borrarRespaldo();
        setRecuperable(null);
        if (ref.current) poner(crearBorrador(ref.current.obras));
    }, [poner]);

    /** Guardar todo junto. Si alguien guardó una de esas obras entremedio, nada se guarda (409 con la lista). */
    const guardar = useCallback(async (): Promise<ResultadoGuardar> => {
        const e = ref.current;
        if (!e) return { ok: false, choques: null, mensaje: 'Todavía no se cargan las obras.' };
        const enviado = e.cambios;
        let mapa: Record<string, number> = {};
        try {
            const res = await api.post<{ data: ResultadoGuardarEditor }>('/sitio-web/editor/guardar', payloadGuardar(e));
            mapa = Object.fromEntries(Object.entries(res.data?.data?.nuevas || {}).map(([tmp, x]) => [tmp, x.id]));
        } catch (err) {
            const codigo = codigoError(err);
            if (codigo === 'SITIO_WEB_EDITADA_POR_OTRO') {
                const choques = ((err as { response?: { data?: { obras?: { id: number; nombre: string | null }[] } } }).response?.data?.obras) || [];
                return { ok: false, choques, mensaje: mensajeError(err, 'Otra persona guardó cambios mientras editabas.') };
            }
            return { ok: false, choques: null, mensaje: mensajeError(err, 'No se pudieron guardar los cambios.'), recargable: codigo === 'SITIO_WEB_ORDEN_DESACTUALIZADO' };
        }
        // Guardado: la base nueva del servidor (las nuevas ya con su slug de verdad) y, encima, lo escrito mientras tanto.
        try {
            const obras = await pedirObras();
            const despues = rebasar(ref.current ?? e, obras, enviado, mapa);
            poner(despues);
            if (!hayAlgo(despues)) borrarRespaldo();
            return { ok: true, despues, mapa };
        } catch {
            // Se guardó, pero no se pudo releer: sin lo enviado (ya está en el servidor) y a recargar.
            const despues = rebasar(ref.current ?? e, (ref.current ?? e).obras, enviado, mapa);
            poner(despues);
            cargar();
            return { ok: true, despues, mapa };
        }
    }, [poner, cargar]);

    /** Después de un 409: la base nueva; las obras que chocaron pierden lo escrito (con [] no pierde nada). */
    const recargarTrasChoque = useCallback(async (ids: number[]) => {
        const obras = await pedirObras().catch(() => null);
        if (!obras) return null;
        return transicion(e => recargarConChoques(e, obras, ids));
    }, [transicion]);

    return { estado, falla, cargar, cambiar, operar, atras, adelante, guardar, recargarTrasChoque, recuperable, recuperar, descartarRespaldo, descartarTodo };
}
