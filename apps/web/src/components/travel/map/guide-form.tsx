"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TRAVEL_MAP_GUIDE_ABOUT_MAX,
  TRAVEL_MAP_GUIDE_CITIES_MAX,
  TRAVEL_MAP_GUIDE_LANGUAGES_MAX,
} from "@vedamatch/shared";
import {
  deleteMyTravelMapGuide,
  getMyTravelMapGuide,
  saveMyTravelMapGuide,
} from "@/lib/travel-map-api";
import { parseCommaList } from "./tour-format";

const fieldClass =
  "w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";

function Chips({ items, label }: { items: string[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <ul aria-label={label} className="mt-2 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-full border border-glass-brd px-2.5 py-0.5 text-xs text-text-1"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

export function GuideForm() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [exists, setExists] = useState(false);
  const [about, setAbout] = useState("");
  const [languages, setLanguages] = useState("");
  const [cities, setCities] = useState("");
  const [telegram, setTelegram] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getMyTravelMapGuide(controller.signal)
      .then((guide) => {
        if (guide) {
          setExists(true);
          setAbout(guide.about);
          setLanguages(guide.languages.join(", "));
          setCities(guide.cities.join(", "));
          setTelegram(guide.telegram ?? "");
          setPhone(guide.phone ?? "");
        }
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Не загрузилось");
        setLoaded(true);
      });
    return () => controller.abort();
  }, []);

  const languageList = useMemo(
    () => parseCommaList(languages, TRAVEL_MAP_GUIDE_LANGUAGES_MAX),
    [languages],
  );
  const cityList = useMemo(
    () => parseCommaList(cities, TRAVEL_MAP_GUIDE_CITIES_MAX),
    [cities],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await saveMyTravelMapGuide({
        about: about.trim(),
        languages: languageList,
        cities: cityList,
        telegram: telegram.trim() || null,
        phone: phone.trim() || null,
      });
      setExists(true);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось сохранить");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (
      !window.confirm(
        "Больше не водить? Профиль исчезнет из списка; назначенные наборы останутся у вас.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteMyTravelMapGuide();
      router.push("/travel/map/guides");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось удалить");
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <p role="status" className="text-sm text-text-2">
        Загружаем…
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-label="Профиль экскурсовода">
      <Link href="/travel/map/guides" className="text-sm text-cyan underline">
        Все экскурсоводы
      </Link>

      <label className="block text-sm text-text-1">
        О себе
        <textarea
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          maxLength={TRAVEL_MAP_GUIDE_ABOUT_MAX}
          rows={6}
          required
          aria-describedby="guide-about-count"
          className={`${fieldClass} mt-1`}
        />
        <span id="guide-about-count" className="block text-right text-xs text-text-2">
          {about.length} / {TRAVEL_MAP_GUIDE_ABOUT_MAX}
        </span>
      </label>

      <div>
        <label className="block text-sm text-text-1">
          Языки (через запятую)
          <input
            value={languages}
            onChange={(e) => setLanguages(e.target.value)}
            className={`${fieldClass} mt-1`}
          />
        </label>
        <Chips items={languageList} label="Языки" />
      </div>

      <div>
        <label className="block text-sm text-text-1">
          Города (через запятую)
          <input
            value={cities}
            onChange={(e) => setCities(e.target.value)}
            className={`${fieldClass} mt-1`}
          />
        </label>
        <Chips items={cityList} label="Города" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-text-1">
          Телеграм
          <input
            value={telegram}
            onChange={(e) => setTelegram(e.target.value)}
            maxLength={100}
            placeholder="@name"
            className={`${fieldClass} mt-1`}
          />
        </label>
        <label className="block text-sm text-text-1">
          Телефон
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={40}
            className={`${fieldClass} mt-1`}
          />
        </label>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm text-text-0">
          Сохранено.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || !about.trim()}
          className="rounded-xl border border-magenta px-4 py-2 text-sm text-text-0 disabled:opacity-60"
        >
          Сохранить
        </button>
        {exists ? (
          <button
            type="button"
            onClick={() => void stop()}
            disabled={busy}
            className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1"
          >
            Больше не вожу
          </button>
        ) : null}
      </div>
    </form>
  );
}
