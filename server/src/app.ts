import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config';
import { logger } from './common/logger';
import { createRouter } from './routes';
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { trustedOrigin } from './middleware/trusted-origin';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  // 线上一般跑在 Nginx / 云 LB 后面，需要它来还原真实 IP 与协议
  if (env.isProduction) {
    app.set('trust proxy', 1);
  }

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/healthz' },
    }),
  );

  app.use(
    helmet({
      // SPA 与 API 跨域部署时，图片等静态资源需要能被跨源引用
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      // 必须是具体来源（不能用 *），因为要带 credentials
      origin: (origin, callback) => {
        if (!origin || env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '32kb' }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  app.use(cookieParser());

  // 写操作统一做 Origin 校验（Cookie 方案下防 CSRF 的第一道防线）
  app.use(trustedOrigin);

  app.use(createRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
