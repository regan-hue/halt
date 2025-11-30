import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    port: 3002,
    open: true,
    // ⭐ 关键：添加响应头以启用 SharedArrayBuffer
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    // 配置代理解决 CORS 问题
    proxy: {
      '/dicom-web': {
        target: 'http://192.168.1.3:18997',
        changeOrigin: true,
        secure: false,
        ws: false,
        configure: (proxy, _options) => {
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            // 确保代理响应也包含必要的头
            proxyRes.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
            proxyRes.headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
          })
        },
      },
      // ⭐ 添加 Orthanc 原生 API 代理
      '/tools': {
        target: 'http://192.168.1.3:18997',
        changeOrigin: true,
        secure: false,
        ws: false,
        configure: (proxy, _options) => {
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            proxyRes.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
            proxyRes.headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
          })
        },
      },
      '/instances': {
        target: 'http://192.168.1.3:18997',
        changeOrigin: true,
        secure: false,
        ws: false,
        configure: (proxy, _options) => {
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            proxyRes.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
            proxyRes.headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
          })
        },
      },
      '/series': {
        target: 'http://192.168.1.3:18997',
        changeOrigin: true,
        secure: false,
        ws: false,
        configure: (proxy, _options) => {
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            proxyRes.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
            proxyRes.headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
          })
        },
      },
      // ⭐ 添加 WADO-URI 代理（根据Orthanc DICOMweb文档）
      '/wado': {
        target: 'http://192.168.1.3:18997',
        changeOrigin: true,
        secure: false,
        ws: false,
        configure: (proxy, _options) => {
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            proxyRes.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
            proxyRes.headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
          })
        },
      }
    }
  }
})
