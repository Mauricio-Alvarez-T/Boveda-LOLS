import React from 'react';
import { cn } from '../../utils/cn';

interface WorkerLinkProps {
    /** Worker ID — used to open the quick view panel */
    workerId: number;
    /** Display content (usually the worker's name) */
    children: React.ReactNode;
    /** Callback to open the quick view panel */
    onClick: (workerId: number) => void;
    /** Additional CSS classes */
    className?: string;
}

/**
 * WorkerLink — Wraps a worker's name (or any content) and makes it
 * interactive. Clicking/tapping opens the WorkerQuickView panel.
 *
 * Usage:
 *   <WorkerLink workerId={worker.id} onClick={setQuickViewId}>
 *       {worker.nombres} {worker.apellido_paterno}
 *   </WorkerLink>
 */
const WorkerLink: React.FC<WorkerLinkProps> = ({ workerId, children, onClick, className }) => {
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onClick(workerId);
            }}
            className={cn(
                "text-left font-semibold text-[#1D1D1F] hover:text-[#029E4D] transition-colors cursor-pointer underline decoration-transparent hover:decoration-[#029E4D]/40 underline-offset-2",
                className
            )}
        >
            {children}
        </button>
    );
};

export default WorkerLink;
