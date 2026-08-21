import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCatalogService } from './admin-catalog.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [AuthModule],
  controllers: [CatalogController, AdminCatalogController],
  providers: [CatalogService, AdminCatalogService],
})
export class CatalogModule {}
