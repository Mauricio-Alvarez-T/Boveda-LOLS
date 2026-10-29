import React from 'react';
import { AlertTriangle, CheckCircle2, Circle, Clock, CloudUpload, ExternalLink, Info, MinusCircle, XCircle } from 'lucide-react';
import { Aviso } from '../costos/piezas';
import { Button } from '../ui/Button';
import { SiluetaPasos } from './piezas';
import { cn } from '../../utils/cn';
import { useEstadoPublicacion } from './useEstadoPublicacion';
import { TEXTO_PASO, TITULO_PASO } from './sitioWebConfig';
import type { EstadoPaso } from './tipos';

/** Ícono y color de un paso: verde listo, azul en camino, rojo falló, gris esperando o reemplazada. */
function marca(estado: EstadoPaso) {
    if (estado === 'ok') return { Icono: CheckCircle2, clase: 'text-green-700 dark:text-green-300' };
    if (estado === 'fallo' || estado === 'no_llego') return { Icono: XCircle, clase: 'text-red-700 dark:text-red-300' };
    // Quieto (diseno.md §9.3: nada gira como estado; el texto dice que va en camino).
    if (estado === 'compilando') return { Icono: CloudUpload, clase: 'text-blue-700 dark:text-blue-300' };
    if (estado === 'en_cola') return { Icono: Clock, clase: 'text-blue-700 dark:text-blue-300' };
    if (estado === 'reemplazada') return { Icono: MinusCircle, clase: 'text-muted-foreground' };
    return { Icono: Circle, clase: 'text-muted-foreground' };
}

/**
 * Cómo va una publicación real después del commit: entró al repositorio → el sitio se compila → se ve en el sitio
 * (plan 4.7.9). Se consulta cada 10 s mientras está en pantalla y no terminó (`useEstadoPublicacion`). En una
 * simulación no hay pasos: no se publicó nada.
 */
export const EstadoPublicacion: React.FC<{ id: number; urlSitio?: string }> = ({ id, urlSitio }) => {
    const { datos, error, recargar } = useEstadoPublicacion(id);

    if (!datos) {
        return error
            ? <Aviso icon={AlertTriangle} tono="peligro">{error} <Button variant="link" size="sm" className="text-xs font-semibold text-green-700 dark:text-green-300" onClick={recargar}>Reintentar</Button></Aviso>
            : <SiluetaPasos />;
    }
    if (!datos.pasos.length) return null;

    const enLinea = datos.pasos.find(p => p.clave === 'en_linea')?.estado === 'ok';
    return (
        <div className="flex flex-col gap-3">
            <ol className="flex flex-col gap-0" aria-label="Pasos de la publicación">
                {datos.pasos.map((p, i) => {
                    const { Icono, clase } = marca(p.estado);
                    const ultimo = i === datos.pasos.length - 1;
                    return (
                        <li key={p.clave} className="relative flex gap-3 pb-4 last:pb-0">
                            {!ultimo && <span className="absolute left-[9px] top-6 h-[calc(100%-1.25rem)] w-px bg-border" aria-hidden />}
                            <Icono className={cn('mt-0.5 h-5 w-5 shrink-0', clase)} aria-hidden />
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-brand-dark">{TITULO_PASO[p.clave]}</p>
                                <p className="text-xs text-muted-foreground">
                                    {p.clave === 'en_linea' && p.estado === 'pendiente' ? 'El sitio se actualiza en unos 5 a 10 minutos.' : TEXTO_PASO[p.estado]}
                                </p>
                                {p.clave === 'commit' && datos.url_commit && (
                                    <a href={datos.url_commit} target="_blank" rel="noopener noreferrer"
                                        className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline dark:text-green-300">
                                        Ver el cambio en GitHub <ExternalLink className="h-3 w-3" />
                                    </a>
                                )}
                                {p.clave === 'compilacion' && datos.build_url && (
                                    <a href={datos.build_url} target="_blank" rel="noopener noreferrer"
                                        className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline dark:text-green-300">
                                        Ver la compilación <ExternalLink className="h-3 w-3" />
                                    </a>
                                )}
                                {p.clave === 'en_linea' && enLinea && urlSitio && (
                                    <a href={urlSitio} target="_blank" rel="noopener noreferrer"
                                        className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline dark:text-green-300">
                                        Abrir el sitio <ExternalLink className="h-3 w-3" />
                                    </a>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ol>
            {datos.aviso && <Aviso icon={Info} tono="neutro">{datos.aviso}</Aviso>}
            {!datos.terminada && <p className="text-caption text-muted-foreground">Se revisa sola cada 10 segundos mientras esté abierta.</p>}
        </div>
    );
};

export default EstadoPublicacion;
