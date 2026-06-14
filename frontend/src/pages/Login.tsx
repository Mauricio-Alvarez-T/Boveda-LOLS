import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, useReducedMotion } from 'framer-motion';
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
    const reduceMotion = useReducedMotion();
    const year = new Date().getFullYear();

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

    const reveal = reduceMotion
        ? {}
        : {
            initial: { opacity: 0, y: 12 },
            animate: { opacity: 1, y: 0 },
            transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const },
        };

    return (
        <div className="min-h-[100dvh] w-full bg-background lg:grid lg:grid-cols-[44%_56%]">

            {/* ── Panel de marca (hero) — solo desktop ───────────────────── */}
            {/* Superficie deliberadamente oscura con un sutil resplandor verde de marca:
                neutro dominante + un toque del verde LOLS, estilo hero de apple.com. */}
            <aside
                className="relative hidden flex-col justify-between overflow-hidden p-14 text-white lg:flex"
                style={{ background: 'radial-gradient(125% 125% at 0% 0%, #0d2c1c 0%, #0a0a0b 58%)' }}
            >
                <Logo variant="white" className="w-[176px] h-auto" />

                <div className="max-w-md">
                    <p className="text-display font-semibold leading-[1.05] tracking-display">
                        Toda tu obra,<br />en orden.
                    </p>
                    <p className="mt-6 text-body-lg text-white/55">
                        Documentación, asistencia e inventario en un solo lugar. Simple, claro y seguro.
                    </p>
                </div>

                <p className="text-ui text-white/40">LOLS Ingeniería © {year}</p>
            </aside>

            {/* ── Panel de formulario ────────────────────────────────────── */}
            <main className="flex items-center justify-center px-6 py-12 sm:px-12">
                <motion.div {...reveal} className="w-full max-w-[400px]">

                    {/* Logo compacto solo en móvil (el hero no se muestra) */}
                    <div className="mb-12 flex justify-center lg:hidden">
                        <Logo variant="green" className="w-[176px] h-auto" />
                    </div>

                    <h1 className="text-headline font-semibold tracking-headline text-foreground">
                        Inicia sesión
                    </h1>
                    <p className="mt-2 text-body text-muted-foreground">
                        Accede a tu cuenta de Bóveda LOLS.
                    </p>

                    <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
                        <Input
                            label="Correo corporativo"
                            placeholder="nombre@lols.cl"
                            type="email"
                            autoComplete="email"
                            error={errors.email?.message}
                            {...register('email')}
                            className="h-12"
                        />
                        <Input
                            label="Contraseña"
                            placeholder="••••••••"
                            type="password"
                            autoComplete="current-password"
                            error={errors.password?.message}
                            {...register('password')}
                            className="h-12"
                        />
                        <Button
                            type="submit"
                            variant="primary"
                            size="lg"
                            className="w-full"
                            isLoading={isLoading}
                        >
                            Iniciar sesión
                        </Button>
                    </form>

                    <p className="mt-12 text-center text-sm text-muted-foreground lg:hidden">
                        LOLS Ingeniería © {year}
                    </p>
                </motion.div>
            </main>
        </div>
    );
};

export default LoginPage;
