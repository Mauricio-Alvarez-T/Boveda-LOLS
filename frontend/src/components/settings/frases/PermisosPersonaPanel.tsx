import React, { useRef, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { usePermisosPersona } from '../../../hooks/usePermisosPersona';
import { ROL_SUPER_ADMIN } from '../../../config/permisosPantallas';
import { cosasDistintasPersona } from '../../../config/frasesPermisos';
import { Button } from '../../ui/Button';
import { cn } from '../../../utils/cn';
import { LeyendaFrases, PermisosEnFrases } from './PermisosEnFrases';

/**
 * «Permisos de <persona>» (Configuración › Usuarios, opción E, Marcos 2026-10-28): la misma vista en frases que un rol,
 * con lo que la persona tiene de más (azul) o de menos (ámbar) que su rol. Reemplaza el árbol de «overrides» con
 * Conceder / Defecto / Denegar. Guardar cierra la sesión solo de esa persona (mig 146).
 * Solo se abre con `usuarios.permisos.gestionar` (Settings esconde el botón sin él: la API de overrides lo exige).
 */
interface Props {
    usuarioId: number;
    usuarioNombre: string;
    rolId: number;
    rolNombre: string;
}

const PermisosPersonaPanel: React.FC<Props> = ({ usuarioId, usuarioNombre, rolId, rolNombre }) => {
    const { user } = useAuth();
    const primer = usuarioNombre.trim().split(/\s+/)[0] || usuarioNombre;
    const ed = usePermisosPersona({ usuarioId, rolId, primer });
    const [soloDistinto, setSoloDistinto] = useState(false);
    const resumenRef = useRef<HTMLParagraphElement>(null);
    const esYo = !!user && Number(user.id) === usuarioId;

    if (rolId === ROL_SUPER_ADMIN) {
        return (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-6">
                {primer} es Super Administrador: tiene todo, siempre, y no se le cambian permisos.
            </p>
        );
    }
    if (ed.loading) {
        return <div className="py-16 text-center text-ui text-muted-foreground">Cargando permisos…</div>;
    }
    if (ed.error) {
        return <p className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-6">{ed.error}</p>;
    }

    const distintas = cosasDistintasPersona(ed.rol, ed.perms);
    // Con cambios sin guardar los controles no desaparecen aunque ya no quede nada distinto (el foco no se pierde).
    const conControles = distintas > 0 || ed.dirty;

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p ref={resumenRef} tabIndex={-1} className="max-w-2xl text-ui text-foreground focus:outline-none" aria-live="polite">
                            {distintas === 0
                                ? <>{primer} tiene justo lo de su rol <b>{rolNombre}</b>.</>
                                : <>{primer} tiene <b>{distintas} {distintas === 1 ? 'cosa distinta' : 'cosas distintas'}</b> a su rol <b>{rolNombre}</b>. Lo demás viene de su rol.</>}
                        </p>
                        {conControles && (
                            <div className="flex flex-wrap items-center gap-2">
                                {/* eslint-disable-next-line no-restricted-syntax -- interruptor con texto (copia el de MatrizRoles) */}
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={soloDistinto}
                                    onClick={() => setSoloDistinto(v => !v)}
                                    className="inline-flex min-h-11 items-center gap-3 rounded-full border border-border bg-card py-1 pl-4 pr-1.5 text-sm text-brand-dark transition-colors duration-200 hover:bg-muted"
                                >
                                    Solo lo distinto a su rol
                                    <span className={cn('relative h-7 w-12 rounded-full transition-colors duration-200', soloDistinto ? 'bg-brand-primary' : 'bg-muted-foreground/70')}>
                                        <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all duration-200', soloDistinto ? 'left-6' : 'left-1')} />
                                    </span>
                                </button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="min-h-11"
                                    disabled={distintas === 0}
                                    leftIcon={<RotateCcw className="h-4 w-4" />}
                                    onClick={() => {
                                        ed.todoComoSuRol();
                                        requestAnimationFrame(() => resumenRef.current?.focus());
                                    }}
                                >
                                    Dejar todo como su rol
                                </Button>
                            </div>
                        )}
                    </div>
                    <LeyendaFrases conMarcas />
                    <PermisosEnFrases
                        perms={ed.perms}
                        rol={ed.rol}
                        sinGuardarEn={ed.sinGuardarEn}
                        soloLectura={false}
                        // Si el interruptor no se ve (nada distinto y nada sin guardar), el filtro tampoco: si no, la
                        // vista quedaría vacía y sin cómo volver.
                        soloDistinto={soloDistinto && conControles}
                        onNivel={ed.setNivel}
                        onAlternar={ed.alternar}
                        onComoSuRol={ed.volver}
                        puedeVolver={ed.comoSuRolCambia}
                        onAlternarPuerta={ed.alternarPuerta}
                        puertaSinGuardar={ed.puertaSinGuardar}
                    />
                </div>
            </div>

            {(ed.dirty || ed.saving) && (
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 sm:px-6">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                        <div className="min-w-0" aria-live="polite">
                            <p className="text-ui font-semibold text-brand-dark">
                                {ed.cambios} {ed.cambios === 1 ? 'cambio' : 'cambios'} sin guardar en los permisos de {primer}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Solo para {primer}: al guardar se le cierra la sesión y ve los cambios al volver a entrar. Su rol no cambia.
                            </p>
                            {esYo && (
                                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Son tus permisos: también se te cerrará la sesión.</p>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={ed.deshacer} disabled={ed.saving} leftIcon={<RotateCcw className="h-4 w-4" />}>Deshacer</Button>
                        <Button onClick={ed.guardar} isLoading={ed.saving} leftIcon={<Save className="h-4 w-4" />}>Guardar</Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PermisosPersonaPanel;
