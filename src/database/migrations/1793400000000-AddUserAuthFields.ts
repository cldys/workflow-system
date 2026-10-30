import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAuthFields1793400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "email" varchar(255),
        ADD COLUMN "password_hash" text,
        ADD COLUMN "role" varchar(20) NOT NULL DEFAULT 'EMPLOYEE',
        ADD COLUMN "is_active" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "CHK_users_role"
      CHECK ("role" IN ('EMPLOYEE', 'APPROVER'))
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_users_email_unique_ci"
      ON "users" (LOWER("email"))
      WHERE "email" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_users_email_unique_ci"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT "CHK_users_role"
    `);

    // 回退会删除这些列中的认证与权限数据。
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN "is_active",
        DROP COLUMN "role",
        DROP COLUMN "password_hash",
        DROP COLUMN "email"
    `);
  }
}
