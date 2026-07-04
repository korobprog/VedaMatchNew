import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { CatalogService } from './catalog.service';

@Controller('services')
@UseGuards(AuthGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.catalog.getForUser(user.sub, user.role);
  }
}
