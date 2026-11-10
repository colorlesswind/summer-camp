import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

/**
 * 单元测试运行器配置。
 *
 * - 只收 test/**\/*.test.ts，避免把 scripts/ 里的手工冒烟脚本当成测试
 * - 测试不连数据库：需要持久层的地方一律 vi.mock('@src/db/pool') 或对应的 repository
 * - 环境变量由 test/setup.ts 注入，本地有没有 .env 都能跑（tests 不能依赖开发机的 .env）
 */
export default defineConfig({
  resolve: {
    alias: {
      '@src': srcDir,
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    // 测试里大量使用 vi.mock，逐个文件隔离；并发跑文件更快
    isolate: true,
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
