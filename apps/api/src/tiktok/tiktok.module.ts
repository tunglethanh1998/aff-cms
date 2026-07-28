import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { TokenCryptoService } from '../common/crypto/token-crypto.service';
import { AccountMediaFolderService } from './account-media-folder.service';
import { BackgroundsController } from './backgrounds.controller';
import { PortraitsController } from './portraits.controller';
import { TiktokApiClient } from './tiktok-api.client';
import { TiktokAssetsController } from './tiktok-assets.controller';
import { TiktokController } from './tiktok.controller';
import { TiktokService } from './tiktok.service';

@Module({
  imports: [AssetsModule],
  controllers: [
    TiktokController,
    TiktokAssetsController,
    PortraitsController,
    BackgroundsController,
  ],
  providers: [
    TiktokService,
    TiktokApiClient,
    TokenCryptoService,
    AccountMediaFolderService,
  ],
  exports: [TiktokService, AccountMediaFolderService],
})
export class TiktokModule {}
