/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Same-origin API in development: the browser talks to localhost:5173 only,
    // so the HttpOnly SameSite=Lax session cookie flows correctly. (Hosted
    // deployments use a reverse proxy for the same same-origin layout.)
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
})
