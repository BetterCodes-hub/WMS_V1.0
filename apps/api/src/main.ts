import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  setupSwagger(app);
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true });
  app.enableShutdownHooks();

  // w obrazie produkcyjnym API serwuje również zbudowany frontend (SPA)
  const webDist = process.env.WEB_DIST ?? join(__dirname, '..', '..', 'web', 'dist');
  if (existsSync(webDist)) {
    app.useStaticAssets(webDist);
    app.use((req: { method: string; path: string }, res: { sendFile: (p: string) => void }, next: () => void) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) return res.sendFile(join(webDist, 'index.html'));
      next();
    });
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`WMS API: http://localhost:${port}/api  ·  Swagger: http://localhost:${port}/api/docs`, 'Bootstrap');
}
bootstrap();
