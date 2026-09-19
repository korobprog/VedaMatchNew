import { canOpenMessageMenuWhileRecording } from './voice-composer-lock';

describe('canOpenMessageMenuWhileRecording', () => {
  it('меню недоступно во время записи', () => {
    expect(canOpenMessageMenuWhileRecording(true)).toBe(false);
  });

  it('меню доступно вне записи', () => {
    expect(canOpenMessageMenuWhileRecording(false)).toBe(true);
  });
});
