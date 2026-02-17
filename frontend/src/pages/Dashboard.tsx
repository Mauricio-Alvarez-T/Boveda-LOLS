import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { LogOut, Users, FileText, CheckSquare, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

const Dashboard: React.FC = () => {
    const { user, logout } = useAuth();

    const stats = [
        { label: 'Trabajadores', value: '248', icon: Users, color: 'text-blue-500' },
        { label: 'Documentos', value: '1,240', icon: FileText, color: 'text-violet-500' },
        { label: 'Asistencia Hoy', value: '98%', icon: CheckSquare, color: 'text-emerald-500' },
        { label: 'Docs. Vencidos', value: '12', icon: FileText, color: 'text-rose-500' },
    ];

    return (
        <div className="min-h-screen bg-slate-950 text-white p-8">
            {/* Header */}
            <header className="flex justify-between items-center mb-12">
                <div>
                    <h1 className="text-3xl font-bold">¡Hola, {user?.nombre}!</h1>
                    <p className="text-muted-foreground">{user?.rol} • Obra Actual</p>
                </div>
                <div className="flex gap-4">
                    <Button variant="glass" size="icon">
                        <Settings className="h-5 w-5" />
                    </Button>
                    <Button variant="outline" onClick={logout} rightIcon={<LogOut className="h-5 w-5" />}>
                        Salir
                    </Button>
                </div>
            </header>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                {stats.map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="premium-card flex items-center gap-4"
                    >
                        <div className={cn("p-3 rounded-xl bg-white/5", stat.color)}>
                            <stat.icon className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">{stat.label}</p>
                            <p className="text-2xl font-bold">{stat.value}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Main Content Areas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 premium-card h-[400px] flex items-center justify-center border-dashed">
                    <p className="text-muted-foreground italic">Gráfico de actividad y cumplimiento (Próximamente)</p>
                </div>
                <div className="premium-card h-[400px] flex items-center justify-center border-dashed">
                    <p className="text-muted-foreground italic">Alertas y Notificaciones (Próximamente)</p>
                </div>
            </div>
        </div>
    );
};

// Simple utility here as well to avoid import issues for now
function cn(...inputs: any[]) {
    return inputs.filter(Boolean).join(' ');
}

export default Dashboard;
