import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '../../../utils/cn';

interface Props {
    totalDocs: number;
    expiredDocs: number;
    missingDocs: number;
    onClick: () => void;
}

const ComplianceDonut: React.FC<Props> = ({ totalDocs, expiredDocs, missingDocs, onClick }) => {
    const validDocs = Math.max(totalDocs - expiredDocs, 0);
    const totalRepresented = totalDocs + missingDocs;
    const compliancePercent = totalRepresented > 0
        ? Math.round((validDocs / totalRepresented) * 100)
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
                                { name: 'Vencidos', value: expiredDocs },
                                { name: 'Faltantes', value: missingDocs }
                            ]}
                            innerRadius={58}
                            outerRadius={68}
                            paddingAngle={8}
                            dataKey="value"
                            stroke="none"
                        >
                            <Cell fill="#34C759" /> {/* Válidos */}
                            <Cell fill="#FF3B30" /> {/* Vencidos */}
                            <Cell fill="#FF9F0A" /> {/* Faltantes */}
                        </Pie>
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(210, 210, 215, 0.5)',
                                borderRadius: '12px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                                fontSize: '12px'
                            }}
                        />
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold text-[#1D1D1F] group-hover:text-[#029E4D] transition-colors">
                        {compliancePercent}%
                    </span>
                    <span className="text-[8px] text-[#A1A1A6] uppercase font-semibold">Total</span>
                </div>
            </div>
            <p className="text-[10px] text-[#6E6E73] mt-5 leading-relaxed">
                Tu bóveda está <span className={cn("font-bold", compliancePercent >= 80 ? "text-[#34C759]" : "text-[#FF3B30]")}>
                    {compliancePercent >= 90 ? 'operativa' : compliancePercent >= 70 ? 'en revisión' : 'crítica'}
                </span>.
                {expiredDocs > 0 && ` ${expiredDocs} vencidos.`}
                {missingDocs > 0 && ` ${missingDocs} faltantes.`}
            </p>
        </div>
    );
};

export default ComplianceDonut;
