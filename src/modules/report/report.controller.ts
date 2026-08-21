import { Controller, Get, Post, Body, Param, UseGuards, Req, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ReportService } from './report.service';
import { ExportService } from './export.service';
import { ProfitLossQueryDto } from './dto/profit-loss-query.dto';
import { CreateExportDto } from './dto/create-export.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

interface AuthRequest {
  user: { id: string; businessId: string; role: Role };
}

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    // Add ExportService later below
  ) {}

  @Get('profit-loss')
  @Roles(Role.OWNER)
  async getProfitLoss(@Query() query: ProfitLossQueryDto, @Req() req: AuthRequest) {
    return this.reportService.getProfitLoss(req.user.businessId, query);
  }
}

@Controller('exports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(Role.OWNER)
  async createExport(@Body() dto: CreateExportDto, @Req() req: AuthRequest) {
    return this.exportService.createExportJob(req.user.businessId, req.user.id, dto);
  }

  @Get(':id')
  @Roles(Role.OWNER)
  async getExportStatus(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.exportService.getExportJob(id, req.user.businessId);
  }
}
