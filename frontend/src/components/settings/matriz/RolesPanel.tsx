import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { useMatrizRoles, type RolMatriz } from '../../../hooks/useMatrizRoles';
import { ROL_SUPER_ADMIN } from '../../../config/permisosPantallas';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { RolForm } from '../RolForm';
import { showDeleteToast } from '../../../utils/toastUtils';
import { cn } from '../../../utils/cn';
import { RolesEnFrases } from '../frases/RolesEnFrases';
import MatrizRoles from './MatrizRoles';
import { PieCambios } from './PieCambios';

/**
 * Configuración › Roles (2026-10-28): dos vistas de los MISMOS datos —
 *   · «Un rol a la vez» (por defecto): el rol en frases, la misma vista que los permisos de una persona (opción E);
 *   · «Todos juntos (tabla)»: la matriz de todos los roles (propuesta C, 2026-10-26).
 * El estado (`useMatrizRoles`) vive acá: pasar de una vista a la otra no pierde lo no guardado, y el pie de guardar,
 * el formulario de rol y el borrado son uno solo. La vista elegida se recuerda en este navegador.
 */
type Vista = 'frases' | 'tabla';
const CLAVE_VISTA = 'boveda-roles-vista';

const leerVista = (): Vista => {
    try { return localStorage.getItem(CLAVE_VISTA) === 'tabla' ? 'tabla' : 'frases'; } catch { return 'frases'; }
};

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
    const [vista, setVista] = useState<Vista>(leerVista);
    const [rolId, setRolId] = useState<number | null>(null);
    const [form, setForm] = useState<{ abierto: boolean; rol: RolMatriz | null }>({ abierto: false, rol: null });
    const [recargas, setRecargas] = useState(0);
    const personas = usePersonasPorRol(recargas);

    const cambiarVista = (v: Vista) => {
        setVista(v);
        try { localStorage.setItem(CLAVE_VISTA, v); } catch { /* sin almacenamiento: no se recuerda */ }
    };

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
        return <div className="py-16 text-center text-ui text-muted-foreground">Cargando roles…</div>;
    }

    // Sin elección (o el elegido ya no existe): el primer rol que se edita; el Super Administrador va al final.
    const elegido = state.roles.find(r => r.id === rolId) ?? state.roles.find(r => r.id !== ROL_SUPER_ADMIN) ?? state.roles[0];

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex w-fit rounded-full border border-border bg-background p-0.5" role="group" aria-label="Cómo ver los roles">
                    {([['frases', 'Un rol a la vez'], ['tabla', 'Todos juntos (tabla)']] as const).map(([k, t]) => {
                        const activo = vista === k;
                        return (
                            <Button
                                key={k}
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-pressed={activo}
                                onClick={() => cambiarVista(k)}
                                className={cn('min-h-11 px-4 text-sm sm:min-h-9', activo ? 'bg-card text-brand-dark shadow-sm hover:bg-card' : 'text-muted-foreground')}
                            >
                                {t}
                            </Button>
                        );
                    })}
                </div>
                {puedeCrear && (
                    <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => abrirForm(null)}>Nuevo rol</Button>
                )}
            </div>

            {vista === 'frases' && elegido ? (
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
            ) : (
                <MatrizRoles
                    editor={editor}
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
