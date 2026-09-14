import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';

jest.mock('jose', () => ({}));
jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class AuthGuard {},
  CurrentUser: () => () => undefined,
}));

import { ChatController } from './chat.controller';

/**
 * Nest сверяет маршруты в порядке объявления методов. Литеральный сегмент
 * обязан стоять раньше параметра на той же позиции, иначе он до него не дойдёт.
 */
function routes() {
  const proto = ChatController.prototype as unknown as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor')
    .map((name) => {
      const handler = proto[name] as object;
      return {
        path: Reflect.getMetadata(PATH_METADATA, handler) as string | undefined,
        method: Reflect.getMetadata(METHOD_METADATA, handler) as
          RequestMethod | undefined,
      };
    })
    .filter((route) => route.path !== undefined);
}

describe('порядок маршрутов чата', () => {
  it('выход из беседы объявлен раньше удаления участника по id', () => {
    const list = routes();
    const leave = list.findIndex(
      (r) =>
        r.method === RequestMethod.DELETE &&
        r.path === 'conversations/:id/members/me',
    );
    const remove = list.findIndex(
      (r) =>
        r.method === RequestMethod.DELETE &&
        r.path === 'conversations/:id/members/:userId',
    );
    expect(leave).toBeGreaterThanOrEqual(0);
    expect(remove).toBeGreaterThan(leave);
  });
});
