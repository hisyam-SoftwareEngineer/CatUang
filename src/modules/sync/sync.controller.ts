import { Controller, Sse, UseGuards, Req } from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Observable } from 'rxjs';
import { Role } from '@prisma/client';

interface AuthRequest {
  user: { id: string; businessId: string; role: Role };
}

@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Sse('events')
  sendEvents(@Req() req: AuthRequest): Observable<any> {
    return this.syncService.getEventStream(req.user.businessId);
  }
}
