import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AstroChartService } from './astro-chart.service';
import { AstronomiaEphemerisProvider } from './ephemeris/astronomia-provider';

const birthRow = {
  bornAtUtc: new Date('1987-05-12T02:20:00.000Z'),
  latitude: 55.7558,
  longitude: 37.6173,
  timeAccuracy: 'exact' as const,
};

describe('AstroChartService', () => {
  const prisma = { astroBirthData: { findUnique: jest.fn() } };
  const service = new AstroChartService(
    prisma as unknown as PrismaService,
    new AstronomiaEphemerisProvider(),
  );

  beforeEach(() => jest.resetAllMocks());

  it('без данных рождения сообщает, что их надо заполнить', async () => {
    prisma.astroBirthData.findUnique.mockResolvedValue(null);
    await expect(service.chart('user-1')).rejects.toThrow(NotFoundException);
  });

  it('строит карту по сохранённому моменту рождения', async () => {
    prisma.astroBirthData.findUnique.mockResolvedValue(birthRow);

    const chart = await service.chart(
      'user-1',
      new Date('2026-08-09T00:00:00Z'),
    );

    expect(chart.bornAtUtc).toBe(birthRow.bornAtUtc.toISOString());
    expect(chart.grahas).toHaveLength(9);
    expect(chart.lagna).not.toBeNull();
    expect(chart.dasha).not.toBeNull();
  });

  it('повторный расчёт даёт тот же отпечаток — кэш можно держать вечно', async () => {
    prisma.astroBirthData.findUnique.mockResolvedValue(birthRow);

    const first = await service.chart(
      'user-1',
      new Date('2026-08-09T00:00:00Z'),
    );
    const second = await service.chart(
      'user-1',
      new Date('2030-01-01T00:00:00Z'),
    );

    // Момент просмотра меняет текущую дашу, но не саму карту.
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.dasha!.currentMahadasha.lord).toBeDefined();
  });

  it('при неизвестном времени отдаёт карту без лагны и даш', async () => {
    prisma.astroBirthData.findUnique.mockResolvedValue({
      ...birthRow,
      timeAccuracy: 'unknown' as const,
    });

    const chart = await service.chart('user-1');

    expect(chart.lagna).toBeNull();
    expect(chart.dasha).toBeNull();
    expect(chart.grahas).toHaveLength(9);
  });
});
