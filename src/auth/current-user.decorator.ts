import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { CurrentUserData } from './current-user-data.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUserData | undefined =>
    context.switchToHttp().getRequest<Request & { user?: CurrentUserData }>()
      .user,
);
