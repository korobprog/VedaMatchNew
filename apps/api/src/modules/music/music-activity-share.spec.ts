import { mayShareMusicActivity } from './music-activity-share';

describe('mayShareMusicActivity', () => {
  it('shares with friends by default', () => {
    expect(mayShareMusicActivity('friends')).toBe(true);
  });

  it('stays silent when the person turned visibility off', () => {
    expect(mayShareMusicActivity('nobody')).toBe(false);
  });

  // Строку настроек заводят при первом изменении: до тех пор действует
  // умолчание схемы, а не молчание.
  it('falls back to the schema default when there are no settings yet', () => {
    expect(mayShareMusicActivity(null)).toBe(true);
    expect(mayShareMusicActivity(undefined)).toBe(true);
  });
});
