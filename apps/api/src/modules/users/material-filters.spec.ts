import { ConfigService } from '@nestjs/config';
import {
  effectiveLineageIds,
  lineageIdsLabel,
  materialMatchesFilters,
  parseMaterialFilters,
  resolveMaterialFilters,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PersonalDataService } from '../personal-data/personal-data.service';
import { UsersService } from './users.service';

/**
 * «Фильтры материалов» (VED-617): портальные поля `User.material*`, пишет
 * `PATCH /profile`, Образование и Медиатека только читают. Правила — в
 * `@vedamatch/shared/material-filters`, здесь проверяются и они, и запись.
 */
describe('resolveMaterialFilters — по анкете, пока не выбраны руками', () => {
  it('своя ступень, а у преданного — и своя линия', () => {
    expect(
      resolveMaterialFilters({ spiritualStage: 'devotee', lineage: 'ipbys' }),
    ).toEqual({ stages: ['devotee'], lineages: ['ipbys'], custom: false });
  });

  it('не преданному линию не навязывает', () => {
    expect(
      resolveMaterialFilters({ spiritualStage: 'yogi', lineage: 'ipbys' }),
    ).toEqual({ stages: ['yogi'], lineages: [], custom: false });
  });

  it('прежние «Все ступени» (VED-575) читаются как умолчание', () => {
    expect(
      resolveMaterialFilters({
        spiritualStage: 'seeker',
        lineage: null,
        showAllStages: true,
      }),
    ).toEqual({ stages: [], lineages: [], custom: false });
  });

  it('без анкеты и гостю — всё', () => {
    expect(resolveMaterialFilters(null)).toEqual({
      stages: [],
      lineages: [],
      custom: false,
    });
    expect(
      resolveMaterialFilters({ spiritualStage: null, lineage: 'iskcon' }),
    ).toEqual({ stages: [], lineages: [], custom: false });
  });

  it('выбор руками сильнее анкеты; мусор из базы отбрасывается', () => {
    expect(
      resolveMaterialFilters({
        spiritualStage: 'devotee',
        lineage: 'ipbys',
        materialFiltersSetAt: new Date(),
        materialStages: ['yogi', 'seeker', 'guru'],
        materialLineages: ['advaita_vamsha', 'iskcon', 'unknown'],
      }),
    ).toEqual({
      stages: ['seeker', 'yogi'],
      lineages: ['iskcon', 'advaita_vamsha'],
      custom: true,
    });
  });
});

describe('parseMaterialFilters', () => {
  it('null — вернуться к анкете', () => {
    expect(parseMaterialFilters(null)).toBeNull();
  });

  it('неверный запрос — undefined', () => {
    expect(parseMaterialFilters(undefined)).toBeUndefined();
    expect(parseMaterialFilters([])).toBeUndefined();
    expect(
      parseMaterialFilters({ stages: ['guru'], lineages: [] }),
    ).toBeUndefined();
    expect(
      parseMaterialFilters({ stages: [], lineages: ['x'] }),
    ).toBeUndefined();
    expect(parseMaterialFilters({ stages: [] })).toBeUndefined();
  });

  it('все ступени и все линии сжимаются в «все»', () => {
    expect(
      parseMaterialFilters({
        stages: ['devotee', 'yogi', 'practitioner', 'seeker'],
        lineages: [
          'iskcon',
          'sri_chaitanya_gaudiya_math',
          'sri_chaitanya_saraswat_math',
          'sri_gopinath_gaudiya_math',
          'ipbys',
          'nityananda_vamsha',
          'advaita_vamsha',
          'gadadhara_parivara',
          'narottama_parivara',
          'shyamananda_parivara',
        ],
      }),
    ).toEqual({ stages: [], lineages: [] });
  });

  it('порядок — по пути и по справочнику, без повторов', () => {
    expect(
      parseMaterialFilters({
        stages: ['yogi', 'seeker', 'yogi'],
        lineages: ['ipbys', 'iskcon'],
      }),
    ).toEqual({ stages: ['seeker', 'yogi'], lineages: ['iskcon', 'ipbys'] });
  });
});

describe('effectiveLineageIds — выбор в сервисе сильнее фильтров', () => {
  const filters = { stages: [], lineages: ['iskcon' as const] };

  it('без настройки сервиса — линии из фильтров', () => {
    expect(effectiveLineageIds(null, filters)).toEqual(['iskcon']);
    expect(effectiveLineageIds(null, { stages: [], lineages: [] })).toBeNull();
  });

  it('«all» в сервисе снимает фильтр, линия или группа — заменяют', () => {
    expect(effectiveLineageIds('all', filters)).toBeNull();
    expect(effectiveLineageIds('ipbys', filters)).toEqual(['ipbys']);
    expect(effectiveLineageIds('group:iskcon', filters)).toEqual(['iskcon']);
  });
});

describe('materialMatchesFilters', () => {
  const filters = {
    stages: ['seeker' as const],
    lineages: ['iskcon' as const],
  };

  it('материал без разметки — для всех', () => {
    expect(materialMatchesFilters({}, filters)).toBe(true);
  });

  it('нужны совпадения в обоих разделах', () => {
    expect(
      materialMatchesFilters(
        { audienceStages: ['seeker', 'yogi'], lineage: 'iskcon' },
        filters,
      ),
    ).toBe(true);
    expect(
      materialMatchesFilters(
        { audienceStages: ['yogi'], lineage: 'iskcon' },
        filters,
      ),
    ).toBe(false);
    expect(
      materialMatchesFilters(
        { audienceStages: ['seeker'], lineage: 'ipbys' },
        filters,
      ),
    ).toBe(false);
  });
});

describe('lineageIdsLabel', () => {
  it('одна линия, группа целиком и набор', () => {
    expect(lineageIdsLabel([])).toBeNull();
    expect(lineageIdsLabel(['iskcon'])).toBe('ISKCON');
    expect(
      lineageIdsLabel([
        'sri_chaitanya_gaudiya_math',
        'sri_chaitanya_saraswat_math',
        'sri_gopinath_gaudiya_math',
        'ipbys',
      ]),
    ).toBe('Гаудия-матх');
    expect(lineageIdsLabel(['iskcon', 'ipbys'])).toBe('ISKCON, IPBYS');
  });
});

describe('UsersService — «Фильтры материалов» (VED-617)', () => {
  const stored = {
    id: 'u1',
    email: 'u1@example.com',
    name: 'Максим',
    spiritualName: null,
    avatarUrl: null,
    avatarKey: null,
    birthDate: null,
    gender: null,
    homeLocation: null,
    socialLinks: null,
    messengers: null,
    role: 'user',
    spiritualStage: 'seeker',
    devoteeVerificationStatus: null,
    lastSelfIdentificationAt: null,
    photoVerifiedAt: null,
    photoVerificationRequestedAt: null,
    trialEndsAt: null,
    subscriptionPaidUntil: null,
    accountStatus: 'active',
    pendingDeletionAt: null,
    showAllStages: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    appSettings: { findUnique: jest.fn() },
  };
  let service: UsersService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.user.findUnique.mockResolvedValue(stored);
    prisma.user.update.mockResolvedValue(stored);
    prisma.appSettings.findUnique.mockResolvedValue(null);
    service = new UsersService(
      prisma as unknown as PrismaService,
      { get: () => undefined } as unknown as ConfigService,
      { emit: jest.fn() } as never,
      new PersonalDataService(
        prisma as unknown as PrismaService,
        { isEnabled: false } as never,
      ),
    );
  });

  it('сохраняет выбор руками с отметкой времени', async () => {
    await service.updateProfile('u1', {
      materialFilters: { stages: ['yogi'], lineages: ['iskcon'] },
    });

    const [[{ data }]] = prisma.user.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(data.materialStages).toEqual(['yogi']);
    expect(data.materialLineages).toEqual(['iskcon']);
    expect(data.materialFiltersSetAt).toBeInstanceOf(Date);
    // Анкету выбор не трогает.
    expect(data).not.toHaveProperty('spiritualStage');
    expect(data).not.toHaveProperty('lineage');
  });

  it('null — сброс к фильтрам по анкете', async () => {
    await service.updateProfile('u1', { materialFilters: null });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          materialStages: [],
          materialLineages: [],
          materialFiltersSetAt: null,
        },
      }),
    );
  });

  it('неизвестная ступень — ошибка, а не запись', async () => {
    await expect(
      service.updateProfile('u1', {
        materialFilters: { stages: ['guru'], lineages: [] } as never,
      }),
    ).rejects.toThrow('Неизвестная ступень или линия');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('профиль отдаёт действующие фильтры', async () => {
    const profile = await service.getProfile('u1');

    // В `stored` — ищущий с прежними «Все ступенями».
    expect(profile.materialFilters).toEqual({
      stages: [],
      lineages: [],
      custom: false,
    });
  });
});
