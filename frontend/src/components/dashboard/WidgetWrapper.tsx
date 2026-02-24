import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '../../utils/cn';
import type { WidgetConfig } from '../../config/WidgetRegistry';

interface Props {
    widget: WidgetConfig;
    children: React.ReactNode;
}

const WidgetWrapper: React.FC<Props> = ({ widget, children }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: widget.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "bg-white rounded-2xl border border-[#D2D2D7] p-5 relative group transition-shadow",
                isDragging && "shadow-xl ring-2 ring-[#0071E3]/20 z-50 opacity-90",
                !isDragging && "hover:shadow-md hover:border-[#B0B0B5]"
            )}
        >
            {/* Drag Handle */}
            <div
                {...attributes}
                {...listeners}
                className="absolute top-3 right-3 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing hover:bg-[#F5F5F7]"
                title="Arrastrar para reordenar"
            >
                <GripVertical className="h-4 w-4 text-[#A1A1A6]" />
            </div>
            {children}
        </div>
    );
};

export default WidgetWrapper;
