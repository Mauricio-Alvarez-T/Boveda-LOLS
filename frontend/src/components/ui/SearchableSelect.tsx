import React, { forwardRef, useId } from 'react';
import Select from 'react-select';
import { cn } from '../../utils/cn';

export interface SearchableSelectProps {
    label?: string;
    options: { value: string | number; label: string }[];
    error?: string;
    helperText?: string;
    value?: string | number | null;
    onChange?: (value: string | number | null) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

export const SearchableSelect = forwardRef<any, SearchableSelectProps>(
    ({ className, label, options, error, helperText, value, onChange, disabled, placeholder = "Buscar...", ...props }, ref) => {
        const id = useId();

        // react-select requiere que el valor sea el objeto completo { value, label }
        const selectedOption = options.find(opt => opt.value === value) || null;

        return (
            <div className="w-full space-y-1.5">
                {label && (
                    <label htmlFor={id} className="text-sm font-medium text-muted-foreground ml-0.5">
                        {label}
                    </label>
                )}
                <div className="relative group">
                    <Select
                        inputId={id}
                        ref={ref}
                        value={selectedOption}
                        onChange={(val: any) => {
                            onChange?.(val ? val.value : null);
                        }}
                        options={options}
                        placeholder={placeholder}
                        noOptionsMessage={() => "No se encontraron resultados"}
                        isDisabled={disabled}
                        classNamePrefix="react-select"
                        className={cn(className)}
                        theme={(theme) => ({
                            ...theme,
                            colors: {
                                ...theme.colors,
                                primary: '#029E4D',
                            },
                        })}
                        styles={{
                            control: (base, state) => ({
                                ...base,
                                minHeight: '44px',
                                borderRadius: '0.75rem',
                                borderColor: error
                                    ? '#FF3B30'
                                    : state.isFocused ? '#029E4D' : '#D2D2D7',
                                boxShadow: state.isFocused
                                    ? error ? '0 0 0 2px rgba(255, 59, 48, 0.3)' : '0 0 0 2px rgba(2, 158, 77, 0.2)'
                                    : 'none',
                                '&:hover': {
                                    borderColor: error ? '#FF3B30' : '#029E4D'
                                },
                                backgroundColor: state.isDisabled ? '#F5F5F7' : 'white',
                                opacity: state.isDisabled ? 0.5 : 1,
                            }),
                            menu: (base) => ({
                                ...base,
                                borderRadius: '0.75rem',
                                padding: '4px',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                                zIndex: 50,
                                border: '1px solid #E8E8ED',
                            }),
                            option: (base, state) => ({
                                ...base,
                                borderRadius: '0.5rem',
                                backgroundColor: state.isSelected
                                    ? '#029E4D'
                                    : state.isFocused ? '#029E4D15' : 'transparent',
                                color: state.isSelected ? 'white' : '#1D1D1F',
                                '&:active': {
                                    backgroundColor: '#029E4D30'
                                },
                                cursor: 'pointer',
                                padding: '8px 12px',
                                fontSize: '0.875rem' // text-sm
                            }),
                            singleValue: (base) => ({
                                ...base,
                                color: '#1D1D1F',
                            }),
                            input: (base) => ({
                                ...base,
                                color: '#1D1D1F',
                            }),
                            placeholder: (base) => ({
                                ...base,
                                color: '#A1A1A6',
                            }),
                            indicatorSeparator: () => ({
                                display: 'none'
                            })
                        }}
                    />
                </div>
                {error && (
                    <p className="text-xs text-destructive font-medium ml-0.5">
                        {error}
                    </p>
                )}
                {helperText && !error && (
                    <p className="text-xs text-muted-foreground ml-0.5">
                        {helperText}
                    </p>
                )}
            </div>
        );
    }
);

SearchableSelect.displayName = "SearchableSelect";
