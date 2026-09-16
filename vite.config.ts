import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// На GitHub Pages сайт лежит не в корне домена, а в /<имя репозитория>/.
// Путь передаётся сборке через переменную BASE_PATH (см. .github/workflows).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
})
