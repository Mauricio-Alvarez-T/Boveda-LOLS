import React, { useState, useEffect } from 'react';
import { Mail, Lock, CheckCircle2, AlertCircle, Save, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import api from '../../services/api';

interface EmailConfigFormProps { }

const EmailConfigForm: React.FC<EmailConfigFormProps> = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [hasPassword, setHasPassword] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await api.get<{ email_corporativo: string; tiene_password: boolean }>('/usuarios/me/email-config');
                setEmail(res.data.email_corporativo || '');
                setHasPassword(res.data.tiene_password);
            } catch (err) {
                // Not configured yet is fine
            } finally {
                setLoading(false);
            }
        };
        fetchConfig();
    }, []);

    const handleSave = async () => {
        if (!email) {
            toast.error('El correo corporativo es requerido');
            return;
        }

        setSaving(true);
        try {
            await api.put('/usuarios/me/email-config', {
                email_corporativo: email,
                ...(password ? { email_password: password } : {})
            });
            toast.success('Credenciales guardadas correctamente');
            setHasPassword(true);
            setPassword('');
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar credenciales');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[#0071E3]" />
            </div>
        );
    }

    return (
        <div className="max-w-lg space-y-6">
            {/* Status Banner */}
            <div className={`flex items-center gap-3 p-4 rounded-xl border ${hasPassword && email
                    ? 'bg-[#34C759]/8 border-[#34C759]/30 text-[#34C759]'
                    : 'bg-[#FF9F0A]/8 border-[#FF9F0A]/30 text-[#FF9F0A]'
                }`}>
                {hasPassword && email ? (
                    <>
                        <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-semibold">Credenciales configuradas</p>
                            <p className="text-xs opacity-80">Los reportes se enviarán desde <strong>{email}</strong></p>
                        </div>
                    </>
                ) : (
                    <>
                        <AlertCircle className="h-5 w-5 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-semibold">Sin configurar</p>
                            <p className="text-xs opacity-80">Configura tu correo para poder enviar reportes desde Bóveda LOLS</p>
                        </div>
                    </>
                )}
            </div>

            <div className="space-y-4">
                <Input
                    label="Correo Corporativo"
                    type="email"
                    placeholder="tu-nombre@empresa.cl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    leftIcon={<Mail className="h-4 w-4 text-[#6E6E73]" />}
                />

                <div className="space-y-1.5 relative">
                    <Input
                        label={hasPassword ? 'Nueva Contraseña (dejar en blanco para no cambiar)' : 'Contraseña de Correo'}
                        type={showPassword ? 'text' : 'password'}
                        placeholder={hasPassword ? '••••••••' : 'Contraseña de tu cuenta de correo'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        leftIcon={<Lock className="h-4 w-4 text-[#6E6E73]" />}
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-[2.15rem] text-[#6E6E73] hover:text-[#1D1D1F] transition-colors"
                    >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>

                <p className="text-xs text-[#A1A1A6] bg-[#F5F5F7] rounded-xl p-3 leading-relaxed">
                    🔒 Tu contraseña se encripta con AES-256 antes de guardarse. Nadie en el sistema, ni siquiera los administradores, pueden leerla.
                </p>

                <Button
                    onClick={handleSave}
                    isLoading={saving}
                    leftIcon={<Save className="h-4 w-4" />}
                    className="w-full"
                >
                    Guardar Credenciales
                </Button>
            </div>
        </div>
    );
};

export default EmailConfigForm;
