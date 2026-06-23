import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { CreateUserAddressDto, UpdateUserAddressDto } from '../dto/user-address.dto';
import { UserAddressesService } from '../services/user-addresses.service';

@ApiTags('User Addresses')
@ApiBearerAuth()
@Controller('users/addresses')
@UseGuards(SessionCookieGuard, VerifiedUserGuard)
export class UserAddressesController {
  constructor(private readonly userAddressesService: UserAddressesService) {}

  @ApiOperation({ summary: 'Create a delivery address' })
  @ResponseMessage('Address created successfully')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CreateUserAddressDto,
  ) {
    return this.userAddressesService.create(user.sub, dto);
  }

  @ApiOperation({ summary: 'List addresses for the authenticated user' })
  @ResponseMessage('Addresses retrieved successfully')
  @Get()
  findAll(@CurrentSessionUser() user: IUserSessionContext) {
    return this.userAddressesService.findAll(user.sub);
  }

  @ApiOperation({ summary: 'Get address by id' })
  @ResponseMessage('Address retrieved successfully')
  @Get(':id')
  findOne(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.userAddressesService.findOne(user.sub, id);
  }

  @ApiOperation({ summary: 'Update address' })
  @ResponseMessage('Address updated successfully')
  @Patch(':id')
  update(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserAddressDto,
  ) {
    return this.userAddressesService.update(user.sub, id, dto);
  }

  @ApiOperation({ summary: 'Delete address' })
  @ResponseMessage('Address deleted successfully')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.userAddressesService.remove(user.sub, id);
  }

  @ApiOperation({ summary: 'Set address as default' })
  @ResponseMessage('Default address updated successfully')
  @Patch(':id/default')
  setDefault(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.userAddressesService.setDefault(user.sub, id);
  }
}
