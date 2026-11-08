import type { UserRole } from '../users/entities/user.entity';

export interface CurrentUserData {
  id: string;
  role: UserRole;
}
