import {
  blogFeedRequestAction,
  blogScopeStatus,
  parseBlogFeedReview,
} from './blog-feed-status';

describe('blogScopeStatus', () => {
  it('defaults to feed when the field is absent', () => {
    expect(blogScopeStatus(undefined)).toBe('feed');
    expect(blogScopeStatus(null)).toBe('feed');
    expect(blogScopeStatus('')).toBe('feed');
    expect(blogScopeStatus('feed')).toBe('feed');
  });

  it('maps personal and rejects everything else', () => {
    expect(blogScopeStatus('personal')).toBe('personal');
    expect(blogScopeStatus('pending')).toBe('invalid');
    expect(blogScopeStatus(1)).toBe('invalid');
  });
});

describe('blogFeedRequestAction', () => {
  it('moves personal and rejected posts to the queue', () => {
    expect(blogFeedRequestAction('personal')).toBe('pending');
    expect(blogFeedRequestAction('rejected')).toBe('pending');
  });

  it('leaves pending and feed posts as they are', () => {
    expect(blogFeedRequestAction('pending')).toBe('unchanged');
    expect(blogFeedRequestAction('feed')).toBe('unchanged');
  });
});

describe('parseBlogFeedReview', () => {
  it('accepts approve without a note', () => {
    expect(parseBlogFeedReview({ decision: 'approve', note: 'x' })).toEqual({
      decision: 'approve',
    });
  });

  it('trims the note on reject and turns empty into null', () => {
    expect(
      parseBlogFeedReview({ decision: 'reject', note: '  Не то ' }),
    ).toEqual({ decision: 'reject', note: 'Не то' });
    expect(parseBlogFeedReview({ decision: 'reject', note: '   ' })).toEqual({
      decision: 'reject',
      note: null,
    });
    expect(parseBlogFeedReview({ decision: 'reject' })).toEqual({
      decision: 'reject',
      note: null,
    });
  });

  it('rejects a too long note and an unknown decision', () => {
    expect(
      parseBlogFeedReview({ decision: 'reject', note: 'я'.repeat(501) }),
    ).toEqual({ error: 'note_too_long' });
    expect(parseBlogFeedReview({ decision: 'maybe' })).toEqual({
      error: 'decision_invalid',
    });
    expect(parseBlogFeedReview(undefined)).toEqual({
      error: 'decision_invalid',
    });
  });
});
