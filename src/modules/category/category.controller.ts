import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

interface AuthRequest {
  user: { id: string; businessId: string; role: Role };
}

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  /**
   * GET /api/v1/categories — Semua kategori aktif milik business.
   * Role: OWNER dan STAFF (keduanya butuh lihat kategori saat input transaksi).
   */
  @Get()
  @Roles(Role.OWNER, Role.STAFF)
  async findAll(@Req() req: AuthRequest) {
    const items = await this.categoryService.findAll(req.user.businessId);
    return { items };
  }

  /**
   * POST /api/v1/categories — Buat kategori kustom baru.
   * Role: OWNER saja.
   */
  @Post()
  @Roles(Role.OWNER)
  async create(@Body() dto: CreateCategoryDto, @Req() req: AuthRequest) {
    return this.categoryService.create(dto, req.user.businessId);
  }

  /**
   * PATCH /api/v1/categories/:id — Update nama kategori kustom.
   * Role: OWNER saja. Kategori default tidak bisa diubah.
   */
  @Patch(':id')
  @Roles(Role.OWNER)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @Req() req: AuthRequest,
  ) {
    return this.categoryService.update(id, dto, req.user.businessId);
  }

  /**
   * DELETE /api/v1/categories/:id — Soft-delete kategori kustom.
   * Role: OWNER saja. Tidak bisa hapus kategori default atau yang masih dipakai.
   */
  @Delete(':id')
  @Roles(Role.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.categoryService.remove(id, req.user.businessId);
  }
}
