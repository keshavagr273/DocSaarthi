import { Module } from '@nestjs/common';
import { DatabaseModule } from '@docsaarthi/database';
import { CacheService } from '../../common/services/cache.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SettingsController],
  providers: [SettingsService, CacheService],
  exports: [SettingsService],
})
export class SettingsModule {}
