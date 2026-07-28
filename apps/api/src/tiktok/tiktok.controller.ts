import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TiktokService } from './tiktok.service';

@Controller('tiktok')
export class TiktokController {
  constructor(private readonly tiktokService: TiktokService) {}

  @Get('oauth/start')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  oauthStart() {
    return this.tiktokService.createOAuthStart();
  }

  @Get('oauth/callback')
  async oauthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    if (error) {
      throw new BadRequestException(error);
    }
    if (!code || !state) {
      throw new BadRequestException('Missing code or state');
    }

    const redirectUrl = await this.tiktokService.handleOAuthCallback(
      code,
      state,
    );
    return res.redirect(redirectUrl);
  }

  @Get('accounts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listAccounts() {
    return this.tiktokService.listAccounts();
  }

  @Get('accounts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getAccount(@Param('id') id: string) {
    return this.tiktokService.getAccount(id);
  }

  @Post('accounts/:id/sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  syncAccount(@Param('id') id: string) {
    return this.tiktokService.syncAccount(id);
  }

  @Get('accounts/:id/videos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listVideos(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    return this.tiktokService.listVideos(id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      q,
    });
  }

  @Delete('accounts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  unlinkAccount(@Param('id') id: string) {
    return this.tiktokService.unlinkAccount(id);
  }

  @Get('accounts/:id/drafts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listDrafts(@Param('id') id: string) {
    return this.tiktokService.listDrafts(id);
  }

  @Post('accounts/:id/drafts/bulk-delete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  bulkDeleteDrafts(
    @Param('id') id: string,
    @Body() body: { ids?: string[] },
  ) {
    return this.tiktokService.bulkDeleteDrafts(id, body?.ids);
  }

  @Delete('accounts/:id/drafts/:jobId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  deleteDraft(@Param('id') id: string, @Param('jobId') jobId: string) {
    return this.tiktokService.deleteDraft(id, jobId);
  }

  @Post('accounts/:id/drafts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('video', {
      storage: memoryStorage(),
      limits: { fileSize: 512 * 1024 * 1024 },
    }),
  )
  uploadDraft(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('caption') caption?: string,
  ) {
    if (!file) {
      throw new BadRequestException('video file is required');
    }
    return this.tiktokService.uploadDraft(id, file, caption);
  }
}
