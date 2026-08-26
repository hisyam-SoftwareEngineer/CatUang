import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Req,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { OcrProcessingService } from './ocr-processing.service';
import { ApproveImportDto } from './dto/approve-import.dto';
import { UploadImportDto } from './dto/upload-import.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UploadRateLimiterGuard } from './guards/upload-rate-limiter.guard';

interface AuthRequest {
  user: { id: string; businessId: string; role: Role };
}

/**
 * OcrProcessingController — mengelola upload struk/invoice untuk diproses OCR.
 * Alur: POST /imports → 202 (job di-queue) → GET /imports/:id (cek hasil)
 *    → PATCH /imports/:id/approve (konfirmasi & buat Transaction)
 */
@Controller('imports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OcrProcessingController {
  constructor(private readonly ocrService: OcrProcessingService) {}

  /**
   * POST /api/v1/imports
   * Role: OWNER, STAFF
   * Upload foto struk/invoice. Langsung merespons 202, proses OCR di background.
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(Role.OWNER, Role.STAFF)
  @UseGuards(JwtAuthGuard, RolesGuard, UploadRateLimiterGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadReceipt(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /image\/(jpeg|png|webp)/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() uploadDto: UploadImportDto,
    @Req() req: AuthRequest,
  ) {
    return this.ocrService.processImportRequest(
      req.user.businessId,
      file.buffer,
      file.originalname,
      uploadDto.inputType,
    );
  }

  /**
   * GET /api/v1/imports/:id
   * Role: OWNER, STAFF
   * Cek status dan hasil parsing OCR dari sebuah ImportBatchItem.
   */
  @Get(':id')
  @Roles(Role.OWNER, Role.STAFF)
  async getImportStatus(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.ocrService.getImportItem(id, req.user.businessId);
  }

  /**
   * PATCH /api/v1/imports/:id/approve
   * Role: OWNER, STAFF
   * Setujui hasil OCR dan buat Transaksi dari data yang sudah dikoreksi.
   */
  @Patch(':id/approve')
  @Roles(Role.OWNER, Role.STAFF)
  async approveImport(
    @Param('id') id: string,
    @Body() dto: ApproveImportDto,
    @Req() req: AuthRequest,
  ) {
    return this.ocrService.approveImport(id, dto, req.user.businessId, req.user.id);
  }

  /**
   * PATCH /api/v1/imports/:id/reject
   * Role: OWNER, STAFF
   * Tolak hasil OCR dengan alasan opsional.
   */
  @Patch(':id/reject')
  @Roles(Role.OWNER, Role.STAFF)
  async rejectImport(
    @Param('id') id: string,
    @Body() dto: { reason?: string },
    @Req() req: AuthRequest,
  ) {
    return this.ocrService.rejectImport(id, dto.reason, req.user.businessId);
  }
}
