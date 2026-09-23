import {
  AUDIOBOOK_FINISHED_TAIL_SECONDS,
  resolveAudiobookResume,
} from './music-audiobook-resume';

const chapters = [
  { trackId: 'c1', durationSeconds: 600 },
  { trackId: 'c2', durationSeconds: 900 },
  { trackId: 'c3', durationSeconds: 300 },
];

const at = (minute: number) => new Date(Date.UTC(2026, 8, 23, 10, minute));

describe('resolveAudiobookResume', () => {
  it('книгу не начинали — продолжать нечего', () => {
    expect(resolveAudiobookResume(chapters, [])).toBeNull();
  });

  it('позиции чужих записей не в счёт', () => {
    expect(
      resolveAudiobookResume(chapters, [
        { trackId: 'other', positionSeconds: 120, updatedAt: at(5) },
      ]),
    ).toBeNull();
  });

  it('продолжает главу, которую слушали последней, а не самую дальнюю', () => {
    expect(
      resolveAudiobookResume(chapters, [
        { trackId: 'c3', positionSeconds: 100, updatedAt: at(1) },
        { trackId: 'c2', positionSeconds: 245.7, updatedAt: at(9) },
      ]),
    ).toEqual({ trackId: 'c2', chapterNumber: 2, positionSeconds: 245 });
  });

  it('дослушанная глава ведёт к следующей с начала', () => {
    expect(
      resolveAudiobookResume(chapters, [
        {
          trackId: 'c1',
          positionSeconds: 600 - AUDIOBOOK_FINISHED_TAIL_SECONDS + 1,
          updatedAt: at(3),
        },
      ]),
    ).toEqual({ trackId: 'c2', chapterNumber: 2, positionSeconds: 0 });
  });

  it('дослушанная последняя глава — книга закончена', () => {
    expect(
      resolveAudiobookResume(chapters, [
        { trackId: 'c3', positionSeconds: 299, updatedAt: at(3) },
      ]),
    ).toBeNull();
  });

  it('пара секунд первой главы — ещё не «продолжить»', () => {
    expect(
      resolveAudiobookResume(chapters, [
        { trackId: 'c1', positionSeconds: 3, updatedAt: at(3) },
      ]),
    ).toBeNull();
  });

  it('начало второй главы — уже место в книге', () => {
    expect(
      resolveAudiobookResume(chapters, [
        { trackId: 'c2', positionSeconds: 0, updatedAt: at(3) },
      ]),
    ).toEqual({ trackId: 'c2', chapterNumber: 2, positionSeconds: 0 });
  });

  it('глава без длительности не считается дослушанной', () => {
    expect(
      resolveAudiobookResume(
        [{ trackId: 'c1', durationSeconds: 0 }],
        [{ trackId: 'c1', positionSeconds: 40, updatedAt: at(3) }],
      ),
    ).toEqual({ trackId: 'c1', chapterNumber: 1, positionSeconds: 40 });
  });
});
