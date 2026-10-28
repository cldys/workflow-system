import { IsString, IsNotEmpty, Matches, MaxLength } from 'class-validator';

export class RejectRequestDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {
    message: 'reason must not be blank',
  })
  @MaxLength(500)
  reason!: string;
}
