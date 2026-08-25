import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const hasStatusValue = (value?: string): boolean => Boolean(value?.trim());

/**
 * One row from Shipway's documented `status_feed`.
 * Docs (shipway.in API 1.1.2): `order_id` + `current_status` (status code, e.g. OOD).
 * Extra keys (awb, courier, scans, …) are allowed by the webhook validation pipe.
 */
export class ShipwayWebhookStatusFeedItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  order_id!: string;

  /** Documented Shipway status code/label for this order. */
  @ValidateIf(
    (item: ShipwayWebhookStatusFeedItemDto) =>
      !hasStatusValue(item.status) && !hasStatusValue(item.current_status_code),
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  current_status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  current_status_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  awb?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  awb_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  awb_no?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  awbno?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  courier_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  carrier?: string;

  @IsOptional()
  courier_id?: string | number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  status_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  status_time?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  time?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

/**
 * Nested `api_input` block from Shipway panel / carrier webhook sample.
 * Only decorated keys survive `whitelist: true`; normalizeEvents reads these.
 */
export class ShipwayWebhookApiInputDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  order_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  current_status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  current_status_desc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  awbno?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  carrier?: string;

  @IsOptional()
  carrier_id?: string | number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  status_time?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  tracking_url?: string;

  /** Scan map: `{ "0": { location, time, status }, ... }` */
  @IsOptional()
  @Allow()
  scans?: Record<string, unknown> | unknown[];

  @IsOptional()
  @Allow()
  extra_fields?: Record<string, unknown>;
}

/**
 * Shipway webhook body shapes we accept:
 * 1. Classic: `{ hash, status_feed: [{ order_id, current_status }] }`
 * 2. Simple: `{ order_id, current_status }`
 * 3. Panel / carrier sample (this is the format we follow for beta):
 *    `{ order_id, current_status, status_time, awbno, carrier, api_input, ... }`
 */
export class ShipwayWebhookDto {
  /** md5(username:licence_key) — documented auth for status_feed posts. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  hash?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShipwayWebhookStatusFeedItemDto)
  status_feed?: ShipwayWebhookStatusFeedItemDto[];

  @ValidateIf((body: ShipwayWebhookDto) => !Array.isArray(body.status_feed))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  order_id?: string;

  @ValidateIf(
    (body: ShipwayWebhookDto) =>
      !Array.isArray(body.status_feed) &&
      !hasStatusValue(body.status) &&
      !hasStatusValue(body.current_status_code) &&
      !hasStatusValue(body.api_input?.current_status),
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  current_status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  event_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  awb?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  awb_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  awb_no?: string;

  /** Shipway panel sample field (no underscore). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  awbno?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  courier_name?: string;

  /** Shipway panel sample courier name. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  carrier?: string;

  @IsOptional()
  courier_id?: string | number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  status_date?: string;

  /** Shipway panel sample timestamp. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  status_time?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  time?: string;

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
  @MaxLength(255)
  scans_current_status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  scans_current_status_time?: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(50)
  store_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  company_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reverse_tracking_number?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ShipwayWebhookApiInputDto)
  api_input?: ShipwayWebhookApiInputDto;
}
