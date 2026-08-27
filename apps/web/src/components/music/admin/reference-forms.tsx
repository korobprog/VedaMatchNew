"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MusicArtistDto, MusicArtistKind } from "@vedamatch/shared";
import {
  createMusicAlbum,
  createMusicArtist,
  createMusicCategory,
} from "@/lib/music-admin-client-api";
import { Alert } from "@/components/ui/alert";

const KINDS: { value: MusicArtistKind; label: string }[] = [
  { value: "kirtaneer", label: "Киртанья" },
  { value: "group", label: "Коллектив" },
  { value: "temple", label: "Храм" },
  { value: "unknown", label: "Не указан" },
];

const field =
  "h-9 w-full rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0";

/**
 * Формы справочников. Три коротких формы вместо одной универсальной: у
 * исполнителя, программы и раздела разные поля, и «универсальная» форма с
 * половиной скрытых полей читается хуже трёх честных.
 *
 * Слаг не спрашиваем — его делает сервер из названия и разводит коллизии
 * сам. Адрес, набранный руками, разъезжается с названием на первой же
 * правке.
 */
export function MusicReferenceForms({ artists }: { artists: MusicArtistDto[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ArtistForm />
      <AlbumForm artists={artists} />
      <CategoryForm />
    </div>
  );
}

function useSubmit() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const run = async (action: () => Promise<unknown>, reset: () => void) => {
    setPending(true);
    setError(null);
    setDone(false);
    try {
      await action();
      reset();
      setDone(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
    } finally {
      setPending(false);
    }
  };

  return { pending, error, done, run };
}

function Shell({
  title,
  children,
  error,
  done,
}: {
  title: string;
  children: React.ReactNode;
  error: string | null;
  done: boolean;
}) {
  return (
    <section className="glass flex flex-col gap-3 rounded-2xl border border-glass-brd p-4">
      <h3 className="font-display text-base font-bold text-text-0">{title}</h3>
      {children}
      {error && <Alert tone="error">{error}</Alert>}
      {done && <Alert tone="success">Сохранено.</Alert>}
    </section>
  );
}

function ArtistForm() {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<MusicArtistKind>("kirtaneer");
  const [isVerified, setIsVerified] = useState(false);
  const { pending, error, done, run } = useSubmit();

  return (
    <Shell title="Новый исполнитель" error={error} done={done}>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">Имя</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={field}
          placeholder="Аударья Дхама дас"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">Кто это</span>
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value as MusicArtistKind)}
          className={field}
        >
          {KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-text-1">
        <input
          type="checkbox"
          checked={isVerified}
          onChange={(event) => setIsVerified(event.target.checked)}
        />
        Отметка редакции «это тот самый»
      </label>
      <button
        type="button"
        disabled={pending || !name.trim()}
        onClick={() =>
          void run(
            () => createMusicArtist({ name: name.trim(), kind, isVerified }),
            () => {
              setName("");
              setIsVerified(false);
            },
          )
        }
        className="btn-mint h-9 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
      >
        Добавить
      </button>
    </Shell>
  );
}

function AlbumForm({ artists }: { artists: MusicArtistDto[] }) {
  const [title, setTitle] = useState("");
  const [artistId, setArtistId] = useState("");
  const [year, setYear] = useState("");
  const { pending, error, done, run } = useSubmit();

  return (
    <Shell title="Новая программа или альбом" error={error} done={done}>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">Название</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={field}
          placeholder="Вечерняя программа, Минск"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">Исполнитель</span>
        <select
          value={artistId}
          onChange={(event) => setArtistId(event.target.value)}
          className={field}
        >
          <option value="">Не указан</option>
          {artists.map((artist) => (
            <option key={artist.id} value={artist.id}>
              {artist.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">
          Год записи — не год загрузки
        </span>
        <input
          value={year}
          inputMode="numeric"
          onChange={(event) => setYear(event.target.value)}
          className={field}
          placeholder="2026"
        />
      </label>
      <button
        type="button"
        disabled={pending || !title.trim()}
        onClick={() =>
          void run(
            () =>
              createMusicAlbum({
                title: title.trim(),
                artistId: artistId || null,
                kind: "live",
                year: year.trim() ? Number(year) : null,
              }),
            () => {
              setTitle("");
              setYear("");
            },
          )
        }
        className="btn-mint h-9 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
      >
        Добавить
      </button>
    </Shell>
  );
}

function CategoryForm() {
  const [title, setTitle] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const { pending, error, done, run } = useSubmit();

  return (
    <Shell title="Новый раздел каталога" error={error} done={done}>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">Название</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={field}
          placeholder="Гуру-пуджа"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">
          На английском — портал двуязычный
        </span>
        <input
          value={titleEn}
          onChange={(event) => setTitleEn(event.target.value)}
          className={field}
          placeholder="Guru-puja"
        />
      </label>
      <button
        type="button"
        disabled={pending || !title.trim()}
        onClick={() =>
          void run(
            () =>
              createMusicCategory({
                title: title.trim(),
                titleEn: titleEn.trim() || null,
              }),
            () => {
              setTitle("");
              setTitleEn("");
            },
          )
        }
        className="btn-mint h-9 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
      >
        Добавить
      </button>
    </Shell>
  );
}
