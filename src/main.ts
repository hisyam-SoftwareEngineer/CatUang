import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Set global prefix for API versioning
  app.setGlobalPrefix('api/v1');

  // Set global middleware: helmet
  app.use(helmet());

  // Setup cookie parser
  app.use(cookieParser());

  // Global ValidationPipe — whitelist: true menolak field tak terdaftar di DTO
  // Sesuai 03-backend-guide.md §4
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global Exception Filter — format error standar di seluruh API
  // Sesuai 03-backend-guide.md §3
  app.useGlobalFilters(new GlobalExceptionFilter());

  // CORS Configuration
  app.enableCors({
    origin: process.env.ALLOWED_ORIGIN,
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
