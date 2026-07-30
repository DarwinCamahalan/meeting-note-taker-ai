/**
 * Team knowledge-base endpoints (Phase 3). The org's shared KB is the set of
 * `visibility = 'org'` documents; every member may list it, and owners/admins
 * may remove documents from it. Personal uploads are managed via the existing
 * `/v1/documents` surface and are never surfaced here.
 *
 * Authorization: the access token is bound to a single org, so `:orgId` must
 * match the caller's active org (enforced in the service), and DELETE is gated
 * to owner/admin roles.
 */
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Document, Paginated } from '@cue/types';
import { type AuthContext } from '../../common/auth-context.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  ListOrgDocumentsQuerySchema,
  type ListOrgDocumentsQueryDto,
} from '../../contracts/index.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DocumentsService } from './documents.service.js';

@Controller('v1/orgs/:orgId/documents')
@UseGuards(JwtAuthGuard)
export class TeamKbController {
  constructor(private readonly documents: DocumentsService) {}

  /** `GET /v1/orgs/:orgId/documents` — list the org's shared team KB. */
  @Get()
  list(
    @CurrentUser() ctx: AuthContext,
    @Param('orgId') orgId: string,
    @Query(new ZodValidationPipe(ListOrgDocumentsQuerySchema)) query: ListOrgDocumentsQueryDto,
  ): Promise<Paginated<Document>> {
    return this.documents.listOrgKb(ctx, orgId, query);
  }

  /** `DELETE /v1/orgs/:orgId/documents/:documentId` — admin-gated removal. */
  @Delete(':documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() ctx: AuthContext,
    @Param('orgId') orgId: string,
    @Param('documentId') documentId: string,
  ): Promise<void> {
    return this.documents.removeOrgDoc(ctx, orgId, documentId);
  }
}
