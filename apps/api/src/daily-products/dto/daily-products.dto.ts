import { IsString, IsUrl, Matches, MinLength } from 'class-validator';

export class CreateDailyProductDto {
  /** Calendar date as YYYY-MM-DD */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be YYYY-MM-DD',
  })
  date!: string;

  @IsString()
  @MinLength(1)
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  productUrl!: string;
}
