import { Injectable, NotFoundException } from '@nestjs/common';
import type { UserProfile } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { toRole } from '../auth/auth.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: toRole(user.role),
      spiritualStage: user.spiritualStage,
      devoteeVerificationStatus: user.devoteeVerificationStatus,
      lastSelfIdentificationAt:
        user.lastSelfIdentificationAt?.toISOString() ?? null,
    };
  }
}
