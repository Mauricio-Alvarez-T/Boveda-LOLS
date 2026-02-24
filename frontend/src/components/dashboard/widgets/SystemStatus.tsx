import React from 'react';
import { ShieldCheck, Database, HardDrive, Clock, Settings } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cn } from '../../../utils/cn';

interface Props {
    dbActive: boolean;
    lastCheck: string;
    onNavigate: () => void;
}

const SystemStatus: React.FC<Props> = ({ dbActive, lastCheck, onNavigate }) => {
    return (
        <div className="p-5 rounded-2xl bg-[#0071E3] text-white space-y-4 shadow-md relative overflow-hidden">
            <ShieldCheck className="h-10 w-10 opacity-10 absolute -right-1 -bottom-1 rotate-12" />
            <h4 className="text-base font-semibold relative z-10">Estado del Sistema</h4>
            <div className="space-y-2.5 relative z-10">
                <div className="flex justify-between items-center text-xs">
                    <span className="flex items-center gap-1.5"><Database className="h-3 w-3" /> Base de Datos</span>
                    <span className={cn(
                        "px-2 py-0.5 rounded-full font-semibold text-[10px]",
                        dbActive ? "bg-white/20" : "bg-[#FF3B30]/60"
                    )}>
                        {dbActive ? 'Activa' : 'Error'}
                    </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                    <span className="flex items-center gap-1.5"><HardDrive className="h-3 w-3" /> API Backend</span>
                    <span className="px-2 py-0.5 rounded-full bg-white/20 font-semibold text-[10px]">
                        {dbActive ? 'Online' : 'Offline'}
                    </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                    <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Última Revisión</span>
                    <span className="px-2 py-0.5 rounded-full bg-white/20 font-semibold text-[10px]">
                        {lastCheck || '---'}
                    </span>
                </div>
            </div>
            <Button
                variant="ghost"
                className="w-full bg-white text-[#0071E3] hover:bg-[#F5F5F7] mt-2 font-semibold rounded-xl"
                onClick={onNavigate}
            >
                <Settings className="h-4 w-4 mr-2" />
                Configuración
            </Button>
        </div>
    );
};

export default SystemStatus;
