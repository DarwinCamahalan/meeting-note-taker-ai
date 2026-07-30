/**
 * Documents (STUB, MVP). The resource exists and is authenticated so clients
 * can wire against it, but ingestion/parsing/embedding are not implemented yet
 * (voyage-3.5 @ 1024 lands in a later phase). List returns an empty page.
 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import type { CueDocument, Paginated } from '@cue/types';
import { type AuthContext } from '../../common/auth-context.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@Controller('v1/documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  // TODO(phase-2): POST upload-url, ingestion pipeline, RAG chunk/embed.
  @Get()
  list(@CurrentUser() _ctx: AuthContext): Paginated<CueDocument> {
    return { data: [], nextCursor: null, hasMore: false };
  }
}
