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
import { AuthResponse } from '../types';

const loginSchema = z.object({
    email: z.string().email({ message: "Email inválido" }),
    password: z.string().min(6, { message: "La contraseña debe tener al menos 6 caracteres" }),
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
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#0f172a] overflow-hidden relative">
            {/* Background Abstract Shapes */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-600/20 blur-[120px] rounded-full" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-fuchsia-600/20 blur-[120px] rounded-full" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md"
            >
                <div className="premium-card space-y-8">
                    <div className="flex flex-col items-center space-y-2">
                        <div className="h-16 w-16 premium-gradient rounded-2xl flex items-center justify-center shadow-2xl">
                            <ShieldCheck className="h-10 w-10 text-white" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight text-white mt-4">Bóveda LOLS</h1>
                        <p className="text-muted-foreground text-center">
                            Gestión Documental y Control de Asistencia
                        </p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        <div className="space-y-4">
                            <div className="relative">
                                <Input
                                    label="Correo Electrónico"
                                    placeholder="ejemplo@empresa.cl"
                                    type="email"
                                    error={errors.email?.message}
                                    {...register('email')}
                                    className="pl-11"
                                />
                                <Mail className="absolute left-4 top-[38px] h-5 w-5 text-muted-foreground" />
                            </div>

                            <div className="relative">
                                <Input
                                    label="Contraseña"
                                    placeholder="••••••••"
                                    type="password"
                                    error={errors.password?.message}
                                    {...register('password')}
                                    className="pl-11"
                                />
                                <Lock className="absolute left-4 top-[38px] h-5 w-5 text-muted-foreground" />
                            </div>
                        </div>

                        <Button
                            type="submit"
                            className="w-full"
                            isLoading={isLoading}
                            rightIcon={<LogIn className="h-5 w-5" />}
                        >
                            Iniciar Sesión
                        </Button>
                    </form>

                    <div className="text-center">
                        <p className="text-xs text-muted-foreground">
                            Sistema de Prevención de Riesgos y Documentación Laboral
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default LoginPage;
