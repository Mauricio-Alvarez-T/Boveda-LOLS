import React from 'react';
import { motion } from 'framer-motion';

export const AnimatedBackgroundText: React.FC = () => {
    return (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            {/* Esfera 1 Cyan */}
            <motion.div
                animate={{
                    x: [0, 150, -100, 0],
                    y: [0, -100, 150, 0],
                    scale: [1, 1.15, 0.9, 1]
                }}
                transition={{ duration: 45, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-[-10%] left-[-10%] w-[70vw] h-[70vw] rounded-full blur-[60px]"
                style={{ backgroundColor: 'cyan', opacity: 0.3 }}
            />
            {/* Esfera 2 Magenta */}
            <motion.div
                animate={{
                    x: [0, -150, 100, 0],
                    y: [0, 150, -100, 0],
                    scale: [1, 0.85, 1.1, 1]
                }}
                transition={{ duration: 55, repeat: Infinity, ease: "easeInOut" }}
                className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] rounded-full blur-[60px]"
                style={{ backgroundColor: 'magenta', opacity: 0.3 }}
            />
            {/* Esfera 3 Yellow */}
            <motion.div
                animate={{
                    x: [-50, 50, -50],
                    y: [-50, 50, -50],
                    scale: [0.95, 1.05, 0.95]
                }}
                transition={{ duration: 65, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-[20%] left-[30%] w-[50vw] h-[50vw] rounded-full blur-[50px]"
                style={{ backgroundColor: 'yellow', opacity: 0.3 }}
            />
        </div>
    );
};
