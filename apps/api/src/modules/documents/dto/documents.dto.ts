import {
  IsString,
  IsIn,
  IsNumber,
  Min,
  Max,
  IsOptional,
  MaxLength,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export class InitiateUploadDto {
  @ApiProperty({ description: 'Original filename with extension' })
  @IsString()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ enum: ALLOWED_MIME_TYPES })
  @IsIn(ALLOWED_MIME_TYPES)
  mimeType: string;

  @ApiProperty({ description: 'File size in bytes', minimum: 1, maximum: 52428800 })
  @IsNumber()
  @Min(1)
  @Max(52428800)
  fileSize: number;

  @ApiPropertyOptional({ description: 'Custom document title (defaults to filename)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: 'Optional tags', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ConfirmUploadDto {
  @ApiProperty({ description: 'Version ID returned from initiate-upload' })
  @IsString()
  versionId: string;
}

export class ListDocumentsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(100) limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() sortBy?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['asc', 'desc']) sortOrder?: 'asc' | 'desc';
}

export class UpdateDocumentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) title?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}
