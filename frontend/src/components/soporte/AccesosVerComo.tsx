import React, { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Archive, ArrowRight, BookOpen, Calculator, Check, CheckSquare, ChevronDown, ChevronUp, Inbox, KeyRound, LayoutDashboard,
    Lightbulb, Minus, Package, ScanEye, SearchCheck, Settings, Truck, UserSearch,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { cn } from '../../utils/cn';
import { PERMISO_HIERARCHY } from '../../config/permisosHierarchy';
import { ETIQUETA_BUZON_IDEAS } from '../ideas/ideasConfig';
import { TEXTO_ORIGEN, type OrigenPermiso } from './fichaUsuario';
import { accesosPerfil, type ClaveTarjeta, type FilaAcceso, type PermisoAcceso, type TarjetaAcceso } from './accesosPerfil';

/**
 * «Lo que puede usar <persona> (<rol>)» (Marcos 2026-10-26): en el Inicio, SOLO mientras el Super Administrador está en
 * «ver como» (para cualquier otra persona, y para él en su cuenta, no se dibuja). Una tarjeta por cada parte de su menú
 * lateral, en el mismo orden, con lo que puede hacer en cada una; todo lo calcula `accesosPerfil` (puro, con test).
 * Solo lectura: «Ir a…» navega como esa persona y «Ver ficha completa» vuelve a la cuenta propia, a su ficha en Soporte.
 */

/** Los íconos del menú lateral (Sidebar.tsx, `extras`): si cambian allá, cambiarlos aquí. */
const ICONO: Record<ClaveTarjeta, React.ElementType> = {
    inicio: LayoutDashboard,
    asistencia: CheckSquare,
    gestiones: SearchCheck,
    inventario: Package,
    vehiculos: Truck,
    obras_finalizadas: Archive,
    presupuestos: Calculator,
    ayuda: BookOpen,
    revisar_ideas: Inbox,
    soporte: UserSearch,
    configuracion: Settings,
    buzon_ideas: Lightbulb,
    otros: KeyRound,
};

/** Los mismos tonos de la ficha de Soporte (FichaPersona): propio = info, quitado = ámbar. */
const TONO_ORIGEN: Record<OrigenPermiso, 'neutral' | 'info' | 'warning'> = { rol: 'neutral', propio: 'info', quitado: 'warning' };

/** Plegado o abierto: se recuerda en esta pestaña (como la sesión de «ver como»). */
const CLAVE_OCULTO = 'sgdl_ver_como_accesos_oculto';
const leerOculto = (): boolean => {
    try { return window.sessionStorage.getItem(CLAVE_OCULTO) === '1'; } catch { return false; }
};
const guardarOculto = (oculto: boolean) => {
    try {
        if (oculto) window.sessionStorage.setItem(CLAVE_OCULTO, '1');
        else window.sessionStorage.removeItem(CLAVE_OCULTO);
    } catch { /* sin almacenamiento: no se recuerda */ }
};

const CHIP_CHICO = 'px-1.5 py-0 text-caption';

/** Las marcas de un permiso: «$» (montos) y su origen si no es del rol (propio / quitado). */
const Marcas: React.FC<{ origen: OrigenPermiso | null; financiero: boolean }> = ({ origen, financiero }) => (
    <>
        {financiero && <Chip label="$" tone="neutral" className={CHIP_CHICO} />}
        {origen && origen !== 'rol' && <Chip label={TEXTO_ORIGEN[origen]} tone={TONO_ORIGEN[origen]} className={CHIP_CHICO} />}
    </>
);

const Rotulo: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="text-label font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
);

const Fila: React.FC<{ fila: FilaAcceso }> = ({ fila }) => {
    const sinTachar = fila.items.some(i => i.origen !== 'quitado');
    return (
        <div className="mt-3">
            <Rotulo>{fila.rotulo}</Rotulo>
            {!sinTachar && fila.vacio && <p className="mt-1 text-sm text-muted-foreground">{fila.vacio}</p>}
            {fila.items.length > 0 && (fila.forma === 'chips' ? (
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {fila.items.map(i => (
                        <li key={i.texto} className="inline-flex items-center gap-1 rounded-full border border-border bg-background py-0.5 pl-2.5 pr-2 text-xs font-medium">
                            <span className={i.origen === 'quitado' ? 'text-muted-foreground line-through' : 'text-foreground'}>{i.texto}</span>
                            <Marcas origen={i.origen} financiero={i.financiero} />
                        </li>
                    ))}
                </ul>
            ) : (
                <ul className="mt-1 flex flex-col gap-1">
                    {fila.items.map(i => (
                        <li key={i.texto} className="text-sm leading-snug">
                            <span className={i.origen === 'quitado' ? 'text-muted-foreground line-through' : 'text-foreground'}>{i.texto}</span>
                            {(i.financiero || (i.origen && i.origen !== 'rol')) && (
                                <span className="ml-1.5 inline-flex -translate-y-px items-center gap-1 align-middle">
                                    <Marcas origen={i.origen} financiero={i.financiero} />
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            ))}
        </div>
    );
};

const Permiso: React.FC<{ p: PermisoAcceso; conModulo: boolean }> = ({ p, conModulo }) => {
    const quitado = p.origen === 'quitado';
    const Icono = quitado ? Minus : Check;
    return (
        <li className="flex items-start gap-2 py-0.5" title={p.descripcion ?? undefined}>
            <Icono aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className={cn('min-w-0 flex-1 text-sm leading-snug break-words', quitado ? 'text-muted-foreground line-through' : 'text-foreground')}>
                {conModulo && <span className="text-muted-foreground">{p.modulo} · </span>}
                {p.texto}
            </span>
            {(p.financiero || (p.origen && p.origen !== 'rol')) && (
                <span className="flex shrink-0 items-center gap-1 pt-px">
                    <Marcas origen={p.origen} financiero={p.financiero} />
                </span>
            )}
        </li>
    );
};

const Tarjeta: React.FC<{ t: TarjetaAcceso; onIr: (ruta: string) => void }> = ({ t, onIr }) => {
    const Icono = ICONO[t.clave];
    const vacia = !t.filas.length && !t.permisos.length;
    return (
        <article aria-label={t.titulo} className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4">
            <header className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                    <Icono className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="flex items-baseline gap-2 text-base font-semibold leading-tight text-foreground">
                        <span className="break-words">{t.titulo}</span>
                        {t.total > 0 && (
                            <span className="text-xs font-normal text-muted-foreground tabular-nums" title={`${t.total} permiso${t.total === 1 ? '' : 's'}`}>
                                {t.total}<span className="sr-only"> permiso{t.total === 1 ? '' : 's'}</span>
                            </span>
                        )}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t.descripcion}</p>
                </div>
            </header>

            {t.filas.map(f => <Fila key={f.rotulo} fila={f} />)}

            {t.permisos.length > 0 && (
                <div className="mt-3">
                    {t.clave !== 'otros' && <Rotulo>Puede</Rotulo>}
                    <ul className={cn('flex flex-col', t.clave !== 'otros' && 'mt-1')}>
                        {t.permisos.map(p => <Permiso key={p.clave} p={p} conModulo={t.clave === 'otros'} />)}
                    </ul>
                </div>
            )}

            {vacia && t.clave !== 'ayuda' && <p className="mt-3 text-sm text-muted-foreground">Solo entra a mirar.</p>}

            {t.ruta && (
                <div className="mt-auto pt-3">
                    <Button variant="link" size="sm" onClick={() => onIr(t.ruta as string)}
                        rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />} className="text-sm text-green-700 dark:text-green-300">
                        Ir a {t.titulo}
                    </Button>
                </div>
            )}
        </article>
    );
};

export const AccesosVerComo: React.FC<{ className?: string }> = ({ className }) => {
    const { verComo, salirVerComo } = useAuth();
    const navigate = useNavigate();
    const [oculto, setOculto] = useState(leerOculto);
    const idTitulo = useId();
    const idCuerpo = useId();

    const r = useMemo(() => (verComo ? accesosPerfil({
        permisos: verComo.user.permisos,
        usuario: verComo.user,
        ficha: verComo.ficha ?? null,
        jerarquia: clave => PERMISO_HIERARCHY[clave],
        etiquetaBuzon: ETIQUETA_BUZON_IDEAS,
    }) : null), [verComo]);

    if (!verComo || !r) return null;

    const alternar = () => {
        setOculto(o => {
            guardarOculto(!o);
            return !o;
        });
    };

    return (
        <section aria-labelledby={idTitulo} className={cn('rounded-3xl bg-card p-5 text-foreground shadow-[var(--shadow-md)] sm:p-6', className)}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                        <ScanEye className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                        <h2 id={idTitulo} className="text-lg font-bold tracking-tight text-foreground break-words">
                            Lo que puede usar {r.nombre}
                            {r.rol && <span className="font-normal text-muted-foreground"> ({r.rol})</span>}
                        </h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Así es su menú y lo que puede hacer en cada parte. Es solo para revisar: no guarda nada.
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 max-md:pl-[3.25rem]">
                    <Button variant="secondary" size="sm" onClick={() => salirVerComo?.()} leftIcon={<UserSearch className="h-4 w-4" aria-hidden />}
                        title="Vuelve a tu cuenta y abre su ficha en Soporte">
                        Ver ficha completa
                    </Button>
                    <Button variant="ghost" size="sm" onClick={alternar} aria-expanded={!oculto} aria-controls={idCuerpo}
                        rightIcon={oculto ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronUp className="h-4 w-4" aria-hidden />}>
                        {oculto ? 'Mostrar' : 'Ocultar'}
                    </Button>
                </div>
            </div>

            <div id={idCuerpo} hidden={oculto}>
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                    {r.conFicha ? (
                        <>
                            <span className="tabular-nums">
                                {r.cuenta.efectivos} permiso{r.cuenta.efectivos === 1 ? '' : 's'} · {r.cuenta.propios} propio{r.cuenta.propios === 1 ? '' : 's'} · {r.cuenta.quitados} quitado{r.cuenta.quitados === 1 ? '' : 's'}
                            </span>
                            <span aria-hidden className="hidden sm:inline">|</span>
                            <span>Sin marca = de su rol</span>
                            <span className="inline-flex items-center gap-1"><Chip label={TEXTO_ORIGEN.propio} tone="info" className={CHIP_CHICO} /> solo a esta persona</span>
                            <span className="inline-flex items-center gap-1"><Chip label={TEXTO_ORIGEN.quitado} tone="warning" className={CHIP_CHICO} /> su rol lo trae, pero se le quitó</span>
                            <span className="inline-flex items-center gap-1"><Chip label="$" tone="neutral" className={CHIP_CHICO} /> ve montos</span>
                        </>
                    ) : (
                        <span>
                            {r.cuenta.efectivos} permiso{r.cuenta.efectivos === 1 ? '' : 's'}. No se guardó su ficha al entrar: los nombres son los
                            técnicos y no dice cuáles son propios o quitados. «Ver ficha completa» lo muestra todo.
                        </span>
                    )}
                </div>

                <div className="mt-4 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {r.tarjetas.map(t => <Tarjeta key={t.clave} t={t} onIr={ruta => navigate(ruta)} />)}
                </div>
            </div>
        </section>
    );
};

export default AccesosVerComo;
