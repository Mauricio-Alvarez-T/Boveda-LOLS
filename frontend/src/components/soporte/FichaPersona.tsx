import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, Info, LayoutDashboard, ScanEye, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { cn } from '../../utils/cn';
import { fmtFechaHora } from '../../utils/fechas';
import { PERMISO_HIERARCHY } from '../../config/permisosHierarchy';
import { ETIQUETA_BUZON_IDEAS } from '../ideas/ideasConfig';
import { TEXTO_ORIGEN, lugarUsuario, resumenFicha, type FichaSoporte, type OrigenPermiso } from './fichaUsuario';

/**
 * La ficha de una persona en «Soporte · usuarios»: quién es, qué ve (Inicio, menú, pestañas) y sus permisos
 * efectivos con el origen de cada uno. Todo lo calculado sale de `resumenFicha` (fichaUsuario.ts, puro y con test).
 * El botón «Ver como esta persona» abre la app tal cual la ve ella, en solo lectura (no para otro Super Administrador
 * ni para alguien inactivo).
 */
interface Props {
    ficha: FichaSoporte;
    onVerComo: () => void;
    abriendo: boolean;
    /** Celular: vuelve a la lista. */
    onVolver?: () => void;
}

const TONO_ORIGEN: Record<OrigenPermiso, 'neutral' | 'info' | 'warning'> = {
    rol: 'neutral',
    propio: 'info',
    quitado: 'warning',
};

/** Una fila de «Qué ve»: rótulo a la izquierda, contenido a la derecha (en el celular, uno sobre otro). */
const Fila: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
    <div className="grid grid-cols-1 gap-1.5 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4 border-t border-border first:border-t-0">
        <dt className="text-xs font-semibold text-muted-foreground sm:pt-0.5">{titulo}</dt>
        <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
);

/** Una lista de etiquetas neutras (menús, pestañas, secciones). */
const Etiquetas: React.FC<{ items: string[]; vacio: string }> = ({ items, vacio }) => (
    items.length ? (
        <ul className="flex flex-wrap gap-1.5">
            {items.map(t => (
                <li key={t} className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-foreground">{t}</li>
            ))}
        </ul>
    ) : <span className="text-muted-foreground">{vacio}</span>
);

export const FichaPersona: React.FC<Props> = ({ ficha, onVerComo, abriendo, onVolver }) => {
    const r = useMemo(() => resumenFicha(ficha), [ficha]);
    const [soloCambios, setSoloCambios] = useState(false);
    const u = ficha.usuario;
    const lugar = lugarUsuario(u);
    const puedeVerComo = !r.esSuperAdmin && u.activo;
    const grupos = useMemo(
        () => (soloCambios
            ? r.grupos.map(g => ({ ...g, permisos: g.permisos.filter(p => p.origen !== 'rol') })).filter(g => g.permisos.length)
            : r.grupos),
        [r.grupos, soloCambios],
    );

    return (
        <div className="flex flex-col gap-4">
            {onVolver && (
                <Button variant="ghost" size="sm" onClick={onVolver} leftIcon={<ChevronLeft className="h-4 w-4" />} className="self-start lg:hidden -ml-2">
                    Volver a la lista
                </Button>
            )}

            {/* Quién es + «Ver como» */}
            <section className="rounded-card border border-border bg-card p-5 md:p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                        <h2 className="text-title font-bold tracking-title text-brand-dark leading-tight break-words">{u.nombre}</h2>
                        <p className="mt-1 text-sm text-muted-foreground break-all">{u.email}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            <Chip label={u.rol_nombre} tone="neutral" icon={r.esSuperAdmin ? <ShieldCheck className="h-3 w-3" /> : undefined} />
                            {!u.activo && <Chip label="Inactiva" tone="warning" />}
                        </div>
                        <p className="mt-2 text-sm text-foreground">{lugar || <span className="text-muted-foreground">Sin obra ni bodega asignada</span>}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-1.5 md:items-end md:max-w-[16rem]">
                        {puedeVerComo ? (
                            <>
                                <Button variant="primary" size="md" onClick={onVerComo} isLoading={abriendo} leftIcon={<ScanEye className="h-4 w-4" />}>
                                    Ver como esta persona
                                </Button>
                                <p className="text-xs text-muted-foreground md:text-right">
                                    Abre su Inicio tal cual lo ve, en solo lectura, por 30 minutos.
                                </p>
                            </>
                        ) : (
                            <p className="text-xs text-muted-foreground md:text-right">
                                {r.esSuperAdmin ? 'Es Super Administrador: no se puede ver como él.' : 'Inactiva: no hay nada que ver como ella.'}
                            </p>
                        )}
                    </div>
                </div>
            </section>

            {/* Qué revisar */}
            {r.avisos.length > 0 && (
                <section aria-label="Qué revisar" className="rounded-card border border-border bg-card p-5">
                    <h3 className="text-section font-semibold text-brand-dark">Qué revisar</h3>
                    <ul className="mt-3 flex flex-col gap-2.5">
                        {r.avisos.map(a => (
                            <li key={a.texto} className="flex items-start gap-2.5 text-sm leading-snug text-foreground">
                                {a.tono === 'warning'
                                    ? <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                                    : <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                                <span>{a.texto}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Qué ve */}
            <section aria-label="Qué ve" className="rounded-card border border-border bg-card px-5 py-2">
                <dl>
                    <Fila titulo="Inicio">
                        <span className="flex flex-col gap-1">
                            {r.inicioGerencia && (
                                <span className="inline-flex items-center gap-1.5 font-medium">
                                    <LayoutDashboard aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                                    Inicio de gerencia arriba (los temas que esperan una decisión)
                                </span>
                            )}
                            <span>Inventario: {r.textoInicioInventario}</span>
                        </span>
                    </Fila>
                    <Fila titulo="Menú">
                        <Etiquetas items={[...r.menus.map(m => m.label), ...(r.buzonIdeas ? [ETIQUETA_BUZON_IDEAS] : [])]} vacio="—" />
                    </Fila>
                    <Fila titulo="Pestañas de Inventario">
                        {r.pestanasInventario
                            ? <Etiquetas items={r.pestanasInventario.map(p => p.label)} vacio="Ninguna: Inventario se ve vacío" />
                            : <span className="text-muted-foreground">No entra a Inventario</span>}
                    </Fila>
                    <Fila titulo="Gestiones">
                        {r.seccionesGestiones
                            ? <Etiquetas items={[...(r.seccionesGestiones.length >= 2 ? ['Portada'] : []), ...r.seccionesGestiones.map(s => s.label)]} vacio="—" />
                            : <span className="text-muted-foreground">No ve Gestiones</span>}
                    </Fila>
                    <Fila titulo="Último ingreso">
                        {ficha.sesion.ultimo_ingreso
                            ? fmtFechaHora(ficha.sesion.ultimo_ingreso)
                            : <span className="text-muted-foreground">Sin ingresos en el historial</span>}
                    </Fila>
                </dl>
            </section>

            {/* Permisos efectivos */}
            <section aria-label="Permisos" className="rounded-card border border-border bg-card">
                <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 className="text-section font-semibold text-brand-dark">Permisos efectivos</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                            {r.cuenta.efectivos} en total · {r.cuenta.propios} propio{r.cuenta.propios === 1 ? '' : 's'} · {r.cuenta.quitados} quitado{r.cuenta.quitados === 1 ? '' : 's'}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Sin marca = {TEXTO_ORIGEN.rol}. «$» = permiso de montos.</p>
                    </div>
                    <div className="flex w-fit rounded-full border border-border bg-background p-0.5" role="group" aria-label="Qué permisos mostrar">
                        {([['todos', 'Todos'], ['cambios', 'Propios y quitados']] as const).map(([k, t]) => {
                            const activo = (k === 'cambios') === soloCambios;
                            return (
                                <Button key={k} type="button" variant="ghost" size="sm" aria-pressed={activo}
                                    onClick={() => setSoloCambios(k === 'cambios')}
                                    className={cn('h-8 px-3 text-xs', activo ? 'bg-card text-brand-dark shadow-sm hover:bg-card' : 'text-muted-foreground')}>
                                    {t}
                                </Button>
                            );
                        })}
                    </div>
                </div>
                {grupos.length === 0 ? (
                    <p className="px-5 py-6 text-sm text-muted-foreground">
                        {soloCambios ? 'Todos sus permisos vienen de su rol: no tiene propios ni quitados.' : 'No tiene ningún permiso.'}
                    </p>
                ) : (
                    <div className="flex flex-col">
                        {grupos.map(g => (
                            <div key={g.modulo} className="border-t border-border first:border-t-0 px-5 py-4">
                                <h4 className="flex items-baseline gap-2 text-sm font-semibold text-brand-dark">
                                    {g.modulo}
                                    <span className="text-xs font-normal text-muted-foreground tabular-nums">
                                        {g.permisos.filter(p => p.origen !== 'quitado').length}
                                    </span>
                                </h4>
                                <ul className="mt-2 flex flex-col">
                                    {g.permisos.map(p => {
                                        const sensible = PERMISO_HIERARCHY[p.clave]?.sensible;
                                        return (
                                            <li key={p.clave} className="flex items-start justify-between gap-3 py-1.5">
                                                <span className="min-w-0">
                                                    <span className={cn('block text-sm leading-snug', p.origen === 'quitado' ? 'text-muted-foreground line-through' : 'text-foreground')}>
                                                        {p.nombre}
                                                    </span>
                                                    <span className="block font-mono text-caption text-muted-foreground break-all">{p.clave}</span>
                                                </span>
                                                <span className="flex shrink-0 items-center gap-1">
                                                    {sensible === 'financiero' && <Chip label="$" tone="neutral" />}
                                                    {p.origen !== 'rol' && <Chip label={TEXTO_ORIGEN[p.origen]} tone={TONO_ORIGEN[p.origen]} />}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};
