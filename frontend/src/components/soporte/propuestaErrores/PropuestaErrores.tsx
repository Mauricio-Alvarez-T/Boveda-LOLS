import React, { useState } from 'react';
import {
    AlertCircle, Camera, CheckCircle2, ChevronRight, Clock, Info, Laptop, MessageSquareText, Mic, Package, Repeat, Search,
    Smartphone, WifiOff, X,
} from 'lucide-react';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { Modal } from '../../ui/Modal';
import { PestanasElasticas } from '../../ui/PestanasElasticas';
import { cn } from '../../../utils/cn';
import { FOTO_CELULAR, PENDIENTES, REPORTES, type ReporteEjemplo } from './datosPropuesta';

/**
 * «Errores» de Soporte — SOLO staging (Soporte.tsx lo gatea con VITE_ENTORNO). Propuesta con datos inventados para
 * conversarla con Mauricio (Marcos 2026-10-26): al salir un error, la app saca sola una foto de la pantalla, le avisa
 * a la persona («Le avisamos a soporte…», puede contar qué pasó o quitar la foto) y el aviso llega a esta pestaña.
 * Fotos 30 días; errores repetidos agrupados; «sin señal» aparte y sin foto. No llama a la API ni guarda nada.
 */

type Clave = 'persona' | 'A' | 'B';
const OPCIONES: { key: Clave; label: string }[] = [
    { key: 'persona', label: 'Lo que ve la persona' },
    { key: 'A', label: 'A · Lista y detalle' },
    { key: 'B', label: 'B · Tarjetas con foto' },
];
const IDEA: Record<Clave, string> = {
    persona: 'Al salir un error, la app saca la foto y avisa a soporte; la persona puede contar qué pasó (o dictarlo) o quitar la foto. En el computador el aviso sale abajo a la derecha, como hoy.',
    A: 'Como «Personas»: los errores a la izquierda y el elegido a la derecha, con la foto entera.',
    B: 'Cada error es una tarjeta con su foto; al tocarla se abre el detalle.',
};

// ───────────────────────── Piezas ─────────────────────────
const Foto: React.FC<{ src: string | null; className?: string; alt: string }> = ({ src, className, alt }) => (
    src ? (
        <img src={src} alt={alt} className={cn('rounded-xl border border-border bg-muted object-cover object-top', className)} />
    ) : (
        <div className={cn('flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-muted text-center text-xs text-muted-foreground', className)}>
            <WifiOff aria-hidden className="h-5 w-5" />
            Sin foto: fue por falta de señal
        </div>
    )
);

const Iniciales: React.FC<{ nombre: string }> = ({ nombre }) => (
    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
        {nombre.split(' ').map(p => p[0]).slice(0, 2).join('')}
    </span>
);

const Marcas: React.FC<{ r: ReporteEjemplo }> = ({ r }) => (
    <span className="flex flex-wrap gap-1.5">
        {r.revisado ? <Chip tone="success" label="Revisado" icon={<CheckCircle2 className="h-3 w-3" />} /> : <Chip tone="warning" label="Sin revisar" />}
        {r.veces > 1 && <Chip label={`${r.veces} veces`} icon={<Repeat className="h-3 w-3" />} />}
        {r.escribio && <Chip label="Escribió" icon={<MessageSquareText className="h-3 w-3" />} />}
        {r.sinSenal && <Chip tone="info" label="Sin señal" icon={<WifiOff className="h-3 w-3" />} />}
    </span>
);

const Filtros: React.FC<{ apilado?: boolean }> = ({ apilado }) => (
    <div className={cn('flex flex-col gap-2', !apilado && 'sm:flex-row sm:items-center')}>
        <div className="flex h-10 flex-1 items-center gap-2 rounded-control border border-input bg-card px-3 text-sm text-muted-foreground">
            <Search aria-hidden className="h-4 w-4" /> Buscar persona, mensaje, pantalla…
        </div>
        <div className="inline-flex w-fit rounded-xl border border-border bg-card p-0.5 text-sm">
            {[`Sin revisar (${PENDIENTES})`, 'Revisados', 'Todos'].map((t, i) => (
                <span key={t} className={cn('rounded-lg px-3 py-1.5 font-medium', i === 0 ? 'bg-muted text-foreground' : 'text-muted-foreground')}>{t}</span>
            ))}
        </div>
    </div>
);

const Detalle: React.FC<{ r: ReporteEjemplo }> = ({ r }) => (
    <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
                <Iniciales nombre={r.nombre} />
                <div>
                    <p className="text-section font-semibold text-brand-dark">{r.nombre}</p>
                    <p className="text-xs text-muted-foreground">{r.rol}{r.obra ? ` · Obra ${r.obra}` : ''}</p>
                </div>
            </div>
            <Marcas r={r} />
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-900/50 dark:bg-red-500/10">
            <p className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
                <AlertCircle aria-hidden className="h-4 w-4 shrink-0" />{r.mensaje}
            </p>
            <p className="mt-0.5 pl-6 text-xs text-muted-foreground">El mensaje que le mostró la app</p>
        </div>
        <Foto src={r.foto} alt={`Foto de la pantalla de ${r.nombre}`}
            className={r.dispositivo === 'celular' && r.foto ? 'mx-auto h-96 w-auto max-w-full' : 'aspect-video w-full'} />
        {r.escribio ? (
            <blockquote className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">Lo que escribió</p>
                «{r.escribio}»
            </blockquote>
        ) : (
            <p className="text-xs text-muted-foreground">No escribió nada (el aviso llegó igual).</p>
        )}
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Pantalla</dt><dd className="text-foreground">{r.pantalla}</dd>
            <dt className="text-muted-foreground">Cuándo</dt>
            <dd className="text-foreground">{r.cuando}{r.primera ? ` (la primera vez, ${r.primera})` : ''}</dd>
            <dt className="text-muted-foreground">Veces</dt><dd className="text-foreground">{r.veces}</dd>
            <dt className="text-muted-foreground">Desde</dt>
            <dd className="flex items-center gap-1.5 text-foreground">
                {r.dispositivo === 'celular' ? <Smartphone aria-hidden className="h-4 w-4" /> : <Laptop aria-hidden className="h-4 w-4" />}
                {r.dispositivo === 'celular' ? 'Celular' : 'Computador'} · {r.navegador}
            </dd>
        </dl>
        {r.revisado ? (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm dark:border-green-900/50 dark:bg-green-500/10">
                <p className="font-semibold text-green-700 dark:text-green-300">Revisado por {r.revisado.por} · {r.revisado.cuando}</p>
                <p className="mt-0.5 text-foreground">{r.revisado.nota}</p>
            </div>
        ) : (
            <div className="space-y-2">
                <div className="min-h-16 rounded-control border border-input bg-card px-3 py-2 text-sm text-muted-foreground">Qué se hizo (nota para ustedes, opcional)…</div>
                <div className="flex flex-wrap gap-2">
                    <Button leftIcon={<CheckCircle2 className="h-4 w-4" />}>Marcar revisado</Button>
                    <Button variant="secondary">Ver su ficha</Button>
                </div>
            </div>
        )}
    </div>
);

// ───────────────────────── Lo que ve la persona ─────────────────────────
const MarcoCelular: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
    <figure className="space-y-2">
        <figcaption className="text-sm font-semibold text-brand-dark">{titulo}</figcaption>
        <div className="relative h-[600px] w-[320px] max-w-full overflow-hidden rounded-[2rem] border-8 border-neutral-800 bg-background">{children}</div>
    </figure>
);

const PantallaRecibir: React.FC = () => (
    <div className="space-y-3 p-3">
        <div className="flex items-center gap-2 pt-1 text-section font-semibold text-brand-dark"><Package aria-hidden className="h-5 w-5" /> Inventario</div>
        <div className="rounded-card border border-border bg-card">
            <div className="rounded-t-card bg-brand-primary px-3 py-2 text-sm font-semibold text-white">Recibir TRF-202610-0041 · Toesca 2770</div>
            <div className="divide-y divide-border">
                {[['Fierro 12 mm', '40', '40'], ['Alambre negro', '10 kg', '10 kg'], ['Clavos 4"', '5 kg', '4 kg']].map(([d, e, r]) => (
                    <div key={d} className="flex items-center justify-between px-3 py-2.5 text-sm">
                        <span className="text-foreground">{d}</span>
                        <span className="text-xs text-muted-foreground">enviado {e} · <b className="text-foreground">llegó {r}</b></span>
                    </div>
                ))}
            </div>
            <div className="p-3"><Button className="w-full">Confirmar recepción</Button></div>
        </div>
    </div>
);

const AvisoError: React.FC<{ enviado?: boolean }> = ({ enviado }) => (
    <div className="absolute inset-x-3 bottom-4 rounded-2xl border border-border bg-card p-3.5 shadow-lg">
        <div className="flex gap-2.5">
            <AlertCircle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">No se pudo guardar la recepción</p>
                <p className="text-xs text-muted-foreground">El servidor no respondió. Intenta de nuevo en un momento.</p>
            </div>
            <X aria-hidden className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
            <Camera aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="flex-1 text-xs text-muted-foreground">
                {enviado ? 'Gracias: soporte ya tiene tu mensaje.' : 'Le avisamos a soporte con una foto de esta pantalla.'}
            </p>
            {!enviado && <span className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-foreground">Contar qué pasó</span>}
        </div>
    </div>
);

const VentanaContar: React.FC = () => (
    <div className="absolute inset-0 flex items-end bg-black/45">
        <div className="w-full space-y-3 rounded-t-3xl bg-card p-4">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-section font-semibold text-brand-dark">Cuéntale a soporte qué pasó</p>
                    <p className="text-xs text-muted-foreground">Lo ven solo Marcos y Mauricio</p>
                </div>
                <X aria-hidden className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-2">
                <Foto src={FOTO_CELULAR} alt="Foto de la pantalla" className="h-20 w-12" />
                <div className="min-w-0 flex-1 text-xs">
                    <p className="font-semibold text-foreground">Foto de esta pantalla</p>
                    <p className="text-muted-foreground">Ya se envió. Se borra sola en 30 días.</p>
                </div>
                <span className="text-xs font-semibold text-muted-foreground underline">Quitar</span>
            </div>
            <div>
                <p className="mb-1 text-xs font-semibold text-foreground">¿Qué estabas haciendo?</p>
                <div className="min-h-20 rounded-control border border-input bg-card px-3 py-2 text-sm text-foreground">
                    Estaba recibiendo los fierros de la 41 y al apretar Confirmar me sale esto
                </div>
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
                    <Mic aria-hidden className="h-3.5 w-3.5" /> Dictar
                </span>
            </div>
            <div className="flex gap-2 pt-1">
                <Button variant="ghost" className="flex-1">Ahora no</Button>
                <Button className="flex-1">Enviar</Button>
            </div>
        </div>
    </div>
);

const VistaPersona: React.FC = () => (
    <div className="flex flex-wrap gap-6">
        <MarcoCelular titulo="1. Sale el error"><PantallaRecibir /><AvisoError /></MarcoCelular>
        <MarcoCelular titulo="2. Si toca «Contar qué pasó»"><PantallaRecibir /><VentanaContar /></MarcoCelular>
        <MarcoCelular titulo="3. Después de enviar"><PantallaRecibir /><AvisoError enviado /></MarcoCelular>
    </div>
);

// ───────────────────────── Soporte · Errores ─────────────────────────
const VistaA: React.FC = () => {
    const [id, setId] = useState(REPORTES[0].id);
    const r = REPORTES.find(x => x.id === id) ?? REPORTES[0];
    return (
        <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <section aria-label="Errores" className="rounded-card border border-border bg-card">
                <div className="border-b border-border p-3"><Filtros apilado /></div>
                <ul className="flex flex-col gap-1 p-2">
                    {REPORTES.map(x => (
                        <li key={x.id}>
                            {/* eslint-disable-next-line no-restricted-syntax -- fila de lista seleccionable (como la de Personas); Button no soporta este layout */}
                            <button type="button" onClick={() => setId(x.id)} aria-current={x.id === id ? 'true' : undefined}
                                className={cn('flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                                    x.id === id ? 'border-brand-primary bg-brand-primary/5' : 'border-transparent hover:bg-background', x.revisado && 'opacity-70')}>
                                <Iniciales nombre={x.nombre} />
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-baseline gap-2">
                                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-dark">{x.nombre}</span>
                                        <span className="shrink-0 text-caption tabular-nums text-muted-foreground">{x.cuando}</span>
                                    </span>
                                    <span className="flex items-center gap-1 truncate text-xs text-red-700 dark:text-red-300">
                                        <AlertCircle aria-hidden className="h-3 w-3 shrink-0" />{x.mensaje}
                                    </span>
                                    <span className="block truncate text-caption text-muted-foreground">{x.pantalla}</span>
                                    <span className="mt-1.5 block"><Marcas r={x} /></span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            </section>
            <section aria-label="Detalle del error" className="rounded-card border border-border bg-card p-5"><Detalle r={r} /></section>
        </div>
    );
};

const VistaB: React.FC = () => {
    const [id, setId] = useState<number | null>(null);
    const r = REPORTES.find(x => x.id === id);
    return (
        <div className="space-y-4">
            <div className="rounded-card border border-border bg-card p-3"><Filtros /></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {REPORTES.map(x => (
                    // eslint-disable-next-line no-restricted-syntax -- tarjeta entera clicable (foto + datos); Button no soporta este layout
                    <button key={x.id} type="button" onClick={() => setId(x.id)}
                        className={cn('flex flex-col overflow-hidden rounded-card border border-border bg-card text-left transition-colors hover:border-brand-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40', x.revisado && 'opacity-70')}>
                        <Foto src={x.foto} alt={`Foto de la pantalla de ${x.nombre}`} className="h-44 w-full rounded-none border-0 border-b" />
                        <span className="flex flex-1 flex-col gap-1.5 p-3.5">
                            <span className="flex items-baseline gap-2">
                                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-dark">{x.nombre}</span>
                                <span className="flex shrink-0 items-center gap-1 text-caption tabular-nums text-muted-foreground"><Clock aria-hidden className="h-3 w-3" />{x.cuando}</span>
                            </span>
                            <span className="text-xs text-muted-foreground">{x.rol}{x.obra ? ` · Obra ${x.obra}` : ''}</span>
                            <span className="flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-300"><AlertCircle aria-hidden className="h-3.5 w-3.5 shrink-0" />{x.mensaje}</span>
                            {x.escribio && <span className="line-clamp-2 text-xs text-foreground">«{x.escribio}»</span>}
                            <span className="mt-auto flex items-center justify-between gap-2 pt-1.5">
                                <Marcas r={x} />
                                <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                            </span>
                        </span>
                    </button>
                ))}
            </div>
            <Modal isOpen={!!r} onClose={() => setId(null)} title="Error" size="lg">
                {r && <Detalle r={r} />}
            </Modal>
        </div>
    );
};

const VISTA: Record<Clave, React.FC> = { persona: VistaPersona, A: VistaA, B: VistaB };

const PropuestaErrores: React.FC = () => {
    const [clave, setClave] = useState<Clave>('persona');
    const Vista = VISTA[clave];
    return (
        <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-card border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-foreground dark:border-blue-900/50 dark:bg-blue-500/10">
                <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" />
                <p>
                    <strong>Propuesta para conversar, con datos inventados.</strong> Todavía no funciona: ninguna persona ve esto, no se
                    sacan fotos ni se guarda nada. Las personas y los errores son de ejemplo. Existe solo en test.
                </p>
            </div>
            <div className="self-start overflow-x-auto rounded-2xl border border-border bg-card p-1">
                <PestanasElasticas opciones={OPCIONES} activa={clave} onCambiar={setClave} aria-label="Qué parte de la propuesta ver" claseFila="gap-1"
                    claseOpcion="inline-flex h-9 shrink-0 items-center justify-center rounded-xl px-3.5 text-sm font-medium whitespace-nowrap"
                    claseInactiva="text-muted-foreground hover:bg-background hover:text-brand-dark"
                    render={o => o.label} />
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">{IDEA[clave]}</p>
            <Vista />
        </div>
    );
};

export default PropuestaErrores;
