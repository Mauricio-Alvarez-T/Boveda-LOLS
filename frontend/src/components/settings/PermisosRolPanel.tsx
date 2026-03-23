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

interface Props {
    rolId: number;
    rolNombre: string;
    onClose?: () => void;
}

const PermisosRolPanel: React.FC<Props> = ({ rolId, rolNombre, onClose }) => {
    const { token } = useAuth();
    const [catalogo, setCatalogo] = useState<CatalogoGrouped | null>(null);
    const [permisosActivos, setPermisosActivos] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const config = { headers: { Authorization: `Bearer ${token}` } };
                const [resCat, resPerms] = await Promise.all([
                    axios.get(`${import.meta.env.VITE_API_URL}/usuarios/permisos/catalogo`, config),
                    axios.get(`${import.meta.env.VITE_API_URL}/usuarios/roles/${rolId}/permisos`, config)
                ]);
                setCatalogo(resCat.data);
                setPermisosActivos(resPerms.data);
            } catch (err) {
                console.error('Error fetching permissions:', err);
                toast.error('Error al cargar catálogo de permisos');
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [rolId, token]);

    const handleToggle = (clave: string) => {
        setPermisosActivos(prev => 
            prev.includes(clave) ? prev.filter(c => c !== clave) : [...prev, clave]
        );
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await axios.post(`${import.meta.env.VITE_API_URL}/usuarios/roles/${rolId}/permisos`, {
                permisos: permisosActivos
            }, config);
            toast.success('Permisos actualizados correctamente');
            if (onClose) onClose();
        } catch (err) {
            console.error('Error saving permissions:', err);
            toast.error('Error al guardar cambios');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="p-4 text-center">Cargando catálogo...</div>;

    return (
        <div className="bg-white rounded-lg shadow p-6 max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-800">
                    Permisos para el Rol: <span className="text-primary">{rolNombre}</span>
                </h2>
                {onClose && (
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            <div className="space-y-8 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {catalogo && Object.entries(catalogo).map(([modulo, permisos]) => (
                    <div key={modulo} className="border rounded-lg p-4 bg-gray-50">
                        <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2 flex items-center">
                            <span className="w-2 h-6 bg-primary rounded mr-3"></span>
                            {modulo}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {permisos.map(p => (
                                <label key={p.clave} className="flex items-start space-x-3 p-2 rounded hover:bg-white transition-colors cursor-pointer group">
                                    <input 
                                        type="checkbox"
                                        className="mt-1 w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary h-checkbox"
                                        checked={permisosActivos.includes(p.clave)}
                                        onChange={() => handleToggle(p.clave)}
                                    />
                                    <div>
                                        <div className="font-medium text-gray-800 group-hover:text-primary transition-colors text-sm">
                                            {p.nombre}
                                        </div>
                                        {p.descripcion && (
                                            <div className="text-xs text-gray-500 italic">
                                                {p.descripcion}
                                            </div>
                                        )}
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-8 flex justify-end space-x-3 border-t pt-6">
                {onClose && (
                    <button 
                        onClick={onClose}
                        className="px-6 py-2 border rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
                        disabled={isSaving}
                    >
                        Cancelar
                    </button>
                )}
                <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-8 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 shadow-md transition-all disabled:opacity-50 flex items-center"
                >
                    {isSaving ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Guardando...
                        </>
                    ) : 'Guardar Cambios'}
                </button>
            </div>
        </div>
    );
};

export default PermisosRolPanel;
