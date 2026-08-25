import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
import { AstroGenerationService } from '../astro-generation.service';
import { AstroQuotaService } from '../astro-quota.service';
import { AstroSettingsService } from '../astro-settings.service';
import { AstronomiaEphemerisProvider } from '../ephemeris/astronomia-provider';
import { AstroCompatibilityService } from './astro-compatibility.service';

const BIRTH_A = {
  bornAtUtc: new Date('1987-05-12T02:20:00.000Z'),
  latitude: 55.7558,
  longitude: 37.6173,
  timeAccuracy: 'exact' as const,
};
const BIRTH_B = {
  bornAtUtc: new Date('1994-11-02T19:45:00.000Z'),
  latitude: 19.076,
  longitude: 72.8777,
  timeAccuracy: 'exact' as const,
};

describe('AstroCompatibilityService', () => {
  const prisma = {
    astroBirthData: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    astroCompatibilityRequest: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    astroCompatibilityReading: { findUnique: jest.fn(), upsert: jest.fn() },
  };
  const users = { resolveAvatarUrl: jest.fn().mockResolvedValue(null) };
  const generation = { generateCompatibility: jest.fn() };
  const quota = { check: jest.fn(), record: jest.fn() };
  const settings = { get: jest.fn() };
  const events = { emit: jest.fn() };

  const service = new AstroCompatibilityService(
    prisma as unknown as PrismaService,
    users as unknown as UsersService,
    new AstronomiaEphemerisProvider(),
    generation as unknown as AstroGenerationService,
    quota as unknown as AstroQuotaService,
    settings as unknown as AstroSettingsService,
    events as unknown as EventEmitter2,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    users.resolveAvatarUrl.mockResolvedValue(null);
    settings.get.mockResolvedValue({ aiEnabled: true });
    prisma.user.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({
          id: where.id,
          name: `User ${where.id}`,
          gender: null,
        }),
    );
  });

  describe('создание запроса', () => {
    it('отклоняет сопоставление с самим собой', async () => {
      await expect(service.createRequest('u1', 'u1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('требует собственные данные рождения у инициатора', async () => {
      prisma.astroBirthData.findUnique.mockResolvedValue(null);
      await expect(service.createRequest('u1', 'u2')).rejects.toThrow(
        /данные рождения/,
      );
      expect(prisma.astroCompatibilityRequest.create).not.toHaveBeenCalled();
    });

    it('не требует данных рождения у получателя на этапе запроса', async () => {
      // Согласие — процесс в два шага: получатель может заполнить данные позже,
      // до момента принятия.
      prisma.astroBirthData.findUnique.mockResolvedValue(BIRTH_A);
      prisma.astroCompatibilityRequest.findUnique.mockResolvedValue(null);
      prisma.astroCompatibilityRequest.create.mockResolvedValue({
        id: 'req-1',
        requesterId: 'u1',
        targetId: 'u2',
        status: 'pending',
        createdAt: new Date(),
        respondedAt: null,
      });

      await expect(service.createRequest('u1', 'u2')).resolves.toMatchObject({
        status: 'pending',
      });
    });

    // Без уведомления запрос лежал бы молча: адресат узнавал бы о нём, только
    // случайно заглянув в раздел астрологии.
    it('уведомляет получателя о запросе', async () => {
      prisma.astroBirthData.findUnique.mockResolvedValue(BIRTH_A);
      prisma.astroCompatibilityRequest.findUnique.mockResolvedValue(null);
      prisma.astroCompatibilityRequest.create.mockResolvedValue({
        id: 'req-1',
        requesterId: 'u1',
        targetId: 'u2',
        status: 'pending',
        createdAt: new Date(),
        respondedAt: null,
      });

      await service.createRequest('u1', 'u2');

      expect(events.emit).toHaveBeenCalledWith('astro.compatibility.requested', {
        name: 'astro.compatibility.requested',
        recipientId: 'u2',
        senderName: expect.any(String),
      });
    });

    it('отклоняет повторный запрос той же паре', async () => {
      prisma.astroBirthData.findUnique.mockResolvedValue(BIRTH_A);
      prisma.astroCompatibilityRequest.findUnique.mockImplementation(
        ({
          where,
        }: {
          where: {
            requesterId_targetId: { requesterId: string; targetId: string };
          };
        }) =>
          Promise.resolve(
            where.requesterId_targetId.requesterId === 'u1' &&
              where.requesterId_targetId.targetId === 'u2'
              ? { id: 'existing' }
              : null,
          ),
      );

      await expect(service.createRequest('u1', 'u2')).rejects.toThrow(
        ConflictException,
      );
    });

    it('встречный запрос принимается автоматически, а не дублируется', async () => {
      // Б уже отправил заявку А; когда А в свою очередь запрашивает Б,
      // естественно читать это как обоюдное согласие, а не как второй pending.
      prisma.astroBirthData.findUnique.mockResolvedValue(BIRTH_A);
      const reverseRow = {
        id: 'reverse-req',
        requesterId: 'u2',
        targetId: 'u1',
        status: 'pending',
        createdAt: new Date(),
        respondedAt: null,
      };
      prisma.astroCompatibilityRequest.findUnique.mockImplementation(
        ({ where }: { where: Record<string, unknown> }) => {
          // createRequest ищет по составному ключу; respond (вызванный изнутри
          // для встречного запроса) — по id. Мок должен понимать обе формы.
          if (where.id) return Promise.resolve(reverseRow);
          const pair = where.requesterId_targetId as
            { requesterId: string; targetId: string } | undefined;
          if (pair?.requesterId === 'u2' && pair.targetId === 'u1') {
            return Promise.resolve(reverseRow);
          }
          return Promise.resolve(null);
        },
      );
      prisma.astroCompatibilityRequest.update.mockResolvedValue({
        id: 'reverse-req',
        requesterId: 'u2',
        targetId: 'u1',
        status: 'accepted',
        createdAt: new Date(),
        respondedAt: new Date(),
      });

      const result = await service.createRequest('u1', 'u2');

      expect(prisma.astroCompatibilityRequest.create).not.toHaveBeenCalled();
      expect(result.status).toBe('accepted');
    });
  });

  describe('ответ на запрос', () => {
    const pendingRow = {
      id: 'req-1',
      requesterId: 'u1',
      targetId: 'u2',
      status: 'pending',
      createdAt: new Date(),
      respondedAt: null,
    };

    it('уведомляет просителя о согласии', async () => {
      prisma.astroCompatibilityRequest.findUnique.mockResolvedValue(pendingRow);
      prisma.astroBirthData.findUnique.mockResolvedValue(BIRTH_A);
      prisma.astroCompatibilityRequest.update.mockResolvedValue({
        ...pendingRow,
        status: 'accepted',
        respondedAt: new Date(),
      });

      await service.respond('u2', 'req-1', true);

      expect(events.emit).toHaveBeenCalledWith('astro.compatibility.accepted', {
        name: 'astro.compatibility.accepted',
        recipientId: 'u1',
        senderName: expect.any(String),
      });
    });

    // «Вам отказали» — сообщение, которое ничего не даёт, но задевает.
    // Проситель увидит статус, когда сам зайдёт.
    it('об отказе никого не уведомляет', async () => {
      prisma.astroCompatibilityRequest.findUnique.mockResolvedValue(pendingRow);
      prisma.astroCompatibilityRequest.update.mockResolvedValue({
        ...pendingRow,
        status: 'declined',
        respondedAt: new Date(),
      });

      await service.respond('u2', 'req-1', false);

      expect(events.emit).not.toHaveBeenCalled();
    });

    it('ответить может только получатель', async () => {
      prisma.astroCompatibilityRequest.findUnique.mockResolvedValue(pendingRow);
      await expect(service.respond('u1', 'req-1', true)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('нельзя ответить на уже обработанный запрос', async () => {
      prisma.astroCompatibilityRequest.findUnique.mockResolvedValue({
        ...pendingRow,
        status: 'accepted',
      });
      await expect(service.respond('u2', 'req-1', true)).rejects.toThrow(
        ConflictException,
      );
    });

    it('принятие требует данных рождения получателя', async () => {
      prisma.astroCompatibilityRequest.findUnique.mockResolvedValue(pendingRow);
      prisma.astroBirthData.findUnique.mockResolvedValue(null);
      await expect(service.respond('u2', 'req-1', true)).rejects.toThrow(
        /данные рождения/,
      );
      expect(prisma.astroCompatibilityRequest.update).not.toHaveBeenCalled();
    });

    it('отказ не требует данных рождения', async () => {
      prisma.astroCompatibilityRequest.findUnique.mockResolvedValue(pendingRow);
      prisma.astroCompatibilityRequest.update.mockResolvedValue({
        ...pendingRow,
        status: 'declined',
        respondedAt: new Date(),
      });

      await expect(
        service.respond('u2', 'req-1', false),
      ).resolves.toMatchObject({
        status: 'declined',
      });
      expect(prisma.astroBirthData.findUnique).not.toHaveBeenCalled();
    });

    it('несуществующий запрос — 404', async () => {
      prisma.astroCompatibilityRequest.findUnique.mockResolvedValue(null);
      await expect(service.respond('u2', 'missing', true)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('приватность до согласия', () => {
    it('score отсутствует, пока запрос не принят', async () => {
      prisma.astroCompatibilityRequest.findMany.mockResolvedValue([
        {
          id: 'req-1',
          requesterId: 'u1',
          targetId: 'u2',
          status: 'pending',
          createdAt: new Date(),
          respondedAt: null,
        },
      ]);

      const [dto] = await service.list('u1');
      expect(dto.score).toBeNull();
    });

    it('score появляется сразу после принятия — расчёт не хранится, а пересчитывается', async () => {
      prisma.astroBirthData.findUnique.mockImplementation(
        ({ where }: { where: { userId: string } }) =>
          Promise.resolve(where.userId === 'u1' ? BIRTH_A : BIRTH_B),
      );
      prisma.astroCompatibilityRequest.findMany.mockResolvedValue([
        {
          id: 'req-1',
          requesterId: 'u1',
          targetId: 'u2',
          status: 'accepted',
          createdAt: new Date(),
          respondedAt: new Date(),
        },
      ]);

      const [dto] = await service.list('u1');

      expect(dto.score).not.toBeNull();
      expect(dto.score!.maxPoints).toBe(36);
    });

    it('в сводке о собеседнике нет положения его Луны', async () => {
      prisma.astroCompatibilityRequest.findMany.mockResolvedValue([
        {
          id: 'req-1',
          requesterId: 'u1',
          targetId: 'u2',
          status: 'pending',
          createdAt: new Date(),
          respondedAt: null,
        },
      ]);

      const [dto] = await service.list('u1');
      expect(dto.counterpart).not.toHaveProperty('moonRashi');
      expect(dto.counterpart).not.toHaveProperty('moonNakshatra');
      expect(Object.keys(dto.counterpart).sort()).toEqual(
        ['avatarUrl', 'name', 'userId'].sort(),
      );
    });
  });

  describe('ИИ-разбор совместимости', () => {
    const acceptedRow = {
      id: 'req-1',
      requesterId: 'u1',
      targetId: 'u2',
      status: 'accepted',
      createdAt: new Date(),
      respondedAt: new Date(),
    };

    beforeEach(() => {
      prisma.astroCompatibilityRequest.findUnique.mockResolvedValue(
        acceptedRow,
      );
      prisma.astroBirthData.findUnique.mockImplementation(
        ({ where }: { where: { userId: string } }) =>
          Promise.resolve(where.userId === 'u1' ? BIRTH_A : BIRTH_B),
      );
      prisma.astroBirthData.findUniqueOrThrow.mockImplementation(
        ({ where }: { where: { userId: string } }) =>
          Promise.resolve(where.userId === 'u1' ? BIRTH_A : BIRTH_B),
      );
    });

    it('доступ только для одной из двух сторон', async () => {
      await expect(service.reading('u3', 'req-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('нельзя запросить разбор до принятия', async () => {
      prisma.astroCompatibilityRequest.findUnique.mockResolvedValue({
        ...acceptedRow,
        status: 'pending',
      });
      await expect(service.reading('u1', 'req-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('готовый разбор берётся из кэша без обращения к провайдеру', async () => {
      prisma.astroCompatibilityReading.findUnique.mockResolvedValue({
        text: 'Уже есть',
      });

      const result = await service.reading('u1', 'req-1');

      expect(result).toEqual({
        text: 'Уже есть',
        available: true,
        blockedBy: null,
      });
      expect(generation.generateCompatibility).not.toHaveBeenCalled();
      expect(quota.check).not.toHaveBeenCalled();
    });

    it('кэш общий для обеих сторон вне зависимости от того, кто спрашивает', async () => {
      prisma.astroCompatibilityReading.findUnique.mockResolvedValue({
        text: 'Общий разбор',
      });

      const asRequester = await service.reading('u1', 'req-1');
      const asTarget = await service.reading('u2', 'req-1');

      expect(asRequester.text).toBe(asTarget.text);
    });

    it('выключенный ИИ не идёт к провайдеру и не бросает исключение', async () => {
      prisma.astroCompatibilityReading.findUnique.mockResolvedValue(null);
      settings.get.mockResolvedValue({ aiEnabled: false });

      await expect(service.reading('u1', 'req-1')).resolves.toEqual({
        text: null,
        available: false,
        blockedBy: 'ai_unavailable',
      });
      expect(generation.generateCompatibility).not.toHaveBeenCalled();
    });

    it('исчерпанная квота блокирует без обращения к провайдеру', async () => {
      prisma.astroCompatibilityReading.findUnique.mockResolvedValue(null);
      quota.check.mockResolvedValue({
        allowed: false,
        reason: 'quota_exhausted',
      });

      await expect(service.reading('u1', 'req-1')).resolves.toEqual({
        text: null,
        available: false,
        blockedBy: 'quota_exhausted',
      });
      expect(generation.generateCompatibility).not.toHaveBeenCalled();
    });

    it('успешная генерация сохраняет разбор и списывает фактический расход', async () => {
      prisma.astroCompatibilityReading.findUnique.mockResolvedValue(null);
      quota.check.mockResolvedValue({ allowed: true });
      generation.generateCompatibility.mockResolvedValue({
        text: 'Новый разбор',
        model: 'test-model',
        tokensIn: 400,
        tokensOut: 150,
      });

      const result = await service.reading('u1', 'req-1');

      expect(result.text).toBe('Новый разбор');
      expect(prisma.astroCompatibilityReading.upsert).toHaveBeenCalled();
      expect(quota.record).toHaveBeenCalledWith('u1', {
        tokensIn: 400,
        tokensOut: 150,
      });
    });

    it('в промпт передаётся только разбивка очков, не карты целиком', async () => {
      prisma.astroCompatibilityReading.findUnique.mockResolvedValue(null);
      quota.check.mockResolvedValue({ allowed: true });
      generation.generateCompatibility.mockResolvedValue({
        text: 'ок',
        model: 'test',
        tokensIn: 1,
        tokensOut: 1,
      });

      await service.reading('u1', 'req-1');

      const calls = generation.generateCompatibility.mock.calls as [
        Record<string, unknown>,
      ][];
      const [scoreArg] = calls[0];
      expect(scoreArg).toHaveProperty('kootas');
      expect(scoreArg).toHaveProperty('totalPoints');
      expect(scoreArg).not.toHaveProperty('bornAtUtc');
      expect(scoreArg).not.toHaveProperty('latitude');
    });
  });
});
