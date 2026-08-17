import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Validate,
} from 'class-validator';

@ValidatorConstraint({ name: 'shipwayWebhookShape', async: false })
class ShipwayWebhookShapeConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const body = args.object as ShipwayWebhookDto;
    if (Array.isArray(body.status_feed) && body.status_feed.length > 0) {
      return Boolean(body.hash?.trim());
    }
    return Boolean(body.order_id?.trim() && body.status?.trim());
  }

  defaultMessage(): string {
    return 'Webhook must include status_feed+hash (classic Shipway) or order_id+status (single event)';
  }
}

export class ShipwayWebhookStatusFeedItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  order_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  current_status!: string;
}

/**
 * Accepts both documented classic Shipway webhooks (`hash` + `status_feed`)
 * and the single-event shape already used by Cureka (`order_id` + `status`).
 */
@Validate(ShipwayWebhookShapeConstraint)
export class ShipwayWebhookDto {
  /** Classic Shipway: md5(username:licence_key). */
  @ValidateIf((o: ShipwayWebhookDto) => Array.isArray(o.status_feed) && o.status_feed.length > 0)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  hash?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ShipwayWebhookStatusFeedItemDto)
  status_feed?: ShipwayWebhookStatusFeedItemDto[];

  @ValidateIf((o: ShipwayWebhookDto) => !o.status_feed?.length)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  order_id?: string;

  @ValidateIf((o: ShipwayWebhookDto) => !o.status_feed?.length)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  event_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  awb_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  courier_name?: string;

  @IsOptional()
  courier_id?: string | number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  status_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  tracking_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  label_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  invoice_url?: string;

  @IsOptional()
  pickup_id?: string | number;

  @IsOptional()
  shipment_id?: string | number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  status_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  current_status_code?: string;
}
