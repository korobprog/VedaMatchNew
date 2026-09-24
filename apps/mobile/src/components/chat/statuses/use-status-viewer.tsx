import type { ChatStatusAuthorDto } from '@vedamatch/shared';
import { useCallback, useState, type ReactNode } from 'react';
import type { StatusApi } from '@/lib/chat/status-api';
import { authorWithStatuses } from '@/lib/chat/statuses/status-playback';
import { StatusViewer } from './status-viewer';

/**
 * Просмотр статусов, который открывается из любого места с аватаркой
 * (VED-129): полоса над беседами, строка списка, шапка беседы, карточка
 * человека. Экран кладёт `viewer` в свою разметку и зовёт `open`/`openUser`.
 */
export function useStatusViewer({
  statusApi,
  viewerId,
  onChanged,
}: {
  statusApi: StatusApi;
  viewerId: string;
  /** Просмотр отметил или удалил статус — кружкам пора перечитать себя. */
  onChanged(): void;
}): {
  open(authors: ChatStatusAuthorDto[], start?: number): void;
  /** `false` — у человека нет живых статусов (истекли, пока смотрели список). */
  openUser(userId: string): Promise<boolean>;
  viewer: ReactNode;
} {
  const [state, setState] = useState<{ authors: ChatStatusAuthorDto[]; start: number } | null>(null);

  const open = useCallback((authors: ChatStatusAuthorDto[], start = 0) => {
    if (authors[start]) setState({ authors, start });
  }, []);

  const openUser = useCallback(
    async (userId: string) => {
      try {
        const author = authorWithStatuses(await statusApi.ofUser(userId));
        if (author) setState({ authors: [author], start: 0 });
        return Boolean(author);
      } catch {
        return false;
      }
    },
    [statusApi],
  );

  const close = useCallback(() => setState(null), []);

  const viewer = state ? (
    <StatusViewer
      authors={state.authors}
      startAuthor={state.start}
      viewerId={viewerId}
      statusApi={statusApi}
      onClose={close}
      onChanged={onChanged}
    />
  ) : null;

  return { open, openUser, viewer };
}
