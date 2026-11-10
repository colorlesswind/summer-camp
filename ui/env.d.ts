/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 基地址；必须与页面同源（refresh Cookie 的 Path 限定在 /user/token） */
  readonly VITE_API_BASE_URL: string;
  /** 仅开发期使用：Vite 代理目标 */
  readonly VITE_API_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
