import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConversationDto {
  @ApiPropertyOptional({ description: 'Optional document ID to scope conversation to a single document' })
  @IsOptional()
  @IsString()
  documentId?: string;

  @ApiPropertyOptional({ description: 'Custom conversation title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Preferred language: en | hi' })
  @IsOptional()
  @IsString()
  language?: string;
}

export class SendMessageDto {
  @ApiProperty({ description: 'Message content from user', example: 'इस नोटिस की अंतिम तिथि क्या है?' })
  @IsString()
  content!: string;

  @ApiPropertyOptional({ description: 'Whether to stream the response as Server-Sent Events', default: true })
  @IsOptional()
  @IsBoolean()
  stream?: boolean = true;
}
