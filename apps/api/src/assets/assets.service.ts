import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ZipArchive } from 'archiver';
import { createHash, randomBytes } from 'crypto';
import { PassThrough } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfirmAssetDto,
  CreateFolderDto,
  PresignAssetDto,
  BulkDeleteFoldersDto,
  BulkDeleteAssetsDto,
  DownloadAssetsZipDto,
  UpdateFolderCompanionsDto,
} from './dto/assets.dto';
import {
  composePromptKindForDownload,
  loadComposePrompt,
} from './compose-prompts';
import { S3Service } from './s3.service';

const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

/** null = shared global library; string = account-owned library */
export type AssetScope = string | null;

export type FolderCompanionSummary = {
  id: string;
  originalName: string;
  url: string;
} | null;

export type AssetFolderTreeNode = {
  id: string;
  accountId: string | null;
  name: string;
  parentId: string | null;
  path: string;
  childCount: number;
  assetCount: number;
  portraitAssetId: string | null;
  backgroundAssetId: string | null;
  portrait: FolderCompanionSummary;
  background: FolderCompanionSummary;
  createdAt: Date;
  children: AssetFolderTreeNode[];
};

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  private scopeWhere(accountId: AssetScope) {
    return { accountId: accountId ?? null };
  }

  async ensureAccountLibrary(accountId: string) {
    const account = await this.prisma.tikTokAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) throw new NotFoundException('Account not found');

    const rootPath = `account/${accountId}`;
    let root = await this.prisma.assetFolder.findUnique({
      where: { path: rootPath },
    });

    if (!root) {
      const label =
        account.username ||
        account.displayName ||
        `account-${accountId.slice(0, 8)}`;
      root = await this.prisma.assetFolder.create({
        data: {
          accountId,
          name: this.sanitizeFolderName(label),
          path: rootPath,
          parentId: null,
        },
      });
    } else if (root.accountId !== accountId) {
      throw new ConflictException('Account library path conflict');
    }

    return root;
  }

  async listFolders(parentId: string | null | undefined, accountId: AssetScope) {
    const folders = await this.prisma.assetFolder.findMany({
      where: {
        ...this.scopeWhere(accountId),
        parentId: parentId ? parentId : null,
      },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { children: true, assets: true } },
      },
    });

    return folders.map((folder) => ({
      id: folder.id,
      accountId: folder.accountId,
      name: folder.name,
      parentId: folder.parentId,
      path: folder.path,
      childCount: folder._count.children,
      assetCount: folder._count.assets,
      createdAt: folder.createdAt,
    }));
  }

  async getFolderTree(accountId: AssetScope): Promise<AssetFolderTreeNode[]> {
    const folders = await this.prisma.assetFolder.findMany({
      where: this.scopeWhere(accountId),
      orderBy: [{ path: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { children: true, assets: true } },
        portraitAsset: true,
        backgroundAsset: true,
      },
    });

    const nodes = new Map<string, AssetFolderTreeNode>();
    for (const folder of folders) {
      nodes.set(folder.id, {
        id: folder.id,
        accountId: folder.accountId,
        name: folder.name,
        parentId: folder.parentId,
        path: folder.path,
        childCount: folder._count.children,
        assetCount: folder._count.assets,
        portraitAssetId: folder.portraitAssetId,
        backgroundAssetId: folder.backgroundAssetId,
        portrait: this.toCompanionSummary(folder.portraitAsset),
        background: this.toCompanionSummary(folder.backgroundAsset),
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

  async createFolder(dto: CreateFolderDto, accountId: AssetScope) {
    const name = this.sanitizeFolderName(dto.name);
    let parentPath = '';
    let parentId: string | null = null;

    if (accountId) {
      await this.ensureAccountLibrary(accountId);
    }

    if (dto.parentId) {
      const parent = await this.prisma.assetFolder.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) throw new NotFoundException('Parent folder not found');
      if ((parent.accountId ?? null) !== (accountId ?? null)) {
        throw new BadRequestException('Parent folder is outside this library');
      }
      parentPath = parent.path;
      parentId = parent.id;
    } else if (accountId) {
      // Account subfolders must live under the account root
      const root = await this.ensureAccountLibrary(accountId);
      parentPath = root.path;
      parentId = root.id;
    }

    const path = parentPath ? `${parentPath}/${name}` : name;
    const existing = await this.prisma.assetFolder.findUnique({
      where: { path },
    });
    if (existing) {
      throw new ConflictException(`Folder already exists: ${path}`);
    }

    return this.prisma.assetFolder.create({
      data: {
        name,
        parentId,
        path,
        accountId: accountId ?? null,
      },
    });
  }

  /**
   * Ensure a nested folder path exists (e.g. `2026/24-07-2026/sp_1`).
   * Creates missing segments; returns the leaf folder.
   */
  async ensurePath(pathInput: string, accountId: AssetScope = null) {
    const segments = pathInput
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => this.sanitizeFolderName(part));

    if (segments.length === 0) {
      throw new BadRequestException('Folder path is required');
    }

    let parentId: string | null = null;
    let parentPath = '';

    if (accountId) {
      const root = await this.ensureAccountLibrary(accountId);
      parentId = root.id;
      parentPath = root.path;
    }

    let leaf = null as Awaited<
      ReturnType<typeof this.prisma.assetFolder.create>
    > | null;

    for (const name of segments) {
      const path = parentPath ? `${parentPath}/${name}` : name;
      let folder = await this.prisma.assetFolder.findUnique({
        where: { path },
      });

      if (folder) {
        if ((folder.accountId ?? null) !== (accountId ?? null)) {
          throw new ConflictException(
            `Folder path belongs to another library: ${path}`,
          );
        }
      } else {
        folder = await this.prisma.assetFolder.create({
          data: {
            name,
            parentId,
            path,
            accountId: accountId ?? null,
          },
        });
      }

      parentId = folder.id;
      parentPath = folder.path;
      leaf = folder;
    }

    return leaf!;
  }

  /** Upload an image buffer into a folder (used by product image sync). */
  async uploadImageBuffer(options: {
    buffer: Buffer;
    mimeType: string;
    filename: string;
    folderId: string;
    accountId?: AssetScope;
  }) {
    const accountId = options.accountId ?? null;
    this.s3.assertConfigured();
    this.assertImageMime(options.mimeType);

    if (!options.buffer?.length) {
      throw new BadRequestException('Empty file');
    }
    if (options.buffer.length > 50 * 1024 * 1024) {
      throw new BadRequestException('File too large (max 50MB)');
    }

    const { key, safeName } = await this.resolveUploadTarget(
      options.filename,
      options.folderId,
      accountId,
    );

    const { etag } = await this.s3.putObject({
      key,
      body: options.buffer,
      mimeType: options.mimeType,
    });

    return this.confirmUpload(
      {
        key,
        filename: safeName,
        originalName: options.filename,
        mimeType: options.mimeType,
        sizeBytes: options.buffer.length,
        folderId: options.folderId,
        etag,
      },
      accountId,
    );
  }

  async deleteFolder(id: string, accountId: AssetScope) {
    const folder = await this.prisma.assetFolder.findUnique({
      where: { id },
      include: {
        _count: { select: { children: true, assets: true } },
      },
    });
    if (!folder) throw new NotFoundException('Folder not found');
    if ((folder.accountId ?? null) !== (accountId ?? null)) {
      throw new NotFoundException('Folder not found');
    }
    if (accountId && folder.path === `account/${accountId}`) {
      throw new BadRequestException('Cannot delete account root folder');
    }
    if (folder._count.children > 0 || folder._count.assets > 0) {
      throw new BadRequestException('Folder is not empty');
    }
    await this.prisma.assetFolder.delete({ where: { id } });
    return { ok: true };
  }

  async bulkDeleteFolders(dto: BulkDeleteFoldersDto, accountId: AssetScope) {
    const uniqueIds = Array.from(new Set(dto.ids.filter(Boolean)));
    if (uniqueIds.length === 0) {
      throw new BadRequestException('No folder ids provided');
    }

    const folders = await this.prisma.assetFolder.findMany({
      where: {
        id: { in: uniqueIds },
        ...this.scopeWhere(accountId),
      },
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
    const rootPath = accountId ? `account/${accountId}` : null;

    for (const id of uniqueIds) {
      if (!byId.has(id)) {
        failed.push({ id, reason: 'Folder not found' });
      }
    }

    for (const folder of ordered) {
      if (rootPath && folder.path === rootPath) {
        failed.push({
          id: folder.id,
          path: folder.path,
          reason: 'Cannot delete account root folder',
        });
        continue;
      }

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
    accountId: AssetScope;
  }) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 24));
    const q = options.q?.trim();

    if (options.folderId) {
      await this.assertFolderInScope(options.folderId, options.accountId);
    }

    const where = {
      ...this.scopeWhere(options.accountId),
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

  async createPresign(dto: PresignAssetDto, accountId: AssetScope) {
    this.s3.assertConfigured();
    this.assertImageMime(dto.mimeType);

    const { key } = await this.resolveUploadTarget(
      dto.filename,
      dto.folderId,
      accountId,
    );

    return this.s3.createUploadUrl({
      key,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
    });
  }

  /** Upload via API → S3 (avoids browser CORS / presign signature issues). */
  async uploadImage(
    file: Express.Multer.File,
    folderId: string | undefined,
    accountId: AssetScope,
  ) {
    this.s3.assertConfigured();
    const mimeType = file.mimetype || 'application/octet-stream';
    this.assertImageMime(mimeType);

    if (!file.buffer?.length) {
      throw new BadRequestException('Empty file');
    }
    if (file.size > 50 * 1024 * 1024) {
      throw new BadRequestException('File too large (max 50MB)');
    }

    let targetFolderId = folderId;
    if (accountId && !targetFolderId) {
      const root = await this.ensureAccountLibrary(accountId);
      targetFolderId = root.id;
    }

    const { key, safeName } = await this.resolveUploadTarget(
      file.originalname || 'image',
      targetFolderId,
      accountId,
    );

    const { etag } = await this.s3.putObject({
      key,
      body: file.buffer,
      mimeType,
    });

    return this.confirmUpload(
      {
        key,
        filename: safeName,
        originalName: file.originalname || safeName,
        mimeType,
        sizeBytes: file.size,
        folderId: targetFolderId,
        etag,
      },
      accountId,
    );
  }

  async confirmUpload(dto: ConfirmAssetDto, accountId: AssetScope) {
    this.s3.assertConfigured();
    this.assertImageMime(dto.mimeType);

    const existing = await this.prisma.asset.findUnique({
      where: { s3Key: dto.key },
    });
    if (existing) {
      if ((existing.accountId ?? null) !== (accountId ?? null)) {
        throw new ConflictException('Asset key already used in another library');
      }
      return this.toPublicAsset(existing);
    }

    let folderId = dto.folderId || null;
    if (folderId) {
      await this.assertFolderInScope(folderId, accountId);
    } else if (accountId) {
      const root = await this.ensureAccountLibrary(accountId);
      folderId = root.id;
    }

    const asset = await this.prisma.asset.create({
      data: {
        accountId: accountId ?? null,
        folderId,
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

  private async resolveUploadTarget(
    filename: string,
    folderId: string | undefined,
    accountId: AssetScope,
  ) {
    let folderPath: string | null = null;
    if (folderId) {
      const folder = await this.assertFolderInScope(folderId, accountId);
      folderPath = folder.path;
    } else if (accountId) {
      const root = await this.ensureAccountLibrary(accountId);
      folderPath = root.path;
    }

    const safeName = this.sanitizeFileName(filename);
    const key = this.s3.buildObjectKey(
      folderPath,
      `${Date.now()}-${randomBytes(4).toString('hex')}-${safeName}`,
    );
    return { key, safeName, folderPath };
  }

  /** Original S3 bytes — no resize/re-encode. */
  async getDownloadPayload(id: string, accountId: AssetScope) {
    this.s3.assertConfigured();
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || (asset.accountId ?? null) !== (accountId ?? null)) {
      throw new NotFoundException('Asset not found');
    }

    const object = await this.s3.getObject(asset.s3Key);
    return {
      kind: 'file' as const,
      body: object.body,
      mimeType: object.contentType || asset.mimeType || 'application/octet-stream',
      filename: this.downloadFileName(asset.originalName, asset.filename),
    };
  }

  async updateFolderCompanions(
    folderId: string,
    dto: UpdateFolderCompanionsDto,
    accountId: AssetScope,
  ) {
    if (!accountId) {
      throw new BadRequestException(
        'Folder companions are only supported for account libraries',
      );
    }

    const folder = await this.assertFolderInScope(folderId, accountId);
    if (
      folder.path.endsWith('/portraits') ||
      folder.path.endsWith('/backgrounds')
    ) {
      throw new BadRequestException(
        'Cannot set companions on portrait/background libraries',
      );
    }

    const assetCount = await this.prisma.asset.count({
      where: { folderId, accountId },
    });
    if (assetCount === 0) {
      throw new BadRequestException(
        'Set portrait/background only on folders that have images',
      );
    }

    const data: {
      portraitAssetId?: string | null;
      backgroundAssetId?: string | null;
    } = {};

    // Only apply fields explicitly sent as string|null.
    // Class-field `undefined` must NOT clear the other companion.
    if (typeof dto.portraitAssetId === 'string' || dto.portraitAssetId === null) {
      if (dto.portraitAssetId) {
        await this.assertCompanionAsset(
          accountId,
          'portraits',
          dto.portraitAssetId,
        );
        data.portraitAssetId = dto.portraitAssetId;
      } else {
        data.portraitAssetId = null;
      }
    }

    if (
      typeof dto.backgroundAssetId === 'string' ||
      dto.backgroundAssetId === null
    ) {
      if (dto.backgroundAssetId) {
        await this.assertCompanionAsset(
          accountId,
          'backgrounds',
          dto.backgroundAssetId,
        );
        data.backgroundAssetId = dto.backgroundAssetId;
      } else {
        data.backgroundAssetId = null;
      }
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No companion fields provided');
    }

    const updated = await this.prisma.assetFolder.update({
      where: { id: folderId },
      data,
      include: {
        _count: { select: { children: true, assets: true } },
        portraitAsset: true,
        backgroundAsset: true,
      },
    });

    return {
      id: updated.id,
      accountId: updated.accountId,
      name: updated.name,
      parentId: updated.parentId,
      path: updated.path,
      childCount: updated._count.children,
      assetCount: updated._count.assets,
      portraitAssetId: updated.portraitAssetId,
      backgroundAssetId: updated.backgroundAssetId,
      portrait: this.toCompanionSummary(updated.portraitAsset),
      background: this.toCompanionSummary(updated.backgroundAsset),
      createdAt: updated.createdAt,
    };
  }

  /**
   * Zip original S3 objects (STORE / no compression).
   * Includes portrait/background set on each selected asset's folder.
   */
  async buildDownloadZip(
    dto: DownloadAssetsZipDto | string[],
    accountId: AssetScope,
  ) {
    this.s3.assertConfigured();
    const ids = Array.isArray(dto) ? dto : dto.ids;

    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) {
      throw new BadRequestException('No asset ids provided');
    }
    if (uniqueIds.length > 100) {
      throw new BadRequestException('Too many assets (max 100 per zip)');
    }

    const assets = await this.prisma.asset.findMany({
      where: {
        id: { in: uniqueIds },
        ...this.scopeWhere(accountId),
      },
    });
    if (assets.length === 0) {
      throw new NotFoundException('No assets found');
    }

    const entries: {
      body: Buffer;
      name: string;
    }[] = [];
    const usedNames = new Set<string>();

    for (const asset of assets) {
      const object = await this.s3.getObject(asset.s3Key);
      const filename = this.uniqueZipEntryName(
        this.downloadFileName(asset.originalName, asset.filename),
        usedNames,
      );
      entries.push({ body: object.body, name: filename });
    }

    if (accountId) {
      let hasBackground = false;
      const folderIds = Array.from(
        new Set(
          assets
            .map((asset) => asset.folderId)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      if (folderIds.length > 0) {
        const folders = await this.prisma.assetFolder.findMany({
          where: {
            id: { in: folderIds },
            accountId,
          },
          select: {
            portraitAssetId: true,
            backgroundAssetId: true,
          },
        });

        const portraitIds = Array.from(
          new Set(
            folders
              .map((folder) => folder.portraitAssetId)
              .filter((id): id is string => Boolean(id)),
          ),
        );
        const backgroundIds = Array.from(
          new Set(
            folders
              .map((folder) => folder.backgroundAssetId)
              .filter((id): id is string => Boolean(id)),
          ),
        );
        hasBackground = backgroundIds.length > 0;

        for (const portraitAssetId of portraitIds) {
          await this.appendCompanionEntry({
            accountId,
            assetId: portraitAssetId,
            folderName: 'portraits',
            zipPrefix: 'portrait',
            selectedIds: uniqueIds,
            entries,
            usedNames,
          });
        }

        for (const backgroundAssetId of backgroundIds) {
          await this.appendCompanionEntry({
            accountId,
            assetId: backgroundAssetId,
            folderName: 'backgrounds',
            zipPrefix: 'background',
            selectedIds: uniqueIds,
            entries,
            usedNames,
          });
        }
      }

      const prompt = loadComposePrompt(
        composePromptKindForDownload(hasBackground),
      );
      entries.push({
        body: prompt.body,
        name: this.uniqueZipEntryName(prompt.filename, usedNames),
      });
    }

    const passThrough = new PassThrough();
    const archive = new ZipArchive({ store: true });
    archive.on('error', (err: Error) => {
      passThrough.destroy(err);
    });
    archive.pipe(passThrough);

    void (async () => {
      try {
        for (const entry of entries) {
          archive.append(entry.body, { name: entry.name, store: true });
        }
        await archive.finalize();
      } catch (err) {
        passThrough.destroy(
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    })();

    return {
      stream: passThrough,
      filename: `assets-${new Date().toISOString().slice(0, 10)}.zip`,
    };
  }

  private async appendCompanionEntry(options: {
    accountId: string;
    assetId: string;
    folderName: 'portraits' | 'backgrounds';
    zipPrefix: string;
    selectedIds: string[];
    entries: { body: Buffer; name: string }[];
    usedNames: Set<string>;
  }) {
    if (options.selectedIds.includes(options.assetId)) return;

    const folder = await this.prisma.assetFolder.findUnique({
      where: { path: `account/${options.accountId}/${options.folderName}` },
    });
    if (!folder) {
      throw new NotFoundException(`${options.folderName} library not found`);
    }

    const asset = await this.prisma.asset.findFirst({
      where: {
        id: options.assetId,
        accountId: options.accountId,
        folderId: folder.id,
      },
    });
    if (!asset) {
      throw new NotFoundException(
        `${options.zipPrefix} not found in this account`,
      );
    }

    const object = await this.s3.getObject(asset.s3Key);
    const ext =
      this.fileExtension(
        this.downloadFileName(asset.originalName, asset.filename),
      ) || 'jpg';
    const name = this.uniqueZipEntryName(
      `${options.zipPrefix}.${ext}`,
      options.usedNames,
    );
    options.entries.push({ body: object.body, name });
  }

  private fileExtension(filename: string) {
    const dot = filename.lastIndexOf('.');
    if (dot <= 0 || dot === filename.length - 1) return '';
    return filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  async deleteAsset(id: string, accountId: AssetScope) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || (asset.accountId ?? null) !== (accountId ?? null)) {
      throw new NotFoundException('Asset not found');
    }

    try {
      await this.s3.deleteObject(asset.s3Key);
    } catch {
      // Still remove DB record if object already gone
    }

    await this.prisma.asset.delete({ where: { id } });
    return { ok: true };
  }

  private downloadFileName(originalName: string, fallback: string) {
    const base = (originalName || fallback || 'image').split(/[\\/]/).pop()!;
    const cleaned = base.replace(/[^\w.\-() ]+/g, '_').trim() || 'image';
    return cleaned.slice(0, 180);
  }

  private uniqueZipEntryName(name: string, used: Set<string>) {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let i = 2;
    let candidate = `${stem}-${i}${ext}`;
    while (used.has(candidate)) {
      i += 1;
      candidate = `${stem}-${i}${ext}`;
    }
    used.add(candidate);
    return candidate;
  }

  async bulkDeleteAssets(dto: BulkDeleteAssetsDto, accountId: AssetScope) {
    const uniqueIds = Array.from(new Set(dto.ids.filter(Boolean)));
    if (uniqueIds.length === 0) {
      throw new BadRequestException('No asset ids provided');
    }

    const assets = await this.prisma.asset.findMany({
      where: {
        id: { in: uniqueIds },
        ...this.scopeWhere(accountId),
      },
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
          data: {
            name,
            path: name,
            parentId: null,
            accountId: null,
          },
        });
      }
    }

    return this.listFolders(null, null);
  }

  private async assertFolderInScope(folderId: string, accountId: AssetScope) {
    const folder = await this.prisma.assetFolder.findUnique({
      where: { id: folderId },
    });
    if (!folder || (folder.accountId ?? null) !== (accountId ?? null)) {
      throw new NotFoundException('Folder not found');
    }
    return folder;
  }

  private async assertCompanionAsset(
    accountId: string,
    kind: 'portraits' | 'backgrounds',
    assetId: string,
  ) {
    const library = await this.prisma.assetFolder.findUnique({
      where: { path: `account/${accountId}/${kind}` },
    });
    if (!library) {
      throw new NotFoundException(`${kind} library not found`);
    }

    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        accountId,
        folderId: library.id,
      },
    });
    if (!asset) {
      throw new NotFoundException(`${kind} asset not found`);
    }
    return asset;
  }

  private toCompanionSummary(
    asset: {
      id: string;
      originalName: string;
      s3Key: string;
    } | null,
  ): FolderCompanionSummary {
    if (!asset) return null;
    return {
      id: asset.id,
      originalName: asset.originalName,
      url: this.s3.getPublicUrl(asset.s3Key),
    };
  }

  private toPublicAsset(asset: {
    id: string;
    accountId: string | null;
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
      accountId: asset.accountId,
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
    return (
      cleaned.slice(0, 180) ||
      `image-${createHash('md5').update(name).digest('hex').slice(0, 8)}`
    );
  }
}
