import { Controller } from '@nestjs/common';
import { UserAuthService } from '../services/user-auth.service';

@Controller('auth/users')
export class UserAuthController {
  constructor(private readonly userAuthService: UserAuthService) {}

  // Future: POST /auth/users/login
  // Future: POST /auth/users/register
  // Future: POST /auth/users/refresh
}
