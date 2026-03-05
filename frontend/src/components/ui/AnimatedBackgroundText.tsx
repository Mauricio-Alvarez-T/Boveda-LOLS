import React from 'react';
import { motion } from 'framer-motion';

// Array de objetos para mezclar fuentes, estilos y tamaños corporativos
const bgWords = [
    { text: "ESFUERZO", font: "font-['Inter']", weight: "font-light", size: "text-[60px]" },
    { text: "CREATIVIDAD", font: "font-['Optima']", weight: "font-normal", size: "text-[45px]" },
    { text: "RESPONSABILIDAD", font: "font-['Helvetica']", weight: "font-semibold", size: "text-[40px]" },
    { text: "SEGURIDAD", font: "font-serif", weight: "font-medium", size: "text-[55px]" },
    { text: "CALIDAD", font: "font-['Helvetica']", weight: "font-light", size: "text-[50px]" },
    { text: "LOLS", font: "font-['DM_Sans']", weight: "font-black", size: "text-[70px]" },
    { text: "INGENIERÍA", font: "font-['Optima']", weight: "font-medium", size: "text-[50px]" },
    { text: "COMPROMISO", font: "font-serif", weight: "font-normal", size: "text-[65px]" }
];

const generateTextLayer = (reverse: boolean, duration: number, delay: number, opacity: number, yOffset: string) => {
    return (
        <div className="flex whitespace-nowrap overflow-hidden absolute w-[200vw]" style={{ top: yOffset, opacity }}>
            <motion.div
                className="flex items-center space-x-12 px-6"
                animate={{ x: reverse ? ['0%', '-50%'] : ['-50%', '0%'] }}
                transition={{ duration, ease: "linear", repeat: Infinity, delay }}
            >
                {/* Repeat words twice to create seamless loop */}
                {[...bgWords, ...bgWords].map((item, i) => (
                    <span
                        key={i}
                        className={`${item.size} ${item.weight} ${item.font} tracking-wide text-[#1D1D1F]/5 select-none pointer-events-none`}
                        style={{ WebkitTextStroke: '1px rgba(29, 29, 31, 0.08)' }}
                    >
                        {item.text}
                    </span>
                ))}
            </motion.div>
        </div>
    );
};

export const AnimatedBackgroundText: React.FC = () => {
    return (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex flex-col justify-center transform -rotate-[8deg] scale-125 origin-center">
            <div className="relative w-full h-[150vh] -mt-[25vh]">
                {generateTextLayer(false, 110, 0, 0.6, '15%')}
                {generateTextLayer(true, 130, -20, 0.4, '35%')}
                {generateTextLayer(false, 150, -10, 0.5, '55%')}
                {generateTextLayer(true, 120, -40, 0.4, '75%')}
            </div>
        </div>
    );
};
