import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

/**
 * Comprime cada .js/.css/.svg de `dist/assets` a .br y .gz al terminar el build (2026-10-21, celular lento).
 * El Apache del hosting no comprime nada (servía 650 KB de JS tal cual); `public/assets/.htaccess` entrega el
 * .br o el .gz a quien lo acepta. Hacerlo acá, una vez, sale gratis: el servidor no gasta CPU por pedido.
 */
function precomprimir(): Plugin {
  let outDir = 'dist'
  return {
    name: 'precomprimir-assets',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir },
    closeBundle() {
      const dir = join(outDir, 'assets')
      for (const nombre of readdirSync(dir)) {
        if (!/\.(js|css|svg)$/.test(nombre)) continue
        const ruta = join(dir, nombre)
        if (statSync(ruta).size < 1024) continue
        const datos = readFileSync(ruta)
        writeFileSync(`${ruta}.br`, brotliCompressSync(datos, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }))
        writeFileSync(`${ruta}.gz`, gzipSync(datos, { level: 9 }))
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    precomprimir(),
  ],
  build: {
    rollupOptions: {
      output: {
        // Librerías en sus propios archivos (2026-10-21): cambian casi nunca, así que su nombre (hash) se
        // mantiene entre deploys y el teléfono las sigue usando desde su caché; solo baja de nuevo el código
        // propio que sí cambió. Antes todo iba en un único index.js de 650 KB que se renovaba en cada deploy.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-dom/client', 'react-router-dom'],
          'vendor-movimiento': ['framer-motion'],
          'vendor-base': ['axios', 'sonner', 'tailwind-merge', 'clsx'],
        },
      },
    },
  },
})
