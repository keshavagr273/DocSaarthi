import { IsString, IsOptional, IsIn, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SearchQueryDto {
  @ApiProperty({ description: 'The search query text' })
  @IsString()
  q!: string;

  @ApiPropertyOptional({ enum: ['hybrid', 'semantic', 'keyword'], default: 'hybrid' })
  @IsOptional()
  @IsIn(['hybrid', 'semantic', 'keyword'])
  mode?: 'hybrid' | 'semantic' | 'keyword' = 'hybrid';

  @ApiPropertyOptional({ description: 'Filter by document category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by document language (e.g. hi, en)' })
  @IsOptional()
  @IsString()
  lang?: string;

  @ApiPropertyOptional({ description: 'Scope search to a specific document' })
  @IsOptional()
  @IsString()
  documentId?: string;

  @ApiPropertyOptional({ description: 'Filter documents uploaded after this ISO date' })
  @IsOptional()
  @IsDateString()
  uploadedAfter?: string;

  @ApiPropertyOptional({ description: 'Filter documents uploaded before this ISO date' })
  @IsOptional()
  @IsDateString()
  uploadedBefore?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

export class SemanticSearchDto {
  @ApiProperty({ description: 'The query text to embed and match' })
  @IsString()
  query!: string;

  @ApiPropertyOptional({ description: 'Optional document ID to scope search' })
  @IsOptional()
  @IsString()
  documentId?: string;

  @ApiPropertyOptional({ description: 'Optional category filter' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

export class KeywordSearchDto {
  @ApiProperty({ description: 'The text query for full-text and trigram search' })
  @IsString()
  query!: string;

  @ApiPropertyOptional({ description: 'Optional document ID to scope search' })
  @IsOptional()
  @IsString()
  documentId?: string;

  @ApiPropertyOptional({ description: 'Optional category filter' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
