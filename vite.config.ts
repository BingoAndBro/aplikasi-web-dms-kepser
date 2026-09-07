import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

const config = defineConfig({
  server: {
    host: true,
    port: 3000,
    allowedHosts: true,
    cors: true,
  },
  esbuild: {
    jsxDev: false,
  },
  plugins: [
    basicSsl(),
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//, /^pg-native$/] } }),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
