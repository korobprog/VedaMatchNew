import { inboxMark } from './notification-mark';

describe('inboxMark', () => {
  it('отдаёт состояние задачи', () => {
    expect(inboxMark('done', null)).toBe('done');
    expect(inboxMark('in_progress', null)).toBe('in_progress');
  });

  it('старую или чужую строку из базы гасит в null', () => {
    expect(inboxMark('backlog', null)).toBeNull();
    expect(inboxMark(null, null)).toBeNull();
    expect(inboxMark(undefined, undefined)).toBeNull();
  });

  it('комментарий без состояния задачи получает значок «Комментарий» (VED-298)', () => {
    expect(inboxMark(null, 'comment')).toBe('comment');
    // Незнакомое состояние — то же, что его отсутствие.
    expect(inboxMark('backlog', 'comment')).toBe('comment');
  });

  it('у комментария к задаче с состоянием значок — состояние', () => {
    // «Если уведомление о комментарии не имеет своего статуса» — значит,
    // когда имеет, показываем его: на вопрос «что с задачей» отвечает он.
    expect(inboxMark('testing', 'comment')).toBe('testing');
  });

  it('«comment» в колонке состояния не принимается', () => {
    // Состояние задачи — только четыре кода; «Комментарий» живёт в своей
    // колонке, иначе переезд карточки стирал бы его.
    expect(inboxMark('comment', null)).toBeNull();
  });

  it('незнакомый запасной значок гасится', () => {
    expect(inboxMark(null, 'mention')).toBeNull();
  });
});
