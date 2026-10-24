import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
