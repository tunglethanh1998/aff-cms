import { Module } from '@nestjs/common';
import { TokenCryptoService } from '../common/crypto/token-crypto.service';
import { TiktokApiClient } from './tiktok-api.client';
import { TiktokController } from './tiktok.controller';
import { TiktokService } from './tiktok.service';

@Module({
  controllers: [TiktokController],
  providers: [TiktokService, TiktokApiClient, TokenCryptoService],
  exports: [TiktokService],
})
export class TiktokModule {}
