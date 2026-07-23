import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { GeoController } from './geo.controller';
import { ProfileController } from './profile.controller';
import { UserGalleryController } from './user-gallery.controller';
import { UserGalleryService } from './user-gallery.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [
    UsersController,
    ProfileController,
    UserGalleryController,
    GeoController,
    AdminUsersController,
  ],
  providers: [UsersService, UserGalleryService, AdminUsersService],
  exports: [UserGalleryService],
})
export class UsersModule {}
