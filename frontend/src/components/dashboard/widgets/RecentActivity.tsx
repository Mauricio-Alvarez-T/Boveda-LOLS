import React from 'react';
import { FileText, ArrowRight, Activity } from 'lucide-react';
import { Button } from '../../ui/Button';

interface RecentDoc {
    id: number;
    tipo_nombre: string;
    nombres: string;
    apellido_paterno: string;
    fecha_subida: string;
}

interface Props {
    data: RecentDoc[];
    onNavigate: () => void;
}

const RecentActivity: React.FC<Props> = ({ data, onNavigate }) => {
    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-[#1D1D1F] flex items-center gap-2">
                    <Activity className="h-4 w-4 text-[#0071E3]" />
                    Actividad Reciente
                </h3>
                <span className="text-xs text-[#A1A1A6] uppercase font-semibold tracking-wider">Últimos 5</span>
            </div>
            <div className="space-y-2.5">
                {data.length > 0 ? (
                    data.map((act) => (
                        <div
                            key={act.id}
                            className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#F5F5F7] transition-colors group cursor-pointer"
                            onClick={onNavigate}
                        >
                            <div className="h-8 w-8 rounded-lg bg-[#0071E3]/8 flex items-center justify-center text-[#0071E3] shrink-0">
                                <FileText className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-[#1D1D1F] truncate">{act.tipo_nombre}</p>
                                <p className="text-xs text-[#6E6E73] truncate">{act.nombres} {act.apellido_paterno}</p>
                            </div>
                            <div className="text-xs text-[#A1A1A6] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                {new Date(act.fecha_subida).toLocaleDateString()}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="py-6 text-center text-[#6E6E73]">
                        <FileText className="h-8 w-8 mx-auto opacity-20 mb-2" />
                        <p className="text-xs italic">No hay documentos subidos aún.</p>
                    </div>
                )}
            </div>
            <Button
                variant="ghost"
                className="w-full mt-4 text-[10px] h-8"
                rightIcon={<ArrowRight className="h-3 w-3" />}
                onClick={onNavigate}
            >
                Ver registros
            </Button>
        </div>
    );
};

export default RecentActivity;
