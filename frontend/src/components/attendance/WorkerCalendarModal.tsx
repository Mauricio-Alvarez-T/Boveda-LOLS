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

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Calendario Mensual"
            size="dynamic"
        >
            <div className="flex flex-col">
                <div className="mb-6 bg-brand-primary/5 p-4 rounded-2xl flex items-center justify-between border border-brand-primary/10">
                    <div>
                        <h4 className="text-sm font-bold text-brand-dark">
                            {worker.apellido_paterno} {worker.apellido_materno || ''} {worker.nombres}
                        </h4>
                        <p className="text-xs text-muted-foreground font-medium">{worker.rut}</p>
                    </div>
                    {onAssignPeriod && (
                        <Button 
                            variant="primary" 
                            size="sm" 
                            onClick={onAssignPeriod} 
                            leftIcon={<CalendarRange className="h-4 w-4" />}
                            className="shadow-sm"
                        >
                            Asignar Período
                        </Button>
                    )}
                </div>

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
