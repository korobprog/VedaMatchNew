import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type {
  DevoteeVerificationStatus,
  MentorVerificationSubmit,
  PortalUseStage,
  SelfIdentificationAnswers,
  SelfIdentificationState,
  SelfIdentificationSubmitResult,
  SpiritualStage,
  StageHistoryItem,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SelfIdentificationService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(userId: string): Promise<SelfIdentificationState> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');

    const [latestResponse, activeMentorRequest] = await Promise.all([
      this.prisma.selfIdentificationResponse.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mentorVerificationRequest.findFirst({
        where: {
          userId,
          status: {
            in: ['awaiting_mentor', 'mentor_submitted', 'awaiting_admin'],
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      spiritualStage: user.spiritualStage,
      devoteeVerificationStatus: user.devoteeVerificationStatus,
      lastSelfIdentificationAt:
        user.lastSelfIdentificationAt?.toISOString() ?? null,
      latestAnswers:
        (latestResponse?.answers as SelfIdentificationAnswers | null) ?? null,
      activeMentorRequest: activeMentorRequest
        ? {
            id: activeMentorRequest.id,
            token: activeMentorRequest.token,
            status: activeMentorRequest.status,
            mentorSubmittedAt:
              activeMentorRequest.mentorSubmittedAt?.toISOString() ?? null,
            createdAt: activeMentorRequest.createdAt.toISOString(),
          }
        : null,
    };
  }

  async submit(
    userId: string,
    answers: SelfIdentificationAnswers,
  ): Promise<SelfIdentificationSubmitResult> {
    this.validateAnswers(answers);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');

    const detectedStage = this.detectStage(answers);
    const previousStage = user.spiritualStage;
    const wasConfirmedDevotee =
      user.spiritualStage === 'devotee' &&
      user.devoteeVerificationStatus === 'confirmed';

    const nextStage = wasConfirmedDevotee ? 'devotee' : detectedStage;
    const nextVerificationStatus = this.resolveVerificationStatus(
      detectedStage,
      user.devoteeVerificationStatus,
      wasConfirmedDevotee,
    );

    const response = await this.prisma.selfIdentificationResponse.create({
      data: {
        userId,
        answers: answers as unknown as Prisma.InputJsonObject,
        detectedStage,
        verificationStatus: nextVerificationStatus,
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        spiritualStage: nextStage,
        devoteeVerificationStatus: nextVerificationStatus,
        lastSelfIdentificationAt: response.createdAt,
      },
    });

    if (previousStage !== nextStage) {
      await this.prisma.stageHistory.create({
        data: {
          userId,
          oldStage: previousStage,
          newStage: nextStage,
          actor: 'system',
          reason: wasConfirmedDevotee
            ? 'Повторная анкета не сняла подтвержденный статус преданного автоматически'
            : 'Автоматическое определение этапа после анкеты',
          answers: answers as unknown as Prisma.InputJsonObject,
          verificationStatus: nextVerificationStatus,
        },
      });
    }

    const mentorRequest =
      nextStage === 'devotee' && nextVerificationStatus !== 'confirmed'
        ? await this.ensureActiveMentorRequest(userId)
        : null;

    const state = await this.getState(userId);
    return {
      ...state,
      detectedStage,
      mentorLinkPath: mentorRequest
        ? `/mentor-verification/${mentorRequest.token}`
        : null,
    };
  }

  async usePortalStage(
    userId: string,
    stage: PortalUseStage,
  ): Promise<SelfIdentificationState> {
    if (!['seeker', 'practitioner', 'yogi'].includes(stage)) {
      throw new BadRequestException(
        'Для временного доступа можно выбрать только ищущего, практикующего или йога',
      );
    }

    const [user, activeMentorRequest] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.mentorVerificationRequest.findFirst({
        where: {
          userId,
          status: {
            in: ['awaiting_mentor', 'mentor_submitted', 'awaiting_admin'],
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!user) throw new NotFoundException('Пользователь не найден');
    if (!activeMentorRequest) {
      throw new BadRequestException(
        'Нет активной проверки статуса преданного',
      );
    }

    const stageChanged = user.spiritualStage !== stage;
    const statusChanged =
      user.devoteeVerificationStatus !== activeMentorRequest.status;

    if (stageChanged || statusChanged) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          spiritualStage: stage,
          devoteeVerificationStatus: activeMentorRequest.status,
        },
      });
    }

    if (stageChanged) {
      await this.prisma.stageHistory.create({
        data: {
          userId,
          oldStage: user.spiritualStage,
          newStage: stage,
          actor: 'user',
          reason:
            'Пользователь выбрал временный тип аккаунта на время проверки куратором',
          verificationStatus: activeMentorRequest.status,
          mentorRequestId: activeMentorRequest.id,
        },
      });
    }

    return this.getState(userId);
  }

  async getHistory(userId: string): Promise<StageHistoryItem[]> {
    const rows = await this.prisma.stageHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((h) => ({
      id: h.id,
      oldStage: h.oldStage,
      newStage: h.newStage,
      actor: h.actor,
      reason: h.reason,
      verificationStatus: h.verificationStatus,
      createdAt: h.createdAt.toISOString(),
    }));
  }

  async getMentorPublicRequest(token: string) {
    const request = await this.prisma.mentorVerificationRequest.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!request) throw new NotFoundException('Заявка наставника не найдена');
    return {
      userName: request.user.name,
      userStage: request.user.spiritualStage as SpiritualStage,
      status: request.status,
      submittedAt: request.mentorSubmittedAt?.toISOString() ?? null,
    };
  }

  async submitMentorForm(token: string, data: MentorVerificationSubmit) {
    this.validateMentorForm(data);

    const request = await this.prisma.mentorVerificationRequest.findUnique({
      where: { token },
    });
    if (!request) throw new NotFoundException('Заявка наставника не найдена');
    if (request.mentorSubmittedAt) {
      throw new BadRequestException('Форма наставника уже заполнена');
    }

    const updated = await this.prisma.mentorVerificationRequest.update({
      where: { token },
      data: {
        ...data,
        status: 'awaiting_admin',
        mentorSubmittedAt: new Date(),
      },
    });

    await this.prisma.user.update({
      where: { id: request.userId },
      data: { devoteeVerificationStatus: 'awaiting_admin' },
    });

    await this.prisma.stageHistory.create({
      data: {
        userId: request.userId,
        oldStage: 'devotee',
        newStage: 'devotee',
        actor: 'user',
        reason: 'Наставник заполнил форму подтверждения',
        verificationStatus: 'awaiting_admin',
        mentorRequestId: updated.id,
      },
    });

    return { ok: true };
  }

  async listAdminRequests(status?: DevoteeVerificationStatus) {
    const requests = await this.prisma.mentorVerificationRequest.findMany({
      where: status ? { status } : undefined,
      include: { user: true },
      orderBy: { updatedAt: 'desc' },
    });

    return requests.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user.name,
      userEmail: r.user.email,
      status: r.status,
      mentorName: r.mentorName,
      mentorPhone: r.phone,
      mentorEmail: r.email,
      cityOrCommunity: r.cityOrCommunity,
      knownDuration: r.knownDuration,
      knowsPersonally: r.knowsPersonally,
      confirmsRegularPractice: r.confirmsRegularPractice,
      confirmsService: r.confirmsService,
      confirmsSpiritualName: r.confirmsSpiritualName,
      confirmsCommunityConnection: r.confirmsCommunityConnection,
      recommendsDevoteeStatus: r.recommendsDevoteeStatus,
      userCharacterReference: r.userCharacterReference,
      adminNote: r.adminNote,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      mentorSubmittedAt: r.mentorSubmittedAt?.toISOString() ?? null,
    }));
  }

  async reviewAdminRequest(
    adminRole: string,
    requestId: string,
    data: { status: DevoteeVerificationStatus; adminNote?: string },
  ) {
    if (adminRole !== 'admin' && adminRole !== 'service-admin') {
      throw new ForbiddenException('Недостаточно прав');
    }
    if (
      !['confirmed', 'rejected', 'needs_clarification'].includes(data.status)
    ) {
      throw new BadRequestException(
        'Администратор может подтвердить, отклонить или запросить уточнение',
      );
    }

    const request = await this.prisma.mentorVerificationRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });
    if (!request) throw new NotFoundException('Заявка не найдена');

    const previousStage = request.user.spiritualStage;
    const nextStage =
      data.status === 'confirmed'
        ? 'devotee'
        : previousStage && previousStage !== 'devotee'
          ? previousStage
          : 'yogi';

    await this.prisma.mentorVerificationRequest.update({
      where: { id: requestId },
      data: {
        status: data.status,
        adminNote: data.adminNote ?? null,
        adminReviewedAt: new Date(),
      },
    });

    await this.prisma.user.update({
      where: { id: request.userId },
      data: {
        spiritualStage: nextStage,
        devoteeVerificationStatus: data.status,
      },
    });

    await this.prisma.stageHistory.create({
      data: {
        userId: request.userId,
        oldStage: previousStage,
        newStage: nextStage,
        actor: 'admin',
        reason:
          data.adminNote ?? 'Решение администратора по статусу преданного',
        verificationStatus: data.status,
        mentorRequestId: request.id,
      },
    });

    return { ok: true };
  }

  private detectStage(answers: SelfIdentificationAnswers): SpiritualStage {
    const devoteeSignals = [
      answers.hasMentor,
      answers.hasCommunity,
      answers.hasSpiritualName,
      answers.participatesInService,
      answers.interest === 'devotional_service',
      answers.currentFocus === 'service_community',
      answers.regularPractice === 'strict_daily',
    ].filter(Boolean).length;

    if (devoteeSignals >= 4) return 'devotee';
    if (
      answers.regularPractice === 'daily' ||
      answers.regularPractice === 'strict_daily' ||
      answers.interest === 'deepening' ||
      answers.currentFocus === 'deep_practice'
    ) {
      return 'yogi';
    }
    if (
      answers.regularPractice === 'sometimes' ||
      answers.interest === 'learning' ||
      answers.currentFocus === 'basic_practice'
    ) {
      return 'practitioner';
    }
    return 'seeker';
  }

  private resolveVerificationStatus(
    detectedStage: SpiritualStage,
    currentStatus: DevoteeVerificationStatus | null,
    wasConfirmedDevotee: boolean,
  ): DevoteeVerificationStatus | null {
    if (wasConfirmedDevotee) return 'confirmed';
    if (
      currentStatus &&
      ['awaiting_mentor', 'mentor_submitted', 'awaiting_admin'].includes(
        currentStatus,
      )
    ) {
      return currentStatus;
    }
    if (detectedStage !== 'devotee') return null;
    if (
      currentStatus &&
      [
        'awaiting_mentor',
        'mentor_submitted',
        'awaiting_admin',
        'needs_clarification',
      ].includes(currentStatus)
    ) {
      return currentStatus;
    }
    return 'awaiting_mentor';
  }

  private async ensureActiveMentorRequest(userId: string) {
    const existing = await this.prisma.mentorVerificationRequest.findFirst({
      where: {
        userId,
        status: {
          in: ['awaiting_mentor', 'mentor_submitted', 'awaiting_admin'],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;

    return this.prisma.mentorVerificationRequest.create({
      data: {
        userId,
        token: randomBytes(24).toString('hex'),
        status: 'awaiting_mentor',
      },
    });
  }

  private validateAnswers(answers: SelfIdentificationAnswers) {
    const required = [
      'interest',
      'regularPractice',
      'currentFocus',
      'hasMentor',
      'hasCommunity',
      'hasSpiritualName',
      'participatesInService',
      'wantsRecommendations',
    ];
    for (const key of required) {
      if (!(key in answers))
        throw new BadRequestException(`Не заполнено поле ${key}`);
    }
  }

  private validateMentorForm(data: MentorVerificationSubmit) {
    if (!data.truthConsent) {
      throw new BadRequestException('Нужно подтвердить достоверность данных');
    }
    for (const key of ['mentorName', 'phone', 'email', 'cityOrCommunity']) {
      const value = data[key as keyof MentorVerificationSubmit];
      if (!value || typeof value !== 'string' || value.trim().length === 0) {
        throw new BadRequestException(`Не заполнено поле ${key}`);
      }
    }

    const email = data.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Некорректный email наставника');
    }

    const phoneDigits = data.phone.replace(/\D/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      throw new BadRequestException('Некорректный телефон наставника');
    }
  }
}
