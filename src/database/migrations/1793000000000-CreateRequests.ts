import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRequests1793000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 兼容第一周通过 db/001_init.sql 初始化的数据库。
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" varchar(120) NOT NULL,
        "description" text,
        "status" varchar(20) NOT NULL DEFAULT 'DRAFT',
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "requests"');
  }
}
