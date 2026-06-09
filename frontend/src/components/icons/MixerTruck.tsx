import React from 'react';

/**
 * Ícono de camión mezclador / mixer (lo que en Chile se llama "bomba" o camión
 * de hormigón). Estilo lucide (24x24, trazo currentColor) para combinar con el
 * resto de los íconos. Reemplaza la antigua gota de agua.
 */
export const MixerTruck: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        {/* Ruedas */}
        <circle cx="6" cy="18.5" r="1.8" />
        <circle cx="17" cy="18.5" r="1.8" />
        {/* Chasis entre ejes y trasero */}
        <path d="M8 18.5h7.3" />
        <path d="M19 18.5h1.4a1 1 0 0 0 1-1v-2" />
        {/* Cabina + capó */}
        <path d="M2 18.5V11a1 1 0 0 1 1-1h3.4l2.1 3" />
        {/* Tambor mezclador (inclinado) */}
        <ellipse cx="14" cy="9" rx="5.2" ry="3.2" transform="rotate(-18 14 9)" />
    </svg>
);

export default MixerTruck;
