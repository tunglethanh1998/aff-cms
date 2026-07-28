import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
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
import { BulkDeleteAssetsDto } from '../assets/dto/assets.dto';
import { AccountMediaFolderService } from './account-media-folder.service';

@Controller('tiktok/accounts/:accountId/backgrounds')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class BackgroundsController {
  constructor(private readonly media: AccountMediaFolderService) {}

  @Get()
  list(@Param('accountId') accountId: string) {
    return this.media.list(accountId, 'backgrounds');
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
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.media.upload(accountId, 'backgrounds', file);
  }

  @Post('bulk-delete')
  bulkRemove(
    @Param('accountId') accountId: string,
    @Body() dto: BulkDeleteAssetsDto,
  ) {
    return this.media.bulkRemove(accountId, 'backgrounds', dto.ids);
  }

  @Delete(':assetId')
  remove(
    @Param('accountId') accountId: string,
    @Param('assetId') assetId: string,
  ) {
    return this.media.remove(accountId, 'backgrounds', assetId);
  }
}
