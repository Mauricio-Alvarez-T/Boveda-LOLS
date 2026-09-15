/**
 * Portada de Gestiones (plan Gestiones B8): una tarjeta por sección disponible — Trabajadores (con atajos a
 * filtros frecuentes), Solicitudes de ingreso (pendientes), Documentos físicos (lotes + alertas fuera de plazo
 * para RRHH) — y la fila Crear (reutiliza CreatePanel: los modales viven en la página). Sin backend nuevo: los
 * contadores salen de los stores que ya alimentan los badges.
 *
 * Accesibilidad: la tarjeta NO es `role="button"` (lleva atajos adentro); la navegación es un <Button> a ancho
 * completo en la cabecera y los atajos son botones ghost. Solo tokens del DS (dark mode incluido).
 */
import React from 'react';
import { SearchCheck, ClipboardList, Truck, ArrowRight, UserPlus, AlertTriangle, PlusCircle } from 'lucide-react';

import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { CreatePanel } from './CreatePanel';
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

const Tarjeta: React.FC<{
    icon: React.ElementType;
    titulo: string;
    descripcion: string;
    badge?: React.ReactNode;
    onEntrar: () => void;
    children?: React.ReactNode;
}> = ({ icon: Icon, titulo, descripcion, badge, onEntrar, children }) => (
    <div className="flex flex-col rounded-2xl border border-border bg-card shadow-sm overflow-hidden hover:border-brand-primary/40 hover:shadow-md transition-all">
        <Button variant="ghost" onClick={onEntrar} title={`Ir a ${titulo}`}
            className="h-auto w-full justify-start gap-3 rounded-none px-4 py-4 text-left border-b border-border/60">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10">
                <Icon className="h-5 w-5 text-brand-primary" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                    <span className="text-section font-bold text-brand-dark truncate">{titulo}</span>
                    {badge}
                </span>
                <span className="block text-caption font-normal normal-case tracking-normal text-muted-foreground whitespace-normal">{descripcion}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
        {children && <div className="flex flex-wrap items-center gap-1.5 px-4 py-3">{children}</div>}
    </div>
);

const Contador: React.FC<{ n: number; critico?: boolean; title: string }> = ({ n, critico, title }) => (
    n > 0 ? (
        <span title={title} className={`flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full text-micro font-bold tabular-nums text-white ${critico ? 'bg-red-600' : 'bg-amber-500'}`}>{n}</span>
    ) : null
);

export const GestionesInicio: React.FC<Props> = ({ permisos, hasPermission, solicitudesPendientes, lotes, lotesBadge, alertas, onIr, setModalType, setSelectedWorkerForAction }) => {
    const disp = seccionesDisponibles(permisos);
    const puedeCrearSolicitud = hasPermission('trabajadores.solicitud.crear');
    const puedeAprobar = hasPermission('trabajadores.solicitud.aprobar');
    const puedeRegistrar = hasPermission('documentos.entrega.registrar');
    const alertasCriticas = alertas ? alertas.criticos + alertas.lotes.sin_confirmar.criticos + alertas.lotes.en_terreno.criticos : 0;
    const alertasTotal = alertas ? alertas.total + alertas.lotes.sin_confirmar.total + alertas.lotes.en_terreno.total : 0;
    const hayCrear = ['trabajadores.crear', 'trabajadores.solicitud.crear', 'empresas.crear', 'obras.crear', 'cargos.crear', 'sistema.tipos_doc.gestionar'].some(hasPermission);

    if (!disp.length) {
        return <EmptyState icon={SearchCheck} title="Sin acceso a Gestiones" description="Tu rol no tiene ninguna sección habilitada. Pide a administración que revise tus permisos." />;
    }

    return (
        <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 pb-4">
                {permisos.trabajadores && (
                    <Tarjeta icon={SearchCheck} titulo="Trabajadores" descripcion="Buscar, ver la ficha y los documentos de cada trabajador; emitir kit, amonestación o finiquito."
                        onEntrar={() => onIr('trabajadores')}>
                        <Button size="sm" variant="ghost" onClick={() => onIr('trabajadores', { completitud: 'faltantes' })}>Faltan documentos</Button>
                        <Button size="sm" variant="ghost" onClick={() => onIr('trabajadores', { activo: 'false' })}>Desvinculados</Button>
                        <Button size="sm" variant="ghost" onClick={() => onIr('trabajadores', { aniversario10m: mesActual() })}>10 meses de contrato</Button>
                    </Tarjeta>
                )}
                {permisos.solicitudes && (
                    <Tarjeta icon={ClipboardList} titulo="Solicitudes de ingreso"
                        descripcion={puedeAprobar ? 'Fichas de terreno por revisar: aprobar crea al trabajador y permite emitir el kit.' : 'Tus fichas de ingreso y en qué estado van.'}
                        badge={<Contador n={solicitudesPendientes} title={`${solicitudesPendientes} pendiente(s)`} />}
                        onEntrar={() => onIr('solicitudes')}>
                        {puedeAprobar && solicitudesPendientes > 0 && <Chip tone="warning" label={`${solicitudesPendientes} por revisar`} />}
                        {puedeCrearSolicitud && (
                            <Button size="sm" variant="ghost" leftIcon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => setModalType('solicitud')}>Nuevo ingreso</Button>
                        )}
                    </Tarjeta>
                )}
                {permisos.fisicos && (
                    <Tarjeta icon={Truck} titulo="Documentos físicos"
                        descripcion={puedeRegistrar ? 'Lotes de documentos impresos: qué se entregó, qué está en terreno y qué volvió firmado.' : 'Los documentos que te entregó RRHH para llevar a firmar: confirma el retiro.'}
                        badge={<Contador n={lotesBadge} critico={alertasCriticas > 0} title={lotes?.alcance === 'propios' ? `${lotesBadge} lote(s) por confirmar` : `${lotesBadge} lote(s) por confirmar o en terreno`} />}
                        onEntrar={() => onIr('fisicos')}>
                        {lotes && lotes.por_confirmar > 0 && <Chip tone="warning" label={`${lotes.por_confirmar} por confirmar`} />}
                        {lotes && lotes.en_terreno > 0 && <Chip tone="info" label={`${lotes.en_terreno} en terreno`} />}
                        {alertasTotal > 0 && (
                            <Chip tone={alertasCriticas > 0 ? 'danger' : 'warning'} icon={<AlertTriangle className="h-3 w-3" />}
                                label={`${alertasTotal} fuera de plazo${alertasCriticas ? ` · ${alertasCriticas} crítico${alertasCriticas === 1 ? '' : 's'}` : ''}`} />
                        )}
                    </Tarjeta>
                )}
                {hayCrear && (
                    <div className="sm:col-span-2 xl:col-span-3 rounded-2xl border border-border bg-card shadow-sm px-4 py-3">
                        <p className="flex items-center gap-2 text-caption font-bold uppercase tracking-wider text-muted-foreground mb-2">
                            <PlusCircle className="h-3.5 w-3.5 text-brand-primary" /> Crear
                        </p>
                        <CreatePanel hasPermission={hasPermission} setModalType={setModalType} setSelectedWorkerForAction={setSelectedWorkerForAction} />
                    </div>
                )}
            </div>
        </div>
    );
};
