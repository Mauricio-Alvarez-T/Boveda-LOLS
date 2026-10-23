import React, { useMemo, useState } from 'react';
import { Package, RotateCcw } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useObra } from '../../../context/ObraContext';
import { cn } from '../../../utils/cn';
import { Button } from '../../ui/Button';
import { SkeletonText } from '../../ui/Skeleton';
import { DetalleModulo } from './DetalleModulo';
import type { EstadoInventarioPerfil } from './inventarioPerfil/cargaInventarioPerfil';
import { obraPorDefecto, obrasVerComo } from './inventarioPerfil/comoObra';
import { TARJETA } from './inventarioPerfil/formato';
import {
    DESCRIPCION_RESPALDO, PERMISOS_PEDIR, descripcionInventario, vistaInventario, type PropsVistaInventario, type VistaInventario,
} from './inventarioPerfil/perfil';
import type { InventarioPerfilApi } from './inventarioPerfil/tipos';
import { useInventarioPerfil } from './inventarioPerfil/useInventarioPerfil';
import { useVerComo } from './inventarioPerfil/useVerComo';
import VerComo from './inventarioPerfil/VerComo';
import { datosVerComo, descripcionVerComo } from './inventarioPerfil/verComo.modelo';
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
}

/**
 * Detalle «Inventario» del Inicio por perfil (Marcos 2026-10-22, del lienzo de diseño): elige la vista según el rol y
 * los permisos (`vistaInventario`) y pone la descripción bajo el título (`descripcionInventario`):
 *   - Super Administrador (rol 1) → VistaSuperAdmin, con el selector «Ver como» arriba para mirar también las vistas de
 *     los demás con los mismos datos, recalculados para cada perfil (DetalleSuperAdmin, abajo).
 *   - ve todas las obras y aprueba → VistaLeonardo · ve todas y las diferencias sin aprobar → VistaJefatura · sin ver
 *     todas ni bodega, pide o recibe para su obra → VistaObra. Todas con GET /transferencias/inicio/perfil (se pide al
 *     abrirlo y con «Actualizar»).
 *   - cualquier otro perfil (y todo el que no tenga la pestaña «Solicitudes») → `respaldo` (lo de producción), sin
 *     pedir nada más.
 */
const DetalleInventario: React.FC<Props> = ({ version, onIr, respaldo }) => {
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
    // `key`: si cambia el perfil o la persona (otra sesión), la carga y lo elegido parten de cero.
    if (vista === 'superadmin') {
        return <DetalleSuperAdmin key={`superadmin-${user?.id ?? ''}`} version={version} accion={accion} respaldo={respaldo} />;
    }
    return <DetalleConDatos key={vista} vista={vista} version={version} accion={accion} />;
};

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
    return (
        <div className={TARJETA} aria-busy="true">
            <SkeletonText lines={6} />
        </div>
    );
};

/** Las vistas propias de cada perfil (Leonardo, jefatura, obra): cargan GET /transferencias/inicio/perfil. */
const DetalleConDatos: React.FC<{ vista: Exclude<VistaConDatos, 'superadmin'>; version?: unknown; accion: Accion }> = ({ vista, version, accion }) => {
    const { user, hasPermission } = useAuth();
    const { obras } = useObra();
    const carga = useInventarioPerfil(version);
    const { datos } = carga;
    // El nombre de su obra: el de la respuesta; mientras llega, el del selector de obras (así el texto no salta).
    const obra = datos?.obra?.nombre ?? obras.find(o => o.id === user?.obra_id)?.nombre ?? null;
    // Si puede pedir: lo que dice la respuesta (lo mismo que mira VistaObra); mientras llega, los permisos del token.
    const puedePedir = datos?.puede.solicitar ?? PERMISOS_PEDIR.some(p => hasPermission(p));
    const descripcion = descripcionInventario(vista, { obra, aprobadores: datos?.aprobadores, puedePedir });
    const Vista = VISTAS[vista];

    return (
        <DetalleModulo icon={Package} titulo="Inventario" descripcion={descripcion} accion={accion}>
            <ConCarga carga={carga}>{d => <Vista datos={d} />}</ConCarga>
        </DetalleModulo>
    );
};

/**
 * El Super Administrador (Marcos y Mauricio): su vista y, con «Ver como» (inventarioPerfil/VerComo.tsx y verComo.modelo.ts),
 * las de quien aprueba, jefatura, un jefe de obra (con selector de obra: por defecto la del selector global de arriba,
 * si no la de más movimiento). Sin «Otros perfiles» (Marcos 2026-10-23). Una sola carga:
 * la suya, de todas las obras. La elección se recuerda por persona en localStorage; la descripción bajo el título es la
 * de la vista elegida.
 */
const DetalleSuperAdmin: React.FC<{ version?: unknown; accion: Accion; respaldo: React.ReactNode }> = ({ version, accion, respaldo }) => {
    const { user } = useAuth();
    const { obras: globales, selectedObra } = useObra();
    const carga = useInventarioPerfil(version);
    const { datos } = carga;
    const userId = user?.id;

    // Lo elegido en la barra «Ver como» de arriba del Inicio (VerComoInicio, Marcos 2026-10-23), compartido.
    const [como] = useVerComo(userId);

    // «Jefe de obra»: la obra que se tocó aquí; mientras no se toque ninguna, sigue a la de arriba (o la de más movimiento).
    const [obraElegida, setObraElegida] = useState<number | null>(null);
    const opciones = useMemo(() => (datos ? obrasVerComo(datos, globales) : []), [datos, globales]);
    const obraId = obraPorDefecto(opciones, { elegida: obraElegida, global: selectedObra?.id ?? null });
    const obra = opciones.find(o => o.id === obraId) ?? null;

    const datosVista = useMemo(() => (datos ? datosVerComo(como, datos, obra) : null), [como, datos, obra]);
    const descripcion = descripcionVerComo(como, { obra: obra?.nombre, aprobadores: datos?.aprobadores });

    // «Gerencia»: en Inventario don Luis ve lo general (el respaldo, como el resto de los Administradores).
    if (como === 'gerencia') {
        return (
            <DetalleModulo icon={Package} titulo="Inventario" descripcion={descripcion} accion={accion}>
                {respaldo}
            </DetalleModulo>
        );
    }

    return (
        <DetalleModulo icon={Package} titulo="Inventario" descripcion={descripcion} accion={accion}>
            {como === 'obra' && (
                <VerComo modo="obra" como={como} onComo={() => {}} aprobadores={datos?.aprobadores}
                    obras={opciones} obra={obraId} onObra={setObraElegida} />
            )}
            <ConCarga carga={carga}>{() => {
                if (!datosVista) {
                    return (
                        <div className={TARJETA}>
                            <p className="text-sm text-muted-foreground">No hay obras con solicitudes para mostrar.</p>
                        </div>
                    );
                }
                const Vista = VISTAS[como];
                // `key`: otra obra (o volver a una vista) parte limpia, sin filtros ni listas abiertas de la anterior.
                return <Vista key={como === 'obra' ? `obra-${obraId}` : como} datos={datosVista} />;
            }}</ConCarga>
        </DetalleModulo>
    );
};

export default DetalleInventario;
