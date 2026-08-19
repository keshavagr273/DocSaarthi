import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { DocumentsService } from './documents.service';
import {
  InitiateUploadDto,
  ConfirmUploadDto,
  ListDocumentsDto,
  UpdateDocumentDto,
  OverrideCategoryDto,
  CreateVersionDto,
} from './dto/documents.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('documents')
@ApiBearerAuth('JWT')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  // ── Upload flow ────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate document upload — returns presigned URL' })
  @ApiResponse({ status: 201, description: 'Presigned upload URL created' })
  async initiateUpload(
    @Body() dto: InitiateUploadDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return this.documentsService.initiateUpload(user.sub, dto, req.requestId);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm upload complete — enqueues processing job' })
  @ApiParam({ name: 'id', description: 'Document ID returned from initiate upload' })
  async confirmUpload(
    @Param('id') documentId: string,
    @Body() dto: ConfirmUploadDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return this.documentsService.confirmUpload(user.sub, documentId, dto.versionId, req.requestId);
  }

  // ── Category Override (Checkpoint 3) ───────────────────────────────

  @Patch(':id/category')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Override AI classification category' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  async overrideCategory(
    @Param('id') documentId: string,
    @Body() dto: OverrideCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return this.documentsService.overrideCategory(user.sub, documentId, dto, req.requestId);
  }

  // ── Versioning Endpoints (Checkpoint 3) ────────────────────────────

  @Get(':id/versions')
  @ApiOperation({ summary: 'List all versions for a document' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  async getVersions(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.getVersions(user.sub, documentId);
  }

  @Post(':id/versions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload a new version of a document' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  async createVersion(
    @Param('id') documentId: string,
    @Body() dto: CreateVersionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return this.documentsService.createVersion(user.sub, documentId, dto, req.requestId);
  }

  @Get(':id/versions/compare')
  @ApiOperation({ summary: 'Compare two versions of a document with field diffs and summary' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiQuery({ name: 'v1', description: 'First version ID' })
  @ApiQuery({ name: 'v2', description: 'Second version ID' })
  async compareVersions(
    @Param('id') documentId: string,
    @Query('v1') v1: string,
    @Query('v2') v2: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.compareVersions(user.sub, documentId, v1, v2);
  }

  @Get(':id/versions/:vId')
  @ApiOperation({ summary: 'Get specific version detail' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiParam({ name: 'vId', description: 'Version ID' })
  async getVersionDetail(
    @Param('id') documentId: string,
    @Param('vId') versionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.getVersionDetail(user.sub, documentId, versionId);
  }

  // ── List / Get ─────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List user documents with filters and pagination' })
  async findAll(
    @Query() query: ListDocumentsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.findAll(user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document details including extracted fields' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  async findOne(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.findOne(user.sub, documentId);
  }

  // ── Processing status ──────────────────────────────────────────────

  @Get(':id/status')
  @ApiOperation({ summary: 'Get document processing status' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  async getStatus(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.getStatus(user.sub, documentId);
  }

  // ── Document Data Endpoints ────────────────────────────────────────

  @Get(':id/pages')
  @ApiOperation({ summary: 'List document pages with metadata and image URLs' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiQuery({ name: 'versionId', required: false, description: 'Optional specific version ID' })
  async getPages(
    @Param('id') documentId: string,
    @Query('versionId') versionId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.getPages(user.sub, documentId, versionId);
  }

  @Get(':id/pages/:pageNum')
  @ApiOperation({ summary: 'Get page with OCR blocks and bounding boxes' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiParam({ name: 'pageNum', description: 'Page number (1-indexed)' })
  @ApiQuery({ name: 'versionId', required: false, description: 'Optional specific version ID' })
  async getPage(
    @Param('id') documentId: string,
    @Param('pageNum', ParseIntPipe) pageNum: number,
    @Query('versionId') versionId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.getPage(user.sub, documentId, pageNum, versionId);
  }

  @Get(':id/fields')
  @ApiOperation({ summary: 'Get extracted fields with confidence scores' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  async getFields(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.getFields(user.sub, documentId);
  }

  @Get(':id/ocr')
  @ApiOperation({ summary: 'Get raw OCR text and blocks for all pages' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiQuery({ name: 'versionId', required: false, description: 'Optional specific version ID' })
  async getOcr(
    @Param('id') documentId: string,
    @Query('versionId') versionId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.getOcr(user.sub, documentId, versionId);
  }

  // ── Update / Delete ────────────────────────────────────────────────

  @Patch(':id')
  @ApiOperation({ summary: 'Update document title or tags' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  async update(
    @Param('id') documentId: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.update(user.sub, documentId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a document (soft delete)' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  async remove(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return this.documentsService.remove(user.sub, documentId, req.requestId);
  }
}
