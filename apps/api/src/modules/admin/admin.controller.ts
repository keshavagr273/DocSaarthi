import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('admin')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get administrative overview stats' })
  @ApiResponse({ status: 200, description: 'Overview statistics' })
  async getOverviewStats() {
    return this.adminService.getOverviewStats();
  }

  @Get('users')
  @ApiOperation({ summary: 'Get users directory with document submission breakdowns' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUsers(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.adminService.getUsers(search, pageNum, limitNum);
  }

  @Get('users/:id/documents')
  @ApiOperation({ summary: 'Get all document submissions for a specific user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async getUserDocuments(@Param('id') userId: string) {
    return this.adminService.getUserDocuments(userId);
  }

  @Patch('users/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable or disable a user account' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async toggleUserStatus(
    @Param('id') userId: string,
    @Body() body: { isActive: boolean },
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.toggleUserStatus(userId, body.isActive, admin.sub);
  }

  @Get('documents')
  @ApiOperation({ summary: 'Get platform-wide document submissions with user info' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAllDocuments(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.adminService.getAllDocuments({ status, search, page: pageNum, limit: limitNum });
  }

  @Get('queue')
  @ApiOperation({ summary: 'Get Bull queue diagnostic details and backlog' })
  async getQueueDetails() {
    return this.adminService.getQueueDetails();
  }

  @Post('queue/retry-failed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk re-enqueue all failed or stuck documents' })
  async retryAllFailed(@CurrentUser() admin: AuthenticatedUser) {
    return this.adminService.retryAllFailed(admin.sub);
  }
}
