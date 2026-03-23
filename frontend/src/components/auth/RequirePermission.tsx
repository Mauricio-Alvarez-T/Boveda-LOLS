import React from 'react';
import { useAuth } from '../../context/AuthContext';

interface RequirePermissionProps {
    children: React.ReactNode;
    permiso?: string; // Nuevo: ej. 'asistencia.guardar'
    modulo?: string;  // Legacy
    accion?: 'puede_ver' | 'puede_crear' | 'puede_editar' | 'puede_eliminar'; // Legacy
}

const RequirePermission: React.FC<RequirePermissionProps> = ({ 
    children, 
    permiso, 
    modulo, 
    accion 
}) => {
    const { hasPermission, checkPermission } = useAuth();

    // Prioridad 1: Permiso atómico directo
    if (permiso) {
        return hasPermission(permiso) ? <>{children}</> : null;
    }

    // Prioridad 2: Retrocompatibilidad (modulo + accion)
    if (modulo && accion) {
        return checkPermission(modulo, accion) ? <>{children}</> : null;
    }

    return null;
};

export default RequirePermission;
