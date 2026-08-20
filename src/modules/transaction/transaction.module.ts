import { Module } from '@nestjs/common';
import { TransactionController } from './transaction.controller';
import { TransactionService } from './transaction.service';
import { AccountModule } from '../account/account.module';
import { CategoryModule } from '../category/category.module';

@Module({
  imports: [
    AccountModule, // AccountService dipakai untuk validasi kepemilikan akun
    CategoryModule, // CategoryService dipakai untuk validasi categoryId
  ],
  controllers: [TransactionController],
  providers: [TransactionService],
  exports: [TransactionService], // diekspor untuk ReportModule nanti
})
export class TransactionModule {}
