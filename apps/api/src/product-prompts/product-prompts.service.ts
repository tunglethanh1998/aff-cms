import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProductPromptDto,
  UpdateProductPromptDto,
} from './dto/product-prompts.dto';

@Injectable()
export class ProductPromptsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(options: { category?: string; q?: string } = {}) {
    const category = options.category?.trim();
    const q = options.q?.trim();
    const where: Prisma.ProductPromptWhereInput = {
      ...(category
        ? { category: { equals: category, mode: 'insensitive' } }
        : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { category: { contains: q, mode: 'insensitive' } },
              { content: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total, categoryRows] = await this.prisma.$transaction([
      this.prisma.productPrompt.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.productPrompt.count({ where }),
      this.prisma.productPrompt.findMany({
        select: { category: true },
        orderBy: { category: 'asc' },
      }),
    ]);

    const categoryCounts = new Map<string, number>();
    for (const row of categoryRows) {
      categoryCounts.set(
        row.category,
        (categoryCounts.get(row.category) ?? 0) + 1,
      );
    }

    return {
      items,
      total,
      categories: Array.from(categoryCounts, ([name, count]) => ({
        name,
        count,
      })),
    };
  }

  async get(id: string) {
    const prompt = await this.prisma.productPrompt.findUnique({
      where: { id },
    });
    if (!prompt) throw new NotFoundException('Product prompt not found');
    return prompt;
  }

  async create(dto: CreateProductPromptDto) {
    try {
      return await this.prisma.productPrompt.create({
        data: {
          name: this.requiredText(dto.name, 'name'),
          category: this.requiredText(dto.category, 'category'),
          content: this.requiredText(dto.content, 'content'),
        },
      });
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  async update(id: string, dto: UpdateProductPromptDto) {
    await this.get(id);
    if (
      dto.name === undefined &&
      dto.category === undefined &&
      dto.content === undefined
    ) {
      throw new BadRequestException('No prompt fields provided');
    }

    try {
      return await this.prisma.productPrompt.update({
        where: { id },
        data: {
          ...(dto.name !== undefined
            ? { name: this.requiredText(dto.name, 'name') }
            : {}),
          ...(dto.category !== undefined
            ? { category: this.requiredText(dto.category, 'category') }
            : {}),
          ...(dto.content !== undefined
            ? { content: this.requiredText(dto.content, 'content') }
            : {}),
        },
      });
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.productPrompt.delete({ where: { id } });
    return { ok: true };
  }

  private requiredText(value: string, field: string) {
    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException(`${field} cannot be empty`);
    }
    return normalized;
  }

  private rethrowConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'A prompt with this name already exists in the category',
      );
    }
    throw error;
  }
}
