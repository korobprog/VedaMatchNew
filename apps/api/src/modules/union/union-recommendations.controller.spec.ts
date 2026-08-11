// Настоящий AuthGuard тянет за собой jose в формате ESM, который jest здесь не
// разбирает. Контроллер проверяем без охраны — см. motivation.controller.spec.ts.
jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class AuthGuard {},
  CurrentUser: () => () => undefined,
}));

import { UnionRecommendationsController } from './union-recommendations.controller';
import type { UnionProfileService } from './union-profile.service';

describe('UnionRecommendationsController', () => {
  const getRecommendations = jest.fn().mockResolvedValue({ items: [] });
  const controller = new UnionRecommendationsController({
    getRecommendations,
  } as unknown as UnionProfileService);
  const user = { sub: 'me' } as never;

  beforeEach(() => getRecommendations.mockClear());

  it('passes a single repeated goal as a one-element list', async () => {
    await controller.recommendations(user, { intentions: 'family' });

    expect(getRecommendations).toHaveBeenCalledWith(
      'me',
      expect.objectContaining({ intentions: ['family'] }),
    );
  });

  it('keeps every value when the goal parameter repeats', async () => {
    await controller.recommendations(user, {
      intentions: ['family', 'service'],
    });

    expect(getRecommendations).toHaveBeenCalledWith(
      'me',
      expect.objectContaining({ intentions: ['family', 'service'] }),
    );
  });

  it('takes the first value of a repeated scalar parameter', async () => {
    await controller.recommendations(user, { city: ['Москва', 'Казань'] });

    expect(getRecommendations).toHaveBeenCalledWith(
      'me',
      expect.objectContaining({ city: 'Москва' }),
    );
  });
});
