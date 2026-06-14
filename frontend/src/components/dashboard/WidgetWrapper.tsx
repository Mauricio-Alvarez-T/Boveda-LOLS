import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '../../utils/cn';
import type { WidgetConfig } from '../../config/WidgetRegistry';

interface Props {
    widget: WidgetConfig;
    children: React.ReactNode;
    tint?: string;
}

const WidgetWrapper: React.FC<Props> = ({ widget, children, tint }) => {
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
                "rounded-card border border-border p-5 relative group transition-shadow",
                tint || "bg-card",
                isDragging && "shadow-xl ring-2 ring-brand-primary/20 z-50 opacity-90",
                !isDragging && "hover:shadow-md hover:border-[var(--border-hover)]"
            )}
        >
            {/* Drag Handle */}
            <div
                {...attributes}
                {...listeners}
                className="absolute top-3 right-3 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing hover:bg-background"
                title="Arrastrar para reordenar"
            >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
            {children}
        </div>
    );
};

export default WidgetWrapper;
