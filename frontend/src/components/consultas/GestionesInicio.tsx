/**
 * Portada de Gestiones (plan Gestiones B8, rediseño 2026-09-15): layout "bento" con jerarquía por tamaño.
 *  - Saludo + fecha (una línea de contexto, sin datos nuevos).
 *  - Tile hero verde = Trabajadores (la sección más usada): atajos a filtros frecuentes como filas grandes.
 *  - Tiles de contadores = Solicitudes y Documentos físicos: el NÚMERO manda (qué hay pendiente hoy).
 *  - Mosaico "Crear": un cuadrado por acción, icono grande arriba (reemplaza la tira en mayúsculas).
 * Sin backend nuevo: los contadores salen de los stores que ya alimentan los badges.
 *
 * Accesibilidad: ningún contenedor es `role="button"` (llevan botones adentro); cada acción es un <Button>.
 * Solo tokens del DS: el hero usa verde de marca fijo (idéntico en dark), el resto bg-card/border/muted.
 */
import React from 'react';
import { SearchCheck, ClipboardList, Truck, ArrowRight, ChevronRight, AlertTriangle, Inbox } from 'lucide-react';

import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { cn } from '../../utils/cn';
import { useAuth } from '../../context/AuthContext';
import { crearItems } from './crearItems';
import { seccionesDisponibles, type PermisosGestiones, type SeccionGestiones } from './gestionesNav';
import type { PendientesLotes } from '../documentos-fisicos/documentosFisicos';
import type { AlertasDocumentos } from '../documentos-fisicos/documentosAlertas';

interface Props {
    permisos: PermisosGestiones;
    hasPermission: (perm: string) => boolean;
    /** Solicitudes pendientes (0 sin permiso de aprobar). */
    solicitudesPendientes: number;
    lotes: PendientesLotes | null;
    lotesBadge: number;
    /** Alertas de documentos sin firmar (null sin documentos.entrega.registrar). */
    alertas: AlertasDocumentos | null;
    onIr: (seccion: SeccionGestiones, extra?: Record<string, string>) => void;
    /** Abre un modal de creación de la página (mismo contrato que CreatePanel). */
    setModalType: (type: 'form' | 'empresa' | 'obra' | 'cargo' | 'tipodoc' | 'solicitud' | null) => void;
    setSelectedWorkerForAction: (worker: null) => void;
}

const mesActual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

const fechaLarga = () => {
    const s = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
};

const saludo = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
};

/** Fila-atajo dentro del hero: texto a la izquierda, chevron a la derecha, tap target alto. */
const Atajo: React.FC<{ label: string; hint: string; onClick: () => void }> = ({ label, hint, onClick }) => (
    <Button variant="ghost" onClick={onClick}
        className="h-auto w-full justify-between rounded-xl bg-white/10 px-4 py-3 text-left text-white hover:bg-white/20 active:bg-white/25">
        <span className="min-w-0">
            <span className="block text-ui font-semibold">{label}</span>
            <span className="block text-caption font-normal text-white/70 normal-case tracking-normal">{hint}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/70" />
    </Button>
);

/** Tile de contador: número grande + etiqueta; el pie es el botón que entra a la sección. */
const TileContador: React.FC<{
    icon: React.ElementType;
    titulo: string;
    descripcion: string;
    onEntrar: () => void;
    children: React.ReactNode;
    pie?: React.ReactNode;
}> = ({ icon: Icon, titulo, descripcion, onEntrar, children, pie }) => (
    <section className="flex min-h-0 flex-col rounded-3xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
        <header className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-primary/10">
                    <Icon className="h-5 w-5 text-brand-primary" />
                </span>
                <h3 className="text-title-sm font-bold text-brand-dark leading-tight truncate">{titulo}</h3>
            </div>
            <Button variant="ghost" size="icon" onClick={onEntrar} title={`Ir a ${titulo}`} aria-label={`Ir a ${titulo}`}
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-brand-primary">
                <ArrowRight className="h-4 w-4" />
            </Button>
        </header>
        <p className="mt-2 text-caption text-muted-foreground">{descripcion}</p>
        <div className="flex flex-1 flex-wrap items-end gap-6 py-5">{children}</div>
        {pie}
    </section>
);

/** Cifra grande con etiqueta debajo (tabular para que no salte al cambiar). */
const Cifra: React.FC<{ n: number; label: string; tono?: 'neutro' | 'aviso' | 'critico' }> = ({ n, label, tono = 'neutro' }) => (
    <div className="min-w-0">
        <span className={cn('block text-display-sm font-bold tabular-nums leading-none tracking-tight',
            tono === 'critico' ? 'text-red-600 dark:text-red-400' : tono === 'aviso' && n > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-brand-dark')}>
            {n}
        </span>
        <span className="mt-1 block text-caption font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
);

export const GestionesInicio: React.FC<Props> = ({ permisos, hasPermission, solicitudesPendientes, lotes, lotesBadge, alertas, onIr, setModalType, setSelectedWorkerForAction }) => {
    const { user } = useAuth();
    const disp = seccionesDisponibles(permisos);
    const puedeCrearSolicitud = hasPermission('trabajadores.solicitud.crear');
    const puedeAprobar = hasPermission('trabajadores.solicitud.aprobar');
    const puedeRegistrar = hasPermission('documentos.entrega.registrar');
    const alertasCriticas = alertas ? alertas.criticos + alertas.lotes.sin_confirmar.criticos + alertas.lotes.en_terreno.criticos : 0;
    const alertasTotal = alertas ? alertas.total + alertas.lotes.sin_confirmar.total + alertas.lotes.en_terreno.total : 0;
    const crear = crearItems(setModalType, setSelectedWorkerForAction).filter(it => hasPermission(it.perm));
    const nombre = user?.nombre?.trim().split(/\s+/)[0] ?? '';

    if (!disp.length) {
        return <EmptyState icon={SearchCheck} title="Sin acceso a Gestiones" description="Tu rol no tiene ninguna sección habilitada. Pide a administración que revise tus permisos." />;
    }

    // Con el hero de Trabajadores los contadores van apilados a la derecha; sin él, lado a lado.
    const gridCls = permisos.trabajadores
        ? 'grid grid-cols-1 gap-4 lg:grid-cols-3 lg:grid-rows-2'
        : 'grid grid-cols-1 gap-4 md:grid-cols-2';

    return (
        <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-6">
                <header className="pt-1">
                    <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">{fechaLarga()}</p>
                    <h2 className="mt-1 text-headline font-bold tracking-tight text-brand-dark">
                        {saludo()}{nombre ? `, ${nombre}` : ''}
                    </h2>
                    <p className="mt-1 text-ui text-muted-foreground">Elige por dónde partir o crea algo nuevo.</p>
                </header>

                <div className={gridCls}>
                    {permisos.trabajadores && (
                        <section className="relative flex flex-col overflow-hidden rounded-3xl bg-brand-primary p-6 text-white shadow-sm lg:col-span-2 lg:row-span-2">
                            <SearchCheck aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 text-white/10" />
                            <div className="relative flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="text-caption font-semibold uppercase tracking-wider text-white/70">Sección principal</p>
                                    <h3 className="mt-1 text-title font-bold leading-tight">Trabajadores</h3>
                                    <p className="mt-2 max-w-md text-ui text-white/80">
                                        Busca a cualquier persona, revisa su ficha y sus documentos; emite kit, amonestación o finiquito.
                                    </p>
                                </div>
                            </div>
                            <div className="relative mt-6 grid gap-2 sm:grid-cols-1">
                                <Atajo label="Faltan documentos" hint="Trabajadores con documentación obligatoria incompleta"
                                    onClick={() => onIr('trabajadores', { completitud: 'faltantes' })} />
                                <Atajo label="Cumplen 10 meses" hint="Contratos que llegan a 10 meses este mes"
                                    onClick={() => onIr('trabajadores', { aniversario10m: mesActual() })} />
                                <Atajo label="Desvinculados" hint="Bajas registradas: finiquito y reactivación"
                                    onClick={() => onIr('trabajadores', { activo: 'false' })} />
                            </div>
                            <div className="relative mt-auto pt-6">
                                <Button variant="glass" onClick={() => onIr('trabajadores')} rightIcon={<ArrowRight className="h-4 w-4" />}
                                    className="w-full justify-center border-transparent bg-white text-brand-primary hover:bg-white/90 sm:w-auto">
                                    Abrir Trabajadores
                                </Button>
                            </div>
                        </section>
                    )}

                    {permisos.solicitudes && (
                        <TileContador icon={ClipboardList} titulo="Solicitudes de ingreso"
                            descripcion={puedeAprobar ? 'Fichas de terreno por revisar: aprobar crea al trabajador y permite emitir el kit.' : 'Tus fichas de ingreso y en qué estado van.'}
                            onEntrar={() => onIr('solicitudes')}
                            pie={(
                                <div className="flex flex-wrap gap-2">
                                    <Button size="sm" variant={solicitudesPendientes > 0 ? 'primary' : 'glass'} onClick={() => onIr('solicitudes')}>
                                        {puedeAprobar && solicitudesPendientes > 0 ? 'Revisar pendientes' : 'Ver solicitudes'}
                                    </Button>
                                    {puedeCrearSolicitud && (
                                        <Button size="sm" variant="glass" onClick={() => setModalType('solicitud')}>Nuevo ingreso</Button>
                                    )}
                                </div>
                            )}>
                            {puedeAprobar
                                ? <Cifra n={solicitudesPendientes} label="por revisar" tono="aviso" />
                                : <Inbox aria-hidden className="h-12 w-12 text-brand-primary/30" />}
                        </TileContador>
                    )}

                    {permisos.fisicos && (
                        <TileContador icon={Truck} titulo="Documentos físicos"
                            descripcion={puedeRegistrar ? 'Dónde están los papeles: en oficina, en terreno o ya firmados.' : 'Documentos que RRHH dejó a tu nombre para llevar a firmar: confirma el retiro.'}
                            onEntrar={() => onIr('fisicos')}
                            pie={(
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button size="sm" variant={lotesBadge > 0 ? 'primary' : 'glass'} onClick={() => onIr('fisicos')}>
                                        {lotesBadge > 0 ? 'Ver lotes pendientes' : 'Ver dónde están'}
                                    </Button>
                                    {alertasTotal > 0 && (
                                        <span className={cn('inline-flex items-center gap-1 text-caption font-semibold',
                                            alertasCriticas > 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')}>
                                            <AlertTriangle className="h-3.5 w-3.5" />
                                            {alertasTotal} fuera de plazo{alertasCriticas ? ` · ${alertasCriticas} crítico${alertasCriticas === 1 ? '' : 's'}` : ''}
                                        </span>
                                    )}
                                </div>
                            )}>
                            <Cifra n={lotes?.por_confirmar ?? 0} label={lotes?.alcance === 'propios' ? 'te esperan' : 'sin retirar'} tono="aviso" />
                            <Cifra n={lotes?.en_terreno ?? 0} label="en terreno" />
                            {alertasCriticas > 0 && <Cifra n={alertasCriticas} label="críticos" tono="critico" />}
                        </TileContador>
                    )}
                </div>

                {crear.length > 0 && (
                    <section>
                        <h3 className="mb-3 text-caption font-semibold uppercase tracking-wider text-muted-foreground">Crear nuevo</h3>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                            {crear.map(item => {
                                const Icon = item.icon;
                                return (
                                    <Button key={item.label} variant="glass" onClick={item.onClick} title={item.title ?? `Nuevo ${item.label}`}
                                        className="h-auto flex-col gap-3 rounded-2xl px-3 py-5 text-brand-dark hover:border-brand-primary/40 hover:text-brand-primary">
                                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-primary/10">
                                            <Icon className="h-5 w-5 text-brand-primary" />
                                        </span>
                                        <span className="text-caption font-semibold leading-tight text-center whitespace-normal">{item.label}</span>
                                    </Button>
                                );
                            })}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
};

