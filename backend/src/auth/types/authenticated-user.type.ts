import { UserRole } from '../../common/enums/user-role.enum';

export type AuthenticatedUser = {
  sub: string;
  email: string;
  role: UserRole;
};
