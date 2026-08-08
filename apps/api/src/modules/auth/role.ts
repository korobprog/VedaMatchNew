import type { Role } from '@vedamatch/shared';

/** Prisma enum → внешняя роль ('service_admin' → 'service-admin') */
export function toRole(dbRole: string): Role {
  return dbRole.replace('_', '-') as Role;
}
