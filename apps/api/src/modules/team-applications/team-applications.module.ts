import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AdminTeamApplicationsController,
  TeamApplicationsController,
} from './team-applications.controller';
import { TeamApplicationsService } from './team-applications.service';

@Module({
  imports: [AuthModule],
  controllers: [TeamApplicationsController, AdminTeamApplicationsController],
  providers: [TeamApplicationsService],
})
export class TeamApplicationsModule {}
