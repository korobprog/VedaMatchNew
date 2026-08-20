// Настоящий AuthGuard тянет за собой jose в формате ESM, который jest здесь не
// разбирает. Контроллер проверяем без охраны — см. union-recommendations.controller.spec.ts.
jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class AuthGuard {},
  CurrentUser: () => () => undefined,
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

function user(role: AccessTokenPayload['role']): AccessTokenPayload {
  return { sub: 'user-1', role } as AccessTokenPayload;
}

describe('TelemetryController', () => {
  const service = {
    recordInstallEnvironment: jest.fn(),
    installEnvironmentSummary: jest.fn(),
  };
  const controller = new TelemetryController(
    service as unknown as TelemetryService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('записывает корректный замер', async () => {
    const report = {
      browser: 'chrome',
      platform: 'android',
      displayMode: 'standalone',
      standaloneCapable: true,
    };

    await expect(controller.record(user('user'), report)).resolves.toEqual({
      ok: true,
    });
    expect(service.recordInstallEnvironment).toHaveBeenCalledWith(
      'user-1',
      report,
    );
  });

  it('не пускает в базу замер с неизвестными значениями', async () => {
    await expect(
      controller.record(user('user'), { browser: 'netscape' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.recordInstallEnvironment).not.toHaveBeenCalled();
  });

  it('отдаёт сводку только администратору', () => {
    expect(() => controller.summary(user('user'))).toThrow(ForbiddenException);
    expect(service.installEnvironmentSummary).not.toHaveBeenCalled();

    void controller.summary(user('admin'));
    expect(service.installEnvironmentSummary).toHaveBeenCalledTimes(1);
  });
});
