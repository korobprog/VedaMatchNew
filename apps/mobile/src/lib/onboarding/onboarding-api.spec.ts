import type { ApiClient } from '@/lib/api/client';
import { createOnboardingApi, submitOnboarding } from './onboarding-api';
import { DEFAULT_ANSWERS } from './onboarding-steps';

/**
 * Ручки те же, что у мастера сайта. Тест сторожит адреса, метод и порядок:
 * этап пути проставляет сервер по анкете, и перепутанный порядок оставил бы
 * человека с этапом, но без пола — то есть снова в онбординге, но уже без
 * анкеты, которой он этот этап и получил.
 */
function client(): { api: ApiClient; calls: { path: string; method?: string; body?: unknown }[] } {
  const calls: { path: string; method?: string; body?: unknown }[] = [];
  return {
    calls,
    api: {
      request: async <T,>(path: string, options?: { method?: string; body?: unknown }) => {
        calls.push({ path, method: options?.method, body: options?.body });
        return {} as T;
      },
    },
  };
}

describe('createOnboardingApi', () => {
  it('профиль правит той же ручкой, что экран «Профиль»', async () => {
    const { api, calls } = client();
    await createOnboardingApi(api).saveProfile({ gender: 'male', lineage: 'iskcon' });
    expect(calls).toEqual([
      { path: '/profile', method: 'PATCH', body: { gender: 'male', lineage: 'iskcon' } },
    ]);
  });

  it('анкету отправляет в self-identification/submit', async () => {
    const { api, calls } = client();
    await createOnboardingApi(api).submitAnswers(DEFAULT_ANSWERS);
    expect(calls).toEqual([
      { path: '/self-identification/submit', method: 'POST', body: DEFAULT_ANSWERS },
    ]);
  });
});

describe('submitOnboarding', () => {
  it('сперва профиль, потом анкета', async () => {
    const { api, calls } = client();
    await submitOnboarding(createOnboardingApi(api), {
      profile: { gender: 'female' },
      answers: DEFAULT_ANSWERS,
    });
    expect(calls.map((c) => c.path)).toEqual(['/profile', '/self-identification/submit']);
  });

  it('без анкеты ходит только в профиль', async () => {
    const { api, calls } = client();
    await submitOnboarding(createOnboardingApi(api), { profile: { gender: 'female' }, answers: null });
    expect(calls.map((c) => c.path)).toEqual(['/profile']);
  });

  // Упавший профиль не должен утащить за собой анкету: этап без пола — то же
  // состояние «онбординг не пройден», но с потерянными ответами.
  it('отказ на профиле не отправляет анкету', async () => {
    const calls: string[] = [];
    const api: ApiClient = {
      request: async <T,>(path: string) => {
        calls.push(path);
        if (path === '/profile') throw new Error('400');
        return {} as T;
      },
    };
    await expect(
      submitOnboarding(createOnboardingApi(api), { profile: { gender: 'male' }, answers: DEFAULT_ANSWERS }),
    ).rejects.toThrow('400');
    expect(calls).toEqual(['/profile']);
  });
});
