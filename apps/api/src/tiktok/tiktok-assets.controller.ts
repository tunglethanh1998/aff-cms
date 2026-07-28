import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
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
import { AssetsService } from '../assets/assets.service';
import {
  BulkDeleteAssetsDto,
  BulkDeleteFoldersDto,
  CreateFolderDto,
  DownloadAssetsZipDto,
  UpdateFolderCompanionsDto,
} from '../assets/dto/assets.dto';

function attachmentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]+/g, '_') || 'download';
  return `attachment; filename="${ascii.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

@Controller('tiktok/accounts/:accountId/assets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class TiktokAssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get('folders/tree')
  async getFolderTree(@Param('accountId') accountId: string) {
    await this.assetsService.ensureAccountLibrary(accountId);
    return this.assetsService.getFolderTree(accountId);
  }

  @Post('folders')
  createFolder(
    @Param('accountId') accountId: string,
    @Body() dto: CreateFolderDto,
  ) {
    return this.assetsService.createFolder(dto, accountId);
  }

  @Post('folders/bulk-delete')
  bulkDeleteFolders(
    @Param('accountId') accountId: string,
    @Body() dto: BulkDeleteFoldersDto,
  ) {
    return this.assetsService.bulkDeleteFolders(dto, accountId);
  }

  @Patch('folders/:folderId/companions')
  updateFolderCompanions(
    @Param('accountId') accountId: string,
    @Param('folderId') folderId: string,
    @Body() dto: UpdateFolderCompanionsDto,
  ) {
    return this.assetsService.updateFolderCompanions(folderId, dto, accountId);
  }

  @Delete('folders/:folderId')
  deleteFolder(
    @Param('accountId') accountId: string,
    @Param('folderId') folderId: string,
  ) {
    return this.assetsService.deleteFolder(folderId, accountId);
  }

  @Get()
  async listAssets(
    @Param('accountId') accountId: string,
    @Query('folderId') folderId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    await this.assetsService.ensureAccountLibrary(accountId);
    return this.assetsService.listAssets({
      folderId: folderId === undefined ? undefined : folderId || null,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      q,
      accountId,
    });
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  upload(
    @Param('accountId') accountId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('folderId') folderId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    return this.assetsService.uploadImage(
      file,
      folderId || undefined,
      accountId,
    );
  }

  @Post('bulk-delete')
  bulkDeleteAssets(
    @Param('accountId') accountId: string,
    @Body() dto: BulkDeleteAssetsDto,
  ) {
    return this.assetsService.bulkDeleteAssets(dto, accountId);
  }

  @Post('download-zip')
  async downloadZip(
    @Param('accountId') accountId: string,
    @Body() dto: DownloadAssetsZipDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const zip = await this.assetsService.buildDownloadZip(dto, accountId);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': attachmentDisposition(zip.filename),
    });
    return new StreamableFile(zip.stream);
  }

  @Get(':assetId/download')
  async downloadAsset(
    @Param('accountId') accountId: string,
    @Param('assetId') assetId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.assetsService.getDownloadPayload(
      assetId,
      accountId,
    );
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.body.length),
      'Content-Disposition': attachmentDisposition(file.filename),
    });
    return new StreamableFile(file.body);
  }

  @Delete(':assetId')
  deleteAsset(
    @Param('accountId') accountId: string,
    @Param('assetId') assetId: string,
  ) {
    return this.assetsService.deleteAsset(assetId, accountId);
  }
}
