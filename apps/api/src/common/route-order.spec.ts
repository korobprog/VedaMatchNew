import { Controller, Delete, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  findRouteShadows,
  formatShadow,
  joinPath,
  parseControllerFile,
  parseModuleControllerOrder,
  shadows,
  stripComments,
  type RouteDeclaration,
} from './route-order';

function route(
  decorator: RouteDeclaration['decorator'],
  path: string,
): RouteDeclaration {
  return { controller: 'X', decorator, path, line: 1 };
}

describe('shadows', () => {
  it('параметр раньше литерала перехватывает литерал', () => {
    expect(
      shadows(
        route('Delete', '/chat/conversations/:id/members/:userId'),
        route('Delete', '/chat/conversations/:id/members/me'),
      ),
    ).toBe(true);
  });

  it('литерал раньше параметра законен', () => {
    expect(
      shadows(
        route('Delete', '/chat/conversations/:id/members/me'),
        route('Delete', '/chat/conversations/:id/members/:userId'),
      ),
    ).toBe(false);
  });

  it('разные методы друг другу не мешают', () => {
    expect(
      shadows(route('Get', '/notices/:id'), route('Delete', '/notices/all')),
    ).toBe(false);
  });

  it('@All перехватывает любой метод', () => {
    expect(
      shadows(route('All', '/notices/:id'), route('Get', '/notices/all')),
    ).toBe(true);
  });

  it('разная длина пути не пересекается', () => {
    expect(
      shadows(route('Get', '/notices/:id'), route('Get', '/notices/me/drafts')),
    ).toBe(false);
  });

  it('расходящиеся литералы не пересекаются', () => {
    expect(
      shadows(
        route('Get', '/notices/drafts/:id'),
        route('Get', '/notices/archive/all'),
      ),
    ).toBe(false);
  });

  it('два параметра на одном месте не перекрытие', () => {
    expect(
      shadows(route('Get', '/notices/:id'), route('Get', '/notices/:slug')),
    ).toBe(false);
  });
});

describe('findRouteShadows', () => {
  it('находит перекрытие и оставляет чистый список пустым', () => {
    const broken = [
      route('Delete', '/chat/conversations/:id/members/:userId'),
      route('Delete', '/chat/conversations/:id/members/me'),
    ];
    const fixed = [broken[1], broken[0]];
    expect(findRouteShadows(broken)).toHaveLength(1);
    expect(findRouteShadows(fixed)).toEqual([]);
    expect(formatShadow(findRouteShadows(broken)[0])).toContain('недостижим');
  });
});

describe('stripComments', () => {
  it('гасит декоратор из комментария, не сдвигая строки', () => {
    const source = "// @Get(':id')\n/* @Get(':x') */\n@Get('real')\n";
    const stripped = stripComments(source);
    expect(stripped).not.toContain("@Get(':id')");
    expect(stripped).not.toContain("@Get(':x')");
    expect(stripped).toContain("@Get('real')");
    expect(stripped.split('\n')).toHaveLength(source.split('\n').length);
  });
});

describe('parseControllerFile', () => {
  const source = [
    "@Controller('chat')",
    'export class ChatController {',
    "  /** Комментарий с @Delete('conversations/:id/members/:userId') внутри. */",
    "  @Delete('conversations/:id/members/me')",
    '  leave() {}',
    "  @Delete('conversations/:id/members/:userId')",
    '  removeMember() {}',
    '}',
    "@Controller('notices')",
    'export class NoticesResponsesController {',
    "  @Get('subscriptions')",
    '  list() {}',
    '}',
  ].join('\n');

  it('делит маршруты по классам и склеивает префикс', () => {
    const parsed = parseControllerFile(source);
    expect(parsed.map((c) => c.name)).toEqual([
      'ChatController',
      'NoticesResponsesController',
    ]);
    expect(parsed[0].routes.map((r) => r.path)).toEqual([
      '/chat/conversations/:id/members/me',
      '/chat/conversations/:id/members/:userId',
    ]);
    expect(parsed[1].routes[0].path).toBe('/notices/subscriptions');
    expect(parsed[0].routes[0].line).toBe(4);
  });

  it('пустой путь метода даёт голый префикс', () => {
    const parsed = parseControllerFile(
      "@Controller('music/playlists')\nclass P {\n  @Get()\n  list() {}\n}",
    );
    expect(parsed[0].routes[0].path).toBe('/music/playlists');
  });
});

describe('parseModuleControllerOrder', () => {
  it('читает порядок регистрации контроллеров', () => {
    const source = [
      '@Module({',
      '  controllers: [NoticesResponsesController, NoticesController],',
      '  providers: [NoticesService],',
      '})',
      'export class NoticesModule {}',
    ].join('\n');
    expect(parseModuleControllerOrder(source)).toEqual([
      'NoticesResponsesController',
      'NoticesController',
    ]);
  });

  it('модуль без контроллеров даёт пустой список', () => {
    expect(parseModuleControllerOrder('@Module({ providers: [] })')).toEqual(
      [],
    );
  });
});

describe('joinPath', () => {
  it('не плодит двойные слэши', () => {
    expect(joinPath('chat', 'conversations/:id')).toBe(
      '/chat/conversations/:id',
    );
    expect(joinPath('chat/', '/conversations')).toBe('/chat/conversations');
    expect(joinPath('', 'notices')).toBe('/notices');
  });
});

/**
 * Опора для всего остального: правило «первый объявленный побеждает» здесь не
 * пересказано, а проверено настоящим HTTP-запросом через роутер Nest. Если
 * Nest когда-нибудь начнёт сортировать маршруты сам, упадёт именно этот тест,
 * и разбор порядка выше станет не нужен.
 */
@Controller('probe')
class LiteralFirstController {
  @Delete('items/:id/members/me')
  leave() {
    return { handler: 'leave' };
  }

  @Delete('items/:id/members/:userId')
  removeMember() {
    return { handler: 'removeMember' };
  }
}

@Controller('probe')
class ParamFirstController {
  @Delete('other/:id/members/:userId')
  removeMember() {
    return { handler: 'removeMember' };
  }

  @Delete('other/:id/members/me')
  leave() {
    return { handler: 'leave' };
  }
}

describe('Nest сопоставляет маршруты в порядке объявления', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LiteralFirstController, ParamFirstController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('литерал раньше параметра — «me» доходит до своего обработчика', async () => {
    const response = await request(app.getHttpServer())
      .delete('/probe/items/c1/members/me')
      .expect(200);
    expect(response.body).toEqual({ handler: 'leave' });
  });

  it('параметр раньше литерала — «me» до обработчика не доходит', async () => {
    const response = await request(app.getHttpServer())
      .delete('/probe/other/c1/members/me')
      .expect(200);
    expect(response.body).toEqual({ handler: 'removeMember' });
  });
});
