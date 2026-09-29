import { publicListenerSummary } from './music-radio-public';

/* VED-645: «Нитай, Радха и ещё 10 человек из 5 городов». */
describe('publicListenerSummary', () => {
  const row = (
    name: string,
    extra: Partial<{
      avatarUrl: string | null;
      spiritualName: string | null;
      homeLocation: unknown;
    }> = {},
  ) => ({
    name,
    avatarUrl: null,
    spiritualName: null,
    homeLocation: null,
    ...extra,
  });

  it('имя — первое слово, духовное впереди мирского, не больше двух', () => {
    const summary = publicListenerSummary([
      row('Иван Петров', { spiritualName: 'Нитай Чаран дас' }),
      row('Мария Иванова'),
      row('Олег'),
    ]);
    expect(summary.names).toEqual(['Нитай', 'Мария']);
  });

  it('фото — только у кого есть, не больше восьми', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row(`Имя${i}`, { avatarUrl: i === 0 ? null : `https://a/${i}.jpg` }),
    );
    const summary = publicListenerSummary(rows);
    expect(summary.avatars).toHaveLength(8);
    expect(summary.avatars[0]).toBe('https://a/1.jpg');
  });

  it('города считаются без регистра и пробелов, пустые и мусор — мимо', () => {
    const summary = publicListenerSummary([
      row('А', { homeLocation: { city: 'Москва', lat: 0, lon: 0 } }),
      row('Б', { homeLocation: { city: ' москва ', lat: 0, lon: 0 } }),
      row('В', { homeLocation: { city: 'Казань', lat: 0, lon: 0 } }),
      row('Г', { homeLocation: { city: '' } }),
      row('Д', { homeLocation: 'Сочи' }),
      row('Е'),
    ]);
    expect(summary.cities).toBe(2);
  });
});
