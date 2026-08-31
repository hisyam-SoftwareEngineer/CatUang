import { Module } from '@nestjs/common';
import { AssetLiabilityController } from './asset-liability.controller';
import { AssetLiabilityService } from './asset-liability.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AssetLiabilityController],
  providers: [AssetLiabilityService],
  exports: [AssetLiabilityService],
})
export class AssetLiabilityModule {}

