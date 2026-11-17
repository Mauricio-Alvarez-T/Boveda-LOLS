import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, Image as ImageIcon, Info, RefreshCw, X } from 'lucide-react';
import api from '../../../services/api';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { StatusBadge } from '../../ui/StatusBadge';
import { SkeletonFormulario } from '../../ui/Skeleton';
import { Aviso } from '../../costos/piezas';
import { cn } from '../../../utils/cn';
import { Casilla } from '../piezas';
import { FotoPortada } from '../FotoPortada';
import { AYUDA_ESTADO, CAMPO, mensajeError } from '../sitioWebConfig';
import { ANIO_MAX, ANIO_MIN, LARGOS, SERVICIOS, TIPOS, autorizacionBloqueada, erroresForm, type FormObra } from '../reglas';
import type { DetalleObraSitio, Faltante, ObraEditor } from '../tipos';
import { etiquetaEstado, type CambiosObra } from './borradorSitio';

interface Props {
    obra: ObraEditor;
    /** Lo cargado con lo escrito encima (lo mismo que muestra el sitio). */
    form: FormObra;
    faltantes: Faltante[];
    puedeEditar: boolean;
    puedePublicar: boolean;
    /** `grupo` junta las teclas de un mismo campo en un solo paso de deshacer. */
    onCambiar: (parcial: CambiosObra, grupo: string | null) => void;
    /** El estado (y el orden, crear, quitar) se cambia en la Lista (etapa A2 del editor). */
    onIrALista: () => void;
    /** Después de subir, aprobar o rechazar una foto: el editor vuelve a pedir el borrador y le pasa la foto al sitio. */
    onFotoCambiada: () => void;
    onCerrar: () => void;
}

const ROTULO = 'mb-1.5 ml-0.5 block text-sm font-medium text-muted-foreground';
const TEXTOS_LARGOS = [
    ['desafio', 'Desafío'], ['solucion', 'Solución'], ['resultado', 'Resultado'],
] as const;

/**
 * La obra tocada en el sitio: los mismos textos que se escriben en el lugar (los dos lados muestran lo mismo) y lo que
 * en el sitio sale formateado y no se escribe ahí (tipo, superficie, año o inicio, servicios, mandante con su
 * autorización), más la portada (`FotoPortada`, las dos llaves de «nadie reconocible»). El estado se ve, pero se cambia
 * en la Lista: mover una obra entre listas del sitio es la etapa A2.
 */
export const PanelSeleccion: React.FC<Props> = ({ obra, form, faltantes, puedeEditar, puedePublicar, onCambiar, onIrALista, onFotoCambiada, onCerrar }) => {
    const id = obra.meta.id;
    const poner = <K extends keyof CambiosObra>(k: K, v: CambiosObra[K], teclas = true) => onCambiar({ [k]: v } as CambiosObra, teclas ? `${id}:${k}` : null);
    const errores = erroresForm(form);
    const solo = !puedeEditar;

    // La autorización del mandante es para ESE nombre (mismo criterio que la Lista y el backend).
    const guardado = { mandante: obra.meta.mandante, mandante_autoriza: obra.meta.mandante_autoriza };
    const bloquea = autorizacionBloqueada(guardado, form.mandante);
    const cambiarMandante = (v: string) => onCambiar({
        mandante: v, mandante_autoriza: autorizacionBloqueada(guardado, v) || !v.trim() ? false : form.mandante_autoriza,
    }, `${id}:mandante`);

    const contador = (v: string, max: number) => (
        <span className={cn('text-caption tabular-nums', v.length > max * 0.9 ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground')}>{v.length} / {max}</span>
    );

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <h2 className="break-words text-base font-bold leading-snug tracking-headline text-brand-dark">{form.nombre.trim() || obra.json.nombre}</h2>
                    <span className="mt-1 inline-block" title={AYUDA_ESTADO[obra.meta.estadoDerivado]}>
                        <StatusBadge domain="sitioWeb" status={obra.meta.estadoDerivado} showIcon />
                    </span>
                </div>
                <IconButton aria-label="Cerrar la obra" icon={<X className="h-4 w-4" />} onClick={onCerrar} />
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Estado:</span>
                <span className="font-medium text-brand-dark">{etiquetaEstado(obra)}</span>
                <Button variant="link" size="sm" className="ml-auto text-xs font-semibold" onClick={onIrALista}>Cambiar en Lista</Button>
            </div>

            {faltantes.length > 0 && (
                <Aviso icon={AlertTriangle}>
                    <p className="font-semibold">Para salir al sitio le falta:</p>
                    <ul className="mt-1 list-disc pl-4">{faltantes.map((f, i) => <li key={`${f.campo}-${i}`}>{f.mensaje}</li>)}</ul>
                </Aviso>
            )}

            <section className="flex flex-col gap-3">
                <Input label="Nombre *" value={form.nombre} maxLength={LARGOS.nombre} disabled={solo} error={form.nombre.trim() ? undefined : errores.nombre}
                    onChange={e => poner('nombre', e.target.value)} />
                <Input label="Titular" value={form.titular} maxLength={LARGOS.titular} disabled={solo} onChange={e => poner('titular', e.target.value)} />
                <Select label="Tipo de obra" value={form.tipo} disabled={solo} onChange={e => poner('tipo', e.target.value, false)}
                    options={[{ value: '', label: 'Sin tipo' }, ...TIPOS.map(t => ({ value: t, label: t })),
                        ...(form.tipo && !TIPOS.includes(form.tipo) ? [{ value: form.tipo, label: `${form.tipo} (ya no existe en el sitio)` }] : [])]} />
                <div className="grid grid-cols-2 gap-3">
                    <Input label="Comuna *" value={form.comuna} maxLength={LARGOS.comuna} disabled={solo} onChange={e => poner('comuna', e.target.value)} />
                    <Input label="Superficie (m²)" value={form.superficie_m2} inputMode="numeric" disabled={solo} error={errores.superficie_m2}
                        onChange={e => poner('superficie_m2', e.target.value)} placeholder="Ej.: 6800" />
                </div>
                <Input label="Dirección" value={form.direccion} maxLength={LARGOS.direccion} disabled={solo} onChange={e => poner('direccion', e.target.value)} />
                {form.estado === 'terminado' ? (
                    <Input label="Año de término *" value={form.anio} inputMode="numeric" maxLength={4} disabled={solo} error={errores.anio}
                        onChange={e => poner('anio', e.target.value)} placeholder={`${ANIO_MIN}–${ANIO_MAX}`} />
                ) : (
                    <Input label={form.estado === 'contratado' ? 'Inicio previsto' : 'Inicio'} value={form.inicio} maxLength={LARGOS.inicio} disabled={solo}
                        onChange={e => poner('inicio', e.target.value)} placeholder="Ej.: Marzo 2027" />
                )}
                <div>
                    <span className={ROTULO}>Servicios * <span className="text-xs">(al menos uno)</span></span>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Servicios de LOLS en la obra">
                        {SERVICIOS.map(s => {
                            const marcado = form.servicios.includes(s.slug);
                            return (
                                <Button key={s.slug} type="button" size="sm" variant={marcado ? 'primary' : 'secondary'} aria-pressed={marcado} disabled={solo}
                                    className="h-11 text-xs md:h-9"
                                    onClick={() => poner('servicios', marcado ? form.servicios.filter(x => x !== s.slug) : [...form.servicios, s.slug], false)}>
                                    {s.nombre}
                                </Button>
                            );
                        })}
                    </div>
                </div>
                <div className="flex flex-col gap-2">
                    <Input label="Mandante" value={form.mandante} maxLength={LARGOS.mandante} disabled={solo} onChange={e => cambiarMandante(e.target.value)}
                        helperText="La empresa, nunca el nombre de una persona." />
                    <Casilla checked={form.mandante_autoriza} onChange={v => poner('mandante_autoriza', v, false)} disabled={solo || !form.mandante.trim() || bloquea}
                        nota={bloquea ? `La autorización era para «${obra.meta.mandante}». Guarda el nombre nuevo y vuelve a marcarla.`
                            : 'Sin esta casilla, el nombre del mandante no sale al sitio.'}>
                        El mandante autorizó publicar su nombre
                    </Casilla>
                </div>
                {TEXTOS_LARGOS.map(([k, titulo]) => (
                    <div key={k} className="flex flex-col gap-1.5">
                        <label htmlFor={`editor-${id}-${k}`} className="ml-0.5 text-sm font-medium text-muted-foreground">{titulo}</label>
                        <textarea id={`editor-${id}-${k}`} rows={3} className={cn(CAMPO, 'resize-y')} value={form[k]} maxLength={LARGOS[k]} disabled={solo}
                            onChange={e => poner(k, e.target.value)} />
                        <div className="flex justify-end">{contador(form[k], LARGOS[k])}</div>
                    </div>
                ))}
            </section>

            <SeccionPortada obra={obra} puedeEditar={puedeEditar} puedePublicar={puedePublicar} onFotoCambiada={onFotoCambiada} />

            {solo && <p className="text-xs text-muted-foreground">Solo lectura: para editar las obras del sitio se necesita «Editar obras del sitio».</p>}
        </div>
    );
};

/** La portada se abre a pedido (baja el detalle de la obra con sus fotos). */
const SeccionPortada: React.FC<{ obra: ObraEditor; puedeEditar: boolean; puedePublicar: boolean; onFotoCambiada: () => void }> = ({ obra, puedeEditar, puedePublicar, onFotoCambiada }) => {
    const [abierta, setAbierta] = useState(false);
    const [detalle, setDetalle] = useState<DetalleObraSitio | null>(null);
    const [falla, setFalla] = useState<string | null>(null);
    const id = obra.meta.id;

    const cargar = useCallback(() => api.get<{ data: DetalleObraSitio }>(`/sitio-web/obras/${id}`)
        .then((res) => { setDetalle(res.data.data); setFalla(null); })
        .catch(e => setFalla(mensajeError(e, 'No se pudo abrir la portada.'))), [id]);
    useEffect(() => { if (abierta) cargar(); }, [abierta, cargar]);

    return (
        <section className="rounded-xl border border-border bg-card">
            <Button variant="ghost" className="h-11 w-full justify-between rounded-xl px-3 md:h-10" aria-expanded={abierta} onClick={() => setAbierta(a => !a)}
                leftIcon={<ImageIcon className="h-4 w-4 text-muted-foreground" />} rightIcon={<ChevronDown className={cn('h-4 w-4 transition-transform', abierta && 'rotate-180')} />}>
                <span className="mr-auto text-sm font-semibold">Portada{obra.meta.fotos_por_aprobar > 0 ? ` · ${obra.meta.fotos_por_aprobar} por aprobar` : ''}</span>
            </Button>
            {abierta && (
                <div className="border-t border-border p-3">
                    {falla ? (
                        <Aviso icon={AlertTriangle} tono="peligro">
                            {falla} <Button variant="link" size="sm" className="text-xs font-semibold" onClick={() => { setFalla(null); cargar(); }} leftIcon={<RefreshCw className="h-3 w-3" />}>Reintentar</Button>
                        </Aviso>
                    ) : !detalle ? (
                        <SkeletonFormulario campos={2} que="la portada" />
                    ) : (
                        <FotoPortada obraId={id} nombreObra={detalle.obra.nombre} estado={detalle.obra.estado} fotos={detalle.fotos} referencia={detalle.obra.referencia}
                            puedeEditar={puedeEditar} puedePublicar={puedePublicar} onCambio={() => { cargar(); onFotoCambiada(); }} />
                    )}
                    <p className="mt-2 flex items-center gap-1 text-caption text-muted-foreground">
                        <Info className="h-3 w-3 shrink-0" /> La foto aprobada se ve aquí en el sitio; sale de verdad al publicar.
                    </p>
                </div>
            )}
        </section>
    );
};

export default PanelSeleccion;
