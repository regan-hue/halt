import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

// https://vite.dev/config/
export default defineConfig({
  base: '/halt/',
  plugins: [
    vue(),
    vueDevTools(),
    wasm(),
    topLevelAwait(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  // 将 WASM 文件作为资源处理
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@icr/polyseg-wasm'],
    esbuildOptions: {
      target: 'esnext'
    }
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        // 处理 WASM 文件
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith('.wasm')) {
            return 'assets/[name]-[hash][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
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
        target: 'http://192.168.4.16:18997',
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
      // 添加 Orthanc 原生 API 代理
      '/tools': {
        target: 'http://192.168.4.16:18997',
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
        target: 'http://192.168.4.16:18997',
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
        target: 'http://192.168.4.16:18997',
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
    
      '/wado': {
        target: 'http://192.168.4.16:18997',
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
      // 添加 CAD API 代理，用于获取 STL 文件和测量数据
      // 匹配 /cad 路径，将请求代理到后端服务器
      '/cad': {
        target: 'http://192.168.4.16:29999',
        changeOrigin: true,
        secure: false,
        ws: false,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log(`[代理] CAD 请求: ${req.url} -> http://192.168.4.16:29999${proxyReq.path}`);
          });
          proxy.on('error', (err, req, res) => {
            console.error(`[代理] CAD 代理错误:`, err.message);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            proxyRes.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
            proxyRes.headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
          })
        },
      }
    }
  }
})
