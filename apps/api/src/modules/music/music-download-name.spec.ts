import {
  attachmentDisposition,
  musicDownloadFileName,
} from './music-download-name';

describe('musicDownloadFileName', () => {
  it('«Исполнитель — Название» с расширением по типу', () => {
    expect(
      musicDownloadFileName({
        title: 'Maha Mantra',
        artistName: 'Shanti people',
        mime: 'audio/mpeg',
      }),
    ).toBe('Shanti people — Maha Mantra.mp3');
    expect(
      musicDownloadFileName({
        title: 'Нама Ом',
        artistName: null,
        mime: 'audio/mp4',
      }),
    ).toBe('Нама Ом.m4a');
  });

  it('запрещённые в именах файлов знаки заменяет пробелом', () => {
    expect(
      musicDownloadFileName({
        title: 'Шри Гуру: вандана / "live" *2*?',
        artistName: 'AC/DC',
        mime: 'audio/mpeg',
      }),
    ).toBe('AC DC — Шри Гуру вандана live 2.mp3');
  });

  it('точку в конце и лишние пробелы убирает — Windows их отбросит сам', () => {
    expect(
      musicDownloadFileName({
        title: '  Киртан...  ',
        artistName: ' ',
        mime: 'audio/mpeg',
      }),
    ).toBe('Киртан.mp3');
  });

  it('длинное название обрезает до 120 знаков', () => {
    const name = musicDownloadFileName({
      title: 'а'.repeat(300),
      artistName: null,
      mime: 'audio/mpeg',
    });
    expect(name).toBe(`${'а'.repeat(120)}.mp3`);
  });

  it('от названия ничего не осталось — «Запись», а не «.mp3»', () => {
    expect(
      musicDownloadFileName({
        title: '???',
        artistName: null,
        mime: 'audio/mpeg',
      }),
    ).toBe('Запись.mp3');
  });

  it('неизвестный тип — mp3', () => {
    expect(
      musicDownloadFileName({
        title: 'X',
        artistName: null,
        mime: 'audio/ogg',
      }),
    ).toBe('X.mp3');
  });
});

describe('attachmentDisposition', () => {
  it('ASCII-замена для старых клиентов и UTF-8 для остальных', () => {
    expect(attachmentDisposition('Нама Ом.mp3')).toBe(
      `attachment; filename="____ __.mp3"; filename*=UTF-8''%D0%9D%D0%B0%D0%BC%D0%B0%20%D0%9E%D0%BC.mp3`,
    );
  });

  it('кавычка и апостроф не ломают заголовок', () => {
    const header = attachmentDisposition(`Krishna's "song".mp3`);
    expect(header).toContain(`filename="Krishna's _song_.mp3"`);
    expect(header).toContain(`filename*=UTF-8''Krishna%27s%20%22song%22.mp3`);
  });
});
