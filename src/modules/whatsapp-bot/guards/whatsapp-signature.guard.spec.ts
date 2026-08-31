import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { WhatsappSignatureGuard } from './whatsapp-signature.guard';
import * as crypto from 'crypto';

describe('WhatsappSignatureGuard', () => {
  let guard: WhatsappSignatureGuard;
  const originalEnv = process.env;

  beforeEach(() => {
    guard = new WhatsappSignatureGuard();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const mockExecutionContext = (headers: Record<string, string>, rawBody?: Buffer): ExecutionContext => {
    const req = {
      headers,
      rawBody,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
  };

  it('harus lolos jika WA_APP_SECRET tidak diset', () => {
    delete process.env.WA_APP_SECRET;
    const context = mockExecutionContext({});
    expect(guard.canActivate(context)).toBe(true);
  });

  it('harus lempar UnauthorizedException jika header signature tidak ada', () => {
    process.env.WA_APP_SECRET = 'secret_key';
    const context = mockExecutionContext({});
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('harus lempar UnauthorizedException jika format signature header tidak valid', () => {
    process.env.WA_APP_SECRET = 'secret_key';
    const context = mockExecutionContext({ 'x-hub-signature-256': 'invalidformat' });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('harus lempar UnauthorizedException jika rawBody tidak ada', () => {
    process.env.WA_APP_SECRET = 'secret_key';
    const context = mockExecutionContext({ 'x-hub-signature-256': 'sha256=12345' });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('harus lolos jika signature valid', () => {
    const secret = 'secret_key';
    process.env.WA_APP_SECRET = secret;
    
    const payload = Buffer.from(JSON.stringify({ object: 'whatsapp' }));
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const context = mockExecutionContext(
      { 'x-hub-signature-256': `sha256=${computedSignature}` },
      payload
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('harus lempar UnauthorizedException jika signature tidak valid', () => {
    const secret = 'secret_key';
    process.env.WA_APP_SECRET = secret;
    
    const payload = Buffer.from(JSON.stringify({ object: 'whatsapp' }));
    const context = mockExecutionContext(
      { 'x-hub-signature-256': 'sha256=wrongsignaturehashwrongsignaturehashwrongsignaturehashwr' },
      payload
    );

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
