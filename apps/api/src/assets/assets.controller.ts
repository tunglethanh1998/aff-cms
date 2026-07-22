import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
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
} from './dto/assets.dto';

@Controller('assets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get('folders/tree')
  getFolderTree() {
    return this.assetsService.getFolderTree();
  }

  @Get('folders')
  listFolders(@Query('parentId') parentId?: string) {
    return this.assetsService.listFolders(parentId || null);
  }

  @Post('folders')
  createFolder(@Body() dto: CreateFolderDto) {
    return this.assetsService.createFolder(dto);
  }

  @Post('folders/seed-defaults')
  seedDefaultFolders() {
    return this.assetsService.seedDefaultFolders();
  }

  @Post('folders/bulk-delete')
  bulkDeleteFolders(@Body() dto: BulkDeleteFoldersDto) {
    return this.assetsService.bulkDeleteFolders(dto);
  }

  @Delete('folders/:id')
  deleteFolder(@Param('id') id: string) {
    return this.assetsService.deleteFolder(id);
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
    });
  }

  @Post('presign')
  createPresign(@Body() dto: PresignAssetDto) {
    return this.assetsService.createPresign(dto);
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
    return this.assetsService.uploadImage(file, folderId || undefined);
  }

  @Post('confirm')
  confirmUpload(@Body() dto: ConfirmAssetDto) {
    return this.assetsService.confirmUpload(dto);
  }

  @Post('bulk-delete')
  bulkDeleteAssets(@Body() dto: BulkDeleteAssetsDto) {
    return this.assetsService.bulkDeleteAssets(dto);
  }

  @Delete(':id')
  deleteAsset(@Param('id') id: string) {
    return this.assetsService.deleteAsset(id);
  }
}
