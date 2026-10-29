import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { useMatrizRoles, type RolMatriz } from '../../../hooks/useMatrizRoles';
import { ROL_SUPER_ADMIN } from '../../../config/permisosPantallas';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { Skeleton, SkeletonCirculo } from '../../ui/Skeleton';
import { RolForm } from '../RolForm';
import { showDeleteToast } from '../../../utils/toastUtils';
import { cn } from '../../../utils/cn';
import { RolesEnFrases } from '../frases/RolesEnFrases';
import { LeyendaFrases, SiluetaFrases } from '../frases/PermisosEnFrases';
import { PieCambios } from './PieCambios';

/**
 * Configuración › Roles: un rol a la vez, en frases (opción E, Marcos 2026-10-28) — la misma vista que los permisos de
 * una persona. La tabla de todos los roles juntos (matriz, propuesta C del 2026-10-26) se quitó el 2026-10-29: «la
 * vista que tiene que permanecer es la nueva». El estado de todos los roles (`useMatrizRoles`) vive acá: lo que se
 * cambia en un rol queda marcado aunque se elija otro, y el pie de guardar, el formulario de rol y el borrado son uno solo.
 */

/** Nombres de las personas activas de cada rol, para decir a quién le llega un cambio. Si no se puede leer, null. */
function usePersonasPorRol(version: number): Map<number, string[]> | null {
    const [mapa, setMapa] = useState<Map<number, string[]> | null>(null);
    useEffect(() => {
        let cancelado = false;
        api.get('/usuarios')
            .then(res => {
                if (cancelado) return;
                const lista: { nombre: string; rol_id: number; activo?: boolean | number }[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
                const m = new Map<number, string[]>();
                for (const u of lista) {
                    if (u.activo === false || u.activo === 0) continue;
                    const id = Number(u.rol_id);
                    m.set(id, [...(m.get(id) ?? []), u.nombre]);
                }
                for (const [id, nombres] of m) m.set(id, nombres.sort((a, b) => a.localeCompare(b, 'es')));
                setMapa(m);
            })
            .catch(() => { if (!cancelado) setMapa(null); });
        return () => { cancelado = true; };
    }, [version]);
    return mapa;
}

const RolesPanel: React.FC = () => {
    const { hasPermission } = useAuth();
    const soloLectura = !hasPermission('usuarios.permisos.gestionar');
    const puedeCrear = hasPermission('usuarios.roles.crear');
    const puedeEditar = hasPermission('usuarios.roles.editar');
    const puedeBorrar = hasPermission('usuarios.roles.eliminar');

    const editor = useMatrizRoles();
    const { state, actions } = editor;
    const [rolId, setRolId] = useState<number | null>(null);
    const [form, setForm] = useState<{ abierto: boolean; rol: RolMatriz | null }>({ abierto: false, rol: null });
    const [recargas, setRecargas] = useState(0);
    const personas = usePersonasPorRol(recargas);

    const recargar = () => { actions.recargar(); setRecargas(n => n + 1); };

    const abrirForm = (rol: RolMatriz | null) => {
        if (state.dirty) {
            toast.info('Guarda o deshaz los cambios de permisos antes de crear o editar un rol.');
            return;
        }
        setForm({ abierto: true, rol });
    };

    const borrar = (rol: RolMatriz) => {
        if (state.dirty) {
            toast.info('Guarda o deshaz los cambios de permisos antes de borrar un rol.');
            return;
        }
        showDeleteToast({
            message: `¿Borrar el rol «${rol.nombre}»?`,
            successMessage: 'Rol borrado',
            onConfirm: async () => {
                await api.delete(`/usuarios/roles/${rol.id}`);
                if (rolId === rol.id) setRolId(null);
                recargar();
            },
        });
    };

    if (state.loading) {
        // Lo mismo que se ve con los datos: el botón, la tarjeta del rol (selector, nombre y personas en gris), la
        // leyenda y las tarjetas de cada módulo con sus pantallas.
        return (
            <div className="flex flex-col gap-4">
                {puedeCrear && (
                    <div className="flex justify-end"><Skeleton className="h-11 w-32 rounded-full" /></div>
                )}
                <section aria-hidden="true" className="rounded-card border border-border bg-card p-4 sm:p-5">
                    <div className="flex flex-wrap gap-1.5">
                        {['w-28', 'w-36', 'w-24', 'w-32', 'w-20', 'w-40', 'w-28'].map((w, i) => (
                            <Skeleton key={i} className={cn('h-11 rounded-full sm:h-9', w)} />
                        ))}
                    </div>
                    <div className="mt-4 flex min-w-0 items-center gap-3">
                        <SkeletonCirculo className="h-11 w-11" />
                        <div className="min-w-0 flex-1 space-y-2">
                            <Skeleton className="h-6 w-48 max-w-full" />
                            <Skeleton className="h-3.5 w-4/5 max-w-sm" />
                        </div>
                    </div>
                </section>
                <LeyendaFrases conMarcas={false} soloLectura={soloLectura} />
                {soloLectura && (
                    <p className="text-sm text-muted-foreground">Puedes mirar, pero cambiar permisos requiere «Cambiar permisos».</p>
                )}
                <SiluetaFrases que="los roles" />
            </div>
        );
    }

    // Sin elección (o el elegido ya no existe): el primer rol que se edita; el Super Administrador va al final.
    const elegido = state.roles.find(r => r.id === rolId) ?? state.roles.find(r => r.id !== ROL_SUPER_ADMIN) ?? state.roles[0];

    return (
        <div className="flex flex-col gap-4">
            {puedeCrear && (
                <div className="flex justify-end">
                    <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => abrirForm(null)}>Nuevo rol</Button>
                </div>
            )}

            {elegido && (
                <RolesEnFrases
                    editor={editor}
                    rolId={elegido.id}
                    onElegir={setRolId}
                    personas={personas}
                    soloLectura={soloLectura}
                    puedeEditar={puedeEditar}
                    puedeBorrar={puedeBorrar}
                    onEditar={abrirForm}
                    onBorrar={borrar}
                />
            )}

            {!soloLectura && (
                <PieCambios
                    totalCambios={state.totalCambios}
                    roles={state.cambiados.map(r => r.nombre)}
                    personas={state.personasAfectadas}
                    cambiaMiRol={state.cambiaMiRol}
                    saving={state.saving}
                    onDeshacer={actions.deshacer}
                    onGuardar={actions.guardar}
                />
            )}

            <Modal
                isOpen={form.abierto}
                onClose={() => setForm({ abierto: false, rol: null })}
                title={form.rol ? `Editar rol «${form.rol.nombre}»` : 'Nuevo rol'}
                size="md"
            >
                <RolForm
                    initialData={form.rol}
                    onSuccess={() => { setForm({ abierto: false, rol: null }); recargar(); }}
                    onCancel={() => setForm({ abierto: false, rol: null })}
                />
            </Modal>
        </div>
    );
};

export default RolesPanel;
