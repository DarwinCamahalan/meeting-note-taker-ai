import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DocumentsController } from './documents.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [DocumentsController],
})
export class DocumentsModule {}
