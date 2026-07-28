import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DailyProductStatus } from '@prisma/client';
import { AssetsService } from '../assets/assets.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDailyProductDto } from './dto/daily-products.dto';
import { ProductImageSyncService } from './product-image-sync.service';

@Injectable()
export class DailyProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetsService: AssetsService,
    private readonly imageSync: ProductImageSyncService,
  ) {}

  async listByDate(accountId: string, dateInput: string) {
    await this.assertAccount(accountId);
    const date = this.parseDateOnly(dateInput);
    const items = await this.prisma.dailyProduct.findMany({
      where: { accountId, date },
      orderBy: { slot: 'asc' },
      include: {
        folder: true,
      },
    });

    const withAssets = await Promise.all(
      items.map(async (item) => {
        const assets = await this.assetsService.listAssets({
          folderId: item.folderId,
          page: 1,
          limit: 24,
          accountId,
        });
        return this.toPublic(item, assets.items);
      }),
    );

    return {
      accountId,
      date: this.formatDateOnly(date),
      items: withAssets,
    };
  }

  async create(accountId: string, dto: CreateDailyProductDto) {
    await this.assertAccount(accountId);
    const date = this.parseDateOnly(dto.date);
    const productUrl = dto.productUrl.trim();

    const latest = await this.prisma.dailyProduct.findFirst({
      where: { accountId, date },
      orderBy: { slot: 'desc' },
      select: { slot: true },
    });
    const slot = (latest?.slot ?? 0) + 1;
    const { year, day } = this.folderDayParts(date);
    // Stored under account library: account/{id}/YYYY/DD-MM-YYYY/sp_N
    const folderPath = `${year}/${day}/sp_${slot}`;

    const folder = await this.assetsService.ensurePath(folderPath, accountId);

    const created = await this.prisma.dailyProduct.create({
      data: {
        accountId,
        date,
        slot,
        productUrl,
        folderId: folder.id,
        status: DailyProductStatus.PENDING,
      },
      include: { folder: true },
    });

    return this.runSync(accountId, created.id);
  }

  async resync(accountId: string, id: string) {
    const existing = await this.findOwned(accountId, id);

    const currentAssets = await this.prisma.asset.findMany({
      where: { folderId: existing.folderId, accountId },
      select: { id: true },
    });
    if (currentAssets.length > 0) {
      await this.assetsService.bulkDeleteAssets(
        { ids: currentAssets.map((asset) => asset.id) },
        accountId,
      );
    }

    await this.prisma.dailyProduct.update({
      where: { id },
      data: {
        status: DailyProductStatus.PENDING,
        errorMessage: null,
        imageCount: 0,
        title: null,
      },
    });

    return this.runSync(accountId, id);
  }

  async remove(accountId: string, id: string) {
    await this.findOwned(accountId, id);
    await this.prisma.dailyProduct.delete({ where: { id } });
    return { ok: true };
  }

  private async runSync(accountId: string, id: string) {
    const item = await this.prisma.dailyProduct.findFirst({
      where: { id, accountId },
      include: { folder: true },
    });
    if (!item) throw new NotFoundException('Daily product not found');

    await this.prisma.dailyProduct.update({
      where: { id },
      data: {
        status: DailyProductStatus.SYNCING,
        errorMessage: null,
      },
    });

    try {
      const result = await this.imageSync.syncFromProductUrl(
        item.productUrl,
        item.folderId,
        accountId,
      );

      const updated = await this.prisma.dailyProduct.update({
        where: { id },
        data: {
          status: DailyProductStatus.READY,
          title: result.title,
          imageCount: result.imageCount,
          errorMessage: null,
        },
        include: { folder: true },
      });

      const assets = await this.assetsService.listAssets({
        folderId: updated.folderId,
        page: 1,
        limit: 24,
        accountId,
      });
      return this.toPublic(updated, assets.items);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to sync product images';

      const updated = await this.prisma.dailyProduct.update({
        where: { id },
        data: {
          status: DailyProductStatus.FAILED,
          errorMessage: message,
          imageCount: 0,
        },
        include: { folder: true },
      });

      const assets = await this.assetsService.listAssets({
        folderId: updated.folderId,
        page: 1,
        limit: 24,
        accountId,
      });
      return this.toPublic(updated, assets.items);
    }
  }

  private async assertAccount(accountId: string) {
    const account = await this.prisma.tikTokAccount.findUnique({
      where: { id: accountId },
      select: { id: true },
    });
    if (!account) throw new NotFoundException('Account not found');
  }

  private async findOwned(accountId: string, id: string) {
    const existing = await this.prisma.dailyProduct.findFirst({
      where: { id, accountId },
    });
    if (!existing) throw new NotFoundException('Daily product not found');
    return existing;
  }

  private parseDateOnly(input: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
    if (!match) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException('Invalid calendar date');
    }
    return date;
  }

  private formatDateOnly(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private folderDayParts(date: Date): { year: string; day: string } {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return {
      year: String(y),
      day: `${d}-${m}-${y}`,
    };
  }

  private toPublic(
    item: {
      id: string;
      accountId: string;
      date: Date;
      slot: number;
      productUrl: string;
      title: string | null;
      folderId: string;
      status: DailyProductStatus;
      errorMessage: string | null;
      imageCount: number;
      createdAt: Date;
      updatedAt: Date;
      folder: { id: string; name: string; path: string };
    },
    assets: unknown[],
  ) {
    return {
      id: item.id,
      accountId: item.accountId,
      date: this.formatDateOnly(item.date),
      slot: item.slot,
      folderName: `sp_${item.slot}`,
      productUrl: item.productUrl,
      title: item.title,
      folderId: item.folderId,
      folderPath: item.folder.path,
      status: item.status,
      errorMessage: item.errorMessage,
      imageCount: item.imageCount,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      assets,
    };
  }
}
