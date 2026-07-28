import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProductPromptDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50_000)
  content!: string;
}

export class UpdateProductPromptDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50_000)
  content?: string;
}
