import { pickNextUnheardVoiceId, type VoiceOrderEntry } from './voice-playback-order';

const entries: VoiceOrderEntry[] = [
  { id: 'a', order: 1 },
  { id: 'b', order: 2 },
  { id: 'c', order: 3 },
  { id: 'd', order: 4 },
];

describe('pickNextUnheardVoiceId', () => {
  it('берёт ближайшее следующее непрослушанное', () => {
    expect(pickNextUnheardVoiceId(entries, 'a', new Set())).toBe('b');
  });

  it('пропускает уже прослушанное и берёт следующее за ним', () => {
    expect(pickNextUnheardVoiceId(entries, 'a', new Set(['b']))).toBe('c');
  });

  it('после последнего — некуда переходить, null', () => {
    expect(pickNextUnheardVoiceId(entries, 'd', new Set())).toBeNull();
  });

  it('всё, что осталось, уже прослушано — null, без повтора и без возврата', () => {
    expect(pickNextUnheardVoiceId(entries, 'a', new Set(['b', 'c', 'd']))).toBeNull();
  });

  it('никогда не идёт назад по списку', () => {
    // доиграло третье — кандидат только среди «d», «a»/«b» не рассматриваются,
    // даже если сами по себе непрослушаны.
    expect(pickNextUnheardVoiceId(entries, 'c', new Set())).toBe('d');
  });

  it('доигравшего id нет в списке (уже размонтирован виртуализацией) — null', () => {
    expect(pickNextUnheardVoiceId(entries, 'ghost', new Set())).toBeNull();
  });

  it('не выбирает само доигравшее сообщение при равном order', () => {
    const withDuplicate: VoiceOrderEntry[] = [...entries, { id: 'a2', order: 1 }];
    // «a2» имеет тот же order, что и доигравшее «a» — order <= finished.order,
    // значит вперёд это не считается.
    expect(pickNextUnheardVoiceId(withDuplicate, 'a', new Set())).toBe('b');
  });

  it('несколько кандидатов впереди — выбирает ближайший, не первый в массиве', () => {
    const shuffled: VoiceOrderEntry[] = [
      { id: 'far', order: 10 },
      { id: 'near', order: 5 },
      { id: 'a', order: 1 },
    ];
    expect(pickNextUnheardVoiceId(shuffled, 'a', new Set())).toBe('near');
  });

  it('пустой список — null', () => {
    expect(pickNextUnheardVoiceId([], 'a', new Set())).toBeNull();
  });
});
