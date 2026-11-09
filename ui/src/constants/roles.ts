import type { UserRole } from '@/types/user';

/** 登录后各角色的默认落地页 */
export const ROLE_HOME: Record<UserRole, string> = {
  student: '/applications',
  admin: '/admin/applications',
  supervisor: '/supervisor/applications',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  student: 'Student',
  admin: 'Admin',
  supervisor: 'Supervisor',
};
