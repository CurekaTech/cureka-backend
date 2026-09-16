import { Injectable } from '@nestjs/common';
import { buildPaginatedResult, buildPaginationOptions } from '@packages/common';
import { DataSource } from 'typeorm';
import { AdminOrderHistoryQueryDto } from '../dto/order.dto';
import { CancellationStatus } from '../enums/cancellation-status.enum';

type HistoryRow = {
  recordType: 'CANCELLATION' | 'RETURN';
  id: string;
  orderId: string;
  orderNumber: string;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerMobile: string | null;
  workflowStatus: string;
  unicommerceStatus: string | null;
  shipwayStatus: string | null;
  lastError: string | null;
  reason: string | null;
  requestedAt: Date;
  attemptCount: number | null;
  reverseAwb: string | null;
};

@Injectable()
export class OrderHistoryService {
  constructor(private readonly dataSource: DataSource) {}

  async list(query: AdminOrderHistoryQueryDto) {
    const pagination = buildPaginationOptions(query);
    const requestType = query.requestType;
    const includeCancellations = requestType !== 'RETURN';
    const includeReturns = requestType !== 'CANCELLATION';

    const params: unknown[] = [];
    const push = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    const searchSql = query.search?.trim()
      ? `AND (
          o.order_number ILIKE ${push('%' + query.search.trim() + '%')}
          OR o.ref_id ILIKE ${push('%' + query.search.trim() + '%')}
          OR COALESCE(u.first_name, '') ILIKE ${push('%' + query.search.trim() + '%')}
          OR COALESCE(u.last_name, '') ILIKE ${push('%' + query.search.trim() + '%')}
          OR COALESCE(u.email, '') ILIKE ${push('%' + query.search.trim() + '%')}
          OR COALESCE(u.mobile_number, '') ILIKE ${push('%' + query.search.trim() + '%')}
        )`
      : '';

    const fromSql = query.fromDate ? `AND requested_at >= ${push(query.fromDate)}` : '';
    const toSql = query.toDate ? `AND requested_at <= ${push(query.toDate)}` : '';

    const cancellationStatusFilter = query.unverifiedOnly
      ? `AND o.cancellation_status = '${CancellationStatus.HISTORICAL_UNVERIFIED}'`
      : query.requiresAttention
        ? `AND o.cancellation_status = '${CancellationStatus.REQUIRES_ATTENTION}'`
        : query.pendingExternalSync
          ? `AND o.cancellation_status IN ('${CancellationStatus.PROCESSING}', '${CancellationStatus.REQUIRES_ATTENTION}')`
          : query.workflowStatus
            ? `AND o.cancellation_status = ${push(query.workflowStatus)}`
            : `AND o.cancellation_status <> '${CancellationStatus.NONE}'`;

    const returnStatusFilter = query.unverifiedOnly
      ? 'AND FALSE'
      : query.requiresAttention
        ? `AND (
            rp.shipway_booking_status IN ('FAILED', 'UNCERTAIN', 'UNSUPPORTED')
            OR rp.unicommerce_sync_status IN ('FAILED', 'UNCERTAIN', 'UNSUPPORTED')
            OR rp.failure_reason IS NOT NULL
          )`
        : query.pendingExternalSync
          ? `AND (
              rp.shipway_booking_status IN ('PENDING', 'FAILED', 'UNCERTAIN')
              OR (r.status = 'APPROVED' AND r.pickup_required = true AND rp.id IS NULL)
            )`
          : query.workflowStatus
            ? `AND r.status = ${push(query.workflowStatus)}`
            : '';

    const cancellationSelect = `
      SELECT
        'CANCELLATION'::text AS record_type,
        o.id::text AS id,
        o.id::text AS order_id,
        o.order_number AS order_number,
        o.user_id::text AS customer_id,
        NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), '') AS customer_name,
        u.email AS customer_email,
        u.mobile_number AS customer_mobile,
        o.cancellation_status AS workflow_status,
        o.cancellation_unicommerce_status AS unicommerce_status,
        o.cancellation_shipway_status AS shipway_status,
        o.cancellation_sync_error AS last_error,
        o.cancel_reason AS reason,
        COALESCE(o.cancellation_requested_at, o.cancelled_at, o.updated_at) AS requested_at,
        o.cancellation_attempt_count AS attempt_count,
        NULL::text AS reverse_awb
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE o.deleted_at IS NULL
        ${cancellationStatusFilter}
        ${searchSql}
    `;

    const returnSelect = `
      SELECT
        'RETURN'::text AS record_type,
        r.id::text AS id,
        r.order_id::text AS order_id,
        r.order_number AS order_number,
        r.customer_id::text AS customer_id,
        NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), '') AS customer_name,
        u.email AS customer_email,
        u.mobile_number AS customer_mobile,
        r.status AS workflow_status,
        rp.unicommerce_sync_status AS unicommerce_status,
        rp.shipway_booking_status AS shipway_status,
        rp.failure_reason AS last_error,
        r.reason_title AS reason,
        r.created_at AS requested_at,
        rp.attempt_count AS attempt_count,
        rp.reverse_awb_number AS reverse_awb
      FROM return_requests r
      LEFT JOIN users u ON u.id = r.customer_id
      LEFT JOIN LATERAL (
        SELECT *
        FROM return_pickups p
        WHERE p.return_request_id = r.id AND p.deleted_at IS NULL
        ORDER BY p.created_at DESC
        LIMIT 1
      ) rp ON TRUE
      WHERE r.deleted_at IS NULL
        ${returnStatusFilter}
        ${searchSql.replaceAll('o.order_number', 'r.order_number').replaceAll('o.ref_id', 'r.ref_id')}
    `;

    const unions: string[] = [];
    if (includeCancellations) unions.push(`(${cancellationSelect})`);
    if (includeReturns) unions.push(`(${returnSelect})`);

    const combined = `
      SELECT * FROM (
        ${unions.join(' UNION ALL ')}
      ) history
      WHERE 1=1
      ${fromSql}
      ${toSql}
      ORDER BY requested_at DESC
      LIMIT ${push(pagination.limit)} OFFSET ${push((pagination.page - 1) * pagination.limit)}
    `;

    const countSql = `
      SELECT COUNT(*)::int AS total FROM (
        ${unions.join(' UNION ALL ')}
      ) history
      WHERE 1=1
      ${fromSql}
      ${toSql}
    `;

    const [rows, countRows] = await Promise.all([
      this.dataSource.query(combined, params) as Promise<
        Array<{
          record_type: 'CANCELLATION' | 'RETURN';
          id: string;
          order_id: string;
          order_number: string;
          customer_id: string | null;
          customer_name: string | null;
          customer_email: string | null;
          customer_mobile: string | null;
          workflow_status: string;
          unicommerce_status: string | null;
          shipway_status: string | null;
          last_error: string | null;
          reason: string | null;
          requested_at: Date;
          attempt_count: number | null;
          reverse_awb: string | null;
        }>
      >,
      this.dataSource.query(countSql, params.slice(0, params.length - 2)) as Promise<
        Array<{ total: number }>
      >,
    ]);

    const mapped: HistoryRow[] = rows.map((row) => ({
      recordType: row.record_type,
      id: row.id,
      orderId: row.order_id,
      orderNumber: row.order_number,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      customerMobile: row.customer_mobile,
      workflowStatus: row.workflow_status,
      unicommerceStatus: row.unicommerce_status,
      shipwayStatus: row.shipway_status,
      lastError: row.last_error,
      reason: row.reason,
      requestedAt: row.requested_at,
      attemptCount: row.attempt_count,
      reverseAwb: row.reverse_awb,
    }));

    return buildPaginatedResult(mapped, countRows[0]?.total ?? 0, pagination);
  }
}
