"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  NOTICE_RESPONSE_MESSAGE_MAX_LENGTH,
  type NoticeDto,
  type NoticeResponseDto,
} from "@vedamatch/shared";
import {
  NoticesApiError,
  createNoticeResponse,
  getNoticeResponses,
  respondToNoticeResponse,
  thankForNotice,
} from "@/lib/notices-api";
import { ContactsBlock } from "./notice-contacts-block";

/**
 * Отклики. Автор объявления видит список и разбирает его; остальные видят
 * форму отклика.
 *
 * Контакты раскрываются только после согласия автора и только той стороне,
 * которой предназначены: доска не отдаёт способы связи пачкой.
 */
export function NoticeResponsesPanel({
  notice,
  onChanged,
}: {
  notice: NoticeDto;
  onChanged: () => void;
}) {
  if (notice.isMine) return <AuthorSide notice={notice} onChanged={onChanged} />;
  return <ResponderSide notice={notice} onChanged={onChanged} />;
}

function AuthorSide({
  notice,
  onChanged,
}: {
  notice: NoticeDto;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<NoticeResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () => getNoticeResponses(notice.id).then((r) => setItems(r.items)),
    [notice.id],
  );

  useEffect(() => {
    let alive = true;
    getNoticeResponses(notice.id)
      .then((r) => {
        if (alive) setItems(r.items);
      })
      .catch(() => {
        if (alive) setError("Не удалось загрузить отклики");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [notice.id]);

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
      onChanged();
    } catch (e) {
      setError(e instanceof NoticesApiError ? e.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass rounded-2xl border border-glass-brd p-6">
      <h2 className="mb-4 font-display text-lg font-semibold text-text-0">
        Отклики ({items.length})
      </h2>

      {error && (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-text-1">
          <Loader2 className="size-4 animate-spin" /> Загружаем…
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-2">
          Пока никто не откликнулся. Объявление живёт до{" "}
          {new Date(notice.expiresAt).toLocaleDateString("ru-RU")}.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((response) => (
            <li
              key={response.id}
              className="rounded-xl border border-glass-brd p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-text-0">
                  {response.user.name}
                </span>
                {response.user.city && (
                  <span className="text-sm text-text-2">
                    {response.user.city}
                  </span>
                )}
                <span className="ml-auto text-xs text-text-2">
                  {response.status === "open"
                    ? "ждёт ответа"
                    : response.status === "accepted"
                      ? "принят"
                      : "отклонён"}
                </span>
              </div>

              {response.message && (
                <p className="mt-2 whitespace-pre-line text-sm text-text-1">
                  {response.message}
                </p>
              )}

              {response.contacts && (
                <ContactsBlock
                  contacts={response.contacts}
                  label="Как связаться"
                />
              )}

              {response.status === "open" && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(() => respondToNoticeResponse(response.id, true))
                    }
                    className="rounded-lg border border-emerald-400/40 px-3 py-1.5 text-sm text-emerald-400 disabled:opacity-50"
                  >
                    Принять и открыть контакты
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(() => respondToNoticeResponse(response.id, false))
                    }
                    className="rounded-lg border border-glass-brd px-3 py-1.5 text-sm text-text-1 disabled:opacity-50"
                  >
                    Отклонить
                  </button>
                </div>
              )}

              {response.status === "accepted" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(() =>
                      thankForNotice(notice.id, {
                        toUserId: response.user.userId,
                      }),
                    )
                  }
                  className="mt-3 rounded-lg border border-glass-brd px-3 py-1.5 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
                >
                  Сказать спасибо
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResponderSide({
  notice,
  onChanged,
}: {
  notice: NoticeDto;
  onChanged: () => void;
}) {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<NoticeResponseDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = notice.status === "published";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSent(await createNoticeResponse(notice.id, { message }));
      onChanged();
    } catch (e) {
      setError(e instanceof NoticesApiError ? e.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  };

  if (!live) return null;

  if (sent)
    return (
      <div className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
        <p className="font-medium text-text-0">Отклик отправлен</p>
        <p className="mt-1">
          Автор увидит его и решит, открывать ли контакты. Ответ появится в
          разделе «Мои отклики».
        </p>
        {sent.contacts && (
          <ContactsBlock contacts={sent.contacts} label="Как связаться" />
        )}
      </div>
    );

  return (
    <form
      onSubmit={submit}
      className="glass rounded-2xl border border-glass-brd p-6"
    >
      <h2 className="mb-1 font-display text-lg font-semibold text-text-0">
        Откликнуться
      </h2>
      <p className="mb-4 text-sm text-text-2">
        Автор увидит ваше имя и сообщение. Способы связи откроются, только если
        он согласится.
      </p>
      <textarea
        rows={3}
        value={message}
        maxLength={NOTICE_RESPONSE_MESSAGE_MAX_LENGTH}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Пара слов: когда удобно, чем можете помочь"
        className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
      />
      {error && (
        <p className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        Отправить отклик
      </button>
    </form>
  );
}
