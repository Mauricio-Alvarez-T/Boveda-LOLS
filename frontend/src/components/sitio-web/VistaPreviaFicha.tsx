import React from 'react';
import { Building2, Eye, ExternalLink, ImageOff, Image as ImageIcon, Info } from 'lucide-react';
import { Aviso } from '../costos/piezas';
import { useFotoUrl } from './useFotoUrl';
import { fichaDesdeForm, urlObraEnSitio, type FormObra } from './reglas';
import type { JsonObraSitio } from './tipos';

interface Props {
    form: FormObra;
    /** La portada que sale hoy (null = sin foto propia). */
    portada: { id: number; alt: string | null } | null;
    referencia: string | null;
    urlSitio: string;
    /** La obra ya está en el sitio (hay a dónde mandar a mirarla). */
    enSitio: boolean;
    /** Hay cambios sin guardar: la vista los incluye, el JSON de abajo no. */
    sucio: boolean;
    /** Lo que se publicaría con lo guardado (null si le falta algo). */
    json: JsonObraSitio | null;
}

/**
 * La ficha de la obra como la arma el sitio (FichaObra.astro de lols.cl), aproximada: misma pirámide (portada, nombre,
 * titular, recuadro de datos, desafío / solución / resultado) y los mismos campos ocultos —lo vacío no tiene fila; el
 * mandante solo con autorización; año en las terminadas, inicio en las demás—. Con lo que está escrito, aunque no se
 * haya guardado. La de verdad se ve en el sitio después de publicar.
 */
export const VistaPreviaFicha: React.FC<Props> = ({ form, portada, referencia, urlSitio, enSitio, sucio, json }) => {
    const v = fichaDesdeForm(form);
    const { url, error: errorFoto } = useFotoUrl(portada?.id ?? null, 1600);
    const slug = form.slug;

    return (
        <div className="flex flex-col gap-4">
            <Aviso icon={Info} tono="neutro">
                Vista aproximada: la ficha final se ve en <strong>{urlSitio.replace(/^https?:\/\//, '')}</strong> unos minutos después de publicar.
                {sucio && ' Incluye lo que todavía no guardas.'}
                {enSitio && slug && (
                    <>
                        {' '}
                        <a href={urlObraEnSitio(urlSitio, slug)} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-green-700 hover:underline dark:text-green-300">
                            Ver la que está publicada <ExternalLink className="h-3 w-3" />
                        </a>
                    </>
                )}
            </Aviso>

            <article className="overflow-hidden rounded-card border border-border bg-card">
                <div className="flex aspect-[16/9] w-full items-center justify-center bg-muted">
                    {portada ? (
                        url ? <img src={url} alt={portada.alt || ''} className="h-full w-full object-cover" />
                            : errorFoto ? (
                                <div className="flex flex-col items-center gap-2 px-6 text-center">
                                    <ImageOff className="h-8 w-8 text-muted-foreground" />
                                    <span className="text-sm text-muted-foreground">No se pudo cargar la portada aquí (en el sitio sale igual). Vuelve a abrir la pestaña.</span>
                                </div>
                            ) : null
                    ) : (
                        <div className="flex flex-col items-center gap-2 px-6 text-center">
                            {referencia ? <ImageIcon className="h-8 w-8 text-muted-foreground" /> : <Building2 className="h-8 w-8 text-muted-foreground" />}
                            <span className="text-sm text-muted-foreground">
                                {referencia ? 'Imagen referencial del sitio (no es una foto de la obra)'
                                    : form.estado === 'contratado' ? `Recuadro «Render de ${v.nombre || 'la obra'} por recibir»` : 'Sin portada: la obra no sale al sitio'}
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-8 p-5 md:p-8">
                    <header className="flex flex-col gap-2">
                        <p className="text-base font-bold text-brand-dark">{v.nombre || 'Nombre de la obra'}</p>
                        {v.titular && <h3 className="max-w-[20ch] text-title-sm font-bold leading-tight tracking-title text-brand-dark md:text-title">{v.titular}</h3>}
                    </header>

                    <dl className="grid gap-x-6 gap-y-3 border-t border-border pt-5 sm:grid-cols-2">
                        {v.datos.map(([rotulo, dato]) => (
                            <div key={rotulo} className="min-w-0">
                                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{rotulo}</dt>
                                <dd className="mt-0.5 break-words text-sm text-brand-dark">{dato}</dd>
                            </div>
                        ))}
                        <div>
                            <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estado</dt>
                            <dd className="mt-0.5 text-sm text-brand-dark">{v.estado}</dd>
                        </div>
                    </dl>

                    {v.relato.length > 0 && (
                        <div className="grid gap-5 md:grid-cols-3">
                            {v.relato.map(([titulo, texto]) => (
                                <div key={titulo} className="flex flex-col gap-1.5">
                                    <h4 className="text-sm font-semibold text-brand-dark">{titulo}</h4>
                                    {/* Como el sitio (FichaObra.astro, `<p>{texto}</p>` sin pre-line): un salto de línea se ve como un espacio. */}
                                    <p className="text-sm leading-relaxed text-muted-foreground">{texto}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </article>

            <details className="rounded-card border border-border bg-card p-4">
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-brand-dark">
                    <Eye className="h-4 w-4 text-muted-foreground" /> Lo que se publica (archivo de la obra)
                </summary>
                <div className="mt-3 flex flex-col gap-2">
                    <p className="text-xs text-muted-foreground">
                        {json ? 'Con lo guardado. Es todo lo que sale al sitio: nada interno (ni la obra vinculada, ni quién la editó).'
                            : 'Todavía no: le faltan datos para salir al sitio.'}
                    </p>
                    {json && <pre className="max-h-96 overflow-auto rounded-xl bg-muted p-3 text-xs leading-relaxed text-brand-dark">{JSON.stringify(json, null, 2)}</pre>}
                </div>
            </details>
        </div>
    );
};

export default VistaPreviaFicha;
