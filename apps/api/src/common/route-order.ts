/**
 * Порядок маршрутов: литеральный сегмент обязан стоять раньше параметра.
 *
 * Nest не сортирует маршруты — он отдаёт их Express в том порядке, в каком
 * они объявлены, а Express берёт первый подошедший. Поэтому
 * `@Delete('conversations/:id/members/:userId')`, объявленный раньше
 * `@Delete('conversations/:id/members/me')`, забирает себе и «me»: выход из
 * беседы уходит в удаление участника с идентификатором «me» и отвечает
 * «Участник не найден». Это ровно тот дефект, который чинил коммит
 * `ba87ed43`; хелпер здесь нужен, чтобы порядок не сломали снова.
 *
 * Порядок считается по двум источникам сразу: методы внутри класса идут так,
 * как написаны, а классы — так, как перечислены в `controllers` модуля.
 * Без второго источника разбор врёт: в `notices.controller.ts` `@Get(':id')`
 * написан выше `@Get('subscriptions')`, но `NoticesResponsesController`
 * зарегистрирован раньше `NoticesController`, и подписки живы.
 *
 * Модуль намеренно не знает про файловую систему: на вход — исходник строкой,
 * на выход — данные. Обход репозитория живёт в `route-order.audit.spec.ts`.
 */

export const HTTP_DECORATORS = [
  'Get',
  'Post',
  'Put',
  'Patch',
  'Delete',
  'Head',
  'Options',
  'All',
] as const;

export type HttpDecorator = (typeof HTTP_DECORATORS)[number];

export interface RouteDeclaration {
  /** Имя класса-контроллера — чтобы сообщение об ошибке было адресным. */
  controller: string;
  decorator: HttpDecorator;
  /** Полный путь: префикс `@Controller` плюс путь метода. */
  path: string;
  /** Строка исходника с декоратором метода. */
  line: number;
}

export interface ControllerDeclaration {
  name: string;
  prefix: string;
  routes: RouteDeclaration[];
}

export interface RouteShadow {
  /** Маршрут, до которого запрос не дойдёт. */
  hidden: RouteDeclaration;
  /** Маршрут, который перехватит его запросы. */
  shadowedBy: RouteDeclaration;
}

/**
 * Комментарии заменяются пробелами с сохранением переводов строк: иначе
 * `@Get(':id')`, упомянутый в JSDoc рядом с настоящим маршрутом, попадёт в
 * разбор и даст ложную тревогу — так и случилось в первом прогоне по
 * `music-playlists.controller.ts`. Номера строк при такой замене не едут.
 */
export function stripComments(source: string): string {
  const blank = (chunk: string) => chunk.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\/\/[^\n]*/g, blank);
}

const DECORATOR_RE = new RegExp(
  `@(Controller|${HTTP_DECORATORS.join('|')})\\(\\s*(?:'([^']*)'|"([^"]*)"|\`([^\`]*)\`)?`,
  'g',
);
const CLASS_RE = /\bclass\s+([A-Za-z0-9_$]+)/g;

/** Склеить префикс контроллера и путь метода в один путь без пустых сегментов. */
export function joinPath(prefix: string, path: string): string {
  const parts = [...prefix.split('/'), ...path.split('/')].filter(Boolean);
  return `/${parts.join('/')}`;
}

/**
 * Разобрать файл контроллера. В одном файле контроллеров бывает несколько
 * (`notices`, `vacancies`), поэтому маршруты раскладываются по классам:
 * `@Controller(...)` открывает новый класс, следующие HTTP-декораторы — его.
 */
export function parseControllerFile(source: string): ControllerDeclaration[] {
  const code = stripComments(source);
  const controllers: ControllerDeclaration[] = [];
  let current: ControllerDeclaration | undefined;

  DECORATOR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DECORATOR_RE.exec(code))) {
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    const line = code.slice(0, match.index).split('\n').length;

    if (match[1] === 'Controller') {
      CLASS_RE.lastIndex = match.index;
      const named = CLASS_RE.exec(code);
      current = {
        name: named?.[1] ?? `<без имени>:${line}`,
        prefix: value,
        routes: [],
      };
      controllers.push(current);
      continue;
    }

    // HTTP-декоратор вне класса-контроллера разбирать не о чем.
    if (!current) continue;
    current.routes.push({
      controller: current.name,
      decorator: match[1] as HttpDecorator,
      path: joinPath(current.prefix, value),
      line,
    });
  }

  return controllers;
}

const MODULE_CONTROLLERS_RE = /controllers\s*:\s*\[([^\]]*)\]/;

/** Имена контроллеров в том порядке, в каком модуль их регистрирует. */
export function parseModuleControllerOrder(source: string): string[] {
  const match = MODULE_CONTROLLERS_RE.exec(stripComments(source));
  if (!match) return [];
  return match[1]
    .split(',')
    .map((name) => name.trim())
    .filter((name) => /^[A-Za-z0-9_$]+$/.test(name));
}

function segments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function isParam(segment: string): boolean {
  return segment.startsWith(':');
}

/**
 * Перехватывает ли `earlier` запросы, адресованные `later`.
 *
 * Считается только случай, который ломает работу: то же число сегментов, тот
 * же метод (или `@All` раньше всех), у `earlier` параметр там, где у `later`
 * литерал, и нигде расхождения литералов. Обратный порядок — литерал раньше
 * параметра — законен и есть в репозитории десятками.
 */
export function shadows(
  earlier: RouteDeclaration,
  later: RouteDeclaration,
): boolean {
  if (earlier.decorator !== 'All' && earlier.decorator !== later.decorator)
    return false;

  const a = segments(earlier.path);
  const b = segments(later.path);
  if (a.length !== b.length) return false;

  let swallowsLiteral = false;
  for (let i = 0; i < a.length; i += 1) {
    if (isParam(a[i])) {
      if (!isParam(b[i])) swallowsLiteral = true;
      continue;
    }
    if (a[i] !== b[i]) return false;
  }
  return swallowsLiteral;
}

/** Все перекрытия в списке маршрутов, поданном в порядке регистрации. */
export function findRouteShadows(routes: RouteDeclaration[]): RouteShadow[] {
  const found: RouteShadow[] = [];
  for (let i = 0; i < routes.length; i += 1)
    for (let j = i + 1; j < routes.length; j += 1)
      if (shadows(routes[i], routes[j]))
        found.push({ hidden: routes[j], shadowedBy: routes[i] });
  return found;
}

/** Человекочитаемая строка для отчёта упавшего теста. */
export function formatShadow(shadow: RouteShadow): string {
  const { hidden, shadowedBy } = shadow;
  return (
    `${hidden.decorator.toUpperCase()} ${hidden.path} ` +
    `(${hidden.controller}, строка ${hidden.line}) недостижим: его запросы ` +
    `перехватит ${shadowedBy.decorator.toUpperCase()} ${shadowedBy.path} ` +
    `(${shadowedBy.controller}, строка ${shadowedBy.line}), объявленный раньше`
  );
}
