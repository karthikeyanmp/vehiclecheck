import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind beyond localhost so a phone on the same network/hotspot can reach
    // this dev server at http://<laptop-lan-ip>:5173.
    host: true,
    // Vite normally rejects requests whose Host header isn't localhost/the
    // bound IP (DNS-rebinding protection). A tunnel (ngrok/localtunnel) puts
    // its own changing hostname in that header, so allow any host — fine for
    // a throwaway local dev/test session, not something to carry into prod.
    allowedHosts: true,
    // Proxy API calls to the backend instead of hardcoding its LAN IP in
    // VITE_API_BASE — the browser sees a same-origin request to whatever
    // host it loaded the page from, and Vite forwards it to the backend
    // running on this same machine. Also sidesteps CORS entirely in dev.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
})
