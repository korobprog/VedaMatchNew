import { hasSessionMarker } from './session-marker';

describe('hasSessionMarker', () => {
  it('находит маркер среди других cookie', () => {
    expect(hasSessionMarker('theme=dark; vm_session=1; lang=ru')).toBe(true);
    expect(hasSessionMarker('vm_session=1')).toBe(true);
  });

  it('без маркера — гость', () => {
    expect(hasSessionMarker('')).toBe(false);
    expect(hasSessionMarker('theme=dark')).toBe(false);
    expect(hasSessionMarker('not_vm_session=1')).toBe(false);
    expect(hasSessionMarker('vm_session=')).toBe(false);
  });
});
