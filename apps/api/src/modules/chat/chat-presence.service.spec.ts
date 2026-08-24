import { ConfigService } from '@nestjs/config';
import { ChatPresenceService } from './chat-presence.service';

/** Без REDIS_HOST сервис обязан работать на памяти процесса — тот же
 *  приём, что уже проверен для ChatEventsService в проде. */
function serviceWithoutRedis(): ChatPresenceService {
  const config = { get: () => undefined } as unknown as ConfigService;
  return new ChatPresenceService(config);
}

describe('ChatPresenceService (без Redis)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('после markViewing isViewing подтверждает ту же беседу', async () => {
    const service = serviceWithoutRedis();
    await service.markViewing('u1', 'conv-1');

    expect(await service.isViewing('u1', 'conv-1')).toBe(true);
  });

  it('другая беседа того же человека — не совпадение', async () => {
    const service = serviceWithoutRedis();
    await service.markViewing('u1', 'conv-1');

    expect(await service.isViewing('u1', 'conv-2')).toBe(false);
  });

  it('без markViewing присутствия нет', async () => {
    const service = serviceWithoutRedis();

    expect(await service.isViewing('u1', 'conv-1')).toBe(false);
  });

  it('присутствие протухает по истечении TTL', async () => {
    const service = serviceWithoutRedis();
    const start = new Date('2026-08-24T10:00:00.000Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(start);

    await service.markViewing('u1', 'conv-1');

    jest.spyOn(Date, 'now').mockReturnValue(start + 25_001);
    expect(await service.isViewing('u1', 'conv-1')).toBe(false);
  });

  it('разные пользователи не путаются между собой', async () => {
    const service = serviceWithoutRedis();
    await service.markViewing('u1', 'conv-1');
    await service.markViewing('u2', 'conv-2');

    expect(await service.isViewing('u1', 'conv-1')).toBe(true);
    expect(await service.isViewing('u2', 'conv-1')).toBe(false);
  });
});
