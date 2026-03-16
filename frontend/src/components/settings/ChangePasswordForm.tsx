import React, { useState } from 'react';
import { Lock, Save, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import api from '../../services/api';

const ChangePasswordForm: React.FC = () => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!currentPassword || !newPassword) {
            toast.error('Ambas contraseñas son requeridas');
            return;
        }

        setSaving(true);
        try {
            await api.put('/auth/me/password', {
                currentPassword,
                newPassword
            });
            toast.success('Contraseña actualizada correctamente');
            setCurrentPassword('');
            setNewPassword('');
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al actualizar contraseña');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-xl space-y-6">
            <div>
                <h3 className="text-base font-semibold text-brand-dark">Cambiar Mi Contraseña</h3>
                <p className="text-sm text-muted-foreground mt-1">
                    Actualiza tu contraseña de acceso al sistema. Por seguridad de la empresa, te recomendamos no compartirla con nadie.
                </p>
            </div>

            <div className="bg-background rounded-xl p-4 md:p-6 space-y-5">
                <div className="space-y-1.5 relative">
                    <Input
                        label="Contraseña Actual"
                        type={showCurrent ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        leftIcon={<Lock className="h-4 w-4 text-muted-foreground" />}
                    />
                    <button
                        type="button"
                        onClick={() => setShowCurrent(!showCurrent)}
                        className="absolute right-3 top-[2.15rem] text-muted-foreground hover:text-brand-dark transition-colors"
                    >
                        {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>

                <div className="space-y-1.5 relative">
                    <Input
                        label="Nueva Contraseña"
                        type={showNew ? 'text' : 'password'}
                        placeholder="Ej: lols150"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        leftIcon={<Lock className="h-4 w-4 text-brand-primary" />}
                    />
                    <button
                        type="button"
                        onClick={() => setShowNew(!showNew)}
                        className="absolute right-3 top-[2.15rem] text-muted-foreground hover:text-brand-dark transition-colors"
                    >
                        {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>

                <div className="pt-2">
                    <Button
                        onClick={handleSave}
                        isLoading={saving}
                        leftIcon={<Save className="h-4 w-4" />}
                        className="w-full sm:w-auto"
                        disabled={!currentPassword || !newPassword}
                    >
                        Actualizar Contraseña
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ChangePasswordForm;
