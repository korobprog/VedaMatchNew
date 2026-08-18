import { BadRequestException } from '@nestjs/common';
import {
  SelfIdentificationService,
  pickMentorFormFields,
} from './self-identification.service';

const validForm = {
  mentorName: 'Прабху Дас',
  phone: '+7 999 123-45-67',
  email: 'mentor@example.org',
  cityOrCommunity: 'Москва',
  knownDuration: '3 года',
  knowsPersonally: true,
  confirmsRegularPractice: true,
  confirmsService: true,
  confirmsSpiritualName: false,
  confirmsCommunityConnection: true,
  userCharacterReference: 'Надёжный человек',
  recommendsDevoteeStatus: true,
  truthConsent: true,
};

describe('pickMentorFormFields', () => {
  it('отбрасывает служебные поля модели, пришедшие в теле', () => {
    const data = pickMentorFormFields({
      ...validForm,
      adminNote: 'hacked',
      adminReviewedAt: new Date().toISOString(),
      userId: 'other-user',
      token: 'other-token',
      status: 'approved',
      createdAt: '2000-01-01',
    }) as Record<string, unknown>;

    expect(data).not.toHaveProperty('adminNote');
    expect(data).not.toHaveProperty('adminReviewedAt');
    expect(data).not.toHaveProperty('userId');
    expect(data).not.toHaveProperty('token');
    expect(data).not.toHaveProperty('status');
    expect(data).not.toHaveProperty('createdAt');
    expect(data.mentorName).toBe('Прабху Дас');
    expect(data.truthConsent).toBe(true);
  });

  it('приводит флаги к boolean и обрезает строки', () => {
    const data = pickMentorFormFields({
      mentorName: '  Имя  ',
      knowsPersonally: 'yes',
      truthConsent: 1,
    }) as Record<string, unknown>;
    expect(data.mentorName).toBe('Имя');
    expect(data.knowsPersonally).toBe(false);
    expect(data.truthConsent).toBe(false);
    expect(data).not.toHaveProperty('phone');
  });
});

describe('SelfIdentificationService.submitMentorForm', () => {
  function makeService() {
    const prisma = {
      mentorVerificationRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'req-1',
          userId: 'user-1',
          mentorSubmittedAt: null,
        }),
        update: jest.fn().mockResolvedValue({ id: 'req-1' }),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
      stageHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    return {
      prisma,
      service: new SelfIdentificationService(prisma as never),
    };
  }

  it('пишет в Prisma только whitelist-поля', async () => {
    const { prisma, service } = makeService();
    await service.submitMentorForm('tok', {
      ...validForm,
      adminNote: 'hacked',
      userId: 'other',
    } as never);

    const [call] = prisma.mentorVerificationRequest.update.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(call.data).not.toHaveProperty('adminNote');
    expect(call.data).not.toHaveProperty('userId');
    expect(call.data.status).toBe('awaiting_admin');
    expect(call.data.mentorSubmittedAt).toBeInstanceOf(Date);
    expect(call.data.mentorName).toBe(validForm.mentorName);
  });

  it('отвергает пустое тело как 400, а не 500', async () => {
    const { service } = makeService();
    await expect(
      service.submitMentorForm('tok', undefined as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.submitMentorForm('tok', {
        ...validForm,
        truthConsent: 'true',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
