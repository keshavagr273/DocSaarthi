import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export const ADMIN_EMAIL = 'keshavagrawal273@gmail.com';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const email = user.email?.toLowerCase().trim();
    const isOwnerEmail = email === ADMIN_EMAIL.toLowerCase();
    const isAdminRole = user.role === 'ADMIN';

    if (isOwnerEmail || isAdminRole) {
      return true;
    }

    throw new ForbiddenException(
      'Access denied. Admin portal is restricted exclusively to authorized administrators.',
    );
  }
}
