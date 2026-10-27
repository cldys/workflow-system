import { MigrationInterface, QueryRunner } from 'typeorm';

// 专门用于标记历史工单的迁移用户，不是真实员工
const LEGACY_USER_ID = '00000000-0000-4000-8000-000000000001';

export class AddWorkflowRelations1793104789066 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 创建用户表
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "display_name" varchar(100) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id")
      )
    `);

    // 2. 给原有工单表增加创建人字段
    // 暂时允许为空，因为旧工单还没有创建人信息
    await queryRunner.query(`
      ALTER TABLE "requests"
      ADD COLUMN "created_by" uuid
    `);

    // 3. 创建一个历史迁移用户
    await queryRunner.query(
      `
        INSERT INTO "users" ("id", "display_name")
        VALUES ($1, $2)
      `,
      [LEGACY_USER_ID, '历史工单迁移用户'],
    );

    // 4. 给所有尚未指定创建人的旧工单回填用户 ID
    await queryRunner.query(
      `
        UPDATE "requests"
        SET "created_by" = $1
        WHERE "created_by" IS NULL
      `,
      [LEGACY_USER_ID],
    );

    // 5. 确认旧数据完成回填后，再禁止创建人为空
    await queryRunner.query(`
      ALTER TABLE "requests"
      ALTER COLUMN "created_by" SET NOT NULL
    `);

    // 6. 建立工单创建人外键
    await queryRunner.query(`
      ALTER TABLE "requests"
      ADD CONSTRAINT "FK_requests_created_by_users"
      FOREIGN KEY ("created_by")
      REFERENCES "users" ("id")
      ON DELETE RESTRICT
    `);

    // 7. 创建工单操作历史表
    await queryRunner.query(`
      CREATE TABLE "request_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "request_id" uuid NOT NULL,
        "actor_id" uuid NOT NULL,
        "action" varchar(30) NOT NULL,
        "from_status" varchar(20) NULL,
        "to_status" varchar(20) NOT NULL,
        "note" text NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT "PK_request_events_id"
          PRIMARY KEY ("id"),

        CONSTRAINT "FK_request_events_request_id_requests"
          FOREIGN KEY ("request_id")
          REFERENCES "requests" ("id")
          ON DELETE RESTRICT,

        CONSTRAINT "FK_request_events_actor_id_users"
          FOREIGN KEY ("actor_id")
          REFERENCES "users" ("id")
          ON DELETE RESTRICT
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. 先删除历史表，解除它对 requests 和 users 的引用
    await queryRunner.query(`
      DROP TABLE "request_events"
    `);

    // 2. 删除 requests 对 users 的外键
    await queryRunner.query(`
      ALTER TABLE "requests"
      DROP CONSTRAINT "FK_requests_created_by_users"
    `);

    // 3. 删除新增的创建人字段
    await queryRunner.query(`
      ALTER TABLE "requests"
      DROP COLUMN "created_by"
    `);

    // 4. 最后删除本次迁移创建的用户表
    await queryRunner.query(`
      DROP TABLE "users"
    `);
  }
}
