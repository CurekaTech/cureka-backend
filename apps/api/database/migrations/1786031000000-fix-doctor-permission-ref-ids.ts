import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Doctor/consultation permissions were seeded with invalid ref_ids like PERDOC000001.
 * Role update validates permissionRefIds with IsRefId (AAA + 8/10 digits), so saving a
 * role that includes those permissions returns 400.
 *
 * This migration rewrites those ref_ids to valid PER20269xxxxx values and also
 * repairs invalid legal-doc / follow-up policy seed ref_ids when present.
 */
export class FixDoctorPermissionRefIds1786031000000 implements MigrationInterface {
  name = 'FixDoctorPermissionRefIds1786031000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const permissionMap: Array<[string, string]> = [
      ['PERDOC000001', 'PER2026900001'],
      ['PERDOC000002', 'PER2026900002'],
      ['PERDOC000003', 'PER2026900003'],
      ['PERDOC000004', 'PER2026900004'],
      ['PERDOC000005', 'PER2026900005'],
      ['PERDOC000006', 'PER2026900006'],
      ['PERDOC000007', 'PER2026900007'],
      ['PERDOC000008', 'PER2026900008'],
      ['PERDOC000010', 'PER2026900010'],
      ['PERDOC000011', 'PER2026900011'],
      ['PERDOC000012', 'PER2026900012'],
      ['PERDOC000013', 'PER2026900013'],
      ['PERDOC000020', 'PER2026900020'],
      ['PERDOC000021', 'PER2026900021'],
      ['PERDOC000022', 'PER2026900022'],
      ['PERDOC000023', 'PER2026900023'],
      ['PERDOC000024', 'PER2026900024'],
      ['PERDOC000030', 'PER2026900030'],
      ['PERDOC000031', 'PER2026900031'],
      ['PERDOC000032', 'PER2026900032'],
      ['PERDOC000033', 'PER2026900033'],
      ['PERDOC000034', 'PER2026900034'],
      ['PERDOC000040', 'PER2026900040'],
      ['PERDOC000041', 'PER2026900041'],
      ['PERDOC000042', 'PER2026900042'],
      ['PERDOC000043', 'PER2026900043'],
      ['PERDOC000044', 'PER2026900044'],
      ['PERDOC000050', 'PER2026900050'],
      ['PERDOC000051', 'PER2026900051'],
      ['PERDOC000052', 'PER2026900052'],
    ];

    for (const [from, to] of permissionMap) {
      await queryRunner.query(
        `
        UPDATE "permissions"
        SET "ref_id" = $2
        WHERE "ref_id" = $1
          AND "deleted_at" IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM "permissions" p2
            WHERE p2."ref_id" = $2 AND p2."deleted_at" IS NULL
          )
        `,
        [from, to],
      );
    }

    await queryRunner.query(`
      UPDATE "doctor_legal_documents"
      SET "ref_id" = 'DLD2026900001'
      WHERE "ref_id" = 'DLDTERM00000001'
        AND "deleted_at" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "doctor_legal_documents" d
          WHERE d."ref_id" = 'DLD2026900001' AND d."deleted_at" IS NULL
        )
    `);

    await queryRunner.query(`
      UPDATE "doctor_legal_documents"
      SET "ref_id" = 'DLD2026900002'
      WHERE "ref_id" = 'DLDPRIV00000001'
        AND "deleted_at" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "doctor_legal_documents" d
          WHERE d."ref_id" = 'DLD2026900002' AND d."deleted_at" IS NULL
        )
    `);

    await queryRunner.query(`
      UPDATE "consultation_follow_up_policies"
      SET "ref_id" = 'CFU2026900001'
      WHERE "ref_id" = 'CFUPOL000000001'
        AND "deleted_at" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "consultation_follow_up_policies" p
          WHERE p."ref_id" = 'CFU2026900001' AND p."deleted_at" IS NULL
        )
    `);

    // Ensure super_admin / admin still have doctor module permissions after any partial seed.
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const permissionMap: Array<[string, string]> = [
      ['PER2026900001', 'PERDOC000001'],
      ['PER2026900002', 'PERDOC000002'],
      ['PER2026900003', 'PERDOC000003'],
      ['PER2026900004', 'PERDOC000004'],
      ['PER2026900005', 'PERDOC000005'],
      ['PER2026900006', 'PERDOC000006'],
      ['PER2026900007', 'PERDOC000007'],
      ['PER2026900008', 'PERDOC000008'],
      ['PER2026900010', 'PERDOC000010'],
      ['PER2026900011', 'PERDOC000011'],
      ['PER2026900012', 'PERDOC000012'],
      ['PER2026900013', 'PERDOC000013'],
      ['PER2026900020', 'PERDOC000020'],
      ['PER2026900021', 'PERDOC000021'],
      ['PER2026900022', 'PERDOC000022'],
      ['PER2026900023', 'PERDOC000023'],
      ['PER2026900024', 'PERDOC000024'],
      ['PER2026900030', 'PERDOC000030'],
      ['PER2026900031', 'PERDOC000031'],
      ['PER2026900032', 'PERDOC000032'],
      ['PER2026900033', 'PERDOC000033'],
      ['PER2026900034', 'PERDOC000034'],
      ['PER2026900040', 'PERDOC000040'],
      ['PER2026900041', 'PERDOC000041'],
      ['PER2026900042', 'PERDOC000042'],
      ['PER2026900043', 'PERDOC000043'],
      ['PER2026900044', 'PERDOC000044'],
      ['PER2026900050', 'PERDOC000050'],
      ['PER2026900051', 'PERDOC000051'],
      ['PER2026900052', 'PERDOC000052'],
    ];

    for (const [from, to] of permissionMap) {
      await queryRunner.query(
        `
        UPDATE "permissions"
        SET "ref_id" = $2
        WHERE "ref_id" = $1
          AND "deleted_at" IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM "permissions" p2
            WHERE p2."ref_id" = $2 AND p2."deleted_at" IS NULL
          )
        `,
        [from, to],
      );
    }
  }
}
