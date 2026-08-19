import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ListReviewFieldsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by document category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Search term for document title or field name/value' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class EditFieldDto {
  @ApiProperty({ description: 'The corrected value for the field', example: '2026-08-20' })
  @IsString()
  newValue!: string;

  @ApiPropertyOptional({ description: 'Optional explanation for the edit', example: 'Corrected OCR misread date' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RejectFieldDto {
  @ApiPropertyOptional({ description: 'Reason for rejecting this field extraction', example: 'Incorrectly extracted footer' })
  @IsOptional()
  @IsString()
  reason?: string;
}
