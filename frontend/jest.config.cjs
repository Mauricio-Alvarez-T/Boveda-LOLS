/**
 * Config mínima de Jest para tests UNITARIOS de utils puras (sin DOM ni Vite).
 * El gate principal de tipos sigue siendo `npm run build` (tsc -b + vite build);
 * esto sólo cubre lógica pura como inferMovimiento (Fase 4).
 */
module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/*.test.ts'],
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            tsconfig: {
                module: 'commonjs',
                esModuleInterop: true,
                verbatimModuleSyntax: false,
                isolatedModules: false,
                skipLibCheck: true,
            },
        }],
    },
};
