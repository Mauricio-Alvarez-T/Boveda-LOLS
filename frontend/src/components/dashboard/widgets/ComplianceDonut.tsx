import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '../../../utils/cn';

interface Props {
    totalDocs: number;
    expiredDocs: number;
    onClick: () => void;
}

const ComplianceDonut: React.FC<Props> = ({ totalDocs, expiredDocs, onClick }) => {
    const validDocs = Math.max(totalDocs - expiredDocs, 0);
    const compliancePercent = totalDocs > 0
        ? Math.round((validDocs / totalDocs) * 100)
        : 100;

    return (
        <div className="flex flex-col items-center justify-center text-center h-full">
            <h3 className="text-sm font-semibold text-[#1D1D1F] mb-5 w-full text-left">Nivel de Cumplimiento</h3>
            <div
                className="relative h-36 w-36 cursor-pointer group"
                onClick={onClick}
                title="Ver documentos"
            >
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={[
                                { name: 'Válidos', value: validDocs },
                                { name: 'Vencidos', value: expiredDocs }
                            ]}
                            innerRadius={55}
                            outerRadius={70}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            <Cell fill="#34C759" />
                            <Cell fill="#FF3B30" />
                        </Pie>
                        <Tooltip
                            contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #D2D2D7', borderRadius: '12px', fontSize: '12px', color: '#1D1D1F' }}
                        />
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold text-[#1D1D1F] group-hover:text-[#0071E3] transition-colors">
                        {compliancePercent}%
                    </span>
                    <span className="text-[8px] text-[#A1A1A6] uppercase font-semibold">Total</span>
                </div>
            </div>
            <p className="text-[10px] text-[#6E6E73] mt-5 leading-relaxed">
                Tu bóveda está <span className={cn("font-bold", compliancePercent >= 80 ? "text-[#34C759]" : "text-[#FF9F0A]")}>
                    {compliancePercent >= 80 ? 'operativa' : 'con alertas'}
                </span>.
                {expiredDocs > 0 && ` ${expiredDocs} documentos requieren atención.`}
            </p>
        </div>
    );
};

export default ComplianceDonut;
