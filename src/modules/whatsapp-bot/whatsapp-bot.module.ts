import { Module } from '@nestjs/common';
import { WhatsappBotController } from './whatsapp-bot.controller';
import { WhatsappBotService } from './whatsapp-bot.service';
import { NlpParserService } from './parsers/nlp-parser.service';
import { TransactionModule } from '../transaction/transaction.module';
import { AccountModule } from '../account/account.module';

@Module({
  imports: [TransactionModule, AccountModule],
  controllers: [WhatsappBotController],
  providers: [WhatsappBotService, NlpParserService],
  exports: [WhatsappBotService],
})
export class WhatsappBotModule {}

