import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Image as ImageIcon, Info, MinusCircle, PlusCircle, RefreshCw, Trash2, X } from 'lucide-react';
import api from '../../../services/api';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { StatusBadge } from '../../ui/StatusBadge';
import { SkeletonFormulario } from '../../ui/Skeleton';
import { Aviso } from '../../costos/piezas';
import { cn } from '../../../utils/cn';
import { Casilla, ConfirmarModal } from '../piezas';
import { FotoPortada } from '../FotoPortada';
import { AYUDA_ESTADO, CAMPO, mensajeError } from '../sitioWebConfig';
import { ANIO_MAX, ANIO_MIN, ESTADOS, ETIQUETA_ESTADO, LARGOS, SERVICIOS, TIPOS, autorizacionBloqueada, erroresForm, type FormObra } from '../reglas';
import type { DetalleObraSitio, EstadoObra, Faltante, ObraEditor } from '../tipos';
import type { CambiosObra } from './borradorSitio';
import { ETIQUETA_REGLA, type Regla } from './protocolo';

/** Dónde está la obra en el sitio con el borrador y qué se puede hacer con su lugar (A2). */
export interface LugarObra {
    /** Sale en el sitio (o saldría: incluida en el borrador). */
    incluida: boolean;
    /** Su lista en /proyectos/ y su posición (null si no se ve: fuera del sitio). */
    lista: { regla: Regla; n: number; total: number } | null;
    /** Por qué no se puede mover un lugar antes / después (null = se puede). */
    motivoAntes: string | null;
    motivoDespues: string | null;
    puedeBorrar: boolean;
}

interface Props {
    obra: ObraEditor;
    /** Lo cargado con lo escrito encima (lo mismo que muestra el sitio). */
    form: FormObra;
    faltantes: Faltante[];
    puedeEditar: boolean;
    puedePublicar: boolean;
    /** `grupo` junta las teclas de un mismo campo en un solo paso de deshacer. */
    onCambiar: (parcial: CambiosObra, grupo: string | null) => void;
    lugar: LugarObra;
    /** Cambiar de estado (Terminado con su año). Devuelve el porqué si no se pudo. */
    onCambiarEstado: (estado: EstadoObra, anio?: string) => string | null;
    onMover: (delta: -1 | 1) => void;
    onQuitar: () => void;
    onIncluir: () => void;
    /** Una guardada nunca publicada: DELETE de siempre; una nueva sin guardar: se descarta. */
    onBorrar: () => Promise<void> | void;
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
 * autorización), más la portada (`FotoPortada`, las dos llaves de «nadie reconocible»). Arriba, su lugar en el sitio
 * (A2): estado (cambia de lista), ◀ ▶ dentro de su lista, quitar / incluir y borrar. Todo queda en el borrador hasta
 * «Guardar», salvo «Borrar» una obra guardada (el DELETE de siempre, con confirmación).
 */
export const PanelSeleccion: React.FC<Props> = ({
    obra, form, faltantes, puedeEditar, puedePublicar, onCambiar, lugar, onCambiarEstado, onMover, onQuitar, onIncluir, onBorrar, onFotoCambiada, onCerrar,
}) => {
    const id = obra.meta.id;
    const nueva = obra.meta.nueva;
    // Una obra recién creada abre con el cursor en el Nombre (todavía no tiene). El panel se monta con `key` = obra.
    const nombreRef = useRef<HTMLInputElement>(null);
    const enfocar = useRef(nueva && !form.nombre.trim());
    useEffect(() => {
        if (!enfocar.current) return undefined;
        enfocar.current = false;
        nombreRef.current?.focus();
        // `mostrar` abre la ficha en el sitio y el sitio enfoca su título (despliegue.ts, accesibilidad): el iframe se
        // queda con el foco. Una sola vez, si el foco se fue al iframe, vuelve al Nombre.
        const t = window.setTimeout(() => {
            if (document.activeElement?.tagName === 'IFRAME') nombreRef.current?.focus();
        }, 400);
        return () => window.clearTimeout(t);
    }, []);
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
                    <h2 className="break-words text-base font-bold leading-snug tracking-headline text-brand-dark">{form.nombre.trim() || (nueva ? 'Nueva obra' : obra.json.nombre)}</h2>
                    {nueva ? (
                        <span className="mt-1 inline-block text-xs font-medium text-amber-800 dark:text-amber-300">Sin guardar · se crea al guardar</span>
                    ) : (
                        <span className="mt-1 inline-block" title={AYUDA_ESTADO[obra.meta.estadoDerivado]}>
                            <StatusBadge domain="sitioWeb" status={obra.meta.estadoDerivado} showIcon />
                        </span>
                    )}
                </div>
                <IconButton aria-label="Cerrar la obra" icon={<X className="h-4 w-4" />} onClick={onCerrar} />
            </div>

            <SeccionLugar key={`${id}:${form.estado}`} nueva={nueva} estado={form.estado} anio={form.anio} lugar={lugar} faltantes={faltantes} solo={solo}
                onCambiarEstado={onCambiarEstado} onMover={onMover} onQuitar={onQuitar} onIncluir={onIncluir} onBorrar={onBorrar}
                nombre={form.nombre.trim() || (nueva ? 'Nueva obra' : obra.json.nombre)} />

            {faltantes.length > 0 && (
                <Aviso icon={AlertTriangle}>
                    <p className="font-semibold">Para salir al sitio le falta:</p>
                    <ul className="mt-1 list-disc pl-4">{faltantes.map((f, i) => <li key={`${f.campo}-${i}`}>{f.mensaje}</li>)}</ul>
                </Aviso>
            )}

            <section className="flex flex-col gap-3">
                <Input ref={nombreRef} label="Nombre *" value={form.nombre} maxLength={LARGOS.nombre} disabled={solo} error={form.nombre.trim() ? undefined : errores.nombre}
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

            {nueva ? (
                <p className="flex items-start gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <ImageIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> La portada se sube después de guardar la obra. Mientras, el sitio muestra el recuadro «por recibir».
                </p>
            ) : (
                <SeccionPortada obra={obra} puedeEditar={puedeEditar} puedePublicar={puedePublicar} onFotoCambiada={onFotoCambiada} />
            )}

            {solo && <p className="text-xs text-muted-foreground">Solo lectura: para editar las obras del sitio se necesita «Editar obras del sitio».</p>}
        </div>
    );
};

/**
 * Su lugar en el sitio: estado (Terminado pide el año ahí mismo), ◀ ▶ dentro de su lista con el porqué cuando no se
 * puede, quitar (ámbar, se deshace) / incluir (solo completa) y borrar (rojo; solo una que nunca salió al sitio).
 */
const SeccionLugar: React.FC<{
    nueva: boolean; estado: EstadoObra; anio: string; lugar: LugarObra; faltantes: Faltante[]; solo: boolean; nombre: string;
    onCambiarEstado: Props['onCambiarEstado']; onMover: Props['onMover']; onQuitar: () => void; onIncluir: () => void; onBorrar: Props['onBorrar'];
}> = ({ nueva, estado, anio, lugar, faltantes, solo, nombre, onCambiarEstado, onMover, onQuitar, onIncluir, onBorrar }) => {
    // Terminado sin año: se pide aquí mismo antes de cambiar.
    const [pideAnio, setPideAnio] = useState(false);
    const [anioNuevo, setAnioNuevo] = useState(anio);
    const [error, setError] = useState<string | null>(null);
    const [confirmar, setConfirmar] = useState<'quitar' | 'borrar' | null>(null);
    const [borrando, setBorrando] = useState(false);

    const elegir = (v: EstadoObra) => {
        setError(null);
        const motivo = onCambiarEstado(v);
        if (motivo && v === 'terminado') setPideAnio(true);
        else if (motivo) setError(motivo);
    };
    const pasarATerminado = () => {
        const motivo = onCambiarEstado('terminado', anioNuevo);
        if (motivo) setError(motivo);
    };
    const borrar = async () => {
        setBorrando(true);
        try { await onBorrar(); } finally { setBorrando(false); setConfirmar(null); }
    };
    const motivos = [lugar.motivoAntes, lugar.motivoDespues].filter((m, i, l): m is string => !!m && l.indexOf(m) === i);

    return (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3" aria-label="Lugar en el sitio">
            <Select label="Estado" value={pideAnio ? 'terminado' : estado} disabled={solo} onChange={e => elegir(e.target.value as EstadoObra)}
                options={ESTADOS.map(v => ({ value: v, label: ETIQUETA_ESTADO[v] }))} />
            {pideAnio && (
                <div className="flex flex-col gap-2">
                    <Input label="Año de término *" value={anioNuevo} inputMode="numeric" maxLength={4} autoFocus placeholder={`${ANIO_MIN}–${ANIO_MAX}`}
                        onChange={e => setAnioNuevo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') pasarATerminado(); }}
                        helperText="Las terminadas van por año en el sitio (la más nueva primero)." />
                    <div className="flex gap-2">
                        <Button size="sm" className="h-11 md:h-9" onClick={pasarATerminado}>Pasar a Terminado</Button>
                        <Button size="sm" variant="ghost" className="h-11 md:h-9" onClick={() => { setPideAnio(false); setError(null); }}>Cancelar</Button>
                    </div>
                </div>
            )}
            {error && <p className="text-xs text-red-700 dark:text-red-300" role="alert">{error}</p>}

            <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 text-sm text-brand-dark">
                        {lugar.lista
                            ? <>N.º {lugar.lista.n} de {lugar.lista.total} en <span className="font-medium">{ETIQUETA_REGLA[lugar.lista.regla]}</span></>
                            : <span className="text-muted-foreground">No se ve en el sitio.</span>}
                    </p>
                    {!solo && lugar.lista && (
                        <div className="flex shrink-0 gap-1" role="group" aria-label="Mover en su lista">
                            <IconButton aria-label="Mover antes" title={lugar.motivoAntes ?? 'Un lugar antes'} icon={<ChevronLeft className="h-4 w-4" />}
                                disabled={!!lugar.motivoAntes} onClick={() => onMover(-1)} />
                            <IconButton aria-label="Mover después" title={lugar.motivoDespues ?? 'Un lugar después'} icon={<ChevronRight className="h-4 w-4" />}
                                disabled={!!lugar.motivoDespues} onClick={() => onMover(1)} />
                        </div>
                    )}
                </div>
                {!solo && lugar.lista && motivos.length > 0 && <p className="text-caption text-muted-foreground">{motivos.join(' ')}</p>}
            </div>

            {!solo && (
                <div className="flex flex-wrap gap-2">
                    {lugar.incluida && !nueva && (
                        <Button variant="secondary" size="sm" className="h-11 md:h-9" leftIcon={<MinusCircle className="h-4 w-4" />} onClick={() => setConfirmar('quitar')}>
                            Quitar del sitio
                        </Button>
                    )}
                    {!lugar.incluida && (
                        <Button variant="secondary" size="sm" className="h-11 md:h-9" leftIcon={<PlusCircle className="h-4 w-4" />} disabled={faltantes.length > 0}
                            title={faltantes.length ? 'Complétala primero (abajo, lo que le falta)' : undefined} onClick={onIncluir}>
                            Incluir en el sitio
                        </Button>
                    )}
                    {lugar.puedeBorrar && (
                        <Button variant="ghost" size="sm" className="h-11 text-red-700 hover:text-red-800 md:h-9 dark:text-red-300" leftIcon={<Trash2 className="h-4 w-4" />}
                            onClick={() => (nueva ? onBorrar() : setConfirmar('borrar'))}>
                            {nueva ? 'Descartar' : 'Borrar'}
                        </Button>
                    )}
                </div>
            )}
            {!solo && !lugar.incluida && (
                <p className="text-caption text-muted-foreground">
                    {nueva ? 'Se crea fuera del sitio. ' : 'Fuera del sitio. '}
                    {faltantes.length ? 'Para incluirla, complétala (abajo, lo que le falta).' : 'Ya está completa: puedes incluirla.'}
                </p>
            )}

            {confirmar === 'quitar' && (
                <ConfirmarModal titulo="Quitar del sitio" textoAccion="Quitar del sitio" tono="aviso" icon={MinusCircle}
                    onConfirmar={() => { setConfirmar(null); onQuitar(); }} onClose={() => setConfirmar(null)}>
                    <p>«{nombre}» se retira del sitio en la próxima publicación (su ficha y sus fotos), después de «Guardar». Queda en la Bóveda y se puede volver a incluir.</p>
                </ConfirmarModal>
            )}
            {confirmar === 'borrar' && (
                <ConfirmarModal titulo="Borrar la obra" textoAccion="Borrar" peligro icon={Trash2} cargando={borrando} onConfirmar={borrar} onClose={() => setConfirmar(null)}>
                    <p>«{nombre}» se borra de la Bóveda ahora mismo, con sus fotos y lo que tengas escrito en ella sin guardar. Nunca salió al sitio. No se puede deshacer.</p>
                </ConfirmarModal>
            )}
        </section>
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
