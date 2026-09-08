import { Module } from '@nestjs/common';
import { DatabaseModule } from '@docsaarthi/database';
import { QueueModule } from '../queue/queue.module';
import { AuditModule } from '../audit/audit.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [DatabaseModule, QueueModule, AuditModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
  exports: [AdminService, AdminGuard],
})
export class AdminModule {}
