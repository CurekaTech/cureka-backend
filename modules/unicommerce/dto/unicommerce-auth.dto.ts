import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UnicommerceAuthDto {
  @IsOptional()
  @IsString()
  username?: string;

  /** UniCommerce connector may send merchantID instead of username. */
  @IsOptional()
  @IsString()
  merchantID?: string;

  @IsNotEmpty()
  @IsString()
  password!: string;

  /** Ignored for auth; whitelisted so connector payloads do not fail validation. */
  @IsOptional()
  @IsString()
  channelWarehouseCodeToUniwareFacilityCode?: string;

  @IsOptional()
  @IsString()
  authToken?: string;
}
