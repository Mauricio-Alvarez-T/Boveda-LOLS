import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'framer-motion';
import { LogIn, ShieldCheck, Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import type { AuthResponse } from '../types';

const loginSchema = z.object({
    email: z.string().email({ message: "Email inválido" }),
    password: z.string().min(5, { message: "La contraseña debe tener al menos 5 caracteres" }),
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
            toast.success('¡Bienvenido de nuevo!');
            navigate('/');
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al iniciar sesión');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#F5F5F7]">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-sm"
            >
                <div className="bg-white rounded-2xl shadow-lg p-8 space-y-8">
                    <div className="flex flex-col items-center space-y-3">
                        <div className="h-14 w-14 bg-[#0071E3] rounded-2xl flex items-center justify-center shadow-sm">
                            <ShieldCheck className="h-8 w-8 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">Bóveda LOLS</h1>
                        <p className="text-[#6E6E73] text-sm text-center">
                            Gestión Documental y Control de Asistencia
                        </p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                        <div className="space-y-4">
                            <div className="relative">
                                <Input
                                    label="Correo Electrónico"
                                    placeholder="ejemplo@empresa.cl"
                                    type="email"
                                    error={errors.email?.message}
                                    {...register('email')}
                                    className="pl-10"
                                />
                                <Mail className="absolute left-3.5 top-[36px] h-4 w-4 text-[#A1A1A6]" />
                            </div>

                            <div className="relative">
                                <Input
                                    label="Contraseña"
                                    placeholder="••••••••"
                                    type="password"
                                    error={errors.password?.message}
                                    {...register('password')}
                                    className="pl-10"
                                />
                                <Lock className="absolute left-3.5 top-[36px] h-4 w-4 text-[#A1A1A6]" />
                            </div>
                        </div>

                        <Button
                            type="submit"
                            className="w-full"
                            isLoading={isLoading}
                            rightIcon={<LogIn className="h-4 w-4" />}
                        >
                            Iniciar Sesión
                        </Button>
                    </form>

                    <div className="text-center">
                        <p className="text-xs text-[#A1A1A6]">
                            Sistema de Prevención de Riesgos y Documentación Laboral
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default LoginPage;
