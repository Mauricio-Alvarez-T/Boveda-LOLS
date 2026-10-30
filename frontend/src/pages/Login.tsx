import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { Eye, EyeOff, ExternalLink } from 'lucide-react';

import { FondoFaena } from '../components/auth/FondoFaena';
import { Button } from '../components/ui/Button';
import { CargaIsotipo } from '../components/ui/CargaIsotipo';
import { IconButton } from '../components/ui/IconButton';
import { Input } from '../components/ui/Input';
import { Logo } from '../components/ui/Logo';
import { useAuth } from '../context/AuthContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import api from '../services/api';
import { cn } from '../utils/cn';
import type { AuthResponse } from '../types';

const loginSchema = z.object({
    email: z.string().email({ message: "Email corporativo inválido" }),
    password: z.string().min(5, { message: "La contraseña es muy corta" }),
});

type LoginForm = z.infer<typeof loginSchema>;

/**
 * La página web de la empresa, abajo del inicio de sesión (Marcos 2026-10-28: «para que la vayan conociendo»). Hoy es la
 * antigua; cuando salga la nueva y se dé de baja esta, se cambian solo estas dos líneas.
 */
const PAGINA_WEB = 'https://lols.cl';
const PAGINA_WEB_TEXTO = 'lols.cl';

const EnlacePaginaWeb: React.FC<{ className: string }> = ({ className }) => (
    <a href={PAGINA_WEB} target="_blank" rel="noopener noreferrer"
        className={cn('inline-flex items-center gap-1 rounded underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2', className)}>
        Conoce nuestra página web: {PAGINA_WEB_TEXTO}
        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="sr-only">(se abre en otra pestaña)</span>
    </a>
);

/**
 * Con la faena a la vista, el isotipo de carga espera a que amanezca en la obra (0,8 s) y asome el sol antes
 * de tapar la pantalla (diseno.md §9.19). No agrega espera: si el servidor responde antes, se entra directo.
 */
const DEMORA_ISOTIPO_MS = 1200;

const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [verCarga, setVerCarga] = useState(false);
    const demoraCarga = useRef<number | undefined>(undefined);
    const formulario = useRef<HTMLFormElement>(null);
    /** El ojito: muestra la contraseña mientras se escribe (Marcos 2026-10-28). */
    const [verClave, setVerClave] = useState(false);
    const reduceMotion = useReducedMotion();
    /** El panel oscuro solo existe en escritorio: ahí (y sin «reducir movimiento») corre la faena. */
    const escritorio = useMediaQuery('(min-width: 1024px)');
    const conFaena = escritorio && !reduceMotion;
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
        if (conFaena) demoraCarga.current = window.setTimeout(() => setVerCarga(true), DEMORA_ISOTIPO_MS);
        else setVerCarga(true);
        try {
            const response = await api.post<AuthResponse>('/auth/login', data);
            login(response.data);
            toast.success('¡Bienvenido a Bóveda LOLS!');
            navigate('/');
        } catch (err) {
            const axiosError = err as { response?: { data?: { error?: string } } };
            toast.error(axiosError.response?.data?.error || 'Credenciales incorrectas');
        } finally {
            window.clearTimeout(demoraCarga.current);
            setIsLoading(false);
            setVerCarga(false);
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
                {/* Detrás del texto, la faena de madrugada (Marcos 2026-10-30, diseno.md §9.19) */}
                {escritorio && <FondoFaena formulario={formulario} entrando={isLoading} quieto={!!reduceMotion} />}

                <Logo variant="white" className="relative w-[176px] h-auto" />

                <div className="relative max-w-md">
                    <p className="text-display font-semibold leading-[1.05] tracking-display">
                        Toda tu obra,<br />en orden.
                    </p>
                    <p className="mt-6 text-body-lg text-white/55">
                        Documentación, asistencia e inventario en un solo lugar. Simple, claro y seguro.
                    </p>
                </div>

                <div className="relative flex flex-col items-start gap-1 text-ui text-white/40">
                    <p>LOLS Ingeniería © {year}</p>
                    <EnlacePaginaWeb className="text-white/70 hover:text-white focus-visible:ring-white/50" />
                </div>
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

                    <form ref={formulario} onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
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
                            type={verClave ? 'text' : 'password'}
                            autoComplete="current-password"
                            error={errors.password?.message}
                            {...register('password')}
                            className="h-12"
                            rightElement={
                                <IconButton
                                    size="lg"
                                    icon={verClave ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                    aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                    aria-pressed={verClave}
                                    title={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                    onClick={() => setVerClave(v => !v)}
                                />
                            }
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

                    <div className="mt-12 flex flex-col items-center text-center text-sm text-muted-foreground lg:hidden">
                        <p>LOLS Ingeniería © {year}</p>
                        <EnlacePaginaWeb className="min-h-11 font-medium text-green-700 focus-visible:ring-brand-primary/40 dark:text-green-300" />
                    </div>
                </motion.div>
            </main>

            {/* Mientras se verifica la cuenta, el isotipo ocupa la pantalla (diseno.md §9.18); al
                entrar lo releva el de la carga de la sesión, sin una pantalla en blanco entre medio.
                En escritorio aparece tras el amanecer de la faena (DEMORA_ISOTIPO_MS). */}
            {verCarga && (
                <CargaIsotipo
                    className="fixed inset-0 z-50"
                    mensajes={['Verificando tus datos…', 'Abriendo tu obra…']}
                />
            )}
        </div>
    );
};

export default LoginPage;
