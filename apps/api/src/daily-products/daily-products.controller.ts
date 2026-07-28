import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DailyProductsService } from './daily-products.service';
import { CreateDailyProductDto } from './dto/daily-products.dto';

@Controller('tiktok/accounts/:accountId/daily-products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class DailyProductsController {
  constructor(private readonly dailyProductsService: DailyProductsService) {}

  @Get()
  list(
    @Param('accountId') accountId: string,
    @Query('date') date?: string,
  ) {
    return this.dailyProductsService.listByDate(
      accountId,
      date || this.todayLocalYmd(),
    );
  }

  @Post()
  create(
    @Param('accountId') accountId: string,
    @Body() dto: CreateDailyProductDto,
  ) {
    return this.dailyProductsService.create(accountId, dto);
  }

  @Post(':id/resync')
  resync(
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.dailyProductsService.resync(accountId, id);
  }

  @Delete(':id')
  remove(
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.dailyProductsService.remove(accountId, id);
  }

  private todayLocalYmd() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
