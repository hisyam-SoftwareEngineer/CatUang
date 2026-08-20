import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base exception untuk semua domain-specific business errors.
 * Sesuai 03-backend-guide.md §3 — custom exception class per domain error.
 */
export class BusinessException extends HttpException {
  constructor(
    public readonly errorCode: string,
    message: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(
      {
        statusCode,
        errorCode,
        message,
        timestamp: new Date().toISOString(),
      },
      statusCode,
    );
  }
}

// ─── Account Domain Exceptions ─────────────────────────

export class UnsupportedCurrencyException extends BusinessException {
  constructor() {
    super(
      'UNSUPPORTED_CURRENCY',
      'Mata uang tidak didukung oleh sistem. Silakan pilih dari daftar yang tersedia.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class AccountNotFoundException extends BusinessException {
  constructor() {
    super(
      'ACCOUNT_NOT_FOUND',
      'Akun tidak ditemukan atau sudah dihapus',
      HttpStatus.NOT_FOUND,
    );
  }
}

// ─── Auth Domain Exceptions ────────────────────────────

export class EmailAlreadyRegisteredException extends BusinessException {
  constructor() {
    super(
      'EMAIL_ALREADY_REGISTERED',
      'Email sudah terdaftar. Silakan gunakan email lain atau login.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class InvalidCredentialsException extends BusinessException {
  constructor() {
    super(
      'INVALID_CREDENTIALS',
      'Email atau password salah',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

// ─── Transaction Domain Exceptions ────────────────────

export class InsufficientBalanceException extends BusinessException {
  constructor() {
    super(
      'INSUFFICIENT_BALANCE',
      'Saldo akun tidak cukup untuk transaksi ini',
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class CurrencyMismatchException extends BusinessException {
  constructor() {
    super(
      'CURRENCY_MISMATCH',
      'Mata uang transaksi tidak sesuai dengan mata uang akun',
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class IdempotencyKeyRequiredException extends BusinessException {
  constructor() {
    super(
      'IDEMPOTENCY_KEY_REQUIRED',
      'Header Idempotency-Key wajib disertakan untuk transaksi',
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class ExchangeRateRequiredException extends BusinessException {
  constructor() {
    super(
      'EXCHANGE_RATE_REQUIRED',
      'Kurs tukar (exchangeRateUsed) wajib diisi untuk transfer antar akun dengan mata uang berbeda',
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class SameAccountTransferException extends BusinessException {
  constructor() {
    super(
      'SAME_ACCOUNT_TRANSFER',
      'Akun asal dan akun tujuan tidak boleh sama untuk transaksi transfer',
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class TransactionNotFoundException extends BusinessException {
  constructor() {
    super(
      'TRANSACTION_NOT_FOUND',
      'Transaksi tidak ditemukan atau sudah dihapus',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class TransactionAlreadyVoidException extends BusinessException {
  constructor() {
    super(
      'TRANSACTION_ALREADY_VOID',
      'Transaksi ini sudah dibatalkan sebelumnya',
      HttpStatus.CONFLICT,
    );
  }
}

export class InvalidTransactionDateException extends BusinessException {
  constructor() {
    super(
      'INVALID_DATE',
      'Tanggal transaksi tidak valid. Tansaksi tidak boleh lebih dari 24 jam di masa depan',
      HttpStatus.BAD_REQUEST,
    );
  }
}
