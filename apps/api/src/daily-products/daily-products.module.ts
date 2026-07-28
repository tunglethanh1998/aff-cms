import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { DailyProductsController } from './daily-products.controller';
import { DailyProductsService } from './daily-products.service';
import { ProductImageSyncService } from './product-image-sync.service';

@Module({
  imports: [AssetsModule],
  controllers: [DailyProductsController],
  providers: [DailyProductsService, ProductImageSyncService],
})
export class DailyProductsModule {}
