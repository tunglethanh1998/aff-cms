import { Module } from '@nestjs/common';
import { ProductPromptsController } from './product-prompts.controller';
import { ProductPromptsService } from './product-prompts.service';

@Module({
  controllers: [ProductPromptsController],
  providers: [ProductPromptsService],
})
export class ProductPromptsModule {}
