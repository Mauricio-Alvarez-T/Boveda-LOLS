import React, { useMemo } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { esSuperAdmin } from './perfil';
import { useInventarioPerfil } from './useInventarioPerfil';
import { useVerComo } from './useVerComo';
import VerComo from './VerComo';
import { opcionesVerComo, type VistaVerComo } from './verComo.modelo';

/**
 * «Ver como» arriba de TODO el Inicio, solo para el Super Administrador (Marcos y Mauricio, 2026-10-23: «yo tengo que
 * tener todas las vistas de las demás personas»): Super Admin · Gerencia · quien aprueba · Jefatura · Jefe de obra.
 * «Gerencia» muestra el tablero de don Luis arriba; las de Inventario cambian la tarjeta Inventario y la abren
 * (`onInventario`). La obra de «Jefe de obra» se elige dentro de la tarjeta Inventario.
 */
const BarraVerComo: React.FC<{ version?: unknown; onInventario: () => void; userId: number | string }> = ({ version, onInventario, userId }) => {
    const [como, setComo] = useVerComo(userId);
    // Solo para el nombre de quien aprueba en la opción («Leonardo»): la misma respuesta que usa la tarjeta Inventario.
    const { datos } = useInventarioPerfil(version);
    const opciones = useMemo(() => opcionesVerComo(datos?.aprobadores), [datos?.aprobadores]);
    const elegir = (v: VistaVerComo) => {
        setComo(v);
        if (v === 'leonardo' || v === 'jefatura' || v === 'obra') onInventario();
    };
    return <VerComo modo="barra" como={como} onComo={elegir} opciones={opciones} aprobadores={datos?.aprobadores}
        obras={[]} obra={null} onObra={() => {}} />;
};

/** Para cualquiera que no sea Super Admin no hay barra ni se pide nada. */
const VerComoInicio: React.FC<{ version?: unknown; onInventario: () => void }> = ({ version, onInventario }) => {
    const { user } = useAuth();
    if (!esSuperAdmin(user) || user?.id == null) return null;
    return <BarraVerComo version={version} onInventario={onInventario} userId={user.id} />;
};

export default VerComoInicio;
