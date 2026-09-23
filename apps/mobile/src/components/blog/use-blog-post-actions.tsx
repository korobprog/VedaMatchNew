import type { BlogPostDto } from '@vedamatch/shared';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { appVariant } from '@/config/app-variant';
import { useSession } from '@/lib/auth/session';
import { createBlogApi } from '@/lib/blog/blog-api';
import { announceBlogChange } from '@/lib/blog/blog-changes';
import { buildBlogPostCopy } from '@/lib/blog/blog-copy';
import { describeBlogError } from '@/lib/blog/blog-error';
import { confirmTap } from '@/lib/feedback';

/**
 * Действия с постом — одинаковые в ленте, в развороте поста и в блоге
 * автора (VED-334): копировать, репост, удалить своё.
 *
 * Удаление — через подтверждение: пост в общей ленте видят все, и отменить
 * удаление нельзя. `ConfirmDialog`, а не `Alert.alert`: тот на вебе
 * приложения — заглушка без эффекта.
 */
export function useBlogPostActions(options: { onRemoved?: (id: string) => void } = {}) {
  const { api } = useSession();
  const blogApi = useMemo(() => createBlogApi(api), [api]);
  const { webOrigin } = appVariant();
  const [pendingDelete, setPendingDelete] = useState<BlogPostDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { onRemoved } = options;

  const copy = useCallback(
    async (post: BlogPostDto) => {
      const text = buildBlogPostCopy(post, webOrigin);
      const ok = await Clipboard.setStringAsync(text).catch(() => false);
      if (!ok) throw new Error('Буфер обмена недоступен.');
      confirmTap();
    },
    [webOrigin],
  );

  const repost = useCallback(
    async (post: BlogPostDto) => {
      try {
        const created = await blogApi.repost(post.id);
        // Сервер поднимает репост репоста до оригинала — счётчик растёт там же.
        announceBlogChange({ kind: 'reposted', sourceId: post.repostOf?.id ?? post.id, post: created });
        confirmTap();
      } catch (error) {
        throw new Error(describeBlogError(error, 'Не удалось сделать репост.'));
      }
    },
    [blogApi],
  );

  const askDelete = useCallback((post: BlogPostDto) => {
    setDeleteError(null);
    setPendingDelete(post);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await blogApi.remove(pendingDelete.id);
      announceBlogChange({ kind: 'removed', id: pendingDelete.id });
      onRemoved?.(pendingDelete.id);
      setPendingDelete(null);
    } catch (error) {
      setDeleteError(describeBlogError(error, 'Не удалось удалить пост.'));
    } finally {
      setDeleting(false);
    }
  }, [blogApi, onRemoved, pendingDelete]);

  const dialog = (
    <ConfirmDialog
      visible={pendingDelete !== null}
      title="Удалить пост?"
      message={deleteError ?? 'Пост пропадёт из ленты у всех. Вернуть его будет нельзя.'}
      confirmLabel="Удалить"
      destructive
      busy={deleting}
      onConfirm={() => void confirmDelete()}
      onCancel={() => setPendingDelete(null)}
    />
  );

  return { copy, repost, askDelete, dialog };
}
