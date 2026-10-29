import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Ban, Download, FileText, FlaskConical, Globe, Info, RefreshCw, Send } from 'lucide-react';
import api from '../../services/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { FormError } from '../ui/FormError';
import { MarcaEstado } from '../ui/MarcaEstado';
import { Aviso } from '../costos/piezas';
import { descargarArchivo } from '../../utils/descargarArchivo';
import { fmtFecha } from '../../utils/format';
import { Casilla, ListaObras } from './piezas';
import { EstadoPublicacion } from './EstadoPublicacion';
import { TEXTO_CODIGO, TIMEOUT_PUBLICAR_MS, mensajeError } from './sitioWebConfig';
import { TEXTO_MOTIVO } from './reglas';
import type { ModoSitio, PreviaPublicacion, ResultadoPublicacion } from './tipos';

interface Props {
    /** El modo de GET /config (mientras llega la previa). */
    modo: ModoSitio;
    urlSitio: string;
    onClose: () => void;
    /** Terminó (bien o mal): la pantalla vuelve a pedir las obras, las publicaciones y el número del menú. */
    onPublicado: (r: ResultadoPublicacion) => void;
    /** Ir a la pestaña Publicaciones (para resincronizar). */
    onVerPublicaciones: () => void;
}

const MOTIVO_EXCLUIDA: Record<string, string> = {
    faltan_datos: 'Le faltan datos y nunca se publicó',
    foto_rechazada: 'Su portada publicada fue rechazada: sale del sitio',
};

const faltaTexto = (f?: { mensaje: string }[]) => (f && f.length ? f.map(x => x.mensaje).join(' ') : null);

/**
 * Publicar (plan 4.7 y 4.8). Primero muestra lo que va a pasar —sin tocar GitHub (`GET /publicacion/previa`)—: obras
 * nuevas, con cambios, que se retiran, que mantienen su versión publicada y las que quedan fuera; los archivos; lo
 * que bloquea. Se publica con la casilla «Revisé los textos y las fotos». La publicación es UNA petición que espera
 * la respuesta (hasta 2 minutos): el servidor hace el commit completo antes de contestar. En simulación (staging) no
 * se publica nada: se arma un paquete para revisarlo.
 */
export const PublicarModal: React.FC<Props> = ({ modo, urlSitio, onClose, onPublicado, onVerPublicaciones }) => {
    const [previa, setPrevia] = useState<PreviaPublicacion | null>(null);
    const [errorPrevia, setErrorPrevia] = useState<string | null>(null);
    const [reviso, setReviso] = useState(false);
    const [publicando, setPublicando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resultado, setResultado] = useState<ResultadoPublicacion | null>(null);
    const [bajando, setBajando] = useState(false);

    const cargarPrevia = useCallback(() => {
        setErrorPrevia(null);
        api.get<{ data: PreviaPublicacion }>('/sitio-web/publicacion/previa')
            .then(res => setPrevia(res.data.data))
            .catch(e => setErrorPrevia(mensajeError(e, 'No se pudo calcular lo que se va a publicar.')));
    }, []);
    useEffect(() => { cargarPrevia(); }, [cargarPrevia]);

    const simulacion = (previa?.modo ?? modo) !== 'publicar';

    const publicar = async () => {
        setPublicando(true);
        setError(null);
        try {
            const res = await api.post<{ data: ResultadoPublicacion }>('/sitio-web/publicar', { confirmo_revision: true }, { timeout: TIMEOUT_PUBLICAR_MS });
            setResultado(res.data.data);
            onPublicado(res.data.data);
        } catch (e) {
            setError(mensajeError(e, 'No se pudo publicar.'));
        } finally {
            setPublicando(false);
        }
    };

    const bajarPaquete = async (id: number) => {
        setBajando(true);
        await descargarArchivo(api, `/sitio-web/publicaciones/${id}/paquete`, {
            nombre: `lols-cl-simulacion-${id}.zip`, modo: 'download', fallbackError: 'No se pudo descargar el paquete.',
        });
        setBajando(false);
    };

    const titulo = resultado ? 'Resultado' : simulacion ? 'Simular publicación' : 'Publicar en lols.cl';
    const bloqueado = !!previa && previa.bloqueos.length > 0;

    const footer = resultado ? (
        <div className="flex w-full justify-end gap-2">
            {resultado.paquete && (
                <Button variant="glass" onClick={() => bajarPaquete(resultado.id)} isLoading={bajando} leftIcon={<Download className="h-4 w-4" />}>Descargar paquete</Button>
            )}
            <Button onClick={onClose}>Listo</Button>
        </div>
    ) : (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {publicando && (
                <span className="text-xs text-muted-foreground sm:mr-auto" role="status">
                    {simulacion ? 'Armando el paquete…' : 'Publicando… puede tardar un minuto. No cierres esta ventana.'}
                </span>
            )}
            <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose} disabled={publicando} className="flex-1 sm:flex-none">Cancelar</Button>
                <Button onClick={publicar} isLoading={publicando} disabled={!previa || !reviso || bloqueado || !previa.hay_cambios}
                    leftIcon={simulacion ? <FlaskConical className="h-4 w-4" /> : <Send className="h-4 w-4" />} className="flex-1 sm:flex-none">
                    {simulacion ? 'Simular' : 'Publicar'}
                </Button>
            </div>
        </div>
    );

    return (
        <Modal isOpen onClose={publicando ? () => { /* espera la respuesta */ } : onClose} size="lg" icon={Globe} title={titulo}
            description={simulacion ? 'Simulación: no se publica nada en el sitio.' : `Un solo cambio en ${urlSitio.replace(/^https?:\/\//, '')}, con todas las obras incluidas.`}
            footer={footer}>
            {resultado ? <Resultado r={resultado} urlSitio={urlSitio} onVerPublicaciones={onVerPublicaciones} />
                : errorPrevia ? (
                    <div className="flex flex-col items-start gap-2">
                        <FormError message={errorPrevia} />
                        <Button variant="glass" onClick={cargarPrevia} leftIcon={<RefreshCw className="h-4 w-4" />}>Reintentar</Button>
                    </div>
                )
                    : !previa ? <div className="h-64 rounded-xl bg-muted/50" aria-busy="true" />
                        : (
                            <div className="flex flex-col gap-4">
                                {simulacion && (
                                    <Aviso icon={FlaskConical} tono="neutro">
                                        <strong>Simulación: no se publica nada.</strong> {previa.motivo ? TEXTO_MOTIVO[previa.motivo] : ''} Se arma un paquete
                                        (ZIP) con los archivos que se escribirían, para revisarlo.
                                    </Aviso>
                                )}
                                {previa.bloqueos.length > 0 && (
                                    <Aviso icon={Ban} tono="peligro">
                                        <p className="font-semibold">No se puede publicar todavía:</p>
                                        <ul className="mt-1 list-disc pl-4">{previa.bloqueos.map(b => <li key={b}>{b}</li>)}</ul>
                                    </Aviso>
                                )}
                                {previa.avisos.length > 0 && (
                                    <Aviso icon={AlertTriangle}>
                                        <ul className="list-disc pl-4">{previa.avisos.map(a => <li key={a}>{a}</li>)}</ul>
                                    </Aviso>
                                )}

                                <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-brand-dark">
                                    {simulacion ? 'Si se publicara, el sitio mostraría' : 'Después de publicar, el sitio va a mostrar'}{' '}
                                    <strong>{previa.obras_incluidas} obra{previa.obras_incluidas === 1 ? '' : 's'}</strong>.
                                    {previa.cambios.iguales > 0 && ` ${previa.cambios.iguales} no cambian.`}
                                    {previa.base && (
                                        <span className="block text-xs text-muted-foreground">
                                            Se compara con {previa.base.modo === 'importacion' ? 'lo importado del sitio' : 'la última publicación'} (#{previa.base.id}, {fmtFecha(previa.base.created_at)}).
                                        </span>
                                    )}
                                </div>

                                {!previa.hay_cambios && previa.bloqueos.length === 0 && (
                                    <Aviso icon={Info} tono="neutro">
                                        {previa.cambios.mantienen.length
                                            ? 'No hay nada nuevo que publicar: las obras a las que les faltan datos mantienen la versión que el sitio ya muestra (complétalas para que sus cambios salgan).'
                                            : 'No hay nada nuevo que publicar: el sitio ya muestra lo que hay aquí.'}
                                    </Aviso>
                                )}

                                <ListaObras titulo="Nuevas en el sitio" obras={previa.cambios.nuevas} />
                                <ListaObras titulo="Con cambios" obras={previa.cambios.cambiadas} />
                                <ListaObras titulo="Se retiran del sitio" tono="aviso" obras={previa.cambios.retiradas} />
                                <ListaObras titulo="Mantienen la versión publicada" tono="aviso"
                                    obras={previa.cambios.mantienen.map(o => ({ ...o, nota: faltaTexto(o.faltantes) ? `Le falta: ${faltaTexto(o.faltantes)}` : null }))} />
                                <ListaObras titulo="Quedan fuera" tono="aviso"
                                    obras={previa.cambios.excluidas.map(o => ({ ...o, nota: MOTIVO_EXCLUIDA[o.motivo] ?? faltaTexto(o.faltantes) }))} />

                                {(previa.archivos.escribir.length + previa.archivos.borrar.length) > 0 && (
                                    <details className="rounded-xl border border-border px-4 py-3">
                                        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-brand-dark">
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                            Archivos: {previa.archivos.escribir.length} para escribir, {previa.archivos.borrar.length} para borrar
                                        </summary>
                                        <ul className="mt-2 flex flex-col gap-0.5 break-all text-xs text-muted-foreground">
                                            {previa.archivos.escribir.map(r => <li key={`e-${r}`}>+ {r}</li>)}
                                            {previa.archivos.borrar.map(r => <li key={`b-${r}`} className="text-red-700 dark:text-red-300">− {r}</li>)}
                                        </ul>
                                    </details>
                                )}

                                <Casilla checked={reviso} onChange={setReviso} disabled={bloqueado || !previa.hay_cambios}
                                    nota={simulacion ? 'Igual que al publicar de verdad.' : 'Lo publicado queda en el historial público del sitio.'}>
                                    Revisé los textos y las fotos
                                </Casilla>
                                <FormError message={error} />
                            </div>
                        )}
        </Modal>
    );
};

/* ──────────────── el resultado ──────────────── */

const Resultado: React.FC<{ r: ResultadoPublicacion; urlSitio: string; onVerPublicaciones: () => void }> = ({ r, urlSitio, onVerPublicaciones }) => {
    const salioBien = r.estado === 'ok' || r.estado === 'simulada' || r.estado === 'sin_cambios';
    const titulo = {
        ok: `Publicada (#${r.id})`,
        simulada: `Simulación lista (#${r.id})`,
        sin_cambios: 'No había nada que cambiar en el sitio',
        error: 'No se publicó',
        en_curso: 'No se pudo confirmar',
        interrumpida: 'No se publicó',
    }[r.estado];
    const n = r.cambios.nuevas.length + r.cambios.cambiadas.length + r.cambios.retiradas.length;
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
                <MarcaEstado estado={salioBien ? 'listo' : 'fallo'} tamano="md" />
                <div className="min-w-0">
                    <p className="text-base font-semibold text-brand-dark">{titulo}</p>
                    <p className="text-sm text-muted-foreground">
                        {r.estado === 'ok' && `${n} obra${n === 1 ? '' : 's'} con cambios · ${r.archivos.escribir + r.archivos.borrar} archivo${r.archivos.escribir + r.archivos.borrar === 1 ? '' : 's'}. El sitio se actualiza en unos 5 a 10 minutos.`}
                        {r.estado === 'simulada' && 'No se publicó nada. Descarga el paquete para revisar los archivos.'}
                        {r.estado === 'sin_cambios' && 'El sitio ya muestra lo que hay aquí.'}
                        {(r.estado === 'error' || r.estado === 'interrumpida') && (r.error_codigo && TEXTO_CODIGO[r.error_codigo] ? TEXTO_CODIGO[r.error_codigo] : 'Revisa el detalle.')}
                        {r.estado === 'en_curso' && 'La próxima publicación lo revisa sola.'}
                    </p>
                </div>
            </div>
            {r.error_mensaje && (
                <Aviso icon={AlertTriangle} tono={r.estado === 'en_curso' ? 'aviso' : 'peligro'}>
                    {r.error_mensaje}
                    {r.error_codigo === 'SITIO_WEB_REPO_MODIFICADO' && (
                        <> <Button variant="link" size="sm" className="text-xs font-semibold text-green-700 dark:text-green-300" onClick={onVerPublicaciones}>Ir a Resincronizar</Button></>
                    )}
                </Aviso>
            )}
            {r.avisos.length > 0 && (
                <Aviso icon={AlertTriangle}>
                    <ul className="list-disc pl-4">{r.avisos.map(a => <li key={a}>{a}</li>)}</ul>
                </Aviso>
            )}
            {r.conciliadas.length > 0 && (
                <Aviso icon={Info} tono="neutro">
                    Se revisó una publicación anterior que había quedado a medias: {r.conciliadas.map(c => `#${c.id} ${c.estado === 'ok' ? 'sí entró' : 'no entró'}`).join(', ')}.
                </Aviso>
            )}
            {r.estado === 'ok' && r.modo === 'publicar' && (
                <div className="rounded-xl border border-border p-4">
                    <EstadoPublicacion id={r.id} urlSitio={urlSitio} />
                </div>
            )}
        </div>
    );
};

export default PublicarModal;
