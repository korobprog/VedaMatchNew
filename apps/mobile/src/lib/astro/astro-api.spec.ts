import type { AstroTodayDto } from '@vedamatch/shared';
import { ApiError, type ApiClient } from '@/lib/api/client';
import { createAstroApi } from './astro-api';

function clientThat(respond: (path: string) => Promise<unknown>): ApiClient & { paths: string[] } {
  const paths: string[] = [];
  return {
    paths,
    request: <T>(path: string) => {
      paths.push(path);
      return respond(path) as Promise<T>;
    },
  };
}

const dto: AstroTodayDto = {
  forDate: '2026-09-27',
  moonBhava: 3,
  moonRashi: 1,
  moonNakshatra: 1,
  currentMahadasha: { lord: 'jupiter' },
  currentAntardasha: { lord: 'moon' },
  text: 'фраза',
};

describe('createAstroApi().today', () => {
  it('ходит в ту же ручку, что сайт', async () => {
    const client = clientThat(async () => dto);
    await expect(createAstroApi(client).today()).resolves.toEqual(dto);
    expect(client.paths).toEqual(['/astro/today']);
  });

  it('404 «нужны данные рождения» — null, а не ошибка', async () => {
    const client = clientThat(async () => {
      throw new ApiError(404, 'Нужны точные дата, время и место рождения', null);
    });
    await expect(createAstroApi(client).today()).resolves.toBeNull();
  });

  it('прочие ошибки пробрасываются — их покажет экран', async () => {
    const failure = new ApiError(500, 'boom', null);
    const client = clientThat(async () => {
      throw failure;
    });
    await expect(createAstroApi(client).today()).rejects.toBe(failure);
  });
});
