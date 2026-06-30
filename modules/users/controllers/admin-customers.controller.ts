import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAdminUser, IAdminJwtPayload, JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { PaginationQueryDto, ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { CreateAdminCustomerDto } from '../dto/user.dto';
import { UsersService } from '../services/users.service';

/**
 * Admin endpoints for customer management used by the payment-request wizard.
 *
 * POST  /admin/customers         – create a new customer
 * GET   /admin/customers/search  – search customers by name / phone / email
 *       (also available at GET /users/customers?search=, kept for backward compat)
 */
@ApiTags('Admin Customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, 'telecaller')
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Create a new customer (admin payment-request wizard)' })
  @ResponseMessage('Customer created successfully')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateAdminCustomerDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.usersService.createCustomer(dto, user.email);
  }

  @ApiOperation({
    summary: 'Search customers by name / phone / email (paginated)',
    description:
      'Returns paginated customer list. Pass `search` to filter by firstName, lastName, email, or mobileNumber.',
  })
  @ResponseMessage('Customers retrieved successfully')
  @Get('search')
  search(@Query() query: PaginationQueryDto) {
    return this.usersService.findCustomers(query);
  }
}
