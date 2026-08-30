import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TransactionService } from '../transaction/transaction.service';
import { AccountService } from '../account/account.service';
import { NlpParserService, IntentType } from './parsers/nlp-parser.service';
import { ReplyTemplates } from './templates/reply-templates';
import { TransactionType, TransactionSourceType } from '@prisma/client';
import { CreateTransactionDto } from '../transaction/dto/create-transaction.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class WhatsappBotService {
  private readonly logger = new Logger(WhatsappBotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionService: TransactionService,
    private readonly accountService: AccountService,
    private readonly nlpParser: NlpParserService,
  ) {}

  // ─── Main Entry Point ────────────────────────────────────────────────────

  async handleIncomingMessage(fromPhone: string, text: string): Promise<void> {
    this.logger.log(`Received message from ${fromPhone}: "${text}"`);

    // 1. Cari user berdasarkan nomor WA yang sudah diverifikasi
    const user = await this.prisma.user.findFirst({
      where: { whatsappPhone: fromPhone, waVerified: true },
    });

    if (!user) {
      await this.sendReply(fromPhone, ReplyTemplates.unregistered());
      return;
    }

    // 2. Parse intent dari pesan
    const intent = this.nlpParser.parse(text);
    this.logger.log(`Intent parsed: ${JSON.stringify(intent)}`);

    // 3. Eksekusi intent
    switch (intent.type) {
      case IntentType.MASUK:
      case IntentType.KELUAR:
        await this.handleTransaction(fromPhone, user, intent);
        break;
      case IntentType.SALDO:
        await this.handleSaldo(fromPhone, user.businessId);
        break;
      case IntentType.LAPORAN:
        await this.handleLaporan(fromPhone, user.businessId, intent.period);
        break;
      case IntentType.BATAL:
        await this.handleBatal(fromPhone, user);
        break;
      case IntentType.BANTUAN:
        await this.sendReply(fromPhone, ReplyTemplates.help());
        break;
      default:
        await this.sendReply(fromPhone, ReplyTemplates.unrecognized());
    }
  }

  // ─── Intent Handlers ─────────────────────────────────────────────────────

  private async handleTransaction(
    fromPhone: string,
    user: { id: string; businessId: string },
    intent: ReturnType<NlpParserService['parse']>,
  ): Promise<void> {
    // Cari akun default WA user (akun CASH pertama milik bisnis)
    const accounts = await this.accountService.findAllByBusiness(user.businessId);
    const defaultAccount = accounts.find((a) => a.type === 'CASH') ?? accounts[0];

    if (!defaultAccount) {
      await this.sendReply(fromPhone, '⚠️ Belum ada akun yang tersedia. Silakan buat akun dulu di web app.');
      return;
    }

    try {
      const dto = Object.assign(new CreateTransactionDto(), {
        accountId: defaultAccount.id,
        type: intent.type === IntentType.MASUK ? TransactionType.MASUK : TransactionType.KELUAR,
        amount: String(intent.amount),
        currency: defaultAccount.currency,
        occurredAt: new Date().toISOString(),
        description: intent.description,
      });
      await this.transactionService.createTransaction(
        dto,
        user.id,
        user.businessId,
        randomUUID(),
        TransactionSourceType.MANUAL,
      );

      // Ambil saldo terbaru dari database
      const updatedAccount = await this.prisma.account.findUnique({
        where: { id: defaultAccount.id },
      });
      const balance = Number(updatedAccount?.balance ?? 0);

      const replyText =
        intent.type === IntentType.MASUK
          ? ReplyTemplates.successMasuk(intent.amount!, intent.description ?? '-', balance)
          : ReplyTemplates.successKeluar(intent.amount!, intent.description ?? '-', balance);

      await this.sendReply(fromPhone, replyText);
    } catch (err) {
      this.logger.error(`Failed to create transaction: ${err}`);
      await this.sendReply(fromPhone, `⚠️ Gagal mencatat transaksi: ${(err as Error).message}`);
    }
  }

  private async handleSaldo(fromPhone: string, businessId: string): Promise<void> {
    const accounts = await this.accountService.findAllByBusiness(businessId);
    if (!accounts.length) {
      await this.sendReply(fromPhone, '⚠️ Belum ada akun yang terdaftar.');
      return;
    }

    const lines = accounts.map((acc) => {
      const balance = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: acc.currency,
        minimumFractionDigits: 0,
      }).format(Number(acc.balance));
      return `• ${acc.name} : ${balance}`;
    });

    const reply = `💰 *Saldo Akun Kamu:*\n${lines.join('\n')}`;
    await this.sendReply(fromPhone, reply);
  }

  private async handleLaporan(
    fromPhone: string,
    businessId: string,
    period: 'hari_ini' | 'minggu_ini' | 'bulan_ini' = 'hari_ini',
  ): Promise<void> {
    const now = new Date();
    let from: Date;

    if (period === 'minggu_ini') {
      from = new Date(now);
      from.setDate(now.getDate() - 7);
    } else if (period === 'bulan_ini') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    const txs = await this.prisma.transaction.findMany({
      where: {
        businessId,
        occurredAt: { gte: from, lte: now },
        status: 'CONFIRMED',
        deletedAt: null,
      },
    });

    let totalMasuk = 0;
    let totalKeluar = 0;
    for (const tx of txs) {
      if (tx.type === 'MASUK') totalMasuk += Number(tx.amount);
      else if (tx.type === 'KELUAR') totalKeluar += Number(tx.amount);
    }

    const fmt = (n: number) =>
      new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

    const label = period === 'minggu_ini' ? '7 Hari Terakhir' : 'Hari Ini';
    const reply =
      `📊 *Laporan ${label}*\n` +
      `Uang Masuk : ${fmt(totalMasuk)}\n` +
      `Uang Keluar: ${fmt(totalKeluar)}\n` +
      `Selisih    : ${fmt(totalMasuk - totalKeluar)}`;

    await this.sendReply(fromPhone, reply);
  }

  private async handleBatal(
    fromPhone: string,
    user: { id: string; businessId: string },
  ): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const lastTx = await this.prisma.transaction.findFirst({
      where: {
        userId: user.id,
        businessId: user.businessId,
        createdAt: { gte: fiveMinutesAgo },
        status: 'CONFIRMED',
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastTx) {
      await this.sendReply(fromPhone, '⚠️ Tidak ada transaksi yang bisa dibatalkan dalam 5 menit terakhir.');
      return;
    }

    try {
      await this.transactionService.voidTransaction(lastTx.id, user.businessId, user.id);
      await this.sendReply(fromPhone, `✅ Transaksi terakhir berhasil dibatalkan.`);
    } catch (err) {
      await this.sendReply(fromPhone, `⚠️ Gagal membatalkan transaksi: ${(err as Error).message}`);
    }
  }

  // ─── WhatsApp API ─────────────────────────────────────────────────────────

  async sendReply(to: string, message: string): Promise<void> {
    const accessToken = process.env.WA_ACCESS_TOKEN;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      this.logger.warn('WA_ACCESS_TOKEN or WA_PHONE_NUMBER_ID not set — skipping reply');
      return;
    }

    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
    const body = JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message },
    });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body,
      });
      if (!res.ok) {
        const err = await res.text();
        this.logger.error(`Failed to send WA reply: ${err}`);
      }
    } catch (err) {
      this.logger.error(`Error sending WA reply: ${err}`);
    }
  }
}

