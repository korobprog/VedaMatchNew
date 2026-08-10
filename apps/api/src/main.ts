import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

function corsOrigins() {
  const origins = (process.env.WEB_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV !== 'production') {
    origins.push('http://localhost:3000', 'http://127.0.0.1:3000');
  }

  return [...new Set(origins.length > 0 ? origins : ['http://localhost:3000'])];
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // За Traefik (единственный хоп на dokploy-network) req.ip иначе всегда
  // резолвится в адрес прокси — все клиенты делят один и тот же бакет
  // ThrottlerModule (100 запросов/мин), и любой всплеск трафика от одного
  // пользователя роняет лимит для всех остальных.
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.enableCors({
    origin: corsOrigins(),
    credentials: true,
  });
  await app.listen(process.env.API_PORT ?? 4000, '0.0.0.0');
}
void bootstrap();
