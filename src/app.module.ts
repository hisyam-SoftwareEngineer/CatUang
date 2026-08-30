import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { validate } from './config/env.validation';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './common/services/redis.module';
import { OcrProcessingModule } from './modules/ocr-processing/ocr-processing.module';
import { AuthModule } from './modules/auth/auth.module';
import { AccountModule } from './modules/account/account.module';
import { CategoryModule } from './modules/category/category.module';
import { TransactionModule } from './modules/transaction/transaction.module';
import { ExchangeRateModule } from './modules/exchange-rate/exchange-rate.module';
import { ReportModule } from './modules/report/report.module';
import { SettingsModule } from './modules/settings/settings.module';
import { WhatsappBotModule } from './modules/whatsapp-bot/whatsapp-bot.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate,
      isGlobal: true,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        const isTls = redisUrl?.startsWith('rediss://');
        return {
          connection: {
            url: redisUrl,
            maxRetriesPerRequest: null,
            tls: isTls ? { rejectUnauthorized: false } : undefined,
          },
        };
      },
      inject: [ConfigService],
    }),
    PrismaModule,
    RedisModule,
    OcrProcessingModule,
    AuthModule,
    AccountModule,
    CategoryModule,
    TransactionModule,
    ExchangeRateModule,
    ReportModule,
    SettingsModule,
    WhatsappBotModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
