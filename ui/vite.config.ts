import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';

/**
 * 开发期把 /user、/form、/healthz 代理到 Express（默认 :3000），浏览器视角同源，
 * 避免跨域 Cookie / SameSite 带来的一堆问题；
 * 生产环境由 Nginx 做同样的反向代理。
 *
 * 注意：refresh Cookie 的 Path 是 /user/token，浏览器必须直接请求 /user/*，
 * 不能给 API 再套一层 /api 前缀，否则刷新时 Cookie 不会被携带。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3000';

  const apiProxy = {
    '/user': { target: proxyTarget, changeOrigin: true },
    '/form': { target: proxyTarget, changeOrigin: true },
    '/healthz': { target: proxyTarget, changeOrigin: true },
  };

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@resource': fileURLToPath(new URL('./resource', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: apiProxy,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('ant-design-vue') || id.includes('@ant-design') || id.includes('dayjs')) {
              return 'antd';
            }
            if (id.includes('vue') || id.includes('pinia')) return 'vue';
            return 'vendor';
          },
        },
      },
    },
    preview: {
      port: 4173,
      strictPort: true,
      proxy: apiProxy,
    },
  };
});
