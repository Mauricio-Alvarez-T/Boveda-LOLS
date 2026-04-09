import React from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { Activity, CheckSquare } from 'lucide-react';
import { Button } from '../../ui/Button';

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
                        <h3 className="text-base font-semibold text-brand-dark">Tendencia de Asistencia</h3>
                        <p className="text-xs text-muted-foreground">Últimos 7 días activos.</p>
                    </div>
                    <Activity className="h-5 w-5 text-brand-accent" />
                </div>
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                    <CheckSquare className="h-10 w-10 opacity-20 mb-4" />
                    <p className="text-sm">No hay registros de asistencia recientes.</p>
                    <Button variant="ghost" className="mt-3 text-xs" onClick={onNavigate}>
                        Ir a Asistencia
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-base font-semibold text-brand-dark">Tendencia de Asistencia</h3>
                    <p className="text-xs text-muted-foreground">Últimos 7 días activos.</p>
                </div>
                <Activity className="h-5 w-5 text-brand-accent" />
            </div>
            <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorTasa" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#34C759" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#34C759" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E8ED" />
                        <XAxis
                            dataKey="fecha"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#86868B', fontSize: 10, fontWeight: 500 }}
                            tickFormatter={(v: string) => v.slice(8, 10) + '/' + v.slice(5, 7)}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#86868B', fontSize: 10 }} domain={[0, 100]} />
                        <ReferenceLine
                            y={80}
                            stroke="#FF9F0A"
                            strokeDasharray="6 4"
                            strokeWidth={1.5}
                            strokeOpacity={0.6}
                            label={{
                                value: 'Meta 80%',
                                position: 'right',
                                fill: '#FF9F0A',
                                fontSize: 9,
                                fontWeight: 600,
                            }}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(210, 210, 215, 0.5)',
                                borderRadius: '14px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                                fontSize: '12px'
                            }}
                            itemStyle={{ color: '#1D1D1F', fontWeight: 600 }}
                            labelStyle={{ color: '#86868B', marginBottom: '4px' }}
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
                            stroke="#34C759"
                            strokeWidth={4}
                            fillOpacity={1}
                            fill="url(#colorTasa)"
                            dot={{ r: 4, fill: '#FFFFFF', stroke: '#34C759', strokeWidth: 2 }}
                            activeDot={{ r: 6, fill: '#34C759', stroke: '#FFFFFF', strokeWidth: 2 }}
                            animationDuration={1500}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default AttendanceTrend;
