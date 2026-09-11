import { buildCommit } from './build-commit';

const SHA = '187ea796f8dfc11288394759c1cf72e402ff1121';

describe('buildCommit', () => {
  it('returns the full commit hash from GIT_SHA', () => {
    expect(buildCommit({ GIT_SHA: SHA })).toBe(SHA);
  });

  it('tolerates spaces and upper case from a hand-set variable', () => {
    expect(buildCommit({ GIT_SHA: ` ${SHA.toUpperCase()}\n` })).toBe(SHA);
  });

  // `unknown` пишет сборка без .git; короткий хеш с полным CI не сравнит.
  it.each([undefined, '', 'unknown', '187ea79', `${SHA}0`, 'g'.repeat(40)])(
    'treats %p as no commit',
    (value) => {
      expect(buildCommit({ GIT_SHA: value })).toBeNull();
    },
  );
});
