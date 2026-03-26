import React from 'react';
import { useAuth } from '../../context/AuthContext';

interface RequirePermissionProps {
    children: React.ReactNode;
    permiso: string; // ej. 'asistencia.guardar'
}

const RequirePermission: React.FC<RequirePermissionProps> = ({ 
    children, 
    permiso, 
}) => {
    const { hasPermission } = useAuth();

    return hasPermission(permiso) ? <>{children}</> : null;
};

export default RequirePermission;
