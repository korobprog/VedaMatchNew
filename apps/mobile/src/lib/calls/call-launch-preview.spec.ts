import { buildLaunchPreviewCall, LAUNCH_PREVIEW_CALLER_ID } from './call-launch-preview';

describe('buildLaunchPreviewCall', () => {
  it('собирает карточку из полного LaunchCall (VED-222, BUG B: fullScreenIntent)', () => {
    const result = buildLaunchPreviewCall(
      { callId: 'call-1', action: 'open', callerName: 'Максим', kind: 'video', avatarUrl: 'https://x/y.jpg' },
      'me',
    );
    expect(result).toEqual({
      id: 'call-1',
      conversationId: '',
      kind: 'video',
      status: 'ringing',
      caller: { id: LAUNCH_PREVIEW_CALLER_ID, name: 'Максим', avatarUrl: 'https://x/y.jpg' },
      callee: { id: 'me', name: '', avatarUrl: null },
      createdAt: expect.any(String),
    });
  });

  it('caller.id — фиксированный плейсхолдер, не настоящий id собеседника (его нет в LaunchCall)', () => {
    const result = buildLaunchPreviewCall(
      { callId: 'call-1', action: 'open', callerName: 'Имя', kind: 'audio' },
      'me',
    );
    expect(result?.caller.id).toBe(LAUNCH_PREVIEW_CALLER_ID);
    expect(result?.callee.id).toBe('me');
  });

  it('неизвестный вид звонка (не video) падает на audio, а не роняется', () => {
    const result = buildLaunchPreviewCall(
      { callId: 'call-1', action: 'open', callerName: 'Имя', kind: 'что-то-новое' as never },
      'me',
    );
    expect(result?.kind).toBe('audio');
  });

  it('без имени или вида — null: показывать нечего, дальше решает reconcile()', () => {
    expect(buildLaunchPreviewCall({ callId: 'call-1', action: 'open' }, 'me')).toBeNull();
    expect(
      buildLaunchPreviewCall({ callId: 'call-1', action: 'open', callerName: 'Имя' }, 'me'),
    ).toBeNull();
  });

  it('avatarUrl не передан — null, не undefined (стабильная форма для ChatAvatar)', () => {
    const result = buildLaunchPreviewCall(
      { callId: 'call-1', action: 'open', callerName: 'Имя', kind: 'audio' },
      'me',
    );
    expect(result?.caller.avatarUrl).toBeNull();
  });
});
