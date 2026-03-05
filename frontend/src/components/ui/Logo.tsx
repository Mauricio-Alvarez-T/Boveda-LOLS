import React from 'react';
import { cn } from '../../utils/cn';

interface LogoProps extends React.SVGProps<SVGSVGElement> {
    variant?: 'default' | 'white' | 'green';
    iconOnly?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className, variant = 'default', iconOnly = false, ...props }) => {
    // Color verde oficial de LOLS Extraído de la imagen
    const color = variant === 'white' ? 'white' : variant === 'green' ? '#029E4D' : 'currentColor';

    return (
        <svg
            viewBox={iconOnly ? "0 0 220 240" : "0 0 540 240"}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={cn("w-full h-auto", className)}
            {...props}
        >
            <g fill={color}>
                {/* Líneas exteriores superior e inferior */}
                <rect x="20" y="20" width={iconOnly ? "180" : "500"} height="12" />
                <rect x="20" y="208" width={iconOnly ? "180" : "500"} height="12" />

                {/* Rectángulo sólido izquierdo */}
                <rect x="20" y="48" width="75" height="144" />

                {/* 3 Rectángulos apilados en el centro */}
                <rect x="119" y="52" width="77" height="32" fill="transparent" stroke={color} strokeWidth="8" />
                <rect x="119" y="104" width="77" height="32" fill="transparent" stroke={color} strokeWidth="8" />
                {/* El último rectángulo abajo es sólido (relleno) según el logo original */}
                <rect x="115" y="152" width="85" height="40" />

                {!iconOnly && (
                    <>
                        {/* Texto LOLS */}
                        <text
                            x="220"
                            y="134"
                            fontFamily="'DM Sans', sans-serif"
                            fontWeight="700"
                            fontSize="115"
                            letterSpacing="-0.02em"
                        >
                            LOLS
                        </text>

                        {/* Línea divisora bajo LOLS */}
                        <rect x="220" y="148" width="300" height="6" />

                        {/* Texto INGENIERIA */}
                        <text
                            x="225"
                            y="192"
                            fontFamily="'DM Sans', sans-serif"
                            fontWeight="700"
                            fontSize="42"
                            letterSpacing="0.01em"
                        >
                            INGENIERIA
                        </text>
                    </>
                )}
            </g>
        </svg>
    );
};
