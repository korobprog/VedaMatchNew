import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModerationModule } from '../moderation/moderation.module';
import { UnionModule } from '../union/union.module';
import { UsersModule } from '../users/users.module';
import { ContactsController } from './contacts.controller';
import { ContactsRequestsService } from './contacts-requests.service';
import { ContactsService } from './contacts.service';

@Module({
  imports: [AuthModule, UsersModule, ModerationModule, UnionModule],
  controllers: [ContactsController],
  providers: [ContactsService, ContactsRequestsService],
})
export class ContactsModule {}
