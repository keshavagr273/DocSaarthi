import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateProfileDto, ChangePasswordDto, CreateApiKeyDto } from './dto/settings.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('settings')
@ApiBearerAuth('JWT')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Patch('profile')
  @ApiOperation({ summary: 'Update user profile & language preferences' })
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settingsService.updateProfile(user.sub, dto);
  }

  @Post('password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change user password' })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settingsService.changePassword(user.sub, dto);
  }

  @Get('api-keys')
  @ApiOperation({ summary: 'List user active API keys' })
  async listApiKeys(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.listApiKeys(user.sub);
  }

  @Post('api-keys')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new API key' })
  async createApiKey(
    @Body() dto: CreateApiKeyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settingsService.createApiKey(user.sub, dto);
  }

  @Delete('api-keys/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an API key' })
  async revokeApiKey(
    @Param('id') keyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settingsService.revokeApiKey(user.sub, keyId);
  }

  @Get('dashboard-stats')
  @ApiOperation({ summary: 'Get aggregated dashboard metrics and deadlines' })
  async getDashboardStats(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getDashboardStats(user.sub);
  }
}
