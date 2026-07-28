import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssetsService } from '../assets/assets.service';
import { PrismaService } from '../prisma/prisma.service';

export type AccountMediaKind = 'portraits' | 'backgrounds';

@Injectable()
export class AccountMediaFolderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetsService: AssetsService,
  ) {}

  async list(accountId: string, kind: AccountMediaKind) {
    await this.assertAccount(accountId);
    const folder = await this.ensureFolder(accountId, kind);
    const page = await this.assetsService.listAssets({
      folderId: folder.id,
      page: 1,
      limit: 100,
      accountId,
    });

    return {
      kind,
      folderId: folder.id,
      folderPath: folder.path,
      items: page.items,
    };
  }

  async upload(
    accountId: string,
    kind: AccountMediaKind,
    file: Express.Multer.File,
  ) {
    await this.assertAccount(accountId);
    const folder = await this.ensureFolder(accountId, kind);
    return this.assetsService.uploadImage(file, folder.id, accountId);
  }

  async remove(accountId: string, kind: AccountMediaKind, assetId: string) {
    return this.bulkRemove(accountId, kind, [assetId]);
  }

  async bulkRemove(
    accountId: string,
    kind: AccountMediaKind,
    ids: string[],
  ) {
    await this.assertAccount(accountId);
    const folder = await this.ensureFolder(accountId, kind);
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) {
      throw new BadRequestException(`No ${kind} ids provided`);
    }

    const assets = await this.prisma.asset.findMany({
      where: {
        id: { in: uniqueIds },
        accountId,
        folderId: folder.id,
      },
      select: { id: true },
    });
    if (assets.length === 0) {
      throw new NotFoundException(`No ${kind} found`);
    }

    const foundIds = assets.map((asset) => asset.id);
    await this.assetsService.bulkDeleteAssets({ ids: foundIds }, accountId);
    const list = await this.list(accountId, kind);
    return {
      ...list,
      deletedCount: foundIds.length,
      failedCount: uniqueIds.length - foundIds.length,
    };
  }

  async assertOwnedAsset(
    accountId: string,
    kind: AccountMediaKind,
    assetId: string,
  ) {
    const folder = await this.ensureFolder(accountId, kind);
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        accountId,
        folderId: folder.id,
      },
    });
    if (!asset) {
      throw new NotFoundException(`${kind} asset not found`);
    }
    return asset;
  }

  private async ensureFolder(accountId: string, kind: AccountMediaKind) {
    return this.assetsService.ensurePath(kind, accountId);
  }

  private async assertAccount(accountId: string) {
    const account = await this.prisma.tikTokAccount.findUnique({
      where: { id: accountId },
      select: { id: true },
    });
    if (!account) throw new NotFoundException('Account not found');
  }
}
