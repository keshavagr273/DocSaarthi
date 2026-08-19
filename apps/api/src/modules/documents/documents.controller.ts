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
} from '@nestjs/swagger';
import { Request } from 'express';
import { DocumentsService } from './documents.service';
import {
  InitiateUploadDto,
  ConfirmUploadDto,
  ListDocumentsDto,
  UpdateDocumentDto,
} from './dto/documents.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('documents')
@ApiBearerAuth('JWT')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  // ── Upload flow ────────────────────────────────────────────────────

  /**
   * Step 1 of the upload flow.
   * Returns a presigned POST URL to upload the file directly to MinIO.
   */
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

  /**
   * Step 2 of the upload flow.
   * Call this after the file is uploaded to MinIO to trigger processing.
   */
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

  // ── List / Get ─────────────────────────────────────────────────────

  /** List all documents for the authenticated user. */
  @Get()
  @ApiOperation({ summary: 'List user documents with filters and pagination' })
  async findAll(
    @Query() query: ListDocumentsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.findAll(user.sub, query);
  }

  /** Get detailed info for one document including extracted fields. */
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

  /** Get real-time processing status with stage-level detail. */
  @Get(':id/status')
  @ApiOperation({ summary: 'Get document processing status — poll this while status is PROCESSING' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  async getStatus(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.getStatus(user.sub, documentId);
  }

  // ── Checkpoint 2: New data endpoints ─────────────────────────────

  /**
   * Get all pages with metadata and thumbnail info.
   */
  @Get(':id/pages')
  @ApiOperation({ summary: 'List document pages with metadata' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  async getPages(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.getPages(user.sub, documentId);
  }

  /**
   * Get a specific page with full OCR block data.
   */
  @Get(':id/pages/:pageNum')
  @ApiOperation({ summary: 'Get page with OCR blocks and bounding boxes' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiParam({ name: 'pageNum', description: 'Page number (1-indexed)' })
  async getPage(
    @Param('id') documentId: string,
    @Param('pageNum', ParseIntPipe) pageNum: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.getPage(user.sub, documentId, pageNum);
  }

  /**
   * Get all extracted fields for a completed document.
   */
  @Get(':id/fields')
  @ApiOperation({ summary: 'Get extracted fields with confidence scores' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  async getFields(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.getFields(user.sub, documentId);
  }

  /**
   * Get raw OCR output for all pages.
   */
  @Get(':id/ocr')
  @ApiOperation({ summary: 'Get raw OCR text and blocks for all pages' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  async getOcr(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.getOcr(user.sub, documentId);
  }

  // ── Update / Delete ────────────────────────────────────────────────

  /** Update document title or tags. */
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

  /** Soft-delete a document. */
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
