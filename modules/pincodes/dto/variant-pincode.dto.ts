import { ArrayMaxSize, IsArray, IsBoolean, IsString, Matches } from 'class-validator';
import { INDIAN_PINCODE_REGEX } from '@modules/cod-blocklist/utils/pincode.util';

export class UpdateProductPincodeManagementDto {
  @IsBoolean()
  isPincodeManaged!: boolean;
}

export class ReplaceProductPincodesDto {
  @IsArray()
  @ArrayMaxSize(20000)
  @IsString({ each: true })
  @Matches(INDIAN_PINCODE_REGEX, { each: true, message: 'each pincode must be a 6-digit Indian pincode' })
  pincodes!: string[];
}
