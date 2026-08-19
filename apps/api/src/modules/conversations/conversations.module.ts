import { Module } from '@nestjs/common';
import { DatabaseModule } from '@docsaarthi/database';
import { SearchModule } from '../search/search.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [DatabaseModule, SearchModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
