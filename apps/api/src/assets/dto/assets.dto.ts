import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateFolderDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class PresignAssetDto {
  @IsString()
  @MinLength(1)
  filename!: string;

  @IsString()
  @MinLength(1)
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  folderId?: string;
}

export class ConfirmAssetDto {
  @IsString()
  @MinLength(1)
  key!: string;

  @IsString()
  @MinLength(1)
  filename!: string;

  @IsString()
  @MinLength(1)
  originalName!: string;

  @IsString()
  @MinLength(1)
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsString()
  etag?: string;

  @IsOptional()
  @IsInt()
  width?: number;

  @IsOptional()
  @IsInt()
  height?: number;
}

export class BulkDeleteFoldersDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];
}

export class BulkDeleteAssetsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];
}
