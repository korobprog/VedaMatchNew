import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  CreateAdminServiceRequest,
  UpdateAdminServiceRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AdminCatalogService } from './admin-catalog.service';

/**
 * Каталог сервисов портала. Портальный раздел: администратор сервиса правит
 * содержимое своего сервиса, но не решает, какие сервисы есть на портале.
 */
@Controller('admin/catalog/services')
@UseGuards(AuthGuard)
export class AdminCatalogController {
  constructor(private readonly catalog: AdminCatalogService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    this.assertAdmin(user);
    return this.catalog.list();
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateAdminServiceRequest,
  ) {
    this.assertAdmin(user);
    return this.catalog.create(user.sub, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateAdminServiceRequest,
  ) {
    this.assertAdmin(user);
    return this.catalog.update(user.sub, id, body);
  }

  private assertAdmin(user: AccessTokenPayload): void {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Доступ только для администратора');
    }
  }
}
