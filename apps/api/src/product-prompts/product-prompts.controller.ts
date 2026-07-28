import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateProductPromptDto,
  UpdateProductPromptDto,
} from './dto/product-prompts.dto';
import { ProductPromptsService } from './product-prompts.service';

@Controller('product-prompts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ProductPromptsController {
  constructor(private readonly productPrompts: ProductPromptsService) {}

  @Get()
  list(@Query('category') category?: string, @Query('q') q?: string) {
    return this.productPrompts.list({ category, q });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.productPrompts.get(id);
  }

  @Post()
  create(@Body() dto: CreateProductPromptDto) {
    return this.productPrompts.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductPromptDto) {
    return this.productPrompts.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productPrompts.remove(id);
  }
}
