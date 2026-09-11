import { archiveOrderBy, archiveWhere, parseArchiveView } from './work-archive';

describe('parseArchiveView', () => {
  it('reads the two tabs and falls back to «done»', () => {
    expect(parseArchiveView('removed')).toBe('removed');
    expect(parseArchiveView('done')).toBe('done');
    expect(parseArchiveView(undefined)).toBe('done');
    expect(parseArchiveView(['removed'])).toBe('done');
  });
});

describe('archiveWhere', () => {
  // Сделанное — сделано, даже если карточку уже убрали с доски.
  it('shows every completed task of the board, on the board or not', () => {
    expect(archiveWhere('b1', 'done')).toEqual({
      boardId: 'b1',
      completedAt: { not: null },
    });
  });

  it('shows the cards taken off the board', () => {
    expect(archiveWhere('b1', 'removed')).toEqual({
      boardId: 'b1',
      archivedAt: { not: null },
    });
  });
});

describe('archiveOrderBy', () => {
  it('puts the freshest first, by the date of its own tab', () => {
    expect(archiveOrderBy('done')[0]).toEqual({ completedAt: 'desc' });
    expect(archiveOrderBy('removed')[0]).toEqual({ archivedAt: 'desc' });
  });
});
