import type { AuthContext } from '../user/user.types';

declare global {
  namespace Express {
    interface Request {
      /** 由 authenticate 中间件注入；未登录时为 undefined */
      auth?: AuthContext;
    }
  }
}

export type { AuthContext };
export {};
