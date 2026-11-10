import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

/**
 * 单元测试配置（与 vite.config.ts 保持同一套 alias）。
 *
 * - 只收集 `test/**\/*.test.ts`，组件测试用 @vue/test-utils 在 jsdom 里挂载；
 * - `globals: false`：每个测试文件显式 import vitest API，避免隐式全局；
 * - `setup.ts` 只补 jsdom 缺失的浏览器 API（matchMedia / scrollTo）。
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@resource': fileURLToPath(new URL('./resource', import.meta.url)),
    },
  },
  test: {
    // 纯逻辑测试默认跑在 node 环境（快）；需要 DOM 的文件用
    // `// @vitest-environment jsdom` 文件头单独声明。
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
    setupFiles: ['test/setup.ts'],
    restoreMocks: true,
    // 计时器用假时钟，测试里不需要真实等待
    testTimeout: 10_000,
  },
});
