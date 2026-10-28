import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateRequestDto {
  @IsUUID()
  createdById!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'title must not be blank' })
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
