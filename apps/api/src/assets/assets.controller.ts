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
import { AssetsService } from './assets.service';
import {
  ConfirmAssetDto,
  CreateFolderDto,
  PresignAssetDto,
  BulkDeleteFoldersDto,
  BulkDeleteAssetsDto,
  DownloadAssetsZipDto,
} from './dto/assets.dto';

function attachmentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]+/g, '_') || 'download';
  return `attachment; filename="${ascii.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Shared/global asset library (accountId = null). */
@Controller('assets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get('folders/tree')
  getFolderTree() {
    return this.assetsService.getFolderTree(null);
  }

  @Get('folders')
  listFolders(@Query('parentId') parentId?: string) {
    return this.assetsService.listFolders(parentId || null, null);
  }

  @Post('folders')
  createFolder(@Body() dto: CreateFolderDto) {
    return this.assetsService.createFolder(dto, null);
  }

  @Post('folders/seed-defaults')
  seedDefaultFolders() {
    return this.assetsService.seedDefaultFolders();
  }

  @Post('folders/bulk-delete')
  bulkDeleteFolders(@Body() dto: BulkDeleteFoldersDto) {
    return this.assetsService.bulkDeleteFolders(dto, null);
  }

  @Delete('folders/:id')
  deleteFolder(@Param('id') id: string) {
    return this.assetsService.deleteFolder(id, null);
  }

  @Get()
  listAssets(
    @Query('folderId') folderId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    return this.assetsService.listAssets({
      folderId: folderId === undefined ? undefined : folderId || null,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      q,
      accountId: null,
    });
  }

  @Post('presign')
  createPresign(@Body() dto: PresignAssetDto) {
    return this.assetsService.createPresign(dto, null);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('folderId') folderId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    return this.assetsService.uploadImage(file, folderId || undefined, null);
  }

  @Post('confirm')
  confirmUpload(@Body() dto: ConfirmAssetDto) {
    return this.assetsService.confirmUpload(dto, null);
  }

  @Post('bulk-delete')
  bulkDeleteAssets(@Body() dto: BulkDeleteAssetsDto) {
    return this.assetsService.bulkDeleteAssets(dto, null);
  }

  @Post('download-zip')
  async downloadZip(
    @Body() dto: DownloadAssetsZipDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const zip = await this.assetsService.buildDownloadZip(dto, null);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': attachmentDisposition(zip.filename),
    });
    return new StreamableFile(zip.stream);
  }

  @Get(':id/download')
  async downloadAsset(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.assetsService.getDownloadPayload(id, null);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.body.length),
      'Content-Disposition': attachmentDisposition(file.filename),
    });
    return new StreamableFile(file.body);
  }

  @Delete(':id')
  deleteAsset(@Param('id') id: string) {
    return this.assetsService.deleteAsset(id, null);
  }
}
