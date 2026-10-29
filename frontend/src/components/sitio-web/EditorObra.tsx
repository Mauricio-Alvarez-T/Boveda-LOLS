import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Link2, Lock, RefreshCw, Save, Undo2, Unlink, Wand2 } from 'lucide-react';
import api from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { SearchableSelect } from '../ui/SearchableSelect';
import { FormError } from '../ui/FormError';
import { Aviso, Opciones } from '../costos/piezas';
import { fmtFecha } from '../../utils/format';
import { cn } from '../../utils/cn';
import { Casilla } from './piezas';
import { Skeleton, Cargando } from '../ui/Skeleton';
import { CAMPO, codigoError, mensajeError } from './sitioWebConfig';
import {
    ANIO_MAX, ANIO_MIN, ETIQUETA_ESTADO, LARGOS, SERVICIOS, TIPOS,
    autorizacionBloqueada, cuerpoDesdeForm, erroresForm, faltantes, formIguales, obraParaReglas, slugDesde, soloCambios,
    type FormObra,
} from './reglas';
import type { EstadoObra, FotoSitio, ObraDisponible, ObraSitio, SugerenciasObra } from './tipos';

interface Props {
    /** null = obra nueva. */
    obra: ObraSitio | null;
    form: FormObra;
    setForm: React.Dispatch<React.SetStateAction<FormObra>>;
    /** Lo cargado (para saber qué cambió). */
    base: FormObra;
    /** La portada que sale hoy y cuántas esperan aprobación (para los faltantes en vivo). */
    vigente: FotoSitio | null;
    porAprobar: number;
    puedeEditar: boolean;
    /** Vincular con una obra de la Bóveda pide además «Ver obras». */
    obrasVer: boolean;
    onGuardada: (r: { id: number; nueva: boolean }) => void;
    onRecargar: () => void;
    onIrPortada?: () => void;
}

const OPCIONES_ESTADO = ETIQUETA_ESTADO as Record<EstadoObra, string>;

/** Los campos que pueden impedir guardar, en el orden en que aparecen (el primero con error se enfoca). */
type CampoConError = 'nombre' | 'slug' | 'superficie_m2' | 'anio';
const CAMPOS_CON_ERROR: CampoConError[] = ['nombre', 'slug', 'superficie_m2', 'anio'];
/** Errores del servidor que son de un campo: se muestran en ese campo. */
const CAMPO_DEL_CODIGO: Record<string, CampoConError> = {
    SITIO_WEB_NOMBRE: 'nombre',
    SITIO_WEB_SLUG: 'slug',
    SITIO_WEB_SLUG_RESERVADO: 'slug',
    SITIO_WEB_SLUG_OCUPADO: 'slug',
    SITIO_WEB_SLUG_CONGELADO: 'slug',
};
const idCampo = (k: CampoConError) => `sitio-obra-${k}`;
/** Lleva el campo a la vista y lo enfoca (después de pintar el error). */
const enfocarCampo = (k: CampoConError) => requestAnimationFrame(() => {
    const el = document.getElementById(idCampo(k));
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
});
/** Mismo rótulo que el de `Input`: el formulario se lee parejo. */
const ROTULO = 'mb-1.5 ml-0.5 block text-sm font-medium text-muted-foreground';

/**
 * Los datos de una obra del sitio (plan 4.8): todo lo que va al JSON de lols.cl, incluida la dirección (D3: se
 * publica). Lo que falta para salir al sitio se calcula mientras se escribe (`reglas.faltantes`, espejo del backend)
 * y se guarda igual: faltar algo no impide guardar, impide incluirla. La dirección web se congela al publicarse.
 * Concurrencia: el PUT lleva la versión cargada; si otra persona guardó antes (409), aviso con «Recargar». La
 * protección de cambios sin guardar vive en `ObraSitio` (dueño del formulario): cubre también las otras pestañas.
 */
export const EditorObra: React.FC<Props> = ({ obra, form, setForm, base, vigente, porAprobar, puedeEditar, obrasVer, onGuardada, onRecargar, onIrPortada }) => {
    const nueva = !obra;
    const congelado = !!obra?.slug_congelado;
    const sucio = !formIguales(form, base);

    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conflicto, setConflicto] = useState(false);
    const [mostrarErrores, setMostrarErrores] = useState(false);
    // Un 4xx del servidor que es de UN campo (dirección web ocupada, reservada…): el error va en ese campo, no abajo.
    const [errorServidor, setErrorServidor] = useState<{ campo: CampoConError; mensaje: string; valor: string } | null>(null);

    const poner = <K extends keyof FormObra>(k: K, v: FormObra[K]) => setForm(f => ({ ...f, [k]: v }));

    const errores = erroresForm(form, { nueva });
    const err = (k: keyof FormObra) => {
        // El del servidor vale mientras el campo siga como estaba al guardar.
        if (errorServidor && errorServidor.campo === k && String(form[k]) === errorServidor.valor) return errorServidor.mensaje;
        return mostrarErrores || (k !== 'nombre' && form[k] !== base[k]) ? errores[k] : undefined;
    };
    const vivo = useMemo(
        () => faltantes(obraParaReglas(form, obra?.referencia ?? null), vigente ? { alt: vigente.alt } : null, { porAprobar }),
        [form, obra?.referencia, vigente, porAprobar],
    );

    // ── La autorización del mandante es para ESE nombre ──
    const guardadoMandante = obra ? { mandante: obra.mandante, mandante_autoriza: obra.mandante_autoriza } : null;
    const bloqueaAutoriza = autorizacionBloqueada(guardadoMandante, form.mandante);
    const sinMandante = !form.mandante.trim();
    // Si el nombre cambió, la casilla se apaga en el mismo cambio (el servidor la anularía igual).
    const cambiarMandante = (v: string) => setForm(f => ({
        ...f, mandante: v, mandante_autoriza: autorizacionBloqueada(guardadoMandante, v) || !v.trim() ? false : f.mandante_autoriza,
    }));

    // ── Vínculo con una obra de la Bóveda (solo con «Ver obras») ──
    const [disponibles, setDisponibles] = useState<ObraDisponible[] | null>(null);
    const [sugerencias, setSugerencias] = useState<SugerenciasObra | null>(null);
    const vincula = obrasVer && puedeEditar;
    useEffect(() => {
        if (!vincula) return;
        api.get<{ data: ObraDisponible[] }>('/sitio-web/obras/disponibles')
            .then(res => setDisponibles(res.data.data || []))
            .catch(() => setDisponibles([]));
    }, [vincula]);
    const opcionesObras = useMemo(() => (disponibles || []).map(o => ({ value: o.id, label: o.finalizada ? `${o.nombre} (finalizada)` : o.nombre })), [disponibles]);

    /** Lo que la Bóveda ya sabe de la obra: completa solo lo vacío (en una obra nueva, casi todo). */
    const completarCon = (s: SugerenciasObra) => {
        setForm(f => ({
            ...f,
            obra_id: s.obra_id,
            nombre: f.nombre.trim() ? f.nombre : s.nombre,
            slug: congelado || f.slug.trim() ? f.slug : (nueva ? '' : s.slug),
            direccion: f.direccion.trim() ? f.direccion : (s.direccion ?? ''),
            estado: nueva ? s.estado : f.estado,
            anio: f.anio.trim() || s.anio === null ? f.anio : String(s.anio),
            inicio: f.inicio.trim() ? f.inicio : (s.inicio ?? ''),
            superficie_m2: f.superficie_m2.trim() || !s.superficie_m2 ? f.superficie_m2 : String(s.superficie_m2),
        }));
    };
    const [trayendo, setTrayendo] = useState(false);
    const leerSugerencias = async (id: number) => {
        setTrayendo(true);
        try {
            const res = await api.get<{ data: SugerenciasObra }>(`/sitio-web/obras/sugerencias/${id}`);
            setSugerencias(res.data.data);
            return res.data.data;
        } catch (e) {
            toast.error(mensajeError(e, 'No se pudieron leer los datos de esa obra.'));
            return null;
        } finally {
            setTrayendo(false);
        }
    };
    const elegirObra = async (v: string | number | null) => {
        const id = v === null || v === '' ? null : Number(v);
        if (!id) { poner('obra_id', null); return; }
        poner('obra_id', id);
        // En una obra nueva se completa sola; en una que ya existe, con «Traer sus datos».
        if (nueva) {
            const s = await leerSugerencias(id);
            if (s) completarCon(s);
        }
    };
    const traerDatos = async () => {
        if (!form.obra_id) return;
        const s = sugerencias?.obra_id === form.obra_id ? sugerencias : await leerSugerencias(form.obra_id);
        if (s) { completarCon(s); toast.success('Se completó lo que estaba vacío con los datos de la Bóveda.'); }
    };
    const nombreVinculo = !form.obra_id ? null
        : form.obra_id === obra?.obra_id && obra.obra_nombre ? obra.obra_nombre
            : disponibles?.find(o => o.id === form.obra_id)?.nombre ?? (sugerencias?.obra_id === form.obra_id ? sugerencias.nombre : `Obra n.º ${form.obra_id}`);

    const guardar = async () => {
        if (Object.keys(errores).length) {
            setMostrarErrores(true);
            // En el teléfono el campo malo suele quedar arriba, fuera de la pantalla: se lleva a la vista y se enfoca.
            const primero = CAMPOS_CON_ERROR.find(k => errores[k]);
            if (primero) enfocarCampo(primero);
            return;
        }
        setGuardando(true);
        setError(null);
        setErrorServidor(null);
        try {
            if (nueva) {
                const res = await api.post<{ data: { id: number; slug: string } }>('/sitio-web/obras', cuerpoDesdeForm(form, { nueva: true }));
                toast.success('Obra creada. Queda fuera del sitio hasta que la incluyas.');
                onGuardada({ id: res.data.data.id, nueva: true });
            } else {
                const cambios = soloCambios(cuerpoDesdeForm(form, { slugCongelado: congelado }), cuerpoDesdeForm(base, { slugCongelado: congelado }));
                if (!Object.keys(cambios).length) { onGuardada({ id: obra.id, nueva: false }); return; }
                await api.put(`/sitio-web/obras/${obra.id}`, { ...cambios, updated_at: obra.updated_at });
                toast.success('Cambios guardados');
                onGuardada({ id: obra.id, nueva: false });
            }
        } catch (e) {
            const codigo = codigoError(e);
            const campo = codigo ? CAMPO_DEL_CODIGO[codigo] : undefined;
            if (codigo === 'SITIO_WEB_EDITADA_POR_OTRO') setConflicto(true);
            else if (campo) {
                setErrorServidor({ campo, mensaje: mensajeError(e, 'Revisa este dato.'), valor: String(form[campo]) });
                enfocarCampo(campo);
            } else setError(mensajeError(e, 'No se pudo guardar la obra.'));
        } finally {
            setGuardando(false);
        }
    };

    const recargar = () => { setConflicto(false); setError(null); onRecargar(); };
    const descartar = () => { setForm(base); setError(null); setMostrarErrores(false); };

    const largo = (k: keyof typeof LARGOS) => ({ maxLength: LARGOS[k] });
    const contador = (v: string, max: number) => (
        <span className={cn('text-caption tabular-nums', v.length > max * 0.9 ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground')}>{v.length} / {max}</span>
    );
    const deshabilitado = !puedeEditar;
    const slugMostrado = form.slug || slugDesde(form.nombre);

    return (
        <div className="flex flex-col gap-5">
            {conflicto && (
                <Aviso icon={AlertTriangle} tono="peligro">
                    <p className="font-semibold">Otra persona guardó cambios en esta obra mientras la editabas.</p>
                    <p>Recarga para ver lo último y vuelve a hacer tus cambios (lo que escribiste se pierde al recargar).</p>
                    <Button size="sm" variant="secondary" className="h-11 md:h-9 mt-2" onClick={recargar} leftIcon={<RefreshCw className="h-4 w-4" />}>Recargar</Button>
                </Aviso>
            )}

            {vivo.length > 0 ? (
                <Aviso icon={AlertTriangle}>
                    <p className="font-semibold">Para salir al sitio le falta:</p>
                    <ul className="mt-1 list-disc pl-4">
                        {vivo.map((f, i) => (
                            <li key={`${f.campo}-${i}`}>
                                {f.mensaje}
                                {f.campo === 'portada' && onIrPortada && !nueva && (
                                    <> <Button variant="link" size="sm" className="text-xs font-semibold text-green-700 dark:text-green-300" onClick={onIrPortada}>Ir a la portada</Button></>
                                )}
                            </li>
                        ))}
                    </ul>
                    {nueva && <p className="mt-1 text-muted-foreground">Igual puedes guardarla: queda como borrador, fuera del sitio.</p>}
                </Aviso>
            ) : null}

            {/* ── Lo básico ── */}
            <section className="flex flex-col gap-4 rounded-card border border-border bg-card p-4 md:p-5">
                <h3 className="text-sm font-semibold text-foreground">Lo básico</h3>

                {vincula && (
                    <div className="flex flex-col gap-2">
                        <span className={ROTULO}>Obra de la Bóveda (opcional)</span>
                        {nombreVinculo ? (
                            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2">
                                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1 text-sm text-brand-dark">{nombreVinculo}</span>
                                <Button size="sm" className="h-11 md:h-9" variant="ghost" onClick={traerDatos} isLoading={trayendo} leftIcon={<Wand2 className="h-4 w-4" />} disabled={deshabilitado}>
                                    Traer sus datos
                                </Button>
                                <Button size="sm" className="h-11 md:h-9" variant="ghost" onClick={() => elegirObra(null)} leftIcon={<Unlink className="h-4 w-4" />} disabled={deshabilitado}>Quitar vínculo</Button>
                            </div>
                        ) : disponibles === null ? (
                            <Cargando que="las obras de la Bóveda"><Skeleton className="h-11 rounded-xl" /></Cargando>
                        ) : (
                            <SearchableSelect options={opcionesObras} value={null} onChange={elegirObra} disabled={deshabilitado}
                                placeholder={opcionesObras.length ? 'Buscar obra para traer sus datos…' : 'No quedan obras sin vincular'} />
                        )}
                        <p className="text-caption text-muted-foreground">
                            Trae la dirección, el inicio y el año de término que ya están en la Bóveda (solo llena lo vacío). El vínculo nunca sale al sitio.
                        </p>
                    </div>
                )}

                <Input id={idCampo('nombre')} label="Nombre de la obra *" value={form.nombre} onChange={e => poner('nombre', e.target.value)} {...largo('nombre')}
                    error={err('nombre')} disabled={deshabilitado} placeholder="Ej.: Gorbea 3082" />

                <div className="flex flex-col gap-1.5">
                    <span className="ml-0.5 text-sm font-medium text-muted-foreground">Dirección web en el sitio</span>
                    {congelado ? (
                        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2.5">
                            <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 break-all text-base text-brand-dark">/proyectos/{form.slug}/</span>
                        </div>
                    ) : (
                        <Input id={idCampo('slug')} value={form.slug} onChange={e => poner('slug', e.target.value.toLowerCase())} {...largo('slug')} error={err('slug')}
                            placeholder={slugDesde(form.nombre) || 'se-arma-del-nombre'} disabled={deshabilitado} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                    )}
                    <p className="ml-0.5 text-caption text-muted-foreground">
                        {congelado
                            ? 'Ya está publicada: no se cambia (rompería los enlaces que ya circulan).'
                            : `Queda como …/proyectos/${slugMostrado || '…'}/. Se arma sola del nombre; después de publicar ya no se cambia.`}
                    </p>
                </div>

                <div>
                    <span className={ROTULO}>Estado *</span>
                    {deshabilitado ? <p className="text-base text-brand-dark">{ETIQUETA_ESTADO[form.estado]}</p>
                        : <Opciones etiqueta="Estado de la obra" valor={form.estado} opciones={OPCIONES_ESTADO} onChange={v => poner('estado', v)} />}
                </div>

                <Input label="Titular" value={form.titular} onChange={e => poner('titular', e.target.value)} {...largo('titular')} disabled={deshabilitado}
                    helperText="El resultado en una frase, no el nombre de la obra. Ej.: «Locales comerciales y oficinas, 6 pisos.»" />

                <Select label="Tipo de obra" value={form.tipo} onChange={e => poner('tipo', e.target.value)} disabled={deshabilitado}
                    options={[{ value: '', label: 'Sin tipo' }, ...TIPOS.map(t => ({ value: t, label: t })),
                        ...(form.tipo && !TIPOS.includes(form.tipo) ? [{ value: form.tipo, label: `${form.tipo} (ya no existe en el sitio)` }] : [])]} />

                <div>
                    <span className={ROTULO}>Servicios * <span className="text-xs">(al menos uno)</span></span>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Servicios de LOLS en la obra">
                        {SERVICIOS.map(s => {
                            const marcado = form.servicios.includes(s.slug);
                            return (
                                <Button key={s.slug} type="button" size="sm" variant={marcado ? 'primary' : 'secondary'} aria-pressed={marcado} disabled={deshabilitado}
                                    className="h-11 md:h-9 text-xs" onClick={() => poner('servicios', marcado ? form.servicios.filter(x => x !== s.slug) : [...form.servicios, s.slug])}>
                                    {s.nombre}
                                </Button>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ── Ubicación y datos ── */}
            <section className="flex flex-col gap-4 rounded-card border border-border bg-card p-4 md:p-5">
                <h3 className="text-sm font-semibold text-foreground">Ubicación y datos</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Comuna *" value={form.comuna} onChange={e => poner('comuna', e.target.value)} {...largo('comuna')} disabled={deshabilitado} placeholder="Ej.: Santiago" />
                    <Input label="Dirección" value={form.direccion} onChange={e => poner('direccion', e.target.value)} {...largo('direccion')} disabled={deshabilitado}
                        helperText="Se publica en el sitio." placeholder="Ej.: Gorbea 3082" />
                    <Input id={idCampo('superficie_m2')} label="Superficie construida (m²)" value={form.superficie_m2} onChange={e => poner('superficie_m2', e.target.value)} inputMode="numeric"
                        error={err('superficie_m2')} disabled={deshabilitado} placeholder="Ej.: 6800" />
                    {form.estado === 'terminado' ? (
                        <Input id={idCampo('anio')} label="Año de término *" value={form.anio} onChange={e => poner('anio', e.target.value)} inputMode="numeric" maxLength={4}
                            error={err('anio')} disabled={deshabilitado} placeholder={`${ANIO_MIN}–${ANIO_MAX}`} />
                    ) : (
                        <Input label={form.estado === 'contratado' ? 'Inicio previsto' : 'Inicio'} value={form.inicio} onChange={e => poner('inicio', e.target.value)}
                            {...largo('inicio')} disabled={deshabilitado} placeholder="Ej.: Marzo 2027" />
                    )}
                </div>

                <div className="flex flex-col gap-2">
                    <Input label="Mandante" value={form.mandante} onChange={e => cambiarMandante(e.target.value)} {...largo('mandante')} disabled={deshabilitado}
                        helperText="La empresa, nunca el nombre de una persona." />
                    <Casilla checked={form.mandante_autoriza} onChange={v => poner('mandante_autoriza', v)} disabled={deshabilitado || sinMandante || bloqueaAutoriza}
                        nota={bloqueaAutoriza
                            ? `La autorización era para «${obra?.mandante}». Guarda el nombre nuevo y vuelve a marcarla.`
                            : obra?.mandante_autoriza && !sucio && obra.mandante_autoriza_por_nombre
                                ? `Lo marcó ${obra.mandante_autoriza_por_nombre}${obra.mandante_autoriza_at ? ` el ${fmtFecha(obra.mandante_autoriza_at)}` : ''}.`
                                : 'Sin esta casilla, el nombre del mandante no sale al sitio.'}>
                        El mandante autorizó publicar su nombre
                    </Casilla>
                </div>
            </section>

            {/* ── La historia ── */}
            <section className="flex flex-col gap-4 rounded-card border border-border bg-card p-4 md:p-5">
                <div>
                    <h3 className="text-sm font-semibold text-foreground">La historia de la obra</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">Opcional. Lo que se deje vacío no aparece en la ficha.</p>
                </div>
                {([
                    ['desafio', 'Desafío', 'Qué problema tenía el mandante.'],
                    ['solucion', 'Solución', 'Qué hizo LOLS y cómo.'],
                    ['resultado', 'Resultado', 'Qué se logró.'],
                ] as const).map(([k, titulo, ayuda]) => (
                    <div key={k} className="flex flex-col gap-1.5">
                        <label htmlFor={`sitio-${k}`} className="ml-0.5 text-sm font-medium text-muted-foreground">{titulo}</label>
                        <textarea id={`sitio-${k}`} rows={3} className={cn(CAMPO, 'resize-y')} value={form[k]} onChange={e => poner(k, e.target.value)}
                            maxLength={LARGOS[k]} placeholder={ayuda} disabled={deshabilitado} />
                        <div className="flex justify-end">{contador(form[k], LARGOS[k])}</div>
                    </div>
                ))}
            </section>

            <FormError message={error} />

            {/* Fija abajo solo cuando hay algo que guardar: en el teléfono no tapa el formulario mientras se lee. */}
            {puedeEditar && (sucio || nueva) && (
                <div className="sticky bottom-0 z-10 -mx-1 flex flex-col gap-2 rounded-card border border-border bg-card/95 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-end">
                    {sucio && !nueva && <span className="text-xs text-amber-800 dark:text-amber-300 sm:mr-auto">Hay cambios sin guardar.</span>}
                    {mostrarErrores && Object.keys(errores).length > 0 && <span className="text-xs text-red-700 dark:text-red-300 sm:mr-auto">Revisa los campos marcados.</span>}
                    <div className="flex gap-2">
                        {sucio && !nueva && (
                            <Button variant="ghost" onClick={descartar} disabled={guardando} leftIcon={<Undo2 className="h-4 w-4" />} className="flex-1 sm:flex-none">Descartar</Button>
                        )}
                        <Button onClick={guardar} isLoading={guardando} disabled={!sucio && !nueva} leftIcon={<Save className="h-4 w-4" />} className="flex-1 sm:flex-none">
                            {nueva ? 'Crear obra' : 'Guardar'}
                        </Button>
                    </div>
                </div>
            )}
            {!puedeEditar && <p className="text-xs text-muted-foreground">Solo lectura: para editar las obras del sitio se necesita «Editar obras del sitio».</p>}
        </div>
    );
};

export default EditorObra;
