import { IsString, IsOptional, MinLength, MaxLength, IsIn, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'User full name', example: 'Rahul Sharma' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Preferred language', example: 'hi', enum: ['en', 'hi'] })
  @IsOptional()
  @IsIn(['en', 'hi'])
  preferredLanguage?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current user password' })
  @IsString()
  @MinLength(6)
  currentPassword!: string;

  @ApiProperty({ description: 'New password (min 8 chars)' })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  newPassword!: string;
}

export class CreateApiKeyDto {
  @ApiProperty({ description: 'Descriptive name for the API key', example: 'Tally ERP Integration' })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  name!: string;

  @ApiPropertyOptional({ description: 'Expiration in days (optional, 1-365)', default: 90 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number = 90;
}
