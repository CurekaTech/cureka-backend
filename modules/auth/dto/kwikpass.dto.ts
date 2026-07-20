import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class KwikpassExchangeDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(8192)
  kpToken!: string;
}
