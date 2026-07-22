import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { S3Service } from './s3.service';

@Module({
  controllers: [AssetsController],
  providers: [AssetsService, S3Service],
  exports: [AssetsService, S3Service],
})
export class AssetsModule {}
