import type { ChatConferenceInviteDto } from '@vedamatch/shared';
import {
  conferenceCallLine,
  conferenceScreenStep,
  conferenceSeatsLine,
  conferenceShareText,
  parseConferenceToken,
} from './conference-link';
import { createPendingConference } from './conference-pending';

const TOKEN = 'a'.repeat(32);

function invite(patch: Partial<ChatConferenceInviteDto> = {}): ChatConferenceInviteDto {
  return {
    title: 'Конференция · Мадхава',
    host: { id: 'u1', name: 'Мадхава', avatarUrl: null, lastSeenAt: null },
    state: 'active',
    expiresAt: '2026-09-22T23:00:00.000Z',
    seatsTaken: 1,
    maxParticipants: 4,
    callLive: false,
    alreadyMember: false,
    denial: null,
    ...patch,
  };
}

describe('разбор ссылки', () => {
  it.each([
    ['своя схема', `vedamatch://j/${TOKEN}`],
    ['адрес сайта', `https://vedamatch.ru/j/${TOKEN}`],
    ['второй домен', `https://vedamatch.com/j/${TOKEN}`],
    ['разработка', `http://localhost:3000/j/${TOKEN}`],
    ['с хвостом', `https://vedamatch.ru/j/${TOKEN}?from=vk`],
    ['голый токен', TOKEN],
    ['с пробелами', `  vedamatch://j/${TOKEN} `],
  ])('%s', (_name, link) => {
    expect(parseConferenceToken(link)).toBe(TOKEN);
  });

  it.each([
    ['чужой префикс', `https://vedamatch.ru/m/${TOKEN}`],
    ['вход', 'vedamatch://auth?code=abc'],
    ['короткий', `vedamatch://j/${'a'.repeat(31)}`],
    ['длинный', `vedamatch://j/${'a'.repeat(33)}`],
    ['посторонние символы', `vedamatch://j/${'a'.repeat(30)}%%`],
    ['пусто', ''],
    ['не строка', null],
  ])('%s — не ссылка на конференцию', (_name, link) => {
    expect(parseConferenceToken(link as string)).toBeNull();
  });
});

describe('шаг экрана', () => {
  it('пока карточка не пришла — ждём', () => {
    expect(conferenceScreenStep({ signedIn: false, invite: null })).toEqual({
      kind: 'loading',
    });
  });

  it('вошедшего ведём дальше без нажатий', () => {
    expect(conferenceScreenStep({ signedIn: true, invite: invite() })).toEqual({
      kind: 'enter',
      note: 'Входим в конференцию…',
    });
  });

  it('своему говорит «возвращаем»', () => {
    expect(
      conferenceScreenStep({ signedIn: true, invite: invite({ alreadyMember: true }) }),
    ).toEqual({ kind: 'enter', note: 'Возвращаем вас в конференцию…' });
  });

  it('гостю предлагаем вход', () => {
    expect(conferenceScreenStep({ signedIn: false, invite: invite() })).toEqual({
      kind: 'sign-in',
      action: 'Войти и присоединиться',
    });
  });

  // Гость, которому всё равно не войти, не должен заводить аккаунт ради
  // закрытой двери.
  it('гостю с отказом вход не предлагается', () => {
    expect(
      conferenceScreenStep({
        signedIn: false,
        invite: invite({ denial: 'Срок ссылки истёк.' }),
      }),
    ).toEqual({
      kind: 'denied',
      title: 'Войти не получится',
      text: 'Срок ссылки истёк.',
    });
  });

  it('сбой сильнее карточки', () => {
    expect(
      conferenceScreenStep({
        signedIn: true,
        invite: invite(),
        error: 'Нет связи',
      }),
    ).toEqual({
      kind: 'denied',
      title: 'Конференция не открылась',
      text: 'Нет связи',
    });
  });
});

describe('подписи', () => {
  it.each([
    [0, 'Занято 0 из 4 — свободно ещё 4 места'],
    [1, 'Занято 1 из 4 — свободно ещё 3 места'],
    [3, 'Занято 3 из 4 — свободно ещё 1 место'],
    [4, 'Мест нет: заняты все 4'],
  ])('места при %i занятых', (seatsTaken, expected) => {
    expect(conferenceSeatsLine({ seatsTaken, maxParticipants: 4 })).toBe(expected);
  });

  it('идущий разговор называется идущим', () => {
    expect(conferenceCallLine({ callLive: true })).toBe('Разговор уже идёт');
    expect(conferenceCallLine({ callLive: false })).toContain('начнёте вы');
  });

  it('в «поделиться» уезжает ссылка целиком', () => {
    const url = `https://vedamatch.ru/j/${TOKEN}`;
    expect(conferenceShareText(url)).toContain(url);
  });
});

describe('куда вести после входа', () => {
  // Возврат после РЕГИСТРАЦИИ в приложении устроен иначе, чем на сайте:
  // `?returnTo=` тут негде проехать — вход уходит в системный браузер и
  // возвращается по `vedamatch://auth`. Намерение держится здесь.
  it('запомненное намерение забирается один раз', () => {
    const pending = createPendingConference();
    pending.remember(`vedamatch://j/${TOKEN}`);
    expect(pending.peek()).toBe(TOKEN);
    expect(pending.take()).toBe(TOKEN);
    expect(pending.take()).toBeNull();
  });

  it('пустое намерение ничего не обещает', () => {
    expect(createPendingConference().take()).toBeNull();
  });

  it('мусор не стирает прежнее намерение', () => {
    const pending = createPendingConference();
    pending.remember(`https://vedamatch.ru/j/${TOKEN}`);
    pending.remember('vedamatch://auth?code=x');
    pending.remember(null);
    expect(pending.take()).toBe(TOKEN);
  });

  it('вторая ссылка перебивает первую', () => {
    const pending = createPendingConference();
    pending.remember(`vedamatch://j/${TOKEN}`);
    pending.remember(`vedamatch://j/${'b'.repeat(32)}`);
    expect(pending.take()).toBe('b'.repeat(32));
  });

  it('два экземпляра не делят намерение', () => {
    const first = createPendingConference();
    const second = createPendingConference();
    first.remember(`vedamatch://j/${TOKEN}`);
    expect(second.take()).toBeNull();
  });
});
