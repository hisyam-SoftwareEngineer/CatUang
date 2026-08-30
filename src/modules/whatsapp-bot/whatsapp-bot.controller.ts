import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { WhatsappBotService } from './whatsapp-bot.service';

@Controller('webhooks/whatsapp')
export class WhatsappBotController {
  constructor(private readonly whatsappBotService: WhatsappBotService) {}

  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    // Webhook verification from Meta
    const verifyToken = process.env.WA_VERIFY_TOKEN;
    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    return HttpStatus.FORBIDDEN;
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() body: any) {
    // TODO: Verify X-Hub-Signature-256 header in production
    
    // Check if it's a valid WhatsApp API webhook payload
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.value && change.value.messages) {
            for (const message of change.value.messages) {
              const fromPhone = message.from;
              const text = message.text?.body;
              
              if (text && fromPhone) {
                await this.whatsappBotService.handleIncomingMessage(fromPhone, text);
              }
            }
          }
        }
      }
    }
    // Meta requires a 200 OK response immediately
    return 'EVENT_RECEIVED';
  }
}
