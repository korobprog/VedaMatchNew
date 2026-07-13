import type { AccessTokenPayload } from '@vedamatch/shared';

jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class AuthGuard {},
  CurrentUser: () => () => undefined,
}));

import { MotivationController } from './motivation.controller';

describe('MotivationController moderation endpoints', () => {
  const user = { sub: 'actor-1', role: 'service-admin' } as AccessTokenPayload;

  it('passes the authenticated actor to every moderation command', async () => {
    const service = {
      approveText: jest.fn(),
      approveImage: jest.fn(),
      rejectModeration: jest.fn(),
      regenerateModerationImage: jest.fn(),
      regenerate: jest.fn(),
    };
    const controller = new MotivationController(service as never);

    await controller.approveText(user, 'post-1', { visualStyle: 'warm_documentary' });
    await controller.approveImage(user, 'post-1');
    await controller.reject(user, 'post-1', { reason: 'Needs review' });
    await controller.regenerateImage(user, 'post-1', { visualStyle: 'cinematic_nature' });
    await controller.regenerate(user, 'post-1');

    expect(service.approveText).toHaveBeenCalledWith('service-admin', 'actor-1', 'post-1', 'warm_documentary');
    expect(service.approveImage).toHaveBeenCalledWith('service-admin', 'actor-1', 'post-1');
    expect(service.rejectModeration).toHaveBeenCalledWith('service-admin', 'actor-1', 'post-1', 'Needs review');
    expect(service.regenerateModerationImage).toHaveBeenCalledWith('service-admin', 'actor-1', 'post-1', 'cinematic_nature');
    expect(service.regenerate).toHaveBeenCalledWith('service-admin', 'actor-1', 'post-1');
  });
});
