import React from 'react';
import { motion } from 'framer-motion';

const bgWords = [
    "ESFUERZO", "CREATIVIDAD", "RESPONSABILIDAD",
    "SEGURIDAD", "CALIDAD", "LOLS", "INGENIERÍA", "COMPROMISO"
];

const generateTextLayer = (reverse: boolean, duration: number, delay: number, opacity: number, yOffset: string) => {
    return (
        <div className="flex whitespace-nowrap overflow-hidden absolute w-[200vw]" style={{ top: yOffset, opacity }}>
            <motion.div
                className="flex space-x-12 px-6"
                animate={{ x: reverse ? ['0%', '-50%'] : ['-50%', '0%'] }}
                transition={{ duration, ease: "linear", repeat: Infinity, delay }}
            >
                {/* Repeat words twice to create seamless loop */}
                {[...bgWords, ...bgWords].map((word, i) => (
                    <span
                        key={i}
                        className="text-[120px] font-black tracking-tighter text-[#1D1D1F]/5 font-['DM_Sans'] select-none pointer-events-none"
                        style={{ WebkitTextStroke: '2px rgba(29, 29, 31, 0.05)' }}
                    >
                        {word}
                    </span>
                ))}
            </motion.div>
        </div>
    );
};

export const AnimatedBackgroundText: React.FC = () => {
    return (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex flex-col justify-center transform -rotate-12 scale-125 origin-center">
            <div className="relative w-full h-[150vh] -mt-[25vh]">
                {generateTextLayer(false, 110, 0, 0.7, '5%')}
                {generateTextLayer(true, 130, -20, 0.4, '25%')}
                {generateTextLayer(false, 150, -10, 0.9, '45%')}
                {generateTextLayer(true, 120, -40, 0.5, '65%')}
                {generateTextLayer(false, 140, -5, 0.8, '85%')}
            </div>
        </div>
    );
};
