import { ABOUT_MAX_LENGTH, NAME_MAX_LENGTH, STATUS_LINE_MAX_LENGTH } from '@vedamatch/shared';
import {
  buildProfileUpdate,
  displayNamePreview,
  findProfileError,
  hasProfileChanges,
  normalizeStatusLineValue,
  profileFormValues,
  remainingChars,
  shouldShowCounter,
  type ProfileFormSource,
  type ProfileFormValues,
} from './profile-fields';

/**
 * Поля профиля в приложении (VED-332). Проверяется здесь то, что решает
 * форма ДО сети: что она не пустит, что именно уйдёт в `PATCH /profile` и
 * каким именем человека увидят другие.
 */

const saved: ProfileFormSource = {
  name: 'Максим',
  spiritualName: null,
  statusLine: null,
  about: null,
};

function form(overrides: Partial<ProfileFormValues> = {}): ProfileFormValues {
  return { ...profileFormValues(saved), ...overrides };
}

describe('profileFormValues', () => {
  it('пустые поля профиля становятся пустыми строками формы', () => {
    expect(profileFormValues(saved)).toEqual({ name: 'Максим', spiritualName: '', statusLine: '', about: '' });
  });

  it('заполненные переносятся как есть', () => {
    expect(
      profileFormValues({ name: 'Максим', spiritualName: 'Мадхава дас', statusLine: 'в Маяпуре', about: 'Читаю' }),
    ).toEqual({ name: 'Максим', spiritualName: 'Мадхава дас', statusLine: 'в Маяпуре', about: 'Читаю' });
  });
});

/**
 * Главное правило портала на этом экране (CLAUDE.md, «Имя пользователя
 * наружу»): наружу идёт духовное имя, если оно заполнено. Предпросмотр
 * «так вас видят другие» обязан показывать ровно его — иначе он врёт в том
 * единственном, ради чего существует.
 */
describe('displayNamePreview', () => {
  it('духовное имя перекрывает мирское', () => {
    expect(displayNamePreview(form({ spiritualName: 'Мадхава дас' }))).toBe('Мадхава дас');
  });

  it('без духовного имени показывается мирское', () => {
    expect(displayNamePreview(form())).toBe('Максим');
  });

  it('духовное имя из одних пробелов именем не считается', () => {
    expect(displayNamePreview(form({ spiritualName: '   ' }))).toBe('Максим');
  });

  it('пробелы по краям мирского имени не попадают в показ', () => {
    expect(displayNamePreview(form({ name: '  Максим  ' }))).toBe('Максим');
  });
});

describe('findProfileError', () => {
  it('заполненная форма ошибок не даёт', () => {
    expect(findProfileError(form({ spiritualName: 'Мадхава дас', statusLine: 'в Маяпуре', about: 'Читаю' }))).toBeNull();
  });

  it('пустое имя — отказ по полю name', () => {
    expect(findProfileError(form({ name: '' }))).toEqual({ field: 'name', message: 'Имя не может быть пустым' });
  });

  it('имя из одних пробелов равносильно пустому', () => {
    expect(findProfileError(form({ name: '   ' }))?.field).toBe('name');
  });

  it('одна буква именем не считается', () => {
    expect(findProfileError(form({ name: 'А' }))?.message).toContain('не короче 2');
  });

  it('имя длиннее потолка — отказ', () => {
    const error = findProfileError(form({ name: 'я'.repeat(NAME_MAX_LENGTH + 1) }));
    expect(error).toEqual({ field: 'name', message: `Имя не длиннее ${NAME_MAX_LENGTH} символов` });
  });

  it('ровно потолок принимается', () => {
    expect(findProfileError(form({ name: 'я'.repeat(NAME_MAX_LENGTH) }))).toBeNull();
  });

  it('цифры и ссылки именем не бывают', () => {
    expect(findProfileError(form({ name: 'Максим 2000' }))?.field).toBe('name');
    expect(findProfileError(form({ name: 'https://vk.com/me' }))?.field).toBe('name');
  });

  it('пустое духовное имя — это «не заполнено», а не ошибка', () => {
    expect(findProfileError(form({ spiritualName: '' }))).toBeNull();
    expect(findProfileError(form({ spiritualName: '   ' }))).toBeNull();
  });

  it('заполненное духовное имя проверяется теми же правилами и своей подписью', () => {
    expect(findProfileError(form({ spiritualName: 'дас 108' }))).toEqual({
      field: 'spiritualName',
      message: 'Духовное имя состоит из букв, пробелов и дефисов — без цифр и символов',
    });
  });

  it('сначала сообщается про имя, даже когда неверны оба поля', () => {
    expect(findProfileError(form({ name: '', spiritualName: 'дас 108' }))?.field).toBe('name');
  });

  it('статус длиннее потолка — отказ, ровно потолок — нет', () => {
    expect(findProfileError(form({ statusLine: 'я'.repeat(STATUS_LINE_MAX_LENGTH + 1) }))).toEqual({
      field: 'statusLine',
      message: `Статус не длиннее ${STATUS_LINE_MAX_LENGTH} символов`,
    });
    expect(findProfileError(form({ statusLine: 'я'.repeat(STATUS_LINE_MAX_LENGTH) }))).toBeNull();
  });

  it('длина статуса считается по схлопнутым пробелам — как её посчитает сервер', () => {
    const line = `${'я'.repeat(STATUS_LINE_MAX_LENGTH)}${' '.repeat(20)}`;
    expect(findProfileError(form({ statusLine: line }))).toBeNull();
  });

  it('рассказ длиннее потолка — отказ по полю about', () => {
    expect(findProfileError(form({ about: 'я'.repeat(ABOUT_MAX_LENGTH + 1) }))?.field).toBe('about');
  });
});

describe('normalizeStatusLineValue', () => {
  it('схлопывает пробелы и переносы так же, как сервер', () => {
    expect(normalizeStatusLineValue('  в Маяпуре\n\nдо марта  ')).toBe('в Маяпуре до марта');
  });
});

describe('buildProfileUpdate', () => {
  it('без правок тело пустое — незачем слать запрос', () => {
    expect(buildProfileUpdate(form(), saved)).toEqual({});
    expect(hasProfileChanges(form(), saved)).toBe(false);
  });

  it('уходит только изменённое поле', () => {
    expect(buildProfileUpdate(form({ name: 'Максим Коробков' }), saved)).toEqual({ name: 'Максим Коробков' });
  });

  /**
   * Не придирка: `updateProfile` на сервере смотрит на НАЛИЧИЕ ключа
   * (`'spiritualName' in payload`). Отправь форма всё подряд — духовное имя
   * и рассказ переписывались бы при каждом сохранении, в том числе на
   * пустоту, если бы форма их почему-то не показала.
   */
  it('нетронутые поля в тело не попадают', () => {
    const initial: ProfileFormSource = { ...saved, spiritualName: 'Мадхава дас', about: 'Читаю' };
    expect(buildProfileUpdate({ ...profileFormValues(initial), statusLine: 'в Маяпуре' }, initial)).toEqual({
      statusLine: 'в Маяпуре',
    });
  });

  it('стёртое духовное имя уходит как null — сервер понимает это как «убрать»', () => {
    const initial: ProfileFormSource = { ...saved, spiritualName: 'Мадхава дас' };
    expect(buildProfileUpdate({ ...profileFormValues(initial), spiritualName: '' }, initial)).toEqual({
      spiritualName: null,
    });
  });

  it('стёртые статус и рассказ тоже уходят как null', () => {
    const initial: ProfileFormSource = { ...saved, statusLine: 'в Маяпуре', about: 'Читаю' };
    expect(buildProfileUpdate({ ...profileFormValues(initial), statusLine: '', about: '   ' }, initial)).toEqual({
      statusLine: null,
      about: null,
    });
  });

  it('правки только в пробелах изменением не считаются — сервер их всё равно обрежет', () => {
    expect(hasProfileChanges(form({ name: '  Максим  ' }), saved)).toBe(false);
  });

  it('вставленный с переносом статус после сохранения перестаёт числиться правкой', () => {
    const initial: ProfileFormSource = { ...saved, statusLine: 'в Маяпуре до марта' };
    expect(hasProfileChanges({ ...profileFormValues(initial), statusLine: 'в Маяпуре\nдо марта' }, initial)).toBe(false);
  });

  it('несколько правок уходят одним телом', () => {
    expect(buildProfileUpdate(form({ name: 'Максим К.', spiritualName: 'Мадхава дас' }), saved)).toEqual({
      name: 'Максим К.',
      spiritualName: 'Мадхава дас',
    });
  });
});

describe('счётчик символов', () => {
  it('показывает остаток', () => {
    expect(remainingChars('abc', 10)).toBe(7);
    expect(remainingChars('', STATUS_LINE_MAX_LENGTH)).toBe(STATUS_LINE_MAX_LENGTH);
  });

  it('появляется только у потолка — иначе это шум у каждого поля', () => {
    expect(shouldShowCounter('', 100)).toBe(false);
    expect(shouldShowCounter('я'.repeat(74), 100)).toBe(false);
    expect(shouldShowCounter('я'.repeat(75), 100)).toBe(true);
    expect(shouldShowCounter('я'.repeat(100), 100)).toBe(true);
  });
});
