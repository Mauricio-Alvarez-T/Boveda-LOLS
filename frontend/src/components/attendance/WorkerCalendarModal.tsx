import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { CalendarRange } from 'lucide-react';
import WorkerCalendar from './WorkerCalendar';
import type { Trabajador, EstadoAsistencia } from '../../types/entities';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    worker: Trabajador | null;
    estados: EstadoAsistencia[];
    obraId?: number;
    onAssignPeriod?: () => void;
    onSelectRange?: (start: string, end: string) => void;
}

export const WorkerCalendarModal: React.FC<Props> = ({ 
    isOpen, 
    onClose, 
    worker, 
    estados, 
    obraId, 
    onAssignPeriod, 
    onSelectRange 
}) => {
    if (!worker) return null;

    const modalTitle = (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 w-full pr-8">
            <div className="flex flex-col min-w-0">
                <span className="text-[10px] uppercase font-black text-brand-dark/40 tracking-widest leading-none mb-1">Calendario de Asistencia</span>
                <div className="flex items-center gap-2">
                    <h3 className="text-sm md:text-base font-bold text-brand-dark truncate">
                        {worker.apellido_paterno} {worker.apellido_materno || ''} {worker.nombres}
                    </h3>
                    <span className="hidden md:inline px-1.5 py-0.5 rounded-md bg-brand-primary/10 text-brand-dark text-[10px] font-bold">
                        {worker.rut}
                    </span>
                </div>
            </div>
            {onAssignPeriod && (
                <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={onAssignPeriod} 
                    leftIcon={<CalendarRange className="h-4 w-4" />}
                    className="h-8 px-3 rounded-xl shadow-sm md:ml-auto"
                >
                    <span className="text-[11px] font-bold">Asignar Período</span>
                </Button>
            )}
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={modalTitle}
            size="dynamic"
        >
            <div className="flex flex-col">
                <WorkerCalendar 
                    worker={worker}
                    estados={estados}
                    obraId={obraId}
                    onSelectRange={onSelectRange}
                />
            </div>
        </Modal>
    );
};
