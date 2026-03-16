import React, { ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';

export interface RequirePermissionProps {
    modulo: string;
    accion: 'puede_ver' | 'puede_crear' | 'puede_editar' | 'puede_eliminar';
    children: ReactNode;
    fallback?: ReactNode;
}

/**
 * Wrapper component to conditionally render UI elements based on user permissions.
 * Replaces repetitive hooks like `if (checkPermission('modulo', 'accion')) return <Component />`.
 */
export const RequirePermission: React.FC<RequirePermissionProps> = ({ 
    modulo, 
    accion, 
    children, 
    fallback = null 
}) => {
    const { checkPermission } = useAuth();

    if (checkPermission(modulo, accion)) {
        return <>{children}</>;
    }

    return <>{fallback}</>;
};
