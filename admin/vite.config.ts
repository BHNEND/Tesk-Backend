import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // 匹配以 /admin/api 开头的请求，转发到后端
      '/admin/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        // 这里不需要 rewrite，因为后端本身就包含 /api 前缀
      },
      // 兼容可能存在的旧版公共接口调用
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
