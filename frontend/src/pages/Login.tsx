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
import { AnimatedBackgroundText } from '../components/ui/AnimatedBackgroundText';
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
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Credenciales incorrectas');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-[#F5F5F7]">
            {/* Animated Typography Background */}
            <AnimatedBackgroundText />

            {/* Apple-Style Glass Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 w-full max-w-[440px] px-6"
            >
                <div className="bg-white/80 backdrop-blur-2xl border border-white/50 shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-[2.5rem] p-10 md:p-12">

                    <div className="flex flex-col items-center mb-10 w-full px-4">
                        <motion.div
                            whileHover={{ scale: 1.02 }}
                            className="w-full max-w-[280px] mb-8"
                        >
                            <Logo variant="green" className="w-full h-auto drop-shadow-sm" />
                        </motion.div>
                        <p className="text-[#86868B] text-sm text-center font-medium uppercase tracking-widest">
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
                                    className="pl-11 bg-[#F5F5F7]/50 border-transparent focus:bg-white focus:border-[#0071E3] h-12 rounded-xl transition-all"
                                />
                                <Mail className="absolute left-4 top-[38px] h-4 w-4 text-[#86868B] group-focus-within:text-[#0071E3] transition-colors" />
                            </div>

                            <div className="relative group">
                                <Input
                                    label="Contraseña"
                                    placeholder="••••••••"
                                    type="password"
                                    error={errors.password?.message}
                                    {...register('password')}
                                    className="pl-11 bg-[#F5F5F7]/50 border-transparent focus:bg-white focus:border-[#0071E3] h-12 rounded-xl transition-all"
                                />
                                <Lock className="absolute left-4 top-[38px] h-4 w-4 text-[#86868B] group-focus-within:text-[#0071E3] transition-colors" />
                            </div>
                        </div>

                        <div className="pt-2">
                            <Button
                                type="submit"
                                className="w-full h-12 text-base font-semibold bg-[#0071E3] text-white hover:bg-[#0077ED] rounded-xl shadow-md transition-all active:scale-[0.98]"
                                isLoading={isLoading}
                                rightIcon={<LogIn className="h-4 w-4" />}
                            >
                                Iniciar Sesión
                            </Button>
                        </div>
                    </form>

                    <div className="mt-10 pt-8 border-t border-gray-100/50 text-center">
                        <div className="flex items-center justify-center gap-2 mb-2">
                            <Fingerprint className="h-4 w-4 text-[#86868B]" />
                            <p className="text-[10px] text-[#A1A1A6] font-bold tracking-widest uppercase">
                                Acceso Seguro Verificado
                            </p>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default LoginPage;
