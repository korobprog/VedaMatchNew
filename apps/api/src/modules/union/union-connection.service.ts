import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UnionConnectionRequest, User } from '@prisma/client';
import type {
  ProfileLocation,
  ProfileMessengers,
  ProfileSocialLinks,
  UnionConnectionCounts,
  UnionConnectionRequestDto,
  UnionConnectionRequestsState,
  UnionConnectionSummary,
  UnionCreateConnectionRequest,
  UnionPrivacySettings,
  UnionUserSummary,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_MESSAGE_LENGTH = 500;

@Injectable()
export class UnionConnectionService {
  constructor(private readonly prisma: PrismaService) {}

  async counts(userId: string): Promise<UnionConnectionCounts> {
    const incomingPending = await this.prisma.unionConnectionRequest.count({
      where: { toUserId: userId, status: 'pending' },
    });
    return { incomingPending };
  }

  async list(userId: string): Promise<UnionConnectionRequestsState> {
    const [incoming, outgoing] = await Promise.all([
      this.prisma.unionConnectionRequest.findMany({
        where: { toUserId: userId },
        include: { fromUser: { include: { unionProfile: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.unionConnectionRequest.findMany({
        where: { fromUserId: userId },
        include: { toUser: { include: { unionProfile: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      incoming: incoming.map((request) =>
        this.toRequestDto(
          request,
          request.fromUser,
          'incoming',
          request.status === 'accepted',
        ),
      ),
      outgoing: outgoing.map((request) =>
        this.toRequestDto(
          request,
          request.toUser,
          'outgoing',
          request.status === 'accepted',
        ),
      ),
    };
  }

  async create(
    fromUserId: string,
    body: UnionCreateConnectionRequest,
  ): Promise<UnionConnectionRequestDto> {
    const toUserId = String(body.toUserId ?? '').trim();
    if (!toUserId) throw new BadRequestException('toUserId is required');
    if (toUserId === fromUserId) {
      throw new BadRequestException('Cannot send a request to yourself');
    }
    const message = this.cleanMessage(body.message);

    const [fromProfile, toProfile] = await Promise.all([
      this.prisma.unionProfile.findUnique({ where: { userId: fromUserId } }),
      this.prisma.unionProfile.findUnique({
        where: { userId: toUserId },
        include: { user: true },
      }),
    ]);
    if (!fromProfile) throw new NotFoundException('Fill Union profile first');
    if (!toProfile || !toProfile.isActive) {
      throw new NotFoundException('Union profile not found');
    }

    const reverse = await this.prisma.unionConnectionRequest.findUnique({
      where: {
        fromUserId_toUserId: { fromUserId: toUserId, toUserId: fromUserId },
      },
      include: { fromUser: { include: { unionProfile: true } } },
    });
    if (reverse?.status === 'pending') {
      const accepted = await this.prisma.unionConnectionRequest.update({
        where: { id: reverse.id },
        data: { status: 'accepted', respondedAt: new Date() },
        include: { fromUser: { include: { unionProfile: true } } },
      });
      return this.toRequestDto(accepted, accepted.fromUser, 'incoming', true);
    }
    if (reverse?.status === 'accepted') {
      return this.toRequestDto(reverse, reverse.fromUser, 'incoming', true);
    }

    const request = await this.prisma.unionConnectionRequest.upsert({
      where: { fromUserId_toUserId: { fromUserId, toUserId } },
      create: { fromUserId, toUserId, message },
      update: { status: 'pending', message, respondedAt: null },
      include: { toUser: { include: { unionProfile: true } } },
    });
    return this.toRequestDto(request, request.toUser, 'outgoing', false);
  }

  async accept(
    userId: string,
    requestId: string,
  ): Promise<UnionConnectionRequestDto> {
    const request = await this.prisma.unionConnectionRequest.findUnique({
      where: { id: requestId },
      include: { fromUser: { include: { unionProfile: true } } },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.toUserId !== userId)
      throw new ForbiddenException('Not your request');
    if (request.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be accepted');
    }

    const accepted = await this.prisma.unionConnectionRequest.update({
      where: { id: request.id },
      data: { status: 'accepted', respondedAt: new Date() },
      include: { fromUser: { include: { unionProfile: true } } },
    });
    return this.toRequestDto(accepted, accepted.fromUser, 'incoming', true);
  }

  async decline(
    userId: string,
    requestId: string,
  ): Promise<UnionConnectionRequestDto> {
    const request = await this.prisma.unionConnectionRequest.findUnique({
      where: { id: requestId },
      include: { fromUser: { include: { unionProfile: true } } },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.toUserId !== userId)
      throw new ForbiddenException('Not your request');
    if (request.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be declined');
    }

    const declined = await this.prisma.unionConnectionRequest.update({
      where: { id: request.id },
      data: { status: 'declined', respondedAt: new Date() },
      include: { fromUser: { include: { unionProfile: true } } },
    });
    return this.toRequestDto(declined, declined.fromUser, 'incoming', false);
  }

  private cleanMessage(message: string | null | undefined): string | null {
    if (message == null) return null;
    const cleaned = String(message).trim();
    if (!cleaned) return null;
    if (cleaned.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(
        `Message must be ${MAX_MESSAGE_LENGTH} characters or shorter`,
      );
    }
    return cleaned;
  }

  private toRequestDto(
    request: UnionConnectionRequest,
    user: User & { unionProfile?: { privacy: unknown } | null },
    direction: 'incoming' | 'outgoing',
    matched: boolean,
  ): UnionConnectionRequestDto {
    return {
      ...this.toSummary(request, direction),
      user: this.toUserSummary(user, matched),
    };
  }

  private toSummary(
    request: UnionConnectionRequest,
    direction: 'incoming' | 'outgoing',
  ): UnionConnectionSummary {
    return {
      id: request.id,
      status: request.status,
      direction,
      message: request.message,
      createdAt: request.createdAt.toISOString(),
      respondedAt: request.respondedAt?.toISOString() ?? null,
    };
  }

  private toUserSummary(
    user: User & { unionProfile?: { privacy: unknown } | null },
    matched: boolean,
  ): UnionUserSummary {
    const privacy =
      (user.unionProfile?.privacy as UnionPrivacySettings | null) ?? null;
    const location = this.location(user);
    return {
      id: user.id,
      name: user.name,
      avatarUrl: this.isVisible(privacy?.photo, matched)
        ? user.avatarUrl
        : null,
      city: this.isVisible(privacy?.city, matched)
        ? (location?.city ?? null)
        : null,
      country: this.isVisible(privacy?.city, matched)
        ? (location?.country ?? null)
        : null,
      spiritualStage: user.spiritualStage,
      photos: [],
      contacts:
        matched && privacy?.contacts !== 'hidden'
          ? {
              socialLinks:
                (user.socialLinks as ProfileSocialLinks | null) ?? {},
              messengers: (user.messengers as ProfileMessengers | null) ?? {},
            }
          : null,
    };
  }

  private isVisible(
    level: UnionPrivacySettings[keyof UnionPrivacySettings] | undefined,
    matched: boolean,
  ): boolean {
    if (level === 'hidden') return false;
    if (level === 'after_match') return matched;
    return true;
  }

  private location(user: User): ProfileLocation | null {
    return (user.homeLocation as ProfileLocation | null) ?? null;
  }
}
