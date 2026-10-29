import React, { useCallback } from 'react';
import { Package, RotateCcw } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useObra } from '../../../context/ObraContext';
import { cn } from '../../../utils/cn';
import { Button } from '../../ui/Button';
import { Cargando, Skeleton } from '../../ui/Skeleton';
import { DetalleModulo } from './DetalleModulo';
import type { EstadoInventarioPerfil } from './inventarioPerfil/cargaInventarioPerfil';
import { TARJETA } from './inventarioPerfil/formato';
import {
    DESCRIPCION_RESPALDO, PERMISOS_PEDIR, descripcionInventario, vistaInventario, type PropsVistaInventario, type VistaInventario,
} from './inventarioPerfil/perfil';
import type { InventarioPerfilApi } from './inventarioPerfil/tipos';
import { useInventarioPerfil } from './inventarioPerfil/useInventarioPerfil';
import VistaJefatura from './inventarioPerfil/VistaJefatura';
import VistaLeonardo from './inventarioPerfil/VistaLeonardo';
import VistaObra from './inventarioPerfil/VistaObra';
import VistaSuperAdmin from './inventarioPerfil/VistaSuperAdmin';

type VistaConDatos = Exclude<VistaInventario, 'otro'>;

/** La vista de cada perfil (la regla, en `vistaInventario` de inventarioPerfil/perfil.ts). */
const VISTAS: Record<VistaConDatos, React.ComponentType<PropsVistaInventario>> = {
    superadmin: VistaSuperAdmin,
    leonardo: VistaLeonardo,
    jefatura: VistaJefatura,
    obra: VistaObra,
};

type Accion = { texto: string; onClick: () => void };

interface Props {
    /** Cambia con «Actualizar» del Inicio (el `lastUpdated` de Dashboard; un valor estable): vuelve a pedir los datos. */
    version?: unknown;
    /** «Ir a Inventario» del encabezado del detalle. */
    onIr: () => void;
    /**
     * Lo que ven los demás perfiles: lo de producción (`<RespaldoInventario modelo={…} />`, armado en Dashboard con los
     * datos de quien mira).
     */
    respaldo: React.ReactNode;
    /**
     * Se aprobó o rechazó algo aquí mismo (VistaLeonardo, 2026-10-23): además de volver a pedir el detalle, Dashboard
     * vuelve a pedir la tarjeta «Inventario» de arriba (sus cifras).
     */
    onCambio?: () => void;
}

/**
 * Detalle «Inventario» del Inicio por perfil (Marcos 2026-10-22, del lienzo de diseño): elige la vista según el rol y
 * los permisos (`vistaInventario`) y pone la descripción bajo el título (`descripcionInventario`):
 *   - Super Administrador (rol 1) → VistaSuperAdmin (su vista, sin «Ver como»: Marcos 2026-10-26; las vistas de los
 *     demás se revisan en Soporte · usuarios).
 *   - ve todas las obras y aprueba → VistaLeonardo · ve todas y las diferencias sin aprobar → VistaJefatura · sin ver
 *     todas ni bodega, pide o recibe para su obra → VistaObra. Todas con GET /transferencias/inicio/perfil (se pide al
 *     abrirlo y con «Actualizar»).
 *   - cualquier otro perfil (y todo el que no tenga la pestaña «Solicitudes») → `respaldo` (lo de producción), sin
 *     pedir nada más.
 */
const DetalleInventario: React.FC<Props> = ({ version, onIr, respaldo, onCambio }) => {
    const { user, hasPermission } = useAuth();
    const vista = vistaInventario(hasPermission, user);
    const accion: Accion = { texto: 'Ir a Inventario', onClick: onIr };
    if (vista === 'otro') {
        return (
            <DetalleModulo icon={Package} titulo="Inventario" descripcion={DESCRIPCION_RESPALDO} accion={accion}>
                {respaldo}
            </DetalleModulo>
        );
    }
    // `key`: si cambia el perfil, la carga parte de cero.
    return <DetalleConDatos key={vista} vista={vista} version={version} accion={accion} onCambio={onCambio} />;
};

/**
 * Lo que reciben las vistas como `onCambio`: vuelve a pedir el detalle (se sigue viendo lo de antes hasta que llega) y
 * avisa a Dashboard para la tarjeta de arriba.
 */
const useAlCambiar = (reintentar: () => void, onCambio?: () => void) =>
    useCallback(() => { reintentar(); onCambio?.(); }, [reintentar, onCambio]);

/** La espera o el error mientras no hay datos; con datos, `children` (y mientras recarga, se queda lo que se veía). */
const ConCarga: React.FC<{
    carga: EstadoInventarioPerfil & { reintentar: () => void };
    children: (datos: InventarioPerfilApi) => React.ReactNode;
}> = ({ carga: { datos, cargando, error, reintentar }, children }) => {
    if (datos) {
        // Mientras recarga («Actualizar») se queda lo que ya se veía; si una recarga falla, también.
        return <div aria-busy={cargando}>{children(datos)}</div>;
    }
    if (error) {
        return (
            <div className={cn(TARJETA, 'flex flex-wrap items-center justify-between gap-3')}>
                <p className="text-sm text-muted-foreground">No se pudieron cargar las solicitudes.</p>
                <Button variant="secondary" size="sm" onClick={reintentar} leftIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}>
                    Reintentar
                </Button>
            </div>
        );
    }
    // Cada perfil tiene su vista (circuito, por aprobar, lo de su obra): va lo que comparten, el rótulo y las filas de
    // solicitudes, en gris.
    return (
        <div className={TARJETA} aria-busy="true">
            <Cargando que="las solicitudes de inventario">
                <div aria-hidden="true">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                        <Skeleton className="h-3 w-56 max-w-full" />
                        <Skeleton className="h-3 w-40 max-w-full" />
                    </div>
                    <ul className="mt-3 divide-y divide-border">
                        {[0, 1, 2, 3, 4].map(i => (
                            <li key={i} className="flex items-center gap-3 py-3">
                                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    <Skeleton className={cn('h-4', i % 2 ? 'w-1/2' : 'w-3/4')} />
                                    <Skeleton className={cn('h-3', i % 3 === 1 ? 'w-1/3' : 'w-1/2')} />
                                </div>
                                <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
                            </li>
                        ))}
                    </ul>
                </div>
            </Cargando>
        </div>
    );
};

/** Las vistas propias de cada perfil (Leonardo, jefatura, obra): cargan GET /transferencias/inicio/perfil. */
const DetalleConDatos: React.FC<{
    vista: VistaConDatos; version?: unknown; accion: Accion; onCambio?: () => void;
}> = ({ vista, version, accion, onCambio }) => {
    const { user, hasPermission } = useAuth();
    const { obras } = useObra();
    const carga = useInventarioPerfil(version);
    const { datos } = carga;
    const alCambiar = useAlCambiar(carga.reintentar, onCambio);
    // El nombre de su obra: el de la respuesta; mientras llega, el del selector de obras (así el texto no salta).
    const obra = datos?.obra?.nombre ?? obras.find(o => o.id === user?.obra_id)?.nombre ?? null;
    // Si puede pedir: lo que dice la respuesta (lo mismo que mira VistaObra); mientras llega, los permisos del token.
    const puedePedir = datos?.puede.solicitar ?? PERMISOS_PEDIR.some(p => hasPermission(p));
    const descripcion = descripcionInventario(vista, { obra, aprobadores: datos?.aprobadores, puedePedir });
    const Vista = VISTAS[vista];

    return (
        <DetalleModulo icon={Package} titulo="Inventario" descripcion={descripcion} accion={accion}>
            <ConCarga carga={carga}>{d => <Vista datos={d} onCambio={alCambiar} />}</ConCarga>
        </DetalleModulo>
    );
};

export default DetalleInventario;
