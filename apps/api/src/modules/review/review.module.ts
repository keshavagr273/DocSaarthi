import { Module } from '@nestjs/common';
import { DatabaseModule } from '@docsaarthi/database';
import { AuditModule } from '../audit/audit.module';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
