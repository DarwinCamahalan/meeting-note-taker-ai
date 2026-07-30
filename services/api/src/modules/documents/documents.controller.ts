/**
 * Documents (Phase 2 — RAG ingest). Upload chunks + embeds + persists inline
 * text synchronously; list/get are org-scoped reads. All routes require a valid
 * access token.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Document, DocumentUploadResponse, Paginated } from '@cue/types';
import { type AuthContext } from '../../common/auth-context.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  DocumentUploadRequestSchema,
  ListDocumentsQuerySchema,
  type DocumentUploadRequestDto,
  type ListDocumentsQueryDto,
} from '../../contracts/index.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DocumentsService } from './documents.service.js';

@Controller('v1/documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  upload(
    @CurrentUser() ctx: AuthContext,
    @Body(new ZodValidationPipe(DocumentUploadRequestSchema)) body: DocumentUploadRequestDto,
  ): Promise<DocumentUploadResponse> {
    return this.documents.upload(ctx, body);
  }

  @Get()
  list(
    @CurrentUser() ctx: AuthContext,
    @Query(new ZodValidationPipe(ListDocumentsQuerySchema)) query: ListDocumentsQueryDto,
  ): Promise<Paginated<Document>> {
    return this.documents.list(ctx, query);
  }

  @Get(':id')
  get(@CurrentUser() ctx: AuthContext, @Param('id') id: string): Promise<Document> {
    return this.documents.get(ctx, id);
  }
}
