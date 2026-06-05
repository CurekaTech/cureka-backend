import { Controller } from '@nestjs/common';

/**
 * @deprecated User authentication is now handled by AuthController.
 * This controller is kept as a placeholder for backward compatibility.
 */
@Controller('auth/users')
export class UserAuthController {}
