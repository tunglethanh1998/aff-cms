import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfirmAssetDto,
  CreateFolderDto,
  PresignAssetDto,
  BulkDeleteFoldersDto,
  BulkDeleteAssetsDto,
} from './dto/assets.dto';
import { S3Service } from './s3.service';

const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

export type AssetFolderTreeNode = {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  childCount: number;
  assetCount: number;
  createdAt: Date;
  children: AssetFolderTreeNode[];
};

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  async listFolders(parentId?: string | null) {
    const folders = await this.prisma.assetFolder.findMany({
      where: parentId ? { parentId } : { parentId: null },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { children: true, assets: true } },
      },
    });

    return folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      path: folder.path,
      childCount: folder._count.children,
      assetCount: folder._count.assets,
      createdAt: folder.createdAt,
    }));
  }

  async getFolderTree(): Promise<AssetFolderTreeNode[]> {
    const folders = await this.prisma.assetFolder.findMany({
      orderBy: [{ path: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { children: true, assets: true } },
      },
    });

    const nodes = new Map<string, AssetFolderTreeNode>();
    for (const folder of folders) {
      nodes.set(folder.id, {
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        path: folder.path,
        childCount: folder._count.children,
        assetCount: folder._count.assets,
        createdAt: folder.createdAt,
        children: [],
      });
    }

    const roots: AssetFolderTreeNode[] = [];
    for (const node of nodes.values()) {
      if (node.parentId && nodes.has(node.parentId)) {
        nodes.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    const sortRecursive = (list: AssetFolderTreeNode[]) => {
      list.sort((a, b) => a.name.localeCompare(b.name));
      for (const item of list) sortRecursive(item.children);
    };
    sortRecursive(roots);

    return roots;
  }

  async createFolder(dto: CreateFolderDto) {
    const name = this.sanitizeFolderName(dto.name);
    let parentPath = '';
    let parentId: string | null = null;

    if (dto.parentId) {
      const parent = await this.prisma.assetFolder.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) throw new NotFoundException('Parent folder not found');
      parentPath = parent.path;
      parentId = parent.id;
    }

    const path = parentPath ? `${parentPath}/${name}` : name;
    const existing = await this.prisma.assetFolder.findUnique({
      where: { path },
    });
    if (existing) {
      throw new ConflictException(`Folder already exists: ${path}`);
    }

    return this.prisma.assetFolder.create({
      data: { name, parentId, path },
    });
  }

  async deleteFolder(id: string) {
    const folder = await this.prisma.assetFolder.findUnique({
      where: { id },
      include: {
        _count: { select: { children: true, assets: true } },
      },
    });
    if (!folder) throw new NotFoundException('Folder not found');
    if (folder._count.children > 0 || folder._count.assets > 0) {
      throw new BadRequestException('Folder is not empty');
    }
    await this.prisma.assetFolder.delete({ where: { id } });
    return { ok: true };
  }

  async bulkDeleteFolders(dto: BulkDeleteFoldersDto) {
    const uniqueIds = Array.from(new Set(dto.ids.filter(Boolean)));
    if (uniqueIds.length === 0) {
      throw new BadRequestException('No folder ids provided');
    }

    const folders = await this.prisma.assetFolder.findMany({
      where: { id: { in: uniqueIds } },
      include: {
        _count: { select: { children: true, assets: true } },
      },
    });

    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const ordered = [...folders].sort(
      (a, b) => b.path.split('/').length - a.path.split('/').length,
    );

    const deleted: string[] = [];
    const failed: { id: string; path?: string; reason: string }[] = [];

    for (const id of uniqueIds) {
      if (!byId.has(id)) {
        failed.push({ id, reason: 'Folder not found' });
      }
    }

    for (const folder of ordered) {
      const remainingChildren = await this.prisma.assetFolder.count({
        where: { parentId: folder.id },
      });
      const assetCount = await this.prisma.asset.count({
        where: { folderId: folder.id },
      });

      if (remainingChildren > 0 || assetCount > 0) {
        failed.push({
          id: folder.id,
          path: folder.path,
          reason:
            assetCount > 0
              ? 'Folder still has images'
              : 'Folder still has subfolders',
        });
        continue;
      }

      await this.prisma.assetFolder.delete({ where: { id: folder.id } });
      deleted.push(folder.id);
    }

    return {
      deleted,
      failed,
      deletedCount: deleted.length,
      failedCount: failed.length,
    };
  }

  async listAssets(options: {
    folderId?: string | null;
    page?: number;
    limit?: number;
    q?: string;
  }) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 24));
    const q = options.q?.trim();

    const where = {
      folderId: options.folderId === undefined ? undefined : options.folderId,
      ...(q
        ? {
            OR: [
              { filename: { contains: q, mode: 'insensitive' as const } },
              { originalName: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, assets] = await this.prisma.$transaction([
      this.prisma.asset.count({ where }),
      this.prisma.asset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: assets.map((asset) => this.toPublicAsset(asset)),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      q: q || null,
    };
  }

  async createPresign(dto: PresignAssetDto) {
    this.s3.assertConfigured();
    this.assertImageMime(dto.mimeType);

    const { key } = await this.resolveUploadTarget(
      dto.filename,
      dto.folderId,
    );

    return this.s3.createUploadUrl({
      key,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
    });
  }

  /** Upload via API → S3 (avoids browser CORS / presign signature issues). */
  async uploadImage(file: Express.Multer.File, folderId?: string) {
    this.s3.assertConfigured();
    const mimeType = file.mimetype || 'application/octet-stream';
    this.assertImageMime(mimeType);

    if (!file.buffer?.length) {
      throw new BadRequestException('Empty file');
    }
    if (file.size > 50 * 1024 * 1024) {
      throw new BadRequestException('File too large (max 50MB)');
    }

    const { key, safeName } = await this.resolveUploadTarget(
      file.originalname || 'image',
      folderId,
    );

    const { etag } = await this.s3.putObject({
      key,
      body: file.buffer,
      mimeType,
    });

    return this.confirmUpload({
      key,
      filename: safeName,
      originalName: file.originalname || safeName,
      mimeType,
      sizeBytes: file.size,
      folderId,
      etag,
    });
  }

  async confirmUpload(dto: ConfirmAssetDto) {
    this.s3.assertConfigured();
    this.assertImageMime(dto.mimeType);

    const existing = await this.prisma.asset.findUnique({
      where: { s3Key: dto.key },
    });
    if (existing) {
      return this.toPublicAsset(existing);
    }

    if (dto.folderId) {
      const folder = await this.prisma.assetFolder.findUnique({
        where: { id: dto.folderId },
      });
      if (!folder) throw new NotFoundException('Folder not found');
    }

    const asset = await this.prisma.asset.create({
      data: {
        folderId: dto.folderId || null,
        filename: this.sanitizeFileName(dto.filename),
        originalName: dto.originalName,
        mimeType: dto.mimeType,
        sizeBytes: BigInt(dto.sizeBytes),
        width: dto.width,
        height: dto.height,
        s3Key: dto.key,
        etag: dto.etag,
      },
    });

    return this.toPublicAsset(asset);
  }

  private async resolveUploadTarget(filename: string, folderId?: string) {
    let folderPath: string | null = null;
    if (folderId) {
      const folder = await this.prisma.assetFolder.findUnique({
        where: { id: folderId },
      });
      if (!folder) throw new NotFoundException('Folder not found');
      folderPath = folder.path;
    }

    const safeName = this.sanitizeFileName(filename);
    const key = this.s3.buildObjectKey(
      folderPath,
      `${Date.now()}-${randomBytes(4).toString('hex')}-${safeName}`,
    );
    return { key, safeName, folderPath };
  }

  async deleteAsset(id: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Asset not found');

    try {
      await this.s3.deleteObject(asset.s3Key);
    } catch {
      // Still remove DB record if object already gone
    }

    await this.prisma.asset.delete({ where: { id } });
    return { ok: true };
  }

  async bulkDeleteAssets(dto: BulkDeleteAssetsDto) {
    const uniqueIds = Array.from(new Set(dto.ids.filter(Boolean)));
    if (uniqueIds.length === 0) {
      throw new BadRequestException('No asset ids provided');
    }

    const assets = await this.prisma.asset.findMany({
      where: { id: { in: uniqueIds } },
    });
    const found = new Set(assets.map((asset) => asset.id));

    const deleted: string[] = [];
    const failed: { id: string; reason: string }[] = [];

    for (const id of uniqueIds) {
      if (!found.has(id)) {
        failed.push({ id, reason: 'Asset not found' });
      }
    }

    for (const asset of assets) {
      try {
        try {
          await this.s3.deleteObject(asset.s3Key);
        } catch {
          // Continue — remove DB row even if S3 object is already gone
        }
        await this.prisma.asset.delete({ where: { id: asset.id } });
        deleted.push(asset.id);
      } catch {
        failed.push({ id: asset.id, reason: 'Delete failed' });
      }
    }

    return {
      deleted,
      failed,
      deletedCount: deleted.length,
      failedCount: failed.length,
    };
  }

  async seedDefaultFolders() {
    const defaults = [
      'products',
      'creatives',
      'thumbnails',
      'brand',
      'accounts',
    ];

    for (const name of defaults) {
      const existing = await this.prisma.assetFolder.findUnique({
        where: { path: name },
      });
      if (!existing) {
        await this.prisma.assetFolder.create({
          data: { name, path: name, parentId: null },
        });
      }
    }

    return this.listFolders(null);
  }

  private toPublicAsset(asset: {
    id: string;
    folderId: string | null;
    filename: string;
    originalName: string;
    mimeType: string;
    sizeBytes: bigint;
    width: number | null;
    height: number | null;
    s3Key: string;
    etag: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: asset.id,
      folderId: asset.folderId,
      filename: asset.filename,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes.toString(),
      width: asset.width,
      height: asset.height,
      s3Key: asset.s3Key,
      etag: asset.etag,
      url: this.s3.getPublicUrl(asset.s3Key),
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  private assertImageMime(mimeType: string) {
    if (!IMAGE_MIME.has(mimeType)) {
      throw new BadRequestException(
        'Only image uploads are allowed (jpeg, png, webp, gif, svg)',
      );
    }
  }

  private sanitizeFolderName(name: string) {
    const cleaned = name
      .trim()
      .replace(/[\\/]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .toLowerCase();
    if (!cleaned) throw new BadRequestException('Invalid folder name');
    return cleaned;
  }

  private sanitizeFileName(name: string) {
    const base = name.split(/[\\/]/).pop() || 'image';
    const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_');
    return cleaned.slice(0, 180) || `image-${createHash('md5').update(name).digest('hex').slice(0, 8)}`;
  }
}
