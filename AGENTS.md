# Repository Guidelines

## Project Structure & Module Organization

This is a NestJS API using TypeScript, PostgreSQL, and TypeORM. `src/main.ts` bootstraps the application; `src/app.module.ts` configures shared modules. Keep request routes, services, and DTOs in `src/requests/`, with entities under `entities/`. User and request-event entities currently live in `src/users/entities/` and `src/request-events/entities/`. Database configuration and migrations belong in `src/database/`. Colocate unit and controller tests with source files; place end-to-end tests in `test/`. `dist/` contains generated build output.

## Build, Test, and Development Commands

- `npm run start:dev`: run the API with automatic rebuilding.
- `npm run build`: compile the application into `dist/`.
- `npm run start:prod`: run the compiled application.
- `npm run lint`: run type-aware Oxlint checks.
- `npm run format`: format TypeScript under `src/` and `test/` with Prettier; review the resulting diff.
- `npm test -- --runInBand`: run unit and controller tests serially.
- `npm run test:e2e`: run integration tests against the configured PostgreSQL database.
- `npm run test:cov`: collect coverage; no minimum threshold is configured.

## Coding Style & Naming Conventions

Use two-space indentation, single quotes, semicolons, and trailing commas. Follow strict TypeScript settings and existing NestJS conventions. Use PascalCase for classes, camelCase for methods and properties, and filenames such as `requests.service.ts`, `request.entity.ts`, and `create-request.dto.ts`. Keep transport validation in DTO decorators and business invariants in services. Register entities through `TypeOrmModule.forFeature(...)` for automatic loading.

## Testing Guidelines

Tests use Jest, ts-jest, Nest testing utilities, and Supertest. Name colocated tests `*.spec.ts` and integration tests `*.e2e-spec.ts`. Mock repositories and transaction dependencies for isolated tests. Cover HTTP status, response body, validation, and failure branches. For UUID lookups, verify malformed, missing, and found cases independently. Run focused tests, lint, and build before submitting code changes.

## Commit & Pull Request Guidelines

Recent commits use short Chinese action summaries, such as `通过id查询工单接口`; no Conventional Commits requirement is established. Keep commits focused. PRs should explain the problem, changed behavior, verification commands, and database implications. Link relevant issues and document API contract changes.

## Security & Configuration

Use the README's `DB_*` configuration instructions. Never commit credentials or expose database backups. Preserve `synchronize: false`; apply reviewed migrations for schema changes. Mocked tests do not prove live database compatibility. Ask before adding dependencies or running destructive operations.
