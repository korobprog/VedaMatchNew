"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type {
  CommunityBadgeDto,
  GeoSearchResult,
  NoticeAudience,
  NoticeKind,
  NoticeRecurrence,
  NoticeRubricDto,
  ProfileLocation,
} from "@vedamatch/shared";
import { getMyCommunities } from "@/lib/communities-api";
import {
  NoticesApiError,
  createNotice,
  getNoticeCalendar,
  getNoticeRubrics,
  uploadNoticeImages,
} from "@/lib/notices-api";
import { NoticeImagePicker } from "./notice-images-upload";
import {
  NOTICE_AUDIENCE_LABELS,
  NOTICE_KIND_LABELS,
  NOTICE_KIND_ORDER,
  NOTICE_RECURRENCE_LABELS,
  NOTICE_RECURRENCE_ORDER,
  RUBRIC_HINTS,
} from "./notice-labels";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Роли, дающие право говорить от имени общины. */
const POSTING_ROLES = new Set(["owner", "admin"]);

export function NoticeForm() {
  const router = useRouter();
  const [kind, setKind] = useState<NoticeKind>("offer");
  const [rubrics, setRubrics] = useState<NoticeRubricDto[]>([]);
  const [rubricSlug, setRubricSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState<NoticeAudience>("everyone");
  const [communities, setCommunities] = useState<CommunityBadgeDto[]>([]);
  const [communityId, setCommunityId] = useState("");
  const [location, setLocation] = useState<ProfileLocation | null>(null);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<GeoSearchResult[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [venueName, setVenueName] = useState("");
  const [isOnline, setIsOnline] = useState(false);
  const [onlineUrl, setOnlineUrl] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<NoticeRecurrence>("none");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [ekadashiAvailable, setEkadashiAvailable] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  useEffect(() => {
    let alive = true;
    getNoticeRubrics()
      .then((response) => {
        if (alive) setRubrics(response.items);
      })
      .catch(() => setError("Не удалось загрузить рубрики"));
    getMyCommunities()
      .then((response) => {
        if (!alive) return;
        setCommunities(
          response.memberships.filter((badge) => POSTING_ROLES.has(badge.role)),
        );
      })
      .catch(() => {
        // Без общин форма работает — просто не будет выбора «от имени».
      });
    // Доступность экадаши узнаём у сервера: календарь лунных дат может быть
    // не загружен, и предлагать вариант, который отклонят, нечестно.
    getNoticeCalendar({
      from: new Date().toISOString(),
      to: new Date().toISOString(),
    })
      .then((response) => {
        if (alive) setEkadashiAvailable(response.ekadashiAvailable);
      })
      .catch(() => {
        // Молчим: без ответа вариант просто останется недоступным.
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const query = locationQuery.trim();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      if (query.length < 2 || query === location?.displayName) {
        setLocationResults([]);
        return;
      }
      apiFetch(`${API_URL}/geo/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(await res.text());
          setLocationResults((await res.json()) as GeoSearchResult[]);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setLocationResults([]);
        });
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [location?.displayName, locationQuery]);

  const visibleRubrics = rubrics.filter(
    (item) => !item.kinds.length || item.kinds.includes(kind),
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const notice = await createNotice({
        kind,
        rubricSlug,
        titleRu: title,
        descriptionRu: description || null,
        audience,
        communityId: communityId || null,
        location,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        timeZone: startsAt ? timeZone : null,
        venueName: venueName || null,
        isOnline,
        onlineUrl: onlineUrl || null,
        repeat: kind === "event" ? repeat : "none",
        repeatUntil:
          kind === "event" && repeat !== "none" && repeatUntil
            ? new Date(repeatUntil).toISOString()
            : null,
      });
      // Фото уходят следом: адрес загрузки требует id, а он появляется
      // только сейчас.
      if (photos.length) {
        try {
          const uploaded = await uploadNoticeImages(notice.id, photos);
          if (uploaded.failed.length) {
            // Объявление уже создано — молча увести человека, потеряв
            // сообщение об отказе, нельзя. Показываем и даём перейти самому.
            setCreatedId(notice.id);
            setUploadWarning(
              uploaded.failed.map((f) => f.message).join("; "),
            );
            setPending(false);
            return;
          }
        } catch (e) {
          setCreatedId(notice.id);
          setUploadWarning(
            e instanceof NoticesApiError
              ? e.message
              : "Объявление создано, но фото загрузить не удалось",
          );
          setPending(false);
          return;
        }
      }
      router.push(`/notices/${notice.id}`);
    } catch (e) {
      setError(e instanceof NoticesApiError ? e.message : "Не удалось сохранить");
      setPending(false);
    }
  };

  if (createdId)
    return (
      <div className="glass rounded-2xl border border-glass-brd p-6">
        <p className="font-medium text-text-0">Объявление опубликовано</p>
        {uploadWarning && (
          <p className="mt-2 text-sm text-amber-300">
            Но с фотографиями не сложилось: {uploadWarning}. Их можно добавить
            на самой карточке.
          </p>
        )}
        <Link
          href={`/notices/${createdId}`}
          className="mt-4 inline-block rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-sm font-medium text-white"
        >
          Открыть объявление
        </Link>
      </div>
    );

  return (
    <form
      onSubmit={submit}
      className="glass rounded-2xl border border-glass-brd p-6"
    >
      <p className="mb-6 rounded-xl border border-glass-brd bg-glass px-4 py-3 text-sm text-text-1">
        Доска некоммерческая: здесь не продают. Если за вещь или услугу нужны
        деньги — это{" "}
        <Link href="/market/sell" className="text-text-0 underline">
          Рынок
        </Link>
        .
      </p>

      <Field label="Что за объявление">
        <div className="flex flex-wrap gap-2">
          {NOTICE_KIND_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={kind === option}
              onClick={() => {
                setKind(option);
                setRubricSlug("");
              }}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                kind === option
                  ? "border-magenta/40 bg-magenta/10 text-text-0"
                  : "border-glass-brd text-text-1 hover:text-text-0"
              }`}
            >
              {NOTICE_KIND_LABELS[option]}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Рубрика">
        <select
          required
          value={rubricSlug}
          onChange={(event) => setRubricSlug(event.target.value)}
          className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0"
        >
          <option value="">Выберите рубрику</option>
          {visibleRubrics.map((item) => (
            <option key={item.id} value={item.slug} className="bg-bg-0">
              {item.nameRu}
            </option>
          ))}
        </select>
        {RUBRIC_HINTS[rubricSlug] && (
          <p className="mt-1.5 text-xs text-text-2">
            {RUBRIC_HINTS[rubricSlug]}
          </p>
        )}
      </Field>

      <Field label="Заголовок">
        <input
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Отдам холодильник"
          className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
        />
      </Field>

      <Field label="Подробности">
        <textarea
          rows={5}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Что именно, в каком состоянии, когда забрать"
          className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
        />
      </Field>

      <Field label="Фотографии">
        <NoticeImagePicker files={photos} onChange={setPhotos} />
      </Field>

      <Field label="Город">
        <input
          value={location ? (location.displayName ?? location.city) : locationQuery}
          onChange={(event) => {
            setLocation(null);
            setLocationQuery(event.target.value);
          }}
          placeholder="Начните вводить город"
          className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
        />
        {locationResults.length > 0 && (
          <ul className="mt-2 space-y-1">
            {locationResults.map((result) => (
              <li key={`${result.lat},${result.lon}`}>
                <button
                  type="button"
                  onClick={() => {
                    setLocation(result);
                    setLocationQuery(result.displayName ?? result.city);
                    setLocationResults([]);
                  }}
                  className="w-full rounded-lg border border-glass-brd px-3 py-2 text-left text-sm text-text-1 hover:text-text-0"
                >
                  {result.displayName ?? result.city}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-text-2">
          На карте объявление встанет в центр города, а не по вашему адресу.
        </p>
      </Field>

      {kind === "event" && (
        <>
          <Field label="Начало">
            <input
              type="datetime-local"
              required
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0"
            />
            <p className="mt-1 text-xs text-text-2">
              Время сохраняем в вашем поясе ({timeZone}) — участники увидят его
              как время на месте.
            </p>
          </Field>
          <Field label="Окончание (необязательно)">
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
              className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0"
            />
          </Field>
          <Field label="Площадка">
            <input
              value={venueName}
              onChange={(event) => setVenueName(event.target.value)}
              placeholder="Храм на Хорошёвке"
              className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
            />
          </Field>
          <Field label="Повторяется">
            <select
              value={repeat}
              onChange={(event) =>
                setRepeat(event.target.value as NoticeRecurrence)
              }
              className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0"
            >
              {NOTICE_RECURRENCE_ORDER.map((option) => (
                <option
                  key={option}
                  value={option}
                  // Экадаши доступен, только когда загружен лунный календарь:
                  // сервер иначе откажет, и молча предлагать вариант нечестно.
                  disabled={option === "ekadashi" && !ekadashiAvailable}
                  className="bg-bg-0"
                >
                  {NOTICE_RECURRENCE_LABELS[option]}
                </option>
              ))}
            </select>
            {repeat !== "none" && (
              <input
                type="date"
                value={repeatUntil}
                onChange={(event) => setRepeatUntil(event.target.value)}
                className="mt-2 w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0"
              />
            )}
            {repeat !== "none" && (
              <p className="mt-1 text-xs text-text-2">
                Дата окончания необязательна — без неё программа идёт, пока её
                не снимут.
              </p>
            )}
          </Field>
        </>
      )}

      <Field label="Формат">
        <label className="flex items-center gap-2 text-sm text-text-1">
          <input
            type="checkbox"
            checked={isOnline}
            onChange={(event) => setIsOnline(event.target.checked)}
          />
          Онлайн
        </label>
        {isOnline && (
          <input
            value={onlineUrl}
            onChange={(event) => setOnlineUrl(event.target.value)}
            placeholder="https://…"
            className="mt-2 w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
          />
        )}
      </Field>

      {communities.length > 0 && (
        <Field label="От чьего имени">
          <select
            value={communityId}
            onChange={(event) => {
              setCommunityId(event.target.value);
              if (!event.target.value && audience === "my_community")
                setAudience("everyone");
            }}
            className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0"
          >
            <option value="">От себя</option>
            {communities.map((badge) => (
              <option key={badge.id} value={badge.id} className="bg-bg-0">
                {badge.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Кому показывать">
        <select
          value={audience}
          onChange={(event) =>
            setAudience(event.target.value as NoticeAudience)
          }
          className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0"
        >
          {(
            Object.entries(NOTICE_AUDIENCE_LABELS) as Array<
              [NoticeAudience, string]
            >
          ).map(([value, label]) => (
            <option
              key={value}
              value={value}
              // «Только общине» без выбранной общины никто не увидит —
              // сервер такое отклоняет, поэтому и в форме недоступно.
              disabled={value === "my_community" && !communityId}
              className="bg-bg-0"
            >
              {label}
            </option>
          ))}
        </select>
      </Field>

      {error && (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !title.trim() || !rubricSlug}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-3 text-sm font-medium text-white transition disabled:opacity-50"
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        Опубликовать
      </button>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <label className="mb-2 block text-sm font-medium text-text-1">
        {label}
      </label>
      {children}
    </div>
  );
}
