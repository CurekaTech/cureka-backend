import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 Doctor + Consultation schema foundation.
 */
export class CreateDoctorConsultationTables1786030000000 implements MigrationInterface {
  name = 'CreateDoctorConsultationTables1786030000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."doctor_master_status_enum" AS ENUM ('active', 'inactive')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."doctors_category_enum" AS ENUM ('DOCTOR', 'EXPERT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."doctors_status_enum" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED', 'INACTIVE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."doctor_consultation_configs_pricing_type_enum" AS ENUM ('FREE', 'PAID')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."doctor_documents_doc_type_enum" AS ENUM ('CERTIFICATION', 'SUPPORTING', 'IDENTITY', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."doctor_slots_status_enum" AS ENUM ('OPEN', 'HELD', 'BOOKED', 'BLOCKED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."doctor_legal_documents_type_enum" AS ENUM ('TERMS_AND_CONDITIONS', 'PRIVACY_POLICY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."doctor_legal_document_versions_status_enum" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."consultations_status_enum" AS ENUM ('DRAFT', 'AWAITING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_DOCTOR', 'CANCELLED_BY_ADMIN', 'RESCHEDULED', 'EXPIRED', 'PAYMENT_RECEIVED_NEEDS_REALLOCATION')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."consultations_pricing_type_enum" AS ENUM ('FREE', 'PAID')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."consultations_payment_status_enum" AS ENUM ('NONE', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."consultations_attendance_status_enum" AS ENUM ('PENDING', 'PRESENT', 'NO_SHOW')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."follow_up_recommendation_status_enum" AS ENUM ('OPEN', 'BOOKED', 'EXPIRED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."follow_up_pricing_mode_enum" AS ENUM ('FREE', 'PAID', 'INHERIT_DOCTOR_FEE')`,
    );

    await queryRunner.query(`
      CREATE TABLE "doctor_specializations_master" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "name" character varying(255) NOT NULL,
        "slug" character varying(280) NOT NULL,
        "status" "public"."doctor_master_status_enum" NOT NULL DEFAULT 'active',
        CONSTRAINT "PK_doctor_specializations_master" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_specializations_master_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_doctor_specializations_master_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "doctor_languages_master" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "name" character varying(255) NOT NULL,
        "code" character varying(16) NOT NULL,
        "status" "public"."doctor_master_status_enum" NOT NULL DEFAULT 'active',
        CONSTRAINT "PK_doctor_languages_master" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_languages_master_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_doctor_languages_master_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "doctor_qualifications_master" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "name" character varying(255) NOT NULL,
        "status" "public"."doctor_master_status_enum" NOT NULL DEFAULT 'active',
        CONSTRAINT "PK_doctor_qualifications_master" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_qualifications_master_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_doctor_qualifications_master_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "doctors" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "category" "public"."doctors_category_enum" NOT NULL,
        "full_name" character varying(255) NOT NULL,
        "profile_photo" jsonb,
        "email" character varying(255) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "must_change_password" boolean NOT NULL DEFAULT true,
        "phone" character varying(20),
        "registration_number" character varying(100),
        "years_experience" integer NOT NULL DEFAULT 0,
        "bio" text,
        "status" "public"."doctors_status_enum" NOT NULL DEFAULT 'DRAFT',
        "rejection_reason" text,
        "is_active" boolean NOT NULL DEFAULT false,
        "is_bookable" boolean NOT NULL DEFAULT false,
        "last_login_at" TIMESTAMPTZ,
        "slug" character varying(280) NOT NULL,
        CONSTRAINT "PK_doctors" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctors_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_doctors_email" UNIQUE ("email"),
        CONSTRAINT "UQ_doctors_slug" UNIQUE ("slug")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_doctors_status" ON "doctors" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_doctors_category" ON "doctors" ("category")`);

    await queryRunner.query(`
      CREATE TABLE "doctor_qualification_maps" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "doctor_id" uuid NOT NULL,
        "qualification_id" uuid NOT NULL,
        CONSTRAINT "PK_doctor_qualification_maps" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_qualification_maps_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_doctor_qualification_maps_pair" UNIQUE ("doctor_id", "qualification_id"),
        CONSTRAINT "FK_doctor_qualification_maps_doctor" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_doctor_qualification_maps_qualification" FOREIGN KEY ("qualification_id") REFERENCES "doctor_qualifications_master"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "doctor_specialization_maps" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "doctor_id" uuid NOT NULL,
        "specialization_id" uuid NOT NULL,
        CONSTRAINT "PK_doctor_specialization_maps" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_specialization_maps_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_doctor_specialization_maps_pair" UNIQUE ("doctor_id", "specialization_id"),
        CONSTRAINT "FK_doctor_specialization_maps_doctor" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_doctor_specialization_maps_specialization" FOREIGN KEY ("specialization_id") REFERENCES "doctor_specializations_master"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "doctor_language_maps" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "doctor_id" uuid NOT NULL,
        "language_id" uuid NOT NULL,
        CONSTRAINT "PK_doctor_language_maps" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_language_maps_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_doctor_language_maps_pair" UNIQUE ("doctor_id", "language_id"),
        CONSTRAINT "FK_doctor_language_maps_doctor" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_doctor_language_maps_language" FOREIGN KEY ("language_id") REFERENCES "doctor_languages_master"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "doctor_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "doctor_id" uuid NOT NULL,
        "doc_type" "public"."doctor_documents_doc_type_enum" NOT NULL DEFAULT 'SUPPORTING',
        "file" jsonb NOT NULL,
        "mime_type" character varying(120),
        "original_name" character varying(255),
        CONSTRAINT "PK_doctor_documents" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_documents_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_doctor_documents_doctor" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "doctor_clinic_associations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "doctor_id" uuid NOT NULL,
        "name" character varying(255) NOT NULL,
        "address_line1" character varying(255) NOT NULL,
        "address_line2" character varying(255),
        "city" character varying(100) NOT NULL,
        "state" character varying(100) NOT NULL,
        "pincode" character varying(20) NOT NULL,
        "latitude" numeric(10,7),
        "longitude" numeric(10,7),
        "is_primary" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_doctor_clinic_associations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_clinic_associations_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_doctor_clinic_associations_doctor" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "doctor_consultation_configs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "doctor_id" uuid NOT NULL,
        "pricing_type" "public"."doctor_consultation_configs_pricing_type_enum" NOT NULL DEFAULT 'PAID',
        "amount" numeric(12,2),
        "currency" character varying(3) NOT NULL DEFAULT 'INR',
        "duration_minutes" integer NOT NULL DEFAULT 30,
        "buffer_minutes" integer NOT NULL DEFAULT 0,
        "max_per_day" integer,
        "advance_window_days" integer NOT NULL DEFAULT 30,
        "same_day_cutoff_minutes" integer,
        "enabled_modes" jsonb NOT NULL DEFAULT '["OFFLINE"]',
        CONSTRAINT "PK_doctor_consultation_configs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_consultation_configs_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_doctor_consultation_configs_doctor_id" UNIQUE ("doctor_id"),
        CONSTRAINT "FK_doctor_consultation_configs_doctor" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "doctor_bank_details" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "doctor_id" uuid NOT NULL,
        "account_holder_name" character varying(255) NOT NULL,
        "account_number_encrypted" text NOT NULL,
        "account_last4" character varying(4) NOT NULL,
        "ifsc_code" character varying(20) NOT NULL,
        "bank_name" character varying(255),
        CONSTRAINT "PK_doctor_bank_details" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_bank_details_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_doctor_bank_details_doctor_id" UNIQUE ("doctor_id"),
        CONSTRAINT "FK_doctor_bank_details_doctor" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "doctor_availabilities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "doctor_id" uuid NOT NULL,
        "clinic_id" uuid NOT NULL,
        "weekday" smallint NOT NULL,
        "start_time" TIME NOT NULL,
        "end_time" TIME NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_doctor_availabilities" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_availabilities_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_doctor_availabilities_doctor" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_doctor_availabilities_clinic" FOREIGN KEY ("clinic_id") REFERENCES "doctor_clinic_associations"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "doctor_slots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "doctor_id" uuid NOT NULL,
        "clinic_id" uuid NOT NULL,
        "start_at" TIMESTAMPTZ NOT NULL,
        "end_at" TIMESTAMPTZ NOT NULL,
        "status" "public"."doctor_slots_status_enum" NOT NULL DEFAULT 'OPEN',
        "hold_expires_at" TIMESTAMPTZ,
        "held_by_consultation_id" uuid,
        CONSTRAINT "PK_doctor_slots" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_slots_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_doctor_slots_doctor_start" UNIQUE ("doctor_id", "start_at"),
        CONSTRAINT "FK_doctor_slots_doctor" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_doctor_slots_clinic" FOREIGN KEY ("clinic_id") REFERENCES "doctor_clinic_associations"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_doctor_slots_status" ON "doctor_slots" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_doctor_slots_start_at" ON "doctor_slots" ("start_at")`);

    await queryRunner.query(`
      CREATE TABLE "doctor_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "doctor_id" uuid NOT NULL,
        "refresh_token_hash" character varying(64) NOT NULL,
        "device_id" character varying(64),
        "device_name" character varying(120),
        "ip_address" character varying(45),
        "user_agent" character varying(500),
        "last_activity" TIMESTAMPTZ NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "is_revoked" boolean NOT NULL DEFAULT false,
        "revoked_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_doctor_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_sessions_refresh_token_hash" UNIQUE ("refresh_token_hash"),
        CONSTRAINT "FK_doctor_sessions_doctor" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "doctor_legal_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "type" "public"."doctor_legal_documents_type_enum" NOT NULL,
        "title" character varying(255) NOT NULL,
        "current_published_version_id" uuid,
        CONSTRAINT "PK_doctor_legal_documents" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_legal_documents_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_doctor_legal_documents_type" UNIQUE ("type")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "doctor_legal_document_versions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "document_id" uuid NOT NULL,
        "version_number" integer NOT NULL,
        "content_html" text NOT NULL,
        "status" "public"."doctor_legal_document_versions_status_enum" NOT NULL DEFAULT 'DRAFT',
        "published_at" TIMESTAMPTZ,
        "published_by_admin_id" uuid,
        "published_by_email" character varying(255),
        CONSTRAINT "PK_doctor_legal_document_versions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_legal_document_versions_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_doctor_legal_document_versions_doc_version" UNIQUE ("document_id", "version_number"),
        CONSTRAINT "FK_doctor_legal_document_versions_document" FOREIGN KEY ("document_id") REFERENCES "doctor_legal_documents"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "doctor_legal_documents"
      ADD CONSTRAINT "FK_doctor_legal_documents_current_version"
      FOREIGN KEY ("current_published_version_id")
      REFERENCES "doctor_legal_document_versions"("id")
      ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "doctor_legal_document_acceptances" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "doctor_id" uuid NOT NULL,
        "document_id" uuid NOT NULL,
        "version_id" uuid NOT NULL,
        "document_type" "public"."doctor_legal_documents_type_enum" NOT NULL,
        "accepted_at" TIMESTAMPTZ NOT NULL,
        "ip_address" character varying(45),
        "user_agent" character varying(500),
        CONSTRAINT "PK_doctor_legal_document_acceptances" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_legal_acceptances_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_doctor_legal_acceptances_doctor_version" UNIQUE ("doctor_id", "version_id"),
        CONSTRAINT "FK_doctor_legal_acceptances_doctor" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_doctor_legal_acceptances_document" FOREIGN KEY ("document_id") REFERENCES "doctor_legal_documents"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_doctor_legal_acceptances_version" FOREIGN KEY ("version_id") REFERENCES "doctor_legal_document_versions"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "consultation_follow_up_policies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "doctor_id" uuid,
        "is_global" boolean NOT NULL DEFAULT false,
        "follow_up_allowed" boolean NOT NULL DEFAULT true,
        "pricing_mode" "public"."follow_up_pricing_mode_enum" NOT NULL DEFAULT 'FREE',
        "free_window_days" integer NOT NULL DEFAULT 7,
        "paid_fee_amount" numeric(12,2),
        CONSTRAINT "PK_consultation_follow_up_policies" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_consultation_follow_up_policies_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_consultation_follow_up_policies_doctor" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_follow_up_policies_global"
      ON "consultation_follow_up_policies" ("is_global")
      WHERE "is_global" = true AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_follow_up_policies_doctor"
      ON "consultation_follow_up_policies" ("doctor_id")
      WHERE "doctor_id" IS NOT NULL AND "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "consultations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "customer_id" uuid NOT NULL,
        "doctor_id" uuid NOT NULL,
        "clinic_id" uuid NOT NULL,
        "slot_id" uuid,
        "parent_consultation_id" uuid,
        "is_follow_up" boolean NOT NULL DEFAULT false,
        "status" "public"."consultations_status_enum" NOT NULL DEFAULT 'DRAFT',
        "pricing_type" "public"."consultations_pricing_type_enum" NOT NULL,
        "amount_charged" numeric(12,2) NOT NULL DEFAULT 0,
        "payment_status" "public"."consultations_payment_status_enum" NOT NULL DEFAULT 'NONE',
        "symptoms" text,
        "patient_name" character varying(255) NOT NULL,
        "patient_mobile" character varying(20) NOT NULL,
        "scheduled_start" TIMESTAMPTZ NOT NULL,
        "scheduled_end" TIMESTAMPTZ NOT NULL,
        "venue_snapshot" jsonb,
        "attendance_status" "public"."consultations_attendance_status_enum" NOT NULL DEFAULT 'PENDING',
        "notes" text,
        "diagnosis" text,
        "tnc_accepted_at" TIMESTAMPTZ,
        "otp_verified_at" TIMESTAMPTZ,
        "cancellation_reason" text,
        "cancelled_at" TIMESTAMPTZ,
        "completed_at" TIMESTAMPTZ,
        CONSTRAINT "PK_consultations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_consultations_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_consultations_customer" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_consultations_doctor" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_consultations_clinic" FOREIGN KEY ("clinic_id") REFERENCES "doctor_clinic_associations"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_consultations_slot" FOREIGN KEY ("slot_id") REFERENCES "doctor_slots"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_consultations_parent" FOREIGN KEY ("parent_consultation_id") REFERENCES "consultations"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_consultations_status" ON "consultations" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_consultations_doctor_id" ON "consultations" ("doctor_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_consultations_customer_id" ON "consultations" ("customer_id")`);

    await queryRunner.query(`
      CREATE TABLE "consultation_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "consultation_id" uuid NOT NULL,
        "file" jsonb NOT NULL,
        "mime_type" character varying(120),
        "original_name" character varying(255),
        CONSTRAINT "PK_consultation_documents" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_consultation_documents_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_consultation_documents_consultation" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "consultation_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "consultation_id" uuid NOT NULL,
        "provider" character varying(40) NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'INR',
        "status" "public"."consultations_payment_status_enum" NOT NULL DEFAULT 'PENDING',
        "gateway_payment_id" character varying(120),
        "gateway_order_id" character varying(120),
        "idempotency_key" character varying(120),
        "raw_payload" jsonb,
        "paid_at" TIMESTAMPTZ,
        "refunded_at" TIMESTAMPTZ,
        CONSTRAINT "PK_consultation_payments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_consultation_payments_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_consultation_payments_consultation_id" UNIQUE ("consultation_id"),
        CONSTRAINT "UQ_consultation_payments_gateway_payment_id" UNIQUE ("gateway_payment_id"),
        CONSTRAINT "FK_consultation_payments_consultation" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "consultation_status_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "consultation_id" uuid NOT NULL,
        "from_status" "public"."consultations_status_enum",
        "to_status" "public"."consultations_status_enum" NOT NULL,
        "actor_type" character varying(40) NOT NULL,
        "actor_id" character varying(64),
        "note" text,
        CONSTRAINT "PK_consultation_status_history" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_consultation_status_history_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_consultation_status_history_consultation" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "prescriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "consultation_id" uuid NOT NULL,
        "additional_notes" text,
        "pdf_file" jsonb,
        CONSTRAINT "PK_prescriptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_prescriptions_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_prescriptions_consultation_id" UNIQUE ("consultation_id"),
        CONSTRAINT "FK_prescriptions_consultation" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "prescription_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "prescription_id" uuid NOT NULL,
        "medicine_name" character varying(255) NOT NULL,
        "dosage" character varying(120),
        "frequency" character varying(120),
        "duration" character varying(120),
        "instructions" text,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_prescription_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_prescription_items_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_prescription_items_prescription" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "consultation_follow_up_recommendations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "source_consultation_id" uuid NOT NULL,
        "doctor_id" uuid NOT NULL,
        "reason" text,
        "instructions" text,
        "recommended_from" date,
        "recommended_to" date,
        "eligible_until" TIMESTAMPTZ,
        "pricing_type" "public"."consultations_pricing_type_enum" NOT NULL,
        "amount" numeric(12,2) NOT NULL DEFAULT 0,
        "status" "public"."follow_up_recommendation_status_enum" NOT NULL DEFAULT 'OPEN',
        "booked_consultation_id" uuid,
        CONSTRAINT "PK_consultation_follow_up_recommendations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_follow_up_rec_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_follow_up_rec_source_consultation" UNIQUE ("source_consultation_id"),
        CONSTRAINT "FK_follow_up_rec_source" FOREIGN KEY ("source_consultation_id") REFERENCES "consultations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_follow_up_rec_doctor" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_follow_up_rec_booked" FOREIGN KEY ("booked_consultation_id") REFERENCES "consultations"("id") ON DELETE SET NULL
      )
    `);

    // Seed permission codes for doctor/consultation admin modules.
    // ref_id must match REF_ID_PATTERN: 3 letters + 8/10 digits (e.g. PER2026900001).
    const permissions = [
      ['PER2026900001', 'View Doctors', 'doctors.read', 'doctors', 'read'],
      ['PER2026900002', 'Create Doctors', 'doctors.create', 'doctors', 'create'],
      ['PER2026900003', 'Update Doctors', 'doctors.update', 'doctors', 'update'],
      ['PER2026900004', 'Change Doctors Status', 'doctors.status', 'doctors', 'status'],
      ['PER2026900005', 'Delete Doctors', 'doctors.delete', 'doctors', 'delete'],
      ['PER2026900006', 'Approve Doctors', 'doctors.approve', 'doctors', 'approve'],
      ['PER2026900007', 'Reject Doctors', 'doctors.reject', 'doctors', 'reject'],
      ['PER2026900008', 'View Doctor Bank Details', 'doctors.bank.read', 'doctors', 'read'],
      ['PER2026900010', 'View Doctor Legal Documents', 'doctor_legal_documents.read', 'doctor_legal_documents', 'read'],
      ['PER2026900011', 'Create Doctor Legal Documents', 'doctor_legal_documents.create', 'doctor_legal_documents', 'create'],
      ['PER2026900012', 'Update Doctor Legal Documents', 'doctor_legal_documents.update', 'doctor_legal_documents', 'update'],
      ['PER2026900013', 'Publish Doctor Legal Documents', 'doctor_legal_documents.publish', 'doctor_legal_documents', 'update'],
      ['PER2026900020', 'View Doctor Specializations', 'doctor_specializations.read', 'doctor_specializations', 'read'],
      ['PER2026900021', 'Create Doctor Specializations', 'doctor_specializations.create', 'doctor_specializations', 'create'],
      ['PER2026900022', 'Update Doctor Specializations', 'doctor_specializations.update', 'doctor_specializations', 'update'],
      ['PER2026900023', 'Change Doctor Specializations Status', 'doctor_specializations.status', 'doctor_specializations', 'status'],
      ['PER2026900024', 'Delete Doctor Specializations', 'doctor_specializations.delete', 'doctor_specializations', 'delete'],
      ['PER2026900030', 'View Doctor Languages', 'doctor_languages.read', 'doctor_languages', 'read'],
      ['PER2026900031', 'Create Doctor Languages', 'doctor_languages.create', 'doctor_languages', 'create'],
      ['PER2026900032', 'Update Doctor Languages', 'doctor_languages.update', 'doctor_languages', 'update'],
      ['PER2026900033', 'Change Doctor Languages Status', 'doctor_languages.status', 'doctor_languages', 'status'],
      ['PER2026900034', 'Delete Doctor Languages', 'doctor_languages.delete', 'doctor_languages', 'delete'],
      ['PER2026900040', 'View Doctor Qualifications', 'doctor_qualifications.read', 'doctor_qualifications', 'read'],
      ['PER2026900041', 'Create Doctor Qualifications', 'doctor_qualifications.create', 'doctor_qualifications', 'create'],
      ['PER2026900042', 'Update Doctor Qualifications', 'doctor_qualifications.update', 'doctor_qualifications', 'update'],
      ['PER2026900043', 'Change Doctor Qualifications Status', 'doctor_qualifications.status', 'doctor_qualifications', 'status'],
      ['PER2026900044', 'Delete Doctor Qualifications', 'doctor_qualifications.delete', 'doctor_qualifications', 'delete'],
      ['PER2026900050', 'View Consultations', 'consultations.read', 'consultations', 'read'],
      ['PER2026900051', 'Update Consultations', 'consultations.update', 'consultations', 'update'],
      ['PER2026900052', 'Cancel Consultations', 'consultations.status', 'consultations', 'status'],
    ] as const;

    for (const [refId, name, code, module, action] of permissions) {
      await queryRunner.query(
        `
        INSERT INTO "permissions" ("ref_id", "code", "name", "module", "action", "status", "created_by")
        SELECT $1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::permissions_action_enum, 'active', 'system'
        WHERE NOT EXISTS (
          SELECT 1 FROM "permissions"
          WHERE (LOWER("code") = LOWER($2::varchar) OR "ref_id" = $1::varchar)
          AND "deleted_at" IS NULL
        )
      `,
        [refId, code, name, module, action],
      );
    }

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r."slug" IN ('super_admin', 'admin')
        AND r."deleted_at" IS NULL
        AND p."deleted_at" IS NULL
        AND p."module" IN (
          'doctors', 'doctor_legal_documents', 'doctor_specializations',
          'doctor_languages', 'doctor_qualifications', 'consultations'
        )
        AND NOT EXISTS (
          SELECT 1 FROM "role_permissions" rp
          WHERE rp."role_id" = r."id" AND rp."permission_id" = p."id"
        )
    `);

    // Seed legal document shells + global follow-up policy (valid REF_ID_PATTERN)
    await queryRunner.query(`
      INSERT INTO "doctor_legal_documents" ("ref_id", "type", "title", "created_by")
      SELECT v."ref_id", v."type"::doctor_legal_documents_type_enum, v."title", 'system'
      FROM (VALUES
        ('DLD2026900001', 'TERMS_AND_CONDITIONS', 'Doctor Terms & Conditions'),
        ('DLD2026900002', 'PRIVACY_POLICY', 'Doctor Privacy Policy')
      ) AS v("ref_id", "type", "title")
      WHERE NOT EXISTS (
        SELECT 1 FROM "doctor_legal_documents" d
        WHERE d."type"::text = v."type" AND d."deleted_at" IS NULL
      )
    `);

    await queryRunner.query(`
      INSERT INTO "consultation_follow_up_policies"
        ("ref_id", "is_global", "follow_up_allowed", "pricing_mode", "free_window_days", "created_by")
      SELECT 'CFU2026900001', true, true, 'FREE', 7, 'system'
      WHERE NOT EXISTS (
        SELECT 1 FROM "consultation_follow_up_policies"
        WHERE "is_global" = true AND "deleted_at" IS NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "consultation_follow_up_recommendations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "prescription_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "prescriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "consultation_status_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "consultation_payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "consultation_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "consultations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "consultation_follow_up_policies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_legal_document_acceptances"`);
    await queryRunner.query(
      `ALTER TABLE "doctor_legal_documents" DROP CONSTRAINT IF EXISTS "FK_doctor_legal_documents_current_version"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_legal_document_versions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_legal_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_slots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_availabilities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_bank_details"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_consultation_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_clinic_associations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_language_maps"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_specialization_maps"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_qualification_maps"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctors"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_qualifications_master"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_languages_master"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_specializations_master"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."follow_up_pricing_mode_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."follow_up_recommendation_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."consultations_attendance_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."consultations_payment_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."consultations_pricing_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."consultations_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."doctor_legal_document_versions_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."doctor_legal_documents_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."doctor_slots_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."doctor_documents_doc_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."doctor_consultation_configs_pricing_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."doctors_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."doctors_category_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."doctor_master_status_enum"`);
  }
}
