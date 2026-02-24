import React from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
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
                        <h3 className="text-base font-semibold text-[#1D1D1F]">Tendencia de Asistencia</h3>
                        <p className="text-xs text-[#6E6E73]">Últimos 7 días activos.</p>
                    </div>
                    <Activity className="h-5 w-5 text-[#34C759]" />
                </div>
                <div className="flex-1 flex flex-col items-center justify-center text-[#6E6E73]">
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
                    <h3 className="text-base font-semibold text-[#1D1D1F]">Tendencia de Asistencia</h3>
                    <p className="text-xs text-[#6E6E73]">Últimos 7 días activos.</p>
                </div>
                <Activity className="h-5 w-5 text-[#34C759]" />
            </div>
            <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E8ED" />
                        <XAxis
                            dataKey="fecha"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#6E6E73', fontSize: 10 }}
                            tickFormatter={(v) => v.slice(8, 10) + '/' + v.slice(5, 7)}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6E6E73', fontSize: 10 }} domain={[0, 100]} />
                        <Tooltip
                            cursor={{ stroke: '#F5F5F7', strokeWidth: 2 }}
                            contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #D2D2D7', borderRadius: '12px', fontSize: '12px', color: '#1D1D1F' }}
                            formatter={(value) => [`${value}%`, 'Tasa de Asistencia']}
                            labelFormatter={(label) => `Fecha: ${label}`}
                        />
                        <Line
                            type="monotone"
                            dataKey="tasa"
                            stroke="#34C759"
                            strokeWidth={3}
                            dot={{ r: 4, fill: '#FFFFFF', stroke: '#34C759', strokeWidth: 2 }}
                            activeDot={{ r: 6, fill: '#34C759', stroke: '#FFFFFF', strokeWidth: 2 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default AttendanceTrend;
