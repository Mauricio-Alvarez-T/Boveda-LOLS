import React from 'react';
import { motion } from 'framer-motion';

export const AnimatedBackgroundText: React.FC = () => {
    return (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            {/* Esfera 1 al 100% */}
            <motion.div
                animate={{
                    x: [0, 150, -100, 0],
                    y: [0, -100, 150, 0],
                    scale: [1, 1.15, 0.9, 1]
                }}
                transition={{ duration: 45, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-[-10%] left-[-10%] w-[70vw] h-[70vw] rounded-full blur-[60px]"
                style={{ backgroundColor: '#029E4D', opacity: 1 }}
            />
            {/* Esfera 2 al 100% */}
            <motion.div
                animate={{
                    x: [0, -150, 100, 0],
                    y: [0, 150, -100, 0],
                    scale: [1, 0.85, 1.1, 1]
                }}
                transition={{ duration: 55, repeat: Infinity, ease: "easeInOut" }}
                className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] rounded-full blur-[60px]"
                style={{ backgroundColor: '#0071E3', opacity: 1 }}
            />
            {/* Esfera 3 al 100% */}
            <motion.div
                animate={{
                    x: [-50, 50, -50],
                    y: [-50, 50, -50],
                    scale: [0.95, 1.05, 0.95]
                }}
                transition={{ duration: 65, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-[20%] left-[30%] w-[50vw] h-[50vw] rounded-full blur-[50px]"
                style={{ backgroundColor: '#94a3b8', opacity: 1 }}
            />
        </div>
    );
};
