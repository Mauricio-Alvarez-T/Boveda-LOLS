import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';

interface PermissionDefinition {
    clave: string;
    nombre: string;
    descripcion: string;
}

interface CatalogoGrouped {
    [modulo: string]: PermissionDefinition[];
}

interface Override {
    permiso_clave: string;
    tipo: 'grant' | 'deny';
}

interface Props {
    usuarioId: number;
    usuarioNombre: string;
    rolId: number;
    rolNombre: string;
    onClose?: () => void;
}

const PermisosUsuarioPanel: React.FC<Props> = ({ 
    usuarioId, 
    usuarioNombre, 
    rolId, 
    rolNombre, 
    onClose 
}) => {
    const { token } = useAuth();
    const [catalogo, setCatalogo] = useState<CatalogoGrouped | null>(null);
    const [rolePerms, setRolePerms] = useState<string[]>([]);
    const [overrides, setOverrides] = useState<Override[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const config = { headers: { Authorization: `Bearer ${token}` } };
                const [resCat, resRole, resOver] = await Promise.all([
                    axios.get(`${import.meta.env.VITE_API_URL}/usuarios/permisos/catalogo`, config),
                    axios.get(`${import.meta.env.VITE_API_URL}/usuarios/roles/${rolId}/permisos`, config),
                    axios.get(`${import.meta.env.VITE_API_URL}/usuarios/user-overrides/${usuarioId}`, config)
                ]);
                setCatalogo(resCat.data);
                setRolePerms(resRole.data);
                setOverrides(resOver.data);
            } catch (err) {
                console.error('Error fetching data:', err);
                toast.error('Error al cargar datos de permisos');
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [usuarioId, rolId, token]);

    const getPermissionStatus = (clave: string) => {
        const override = overrides.find(o => o.permiso_clave === clave);
        if (override) return override.tipo;
        return 'default'; // Inherited from role
    };

    const isEffective = (clave: string) => {
        const status = getPermissionStatus(clave);
        if (status === 'grant') return true;
        if (status === 'deny') return false;
        return rolePerms.includes(clave);
    };

    const handleSetOverride = (clave: string, tipo: 'grant' | 'deny' | 'default') => {
        setOverrides(prev => {
            const filtered = prev.filter(o => o.permiso_clave !== clave);
            if (tipo === 'default') return filtered;
            return [...filtered, { permiso_clave: clave, tipo }];
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await axios.post(`${import.meta.env.VITE_API_URL}/usuarios/user-overrides/${usuarioId}`, {
                overrides,
                rol_id: rolId
            }, config);
            toast.success('Cambios guardados. El usuario deberá re-iniciar sesión.');
            if (onClose) onClose();
        } catch (err) {
            console.error('Error saving overrides:', err);
            toast.error('Error al guardar cambios');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="p-4 text-center">Cargando...</div>;

    return (
        <div className="bg-white rounded-lg shadow-xl border p-6 max-w-5xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold text-gray-800">
                        Ajustes para <span className="text-primary">{usuarioNombre}</span>
                    </h2>
                    <p className="text-sm text-gray-500">
                        Rol base: <span className="font-semibold">{rolNombre}</span>
                    </p>
                </div>
                {onClose && (
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg mb-6 text-sm text-blue-700 flex items-start">
                <svg className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <p>
                    Los <b>Overrides</b> permiten forzar un permiso (Conceder) o prohibirlo (Denegar) sin importar lo que el Rol diga. 
                    Si está en "Por Defecto", usará el permiso del Rol.
                </p>
            </div>

            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-4 custom-scrollbar">
                {catalogo && Object.entries(catalogo).map(([modulo, permisos]) => (
                    <div key={modulo} className="border rounded-lg overflow-hidden">
                        <div className="bg-gray-100 px-4 py-2 border-b font-semibold text-gray-700">
                            {modulo}
                        </div>
                        <div className="divide-y bg-white">
                            {permisos.map(p => {
                                const status = getPermissionStatus(p.clave);
                                const effective = isEffective(p.clave);
                                const fromRole = rolePerms.includes(p.clave);
                                
                                return (
                                    <div key={p.clave} className="p-4 flex flex-col md:flex-row md:items-center justify-between hover:bg-gray-50 transition-colors">
                                        <div className="mb-3 md:mb-0 max-w-lg">
                                            <div className="flex items-center space-x-2">
                                                <span className={`w-2.5 h-2.5 rounded-full ${effective ? 'bg-green-500' : 'bg-red-500'}`} title={effective ? 'Permitido' : 'Denegado'}></span>
                                                <span className="font-medium text-gray-800">{p.nombre}</span>
                                                {status === 'default' && (
                                                    <span className="text-[10px] bg-gray-200 px-1.5 py-0.5 rounded text-gray-600 uppercase">Rol</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 ml-5">{p.descripcion}</p>
                                        </div>

                                        <div className="flex items-center bg-gray-200 p-0.5 rounded-lg">
                                            <button 
                                                onClick={() => handleSetOverride(p.clave, 'grant')}
                                                className={`px-3 py-1 text-xs rounded-md transition-all ${status === 'grant' ? 'bg-green-500 text-white shadow' : 'text-gray-600 hover:bg-gray-300'}`}
                                            >
                                                Conceder
                                            </button>
                                            <button 
                                                onClick={() => handleSetOverride(p.clave, 'default')}
                                                className={`px-3 py-1 text-xs rounded-md transition-all ${status === 'default' ? 'bg-white text-gray-800 shadow' : 'text-gray-600 hover:bg-gray-300'}`}
                                            >
                                                Defecto ({fromRole ? '✓' : '✗'})
                                            </button>
                                            <button 
                                                onClick={() => handleSetOverride(p.clave, 'deny')}
                                                className={`px-3 py-1 text-xs rounded-md transition-all ${status === 'deny' ? 'bg-red-500 text-white shadow' : 'text-gray-600 hover:bg-gray-300'}`}
                                            >
                                                Denegar
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-8 flex justify-end space-x-3 border-t pt-6">
                <button 
                    onClick={onClose}
                    className="px-6 py-2 border rounded-lg hover:bg-gray-50 text-gray-600"
                    disabled={isSaving}
                >
                    Cancelar
                </button>
                <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-8 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 shadow-md transition-all disabled:opacity-50 flex items-center"
                >
                    {isSaving ? 'Guardando...' : 'Guardar Overrides'}
                </button>
            </div>
        </div>
    );
};

export default PermisosUsuarioPanel;
