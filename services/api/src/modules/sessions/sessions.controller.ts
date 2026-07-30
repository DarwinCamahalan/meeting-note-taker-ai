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
import type { Paginated, Session, WsTicket } from '@cue/types';
import { type AuthContext } from '../../common/auth-context.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  CreateSessionRequestSchema,
  ListSessionsQuerySchema,
  type CreateSessionRequestDto,
  type ListSessionsQueryDto,
} from '../../contracts/index.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SessionsService } from './sessions.service.js';

@Controller('v1/sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() ctx: AuthContext,
    @Body(new ZodValidationPipe(CreateSessionRequestSchema)) body: CreateSessionRequestDto,
  ): Promise<Session> {
    return this.sessions.create(ctx, body);
  }

  @Get()
  list(
    @CurrentUser() ctx: AuthContext,
    @Query(new ZodValidationPipe(ListSessionsQuerySchema)) query: ListSessionsQueryDto,
  ): Promise<Paginated<Session>> {
    return this.sessions.list(ctx, query);
  }

  @Get(':id')
  get(@CurrentUser() ctx: AuthContext, @Param('id') id: string): Promise<Session> {
    return this.sessions.get(ctx, id);
  }

  @Post(':id/ws-ticket')
  @HttpCode(HttpStatus.OK)
  wsTicket(@CurrentUser() ctx: AuthContext, @Param('id') id: string): Promise<WsTicket> {
    return this.sessions.wsTicket(ctx, id);
  }
}
