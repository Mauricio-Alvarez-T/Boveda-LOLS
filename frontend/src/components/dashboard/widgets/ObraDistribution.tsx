import React from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { Button } from '../../ui/Button';

interface Props {
    data: { nombre: string; count: number }[];
    onNavigate: () => void;
}

const ObraDistribution: React.FC<Props> = ({ data, onNavigate }) => {
    if (data.length === 0) {
        return (
            <div className="h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-base font-semibold text-[#1D1D1F]">Distribución por Obra</h3>
                        <p className="text-xs text-[#6E6E73]">Capacidad operativa.</p>
                    </div>
                    <TrendingUp className="h-5 w-5 text-[#0071E3]" />
                </div>
                <div className="flex-1 flex flex-col items-center justify-center text-[#6E6E73]">
                    <TrendingUp className="h-10 w-10 opacity-20 mb-4" />
                    <p className="text-sm">No hay obras activas con trabajadores.</p>
                    <Button variant="ghost" className="mt-3 text-xs" onClick={onNavigate}>
                        Ir a Trabajadores
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-base font-semibold text-[#1D1D1F]">Distribución por Obra</h3>
                    <p className="text-xs text-[#6E6E73]">Capacidad operativa.</p>
                </div>
                <TrendingUp className="h-5 w-5 text-[#0071E3]" />
            </div>
            <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E8ED" />
                        <XAxis dataKey="nombre" axisLine={false} tickLine={false} tick={{ fill: '#6E6E73', fontSize: 10 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6E6E73', fontSize: 10 }} />
                        <Tooltip
                            cursor={{ fill: '#F5F5F7' }}
                            contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #D2D2D7', borderRadius: '12px', fontSize: '12px', color: '#1D1D1F' }}
                        />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                            {data.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#0071E3' : '#5856D6'} fillOpacity={0.85} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default ObraDistribution;
