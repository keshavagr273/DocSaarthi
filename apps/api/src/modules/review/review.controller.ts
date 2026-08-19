import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ReviewService } from './review.service';
import { ListReviewFieldsDto, EditFieldDto, RejectFieldDto } from './dto/review.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('review')
@ApiBearerAuth('JWT')
@Controller('review')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get()
  @ApiOperation({ summary: 'Get unverified low-confidence fields for human review' })
  @ApiResponse({ status: 200, description: 'Review queue fields retrieved' })
  async getReviewQueue(
    @Query() query: ListReviewFieldsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviewService.getReviewQueue(user.sub, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get counts of pending, verified, and rejected review fields' })
  @ApiResponse({ status: 200, description: 'Review queue statistics' })
  async getReviewStats(@CurrentUser() user: AuthenticatedUser) {
    return this.reviewService.getReviewStats(user.sub);
  }

  @Post('fields/:id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a field as verified' })
  @ApiParam({ name: 'id', description: 'DocumentField ID' })
  async acceptField(
    @Param('id') fieldId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return this.reviewService.acceptField(user.sub, fieldId, req.requestId);
  }

  @Post('fields/:id/edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Edit and verify a field value' })
  @ApiParam({ name: 'id', description: 'DocumentField ID' })
  async editField(
    @Param('id') fieldId: string,
    @Body() dto: EditFieldDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return this.reviewService.editField(user.sub, fieldId, dto, req.requestId);
  }

  @Post('fields/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject an incorrectly extracted field' })
  @ApiParam({ name: 'id', description: 'DocumentField ID' })
  async rejectField(
    @Param('id') fieldId: string,
    @Body() dto: RejectFieldDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return this.reviewService.rejectField(user.sub, fieldId, dto, req.requestId);
  }
}
