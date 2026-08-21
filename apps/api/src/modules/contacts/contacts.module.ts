import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModerationModule } from '../moderation/moderation.module';
import { UnionModule } from '../union/union.module';
import { UsersModule } from '../users/users.module';
import { ContactsAdminController } from './contacts-admin.controller';
import { ContactsAdminService } from './contacts-admin.service';
import { ContactsController } from './contacts.controller';
import { ContactsRequestsService } from './contacts-requests.service';
import { ContactsService } from './contacts.service';

@Module({
  imports: [AuthModule, UsersModule, ModerationModule, UnionModule],
  controllers: [ContactsController, ContactsAdminController],
  providers: [ContactsService, ContactsRequestsService, ContactsAdminService],
})
export class ContactsModule {}
