import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAdminUser, IAdminJwtPayload, JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { PaginationQueryDto, ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { CreateAdminCustomerDto, UpdateAdminCustomerDto } from '../dto/user.dto';
import { UsersService } from '../services/users.service';

/**
 * Admin endpoints for customer management used by the payment-request wizard.
 *
 * POST  /admin/customers         – create a new customer
 * GET   /admin/customers/search  – search customers by name / phone / email
 * GET   /admin/customers/:refId  – customer detail with addresses
 * PUT   /admin/customers/:refId  – update an existing customer
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

  @ApiOperation({
    summary: 'Get customer detail by refId (includes addresses)',
  })
  @ResponseMessage('Customer retrieved successfully')
  @Get(':refId')
  findOne(@Param('refId') refId: string) {
    return this.usersService.findCustomerByRefId(refId);
  }

  @ApiOperation({ summary: 'Update customer details (admin payment-request wizard)' })
  @ResponseMessage('Customer updated successfully')
  @Put(':refId')
  update(
    @Param('refId') refId: string,
    @Body() dto: UpdateAdminCustomerDto,
  ) {
    return this.usersService.updateCustomer(refId, dto);
  }
}
