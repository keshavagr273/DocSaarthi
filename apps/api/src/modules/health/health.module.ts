import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { ProcessorModule } from '../processor/processor.module';

@Module({
  imports: [TerminusModule, ProcessorModule],
  controllers: [HealthController],
})
export class HealthModule {}
