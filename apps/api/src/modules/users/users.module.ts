import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GeoController } from './geo.controller';
import { ProfileController } from './profile.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, ProfileController, GeoController],
  providers: [UsersService],
})
export class UsersModule {}
