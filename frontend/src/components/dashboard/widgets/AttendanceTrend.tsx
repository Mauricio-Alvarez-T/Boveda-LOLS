import React from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { Activity, CheckSquare } from 'lucide-react';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';

interface Props {
    data: { fecha: string; tasa: number }[];
    onNavigate: () => void;
}

const AttendanceTrend: React.FC<Props> = ({ data, onNavigate }) => {
    if (data.length === 0) {
        return (
            <div className="h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">Tendencia de Asistencia</h3>
                        <p className="text-xs text-muted-foreground">Últimos 7 días activos.</p>
                    </div>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                        <Activity className="h-5 w-5 text-muted-foreground" />
                    </span>
                </div>
                <EmptyState
                    className="flex-1 py-8"
                    icon={CheckSquare}
                    title="No hay registros de asistencia recientes."
                    action={
                        <Button variant="ghost" size="sm" onClick={onNavigate}>
                            Ir a Asistencia
                        </Button>
                    }
                />
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-sm font-semibold text-foreground">Tendencia de Asistencia</h3>
                    <p className="text-xs text-muted-foreground">Últimos 7 días activos.</p>
                </div>
                <Activity className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    {/* Colores vía CSS vars (tokens) → el gráfico respeta claro/oscuro.
                        La línea/área verde es color-con-significado (data-viz de la marca). */}
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorTasa" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--brand-accent)" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="var(--brand-accent)" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                        <XAxis
                            dataKey="fecha"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'var(--muted-foreground)', fontSize: 10, fontWeight: 500 }}
                            tickFormatter={(v: string) => v.slice(8, 10) + '/' + v.slice(5, 7)}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} domain={[0, 100]} />
                        <ReferenceLine
                            y={80}
                            stroke="var(--muted-foreground)"
                            strokeDasharray="6 4"
                            strokeWidth={1.5}
                            strokeOpacity={0.6}
                            label={{
                                value: 'Meta 80%',
                                position: 'right',
                                fill: 'var(--muted-foreground)',
                                fontSize: 9,
                                fontWeight: 600,
                            }}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'var(--card)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid var(--border)',
                                borderRadius: '14px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                fontSize: '12px'
                            }}
                            itemStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
                            labelStyle={{ color: 'var(--muted-foreground)', marginBottom: '4px' }}
                            formatter={(value: any) => [`${value}%`, 'Presencia']}
                            labelFormatter={(label: any) => {
                                if (!label) return '';
                                const date = new Date(label);
                                return date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="tasa"
                            stroke="var(--brand-accent)"
                            strokeWidth={4}
                            fillOpacity={1}
                            fill="url(#colorTasa)"
                            dot={{ r: 4, fill: 'var(--card)', stroke: 'var(--brand-accent)', strokeWidth: 2 }}
                            activeDot={{ r: 6, fill: 'var(--brand-accent)', stroke: 'var(--card)', strokeWidth: 2 }}
                            animationDuration={1500}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default AttendanceTrend;
