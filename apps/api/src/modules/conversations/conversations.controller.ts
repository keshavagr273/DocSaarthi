import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { Response } from 'express';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto, SendMessageDto } from './dto/conversations.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('conversations')
@ApiBearerAuth('JWT')
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new conversation (global or document-scoped)' })
  @ApiResponse({ status: 201, description: 'Conversation created' })
  async create(
    @Body() dto: CreateConversationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversationsService.createConversation(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all conversations for the user' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.conversationsService.listConversations(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversation details with all messages and citations' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  async getOne(
    @Param('id') conversationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversationsService.getConversation(user.sub, conversationId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a conversation' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  async remove(
    @Param('id') conversationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversationsService.deleteConversation(user.sub, conversationId);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a message in a conversation (supports SSE streaming)' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  async sendMessage(
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void | Response> {
    if (dto.stream !== false) {
      await this.conversationsService.handleSendMessage(user.sub, conversationId, dto, res);
      return;
    } else {
      const result = await this.conversationsService.handleSendMessage(user.sub, conversationId, dto);
      return res.status(HttpStatus.OK).json({ data: result });
    }
  }
}
