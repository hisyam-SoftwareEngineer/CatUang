import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

@Injectable()
export class WhatsappSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WhatsappSignatureGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithRawBody>();
    
    const appSecret = process.env.WA_APP_SECRET;
    // Skip verification if app secret is not defined (for development convenience)
    if (!appSecret) {
      this.logger.warn('WA_APP_SECRET is not configured. Webhook signature verification is bypassed.');
      return true;
    }

    const signatureHeader = request.headers['x-hub-signature-256'] as string;
    if (!signatureHeader) {
      this.logger.warn('Webhook request rejected: Missing X-Hub-Signature-256 header');
      throw new UnauthorizedException('Missing X-Hub-Signature-256 header');
    }

    const signatureParts = signatureHeader.split('=');
    if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
      this.logger.warn('Webhook request rejected: Invalid signature header format');
      throw new UnauthorizedException('Invalid signature format');
    }

    const expectedSignature = signatureParts[1];
    
    if (!request.rawBody) {
      this.logger.error('Raw request body is missing. Ensure rawBody option is enabled in NestFactory.create()');
      throw new UnauthorizedException('Raw body missing');
    }

    const computedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(request.rawBody)
      .digest('hex');

    try {
      const signatureBuffer = Buffer.from(expectedSignature, 'hex');
      const computedBuffer = Buffer.from(computedSignature, 'hex');

      if (signatureBuffer.length !== computedBuffer.length) {
        this.logger.warn('Webhook request rejected: Signature mismatch (length)');
        throw new UnauthorizedException('Signature mismatch');
      }

      const isValid = crypto.timingSafeEqual(signatureBuffer, computedBuffer);
      if (!isValid) {
        this.logger.warn('Webhook request rejected: Signature verification failed');
        throw new UnauthorizedException('Signature mismatch');
      }

      return true;
    } catch (err) {
      throw new UnauthorizedException('Signature validation error');
    }
  }
}
