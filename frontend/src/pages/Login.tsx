import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'framer-motion';
import { LogIn, Mail, Lock, Fingerprint } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Logo } from '../components/ui/Logo';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import type { AuthResponse } from '../types';

const loginSchema = z.object({
    email: z.string().email({ message: "Email corporativo inválido" }),
    password: z.string().min(5, { message: "La contraseña es muy corta" }),
});

type LoginForm = z.infer<typeof loginSchema>;

const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [isLoading, setIsLoading] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<LoginForm>({
        resolver: zodResolver(loginSchema),
    });

    const onSubmit = async (data: LoginForm) => {
        setIsLoading(true);
        try {
            const response = await api.post<AuthResponse>('/auth/login', data);
            login(response.data);
            toast.success('¡Bienvenido a Bóveda LOLS!');
            navigate('/');
        } catch (err) {
            const axiosError = err as { response?: { data?: { error?: string } } };
            toast.error(axiosError.response?.data?.error || 'Credenciales incorrectas');
        } finally {
            setIsLoading(false);
        }
    };

    React.useEffect(() => {
        const reason = sessionStorage.getItem('sgdl_logout_reason');
        if (reason) {
            if (reason === 'permissions') {
                toast.error('Sesión expirada por actualización de permisos', {
                    description: 'Tus permisos han cambiado. Por favor, re-ingresa al sistema.'
                });
            } else if (reason === 'expired') {
                toast.info('Tu sesión ha expirado del servidor');
            }
            sessionStorage.removeItem('sgdl_logout_reason');
        }
    }, []);

    return (
        <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-[#F8F9FA]"
            style={{
                backgroundImage: `linear-gradient(to right, #E5E7EB 1px, transparent 1px), linear-gradient(to bottom, #E5E7EB 1px, transparent 1px)`,
                backgroundSize: '40px 40px'
            }}>

            {/* Blueprint Grid Overlay for aesthetic engineering feel */}
            <div className="absolute inset-0 pointer-events-none"
                style={{
                    backgroundImage: `linear-gradient(to right, #F3F4F6 1px, transparent 1px), linear-gradient(to bottom, #F3F4F6 1px, transparent 1px)`,
                    backgroundSize: '10px 10px',
                    opacity: 0.5
                }}
            />

            {/* Solid Engineering-Style Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="relative z-10 w-full max-w-[440px] px-6"
            >
                <div className="bg-white border border-gray-200 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] rounded-2xl overflow-hidden">

                    {/* Top Green Accent Bar */}
                    <div className="h-2 w-full bg-brand-primary" />

                    <div className="p-8 md:p-10">
                        <div className="flex flex-col items-center mb-10 w-full px-2">
                            <motion.div
                                whileHover={{ scale: 1.02 }}
                                className="w-full max-w-[260px] mb-6"
                            >
                                <Logo variant="green" className="w-full h-auto" />
                            </motion.div>
                            <div className="h-px w-16 bg-brand-primary/20 mb-4" />
                            <p className="text-[#64748B] text-xs text-center font-bold uppercase tracking-[0.2em]">
                                Gestión Documental & Asistencia
                            </p>
                        </div>

                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                            <div className="space-y-5">
                                <div className="relative group">
                                    <Input
                                        label="Correo Corporativo"
                                        placeholder="ejemplo@lols.cl"
                                        type="email"
                                        error={errors.email?.message}
                                        {...register('email')}
                                        className="pl-11 bg-white border-gray-200 focus:bg-white focus:border-brand-primary focus:ring-1 focus:ring-brand-primary h-12 rounded-lg transition-all"
                                    />
                                    <Mail className="absolute left-4 top-[38px] h-4 w-4 text-[#94A3B8] group-focus-within:text-brand-primary transition-colors" />
                                </div>

                                <div className="relative group">
                                    <Input
                                        label="Contraseña"
                                        placeholder="••••••••"
                                        type="password"
                                        error={errors.password?.message}
                                        {...register('password')}
                                        className="pl-11 bg-white border-gray-200 focus:bg-white focus:border-brand-primary focus:ring-1 focus:ring-brand-primary h-12 rounded-lg transition-all"
                                    />
                                    <Lock className="absolute left-4 top-[38px] h-4 w-4 text-[#94A3B8] group-focus-within:text-brand-primary transition-colors" />
                                </div>
                            </div>

                            <div className="pt-4">
                                <Button
                                    type="submit"
                                    className="w-full h-12 text-base font-semibold bg-brand-primary text-white hover:bg-[#027A3B] rounded-lg shadow-sm transition-all active:scale-[0.98]"
                                    isLoading={isLoading}
                                    rightIcon={<LogIn className="h-4 w-4" />}
                                >
                                    Iniciar Sesión
                                </Button>
                            </div>
                        </form>

                        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
                            <div className="flex items-center justify-center gap-2">
                                <Fingerprint className="h-3.5 w-3.5 text-[#94A3B8]" />
                                <p className="text-[10px] text-[#64748B] font-bold tracking-widest uppercase">
                                    Acceso Seguro Verificado
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Subtle bottom brand text */}
            <div className="absolute bottom-6 w-full text-center pointer-events-none">
                <p className="text-[#94A3B8] text-[10px] font-medium tracking-widest uppercase opacity-70">
                    LOLS Ingeniería © {new Date().getFullYear()}
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
