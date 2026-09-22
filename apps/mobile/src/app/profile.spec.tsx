import type { UserProfile } from '@vedamatch/shared';
import { ApiError } from '@/lib/api/client';
import { light } from '@/theme/tokens';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import ProfileScreen from './profile';

/**
 * Экран «Профиль» (VED-332). Чистые правила (проверка полей, сборка тела,
 * правила аватара, тексты ошибок) проверены в `lib/profile/*.spec.ts`;
 * здесь — что экран действительно ходит на сервер тем, что собрал, и что
 * человек видит каждое состояние: загрузку, отказ, успех.
 */

const mockMe = jest.fn<Promise<UserProfile>, []>();
const mockUpdate = jest.fn<Promise<UserProfile>, [unknown]>();
const mockUploadAvatar = jest.fn<Promise<UserProfile>, [FormData]>();
const mockDeleteAvatar = jest.fn<Promise<UserProfile>, []>();
const mockReloadUser = jest.fn<Promise<void>, []>(async () => undefined);
const mockLaunchLibrary = jest.fn();
const mockLaunchCamera = jest.fn();
const mockRequestCameraPermissions = jest.fn(async () => ({ granted: true }));
const mockBuildUploadFormPart = jest.fn(async (part: { name: string; type: string }) => ({
  name: part.name,
  type: part.type,
  bytes: async () => new Uint8Array([1, 2, 3]),
}));

jest.mock('expo-router', () => ({ __esModule: true, Stack: { Screen: () => null } }));

jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-image-picker', () => ({
  __esModule: true,
  launchImageLibraryAsync: (options: unknown) => mockLaunchLibrary(options),
  launchCameraAsync: (options: unknown) => mockLaunchCamera(options),
  requestCameraPermissionsAsync: () => mockRequestCameraPermissions(),
}));

jest.mock('@/lib/upload/upload-form-part', () => ({
  __esModule: true,
  buildUploadFormPart: (part: { name: string; type: string }) => mockBuildUploadFormPart(part),
}));

// Обёртка над `react-native-keyboard-controller`: нативный модуль в тесте
// не слинкован, а от прокрутки здесь ничего не зависит — обычный ScrollView.
jest.mock('@/components/keyboard-controller-web', () => ({
  __esModule: true,
  PersonKeyboardAwareScroll: jest.requireActual('react-native').ScrollView,
  ChatKeyboardAvoidingView: jest.requireActual('react-native').View,
}));

// Сессия — ОДИН и тот же объект на все рендеры: новый литерал каждый раз
// менял бы `api`, а с ним и `useMemo`/`useCallback` загрузки, и эффект
// перезапрашивал бы профиль бесконечно. `reloadUser` — стрелка, а не сам
// `mockReloadUser`: объект собирается раньше, чем `jest.fn()` окажется в
// переменной, и прямая ссылка застыла бы на `undefined`.
const mockSession = { api: {}, reloadUser: () => mockReloadUser() };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => mockSession }));

jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));

jest.mock('@/lib/feedback', () => ({ __esModule: true, confirmTap: () => undefined }));

// Подменяется только клиент: `describeProfileError` остаётся настоящей —
// тексты ошибок экрана должны совпадать с тем, что видит человек, а не с
// выдумкой теста.
jest.mock('@/lib/profile/profile-api', () => {
  const actual = jest.requireActual('@/lib/profile/profile-api');
  return {
    ...actual,
    __esModule: true,
    createProfileApi: () => ({
      me: () => mockMe(),
      update: (body: unknown) => mockUpdate(body),
      uploadAvatar: (form: FormData) => mockUploadAvatar(form),
      deleteAvatar: () => mockDeleteAvatar(),
    }),
  };
});

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u-1',
    email: 'max@example.com',
    name: 'Максим',
    spiritualName: null,
    displayName: 'Максим',
    avatarUrl: null,
    avatarKey: null,
    birthDate: null,
    age: null,
    gender: null,
    photoVerification: 'none',
    about: null,
    statusLine: null,
    languages: [],
    homeLocation: null,
    socialLinks: {},
    messengers: {},
    role: 'user',
    adminServices: [],
    spiritualStage: null,
    devoteeVerificationStatus: 'none',
    lastSelfIdentificationAt: null,
    lineage: null,
    timeZone: null,
    timeZoneLocked: false,
    subscription: null,
    accountStatus: 'active',
    pendingDeletionAt: null,
    deletionEligibleAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
    ...overrides,
  } as UserProfile;
}

/** Весь текст, который человек видит на экране, одной строкой. */
function texts(renderer: ReactTestRenderer): string {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      found.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (node && typeof node === 'object' && 'children' in node) {
      walk((node as { children: unknown }).children);
    }
  };
  walk(renderer.toJSON());
  return found.join(' ');
}

/** Нажимаемый узел с такой подписью — только с `onPress`, чтобы обёртки не считались. */
function byLabel(renderer: ReactTestRenderer, match: string): ReactTestInstance[] {
  return renderer.root.findAll(
    (node) => typeof node.props?.onPress === 'function' && typeof node.props?.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes(match),
  );
}

function press(renderer: ReactTestRenderer, label: string): Promise<void> {
  const found = byLabel(renderer, label);
  if (found.length === 0) throw new Error(`Кнопки «${label}» на экране нет`);
  return act(async () => {
    found[0].props.onPress();
  });
}

/** Весь текст внутри узла — по нему опознаются кнопки без своей подписи. */
function textOf(node: ReactTestInstance): string {
  const parts: string[] = [];
  const walk = (child: ReactTestInstance | string): void => {
    if (typeof child === 'string') {
      parts.push(child);
      return;
    }
    for (const next of child.children) walk(next as ReactTestInstance | string);
  };
  walk(node);
  return parts.join(' ');
}

/** Кнопка, подписанная текстом внутри себя («Повторить»). */
function pressText(renderer: ReactTestRenderer, text: string): Promise<void> {
  const found = renderer.root.findAll(
    (node) =>
      typeof node.props?.onPress === 'function' && node.props?.accessibilityRole === 'button' && textOf(node).includes(text),
  );
  if (found.length === 0) throw new Error(`Кнопки «${text}» на экране нет`);
  return act(async () => {
    found[0].props.onPress();
  });
}

/** Поле формы по его подписи: у ввода `accessibilityLabel`, но нет `onPress`. */
function input(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  const found = renderer.root.findAll(
    (node) => node.props?.accessibilityLabel === label && typeof node.props?.onChangeText === 'function',
  );
  if (found.length === 0) throw new Error(`Поля «${label}» на экране нет`);
  return found[0];
}

function type(renderer: ReactTestRenderer, label: string, value: string): Promise<void> {
  const field = input(renderer, label);
  return act(async () => {
    field.props.onChangeText(value);
  });
}

const mounted: ReactTestRenderer[] = [];

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ProfileScreen />);
  });
  mounted.push(renderer);
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMe.mockResolvedValue(profile());
  mockUpdate.mockResolvedValue(profile());
  mockUploadAvatar.mockResolvedValue(profile());
  mockDeleteAvatar.mockResolvedValue(profile());
  mockReloadUser.mockResolvedValue(undefined);
  mockRequestCameraPermissions.mockResolvedValue({ granted: true });
});

afterEach(() => {
  for (const renderer of mounted.splice(0)) {
    act(() => renderer.unmount());
  }
});

describe('загрузка профиля', () => {
  it('поля заполняются тем, что пришло с сервера', async () => {
    mockMe.mockResolvedValue(profile({ name: 'Максим', spiritualName: 'Мадхава дас', statusLine: 'в Маяпуре' }));
    const renderer = await render();
    expect(mockMe).toHaveBeenCalledTimes(1);
    expect(input(renderer, 'Имя').props.value).toBe('Максим');
    expect(input(renderer, 'Духовное имя').props.value).toBe('Мадхава дас');
    expect(input(renderer, 'Статус').props.value).toBe('в Маяпуре');
  });

  it('предпросмотр показывает духовное имя — так человека видят другие', async () => {
    mockMe.mockResolvedValue(profile({ spiritualName: 'Мадхава дас', displayName: 'Мадхава дас' }));
    const renderer = await render();
    expect(texts(renderer)).toContain('Так вас видят другие');
    expect(texts(renderer)).toContain('Мадхава дас');
  });

  it('духовное имя, набранное прямо сейчас, сразу видно в предпросмотре', async () => {
    const renderer = await render();
    expect(texts(renderer)).toContain('Максим');
    await type(renderer, 'Духовное имя', 'Мадхава дас');
    expect(texts(renderer)).toContain('Мадхава дас');
  });

  it('отказ загрузки объясняется и даёт «Повторить»', async () => {
    mockMe.mockRejectedValueOnce(new TypeError('Network request failed'));
    const renderer = await render();
    expect(texts(renderer)).toContain('Нет соединения с сервером.');
    mockMe.mockResolvedValue(profile({ name: 'Максим' }));
    await pressText(renderer, 'Повторить');
    expect(mockMe).toHaveBeenCalledTimes(2);
    expect(input(renderer, 'Имя').props.value).toBe('Максим');
  });

  it('до ответа сервера формы нет — только ожидание', async () => {
    let resolve!: (value: UserProfile) => void;
    mockMe.mockReturnValueOnce(new Promise<UserProfile>((done) => (resolve = done)));
    const renderer = await render();
    expect(() => input(renderer, 'Имя')).toThrow();
    await act(async () => resolve(profile()));
    expect(input(renderer, 'Имя').props.value).toBe('Максим');
  });
});

describe('сохранение', () => {
  it('уходит только изменённое поле, и ответ сервера становится новым состоянием', async () => {
    mockUpdate.mockResolvedValue(profile({ name: 'Максим Коробков', displayName: 'Максим Коробков' }));
    const renderer = await render();
    await type(renderer, 'Имя', 'Максим Коробков');
    await press(renderer, 'Сохранить');
    expect(mockUpdate).toHaveBeenCalledWith({ name: 'Максим Коробков' });
    expect(texts(renderer)).toContain('Профиль сохранён.');
    expect(input(renderer, 'Имя').props.value).toBe('Максим Коробков');
  });

  it('сессия перечитывается — иначе «Аккаунт» показывал бы прежнее имя', async () => {
    const renderer = await render();
    await type(renderer, 'Имя', 'Максим К.');
    await press(renderer, 'Сохранить');
    expect(mockReloadUser).toHaveBeenCalledTimes(1);
  });

  it('пустое имя не уходит на сервер вовсе', async () => {
    const renderer = await render();
    await type(renderer, 'Имя', '   ');
    await press(renderer, 'Сохранить');
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(texts(renderer)).toContain('Имя не может быть пустым');
  });

  it('неверное поле подсвечивается', async () => {
    const renderer = await render();
    await type(renderer, 'Духовное имя', 'дас 108');
    await press(renderer, 'Сохранить');
    expect(input(renderer, 'Духовное имя').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ borderColor: light.magenta })]),
    );
  });

  it('без правок запроса нет — и экран честно говорит почему', async () => {
    const renderer = await render();
    await press(renderer, 'Сохранить');
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(texts(renderer)).toContain('Изменений нет');
  });

  it('отказ сервера показывается его же словами, набранное не теряется', async () => {
    mockUpdate.mockRejectedValueOnce(new ApiError(400, 'Имя не длиннее 80 символов', null));
    const renderer = await render();
    await type(renderer, 'Имя', 'Максим Коробков');
    await press(renderer, 'Сохранить');
    expect(texts(renderer)).toContain('Имя не длиннее 80 символов');
    expect(input(renderer, 'Имя').props.value).toBe('Максим Коробков');
  });

  it('пока запрос идёт, поля заблокированы и повторное нажатие не шлёт второй запрос', async () => {
    let resolve!: (value: UserProfile) => void;
    mockUpdate.mockReturnValueOnce(new Promise<UserProfile>((done) => (resolve = done)));
    const renderer = await render();
    await type(renderer, 'Имя', 'Максим К.');
    await press(renderer, 'Сохранить');
    expect(input(renderer, 'Имя').props.editable).toBe(false);
    await press(renderer, 'Сохранить');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    await act(async () => resolve(profile({ name: 'Максим К.' })));
    expect(input(renderer, 'Имя').props.editable).toBe(true);
  });
});

describe('фотография', () => {
  async function openSheetAndPick(renderer: ReactTestRenderer, label: string): Promise<void> {
    await press(renderer, 'фотографию');
    await press(renderer, label);
  }

  it('галерея открывается с обрезкой по квадрату — аватар везде квадратный', async () => {
    mockLaunchLibrary.mockResolvedValue({ canceled: true });
    const renderer = await render();
    await openSheetAndPick(renderer, 'Выбрать из галереи');
    expect(mockLaunchLibrary).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: true, aspect: [1, 1] }));
  });

  it('выбранное фото уходит байтами, а не тройкой {uri,name,type}', async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/a.jpg', mimeType: 'image/jpeg', fileSize: 1024 }],
    });
    mockUploadAvatar.mockResolvedValue(profile({ avatarUrl: 'https://s3/avatar.jpg' }));
    const renderer = await render();
    await openSheetAndPick(renderer, 'Выбрать из галереи');

    expect(mockBuildUploadFormPart).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'file:///tmp/a.jpg', type: 'image/jpeg', name: 'avatar.jpg' }),
    );
    expect(mockUploadAvatar).toHaveBeenCalledTimes(1);
    expect(mockUploadAvatar.mock.calls[0][0]).toBeInstanceOf(FormData);
    expect(texts(renderer)).toContain('Фотография обновлена.');
    expect(mockReloadUser).toHaveBeenCalled();
  });

  it('отмена выбора ничего не грузит', async () => {
    mockLaunchLibrary.mockResolvedValue({ canceled: true });
    const renderer = await render();
    await openSheetAndPick(renderer, 'Выбрать из галереи');
    expect(mockUploadAvatar).not.toHaveBeenCalled();
  });

  it('гифка не уезжает на сервер — отказ виден сразу и по делу', async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/a.gif', mimeType: 'image/gif', fileSize: 1024 }],
    });
    const renderer = await render();
    await openSheetAndPick(renderer, 'Выбрать из галереи');
    expect(mockUploadAvatar).not.toHaveBeenCalled();
    expect(texts(renderer)).toContain('JPEG');
  });

  it('фото больше 5 МБ не уезжает', async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/a.jpg', mimeType: 'image/jpeg', fileSize: 6 * 1024 * 1024 }],
    });
    const renderer = await render();
    await openSheetAndPick(renderer, 'Выбрать из галереи');
    expect(mockUploadAvatar).not.toHaveBeenCalled();
    expect(texts(renderer)).toContain('5 МБ');
  });

  it('без разрешения камера не открывается, а человек узнаёт, куда идти', async () => {
    mockRequestCameraPermissions.mockResolvedValue({ granted: false });
    const renderer = await render();
    await openSheetAndPick(renderer, 'Снять на камеру');
    expect(mockLaunchCamera).not.toHaveBeenCalled();
    expect(texts(renderer)).toContain('настройках телефона');
  });

  it('снимок с камеры проходит тем же путём', async () => {
    mockLaunchCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/cam.jpg', mimeType: 'image/jpeg', fileSize: 2048 }],
    });
    const renderer = await render();
    await openSheetAndPick(renderer, 'Снять на камеру');
    expect(mockUploadAvatar).toHaveBeenCalledTimes(1);
  });

  it('неудача загрузки объясняется и не выглядит как успех', async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/a.jpg', mimeType: 'image/jpeg', fileSize: 1024 }],
    });
    mockUploadAvatar.mockRejectedValueOnce(new TypeError('Network request failed'));
    const renderer = await render();
    await openSheetAndPick(renderer, 'Выбрать из галереи');
    expect(texts(renderer)).toContain('Нет соединения с сервером.');
    expect(texts(renderer)).not.toContain('Фотография обновлена.');
  });

  it('«Убрать фото» предлагается, только когда фото есть', async () => {
    const renderer = await render();
    await press(renderer, 'фотографию');
    expect(byLabel(renderer, 'Убрать фото')).toHaveLength(0);
  });

  it('загруженное фото можно убрать', async () => {
    mockMe.mockResolvedValue(profile({ avatarUrl: 'https://s3/avatar.jpg' }));
    mockDeleteAvatar.mockResolvedValue(profile({ avatarUrl: null }));
    const renderer = await render();
    await press(renderer, 'фотографию');
    await press(renderer, 'Убрать фото');
    expect(mockDeleteAvatar).toHaveBeenCalledTimes(1);
    expect(texts(renderer)).toContain('Фотография убрана.');
  });
});
