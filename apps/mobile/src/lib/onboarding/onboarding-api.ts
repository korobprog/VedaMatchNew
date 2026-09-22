import type { SelfIdentificationSubmitResult, UserProfile } from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';
import { createProfileApi } from '@/lib/profile/profile-api';
import type { OnboardingSubmit } from './onboarding-steps';

/**
 * Ручки онбординга — те же, которыми пользуется мастер сайта
 * (`apps/web/src/components/welcome-wizard.tsx`): `PATCH /profile` для пола и
 * линии и `POST /self-identification/submit` для анкеты. Нового серверного
 * кода приложение не потребовало: `AuthGuard` принимает `Authorization:
 * Bearer` наравне с cookie сайта, а этап по ответам считает сервер сам.
 *
 * Профиль правится тем же клиентом, что и на экране «Профиль»
 * (`lib/profile/profile-api.ts`), а не своей копией вызова: тело запроса и
 * разбор ошибок обязаны быть одни, иначе два места начнут по-разному
 * объяснять один и тот же отказ сервера.
 */
export function createOnboardingApi(api: ApiClient) {
  const profile = createProfileApi(api);
  return {
    saveProfile: (body: OnboardingSubmit['profile']): Promise<UserProfile> => profile.update(body),
    submitAnswers: (answers: NonNullable<OnboardingSubmit['answers']>) =>
      api.request<SelfIdentificationSubmitResult>('/self-identification/submit', {
        method: 'POST',
        body: answers,
      }),
  };
}

export type OnboardingApi = ReturnType<typeof createOnboardingApi>;

/**
 * Отправка целиком: сперва профиль, потом анкета — тот же порядок, что в
 * мастере сайта. Порядок важен: этап пути сервер проставляет по анкете, и
 * упавший на ней запрос оставляет человека с полом, но без этапа, то есть с
 * онбордингом, который честно повторится при следующем запуске, а не
 * пропадёт «наполовину пройденным».
 */
export async function submitOnboarding(api: OnboardingApi, submit: OnboardingSubmit): Promise<void> {
  await api.saveProfile(submit.profile);
  if (submit.answers) await api.submitAnswers(submit.answers);
}
