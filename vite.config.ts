import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/3dGlider/' : '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@jscad')) return 'jscad'
          if (id.includes('three')) return 'three'
          if (id.includes('react') || id.includes('zustand')) return 'react'
          return 'vendor'
        },
      },
    },
  },
}))
