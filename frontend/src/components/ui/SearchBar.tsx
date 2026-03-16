import React from 'react';
import { Search } from 'lucide-react';
import { Input } from './Input';
import { cn } from '../../utils/cn';

export interface SearchBarProps {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    className?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({ value, onChange, placeholder = "Buscar...", className }) => {
    return (
        <div className={cn("relative flex-1", className)}>
            <Input
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="pl-10 h-[42px] bg-background border-border text-brand-dark focus:border-brand-primary"
            />
            <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
        </div>
    );
};
