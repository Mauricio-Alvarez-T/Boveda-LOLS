import React, { useEffect, useState } from 'react';
import { escribirMontoDecimal, textoMontoDecimal, valorMontoDecimal } from '../../utils/montoDecimal';

/**
 * Campo de monto en pesos que acepta decimales con coma o punto («1500,50» o
 * «1500.50» → «$1.500,50»). Input "pelado" (sin etiqueta): el estilo lo pone
 * quien lo usa. `CurrencyInput decimales` lo envuelve con etiqueta y error.
 *
 * `type="text"` + `inputMode="decimal"` (mismo criterio que `CantidadInput`):
 * con `type="number"`, Safari en iPhone con teclado en español entrega "" al
 * escribir «0,5». Lógica pura en `utils/montoDecimal.ts` (con test).
 */
type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
    value: number;
    onChange: (valor: number) => void;
};

export const MontoInput = React.forwardRef<HTMLInputElement, Props>(
    ({ value, onChange, placeholder = '$0', ...rest }, ref) => {
        const [texto, setTexto] = useState(() => textoMontoDecimal(value));

        // Si el valor cambia desde afuera (reset, deshacer), mostrarlo; si el
        // cambio vino de lo que se está escribiendo, no pisar «1.500,» a medias.
        useEffect(() => {
            if (valorMontoDecimal(texto) !== (Number(value) || 0)) setTexto(textoMontoDecimal(value));
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [value]);

        return (
            <input
                ref={ref}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={texto}
                placeholder={placeholder}
                onChange={e => {
                    const r = escribirMontoDecimal(texto, e.target.value);
                    setTexto(r.texto);
                    onChange(r.valor);
                }}
                {...rest}
            />
        );
    }
);

MontoInput.displayName = 'MontoInput';
