import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContactsProfileDto } from "@vedamatch/shared";
import {
  CONTACTS_MAX_MESSAGE_LENGTH,
  buildContactsCreateRequestBody,
  buildContactsProfileRequest,
  buildContactsRespondBody,
  buildContactsSearchQuery,
  cancelContactsRequest,
  createContactsRequest,
  getContactsCard,
  getContactsDisclosures,
  getContactsRequests,
  getContactsTags,
  parseContactsSearchFilters,
  respondToContactsRequest,
  revokeContactsDisclosure,
  searchContacts,
  toContactsDraft,
  updateContactsProfile,
} from "./contacts-api";

afterEach(() => vi.unstubAllGlobals());

const profile: ContactsProfileDto = {
  headline: "Повар на праздничных программах",
  about: "Готовлю прасад",
  offers: null,
  languages: ["русский"],
  ashram: "grihastha",
  format: "offline",
  visibility: "same_city",
  status: "active",
  pausedUntil: "2026-09-01T23:59:59.999Z",
  fieldPrivacy: { city: "hidden" },
  requestsFromVerifiedOnly: true,
  tagIds: ["t1"],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("toContactsDraft", () => {
  it("turns an empty card into a blank draft with safe defaults", () => {
    expect(toContactsDraft(null)).toEqual({
      headline: "",
      about: "",
      offers: "",
      languages: [],
      ashram: "",
      format: "any",
      visibility: "everyone",
      pausedUntil: "",
      fieldPrivacy: { city: "everyone", photo: "everyone", age: "everyone" },
      requestsFromVerifiedOnly: false,
      tagIds: [],
    });
  });

  it("cuts the pause moment down to a date input value", () => {
    expect(toContactsDraft(profile).pausedUntil).toBe("2026-09-01");
  });

  it("fills the field privacy keys the server left out", () => {
    expect(toContactsDraft(profile).fieldPrivacy).toEqual({
      city: "hidden",
      photo: "everyone",
      age: "everyone",
    });
  });
});

describe("buildContactsProfileRequest", () => {
  it("trims texts and turns empty ones into null", () => {
    const body = buildContactsProfileRequest({
      ...toContactsDraft(null),
      headline: "  Йога-инструктор  ",
      about: "   ",
      offers: "",
    });

    expect(body.headline).toBe("Йога-инструктор");
    expect(body.about).toBeNull();
    expect(body.offers).toBeNull();
  });

  it("drops blank and duplicate languages and keeps at most ten", () => {
    const body = buildContactsProfileRequest({
      ...toContactsDraft(null),
      languages: [
        "русский",
        "  ",
        "русский",
        ...Array.from({ length: 12 }, (_, i) => `язык-${i}`),
      ],
    });

    expect(body.languages).toHaveLength(10);
    expect(body.languages?.slice(0, 2)).toEqual(["русский", "язык-0"]);
  });

  it("sends «ашрам не указан» as null", () => {
    expect(buildContactsProfileRequest(toContactsDraft(null)).ashram).toBeNull();
    expect(
      buildContactsProfileRequest({ ...toContactsDraft(null), ashram: "sannyasi" })
        .ashram,
    ).toBe("sannyasi");
  });

  it("sends the pause as the end of the chosen day, and null when cleared", () => {
    expect(
      buildContactsProfileRequest({
        ...toContactsDraft(null),
        pausedUntil: "2026-09-01",
      }).pausedUntil,
    ).toBe("2026-09-01T23:59:59.999Z");
    expect(
      buildContactsProfileRequest(toContactsDraft(null)).pausedUntil,
    ).toBeNull();
  });

  it("never sends more than twelve tags", () => {
    const body = buildContactsProfileRequest({
      ...toContactsDraft(null),
      tagIds: Array.from({ length: 20 }, (_, i) => `tag-${i}`),
    });

    expect(body.tagIds).toHaveLength(12);
    expect(body.tagIds?.at(-1)).toBe("tag-11");
  });

  it("does not carry the read-only status into the request", () => {
    const body = buildContactsProfileRequest(toContactsDraft(profile));
    expect("status" in body).toBe(false);
  });
});

describe("buildContactsSearchQuery", () => {
  it("skips empty, blank and undefined values", () => {
    expect(
      buildContactsSearchQuery({
        q: "   ",
        city: "",
        country: undefined,
        radiusKm: 0,
        stages: [],
        tagIds: ["", "  "],
        page: 0,
      }),
    ).toBe("");
  });

  it("sends arrays as repeated parameters", () => {
    const query = buildContactsSearchQuery({
      tagIds: ["a", "b"],
      stages: ["yogi", "devotee"],
      languages: ["русский", "хинди"],
      ashram: ["grihastha"],
    });

    expect(query).toContain("tagIds=a&tagIds=b");
    expect(new URLSearchParams(query).getAll("stages")).toEqual([
      "yogi",
      "devotee",
    ]);
    expect(new URLSearchParams(query).getAll("languages")).toEqual([
      "русский",
      "хинди",
    ]);
    expect(new URLSearchParams(query).getAll("ashram")).toEqual(["grihastha"]);
  });

  it("trims texts and keeps only the flags that are on", () => {
    const params = new URLSearchParams(
      buildContactsSearchQuery({
        q: "  повар  ",
        city: " Москва ",
        radiusKm: 100,
        format: "offline",
        verifiedDevoteeOnly: true,
        photoVerifiedOnly: false,
        page: 2,
      }),
    );

    expect(params.get("q")).toBe("повар");
    expect(params.get("city")).toBe("Москва");
    expect(params.get("radiusKm")).toBe("100");
    expect(params.get("format")).toBe("offline");
    expect(params.get("verifiedDevoteeOnly")).toBe("true");
    expect(params.has("photoVerifiedOnly")).toBe(false);
    expect(params.get("page")).toBe("2");
  });
});

describe("parseContactsSearchFilters", () => {
  it("reads repeated parameters and drops values the API does not know", () => {
    const filters = parseContactsSearchFilters(
      new URLSearchParams(
        "tagIds=a&tagIds=b&stages=yogi&stages=пришелец&ashram=grihastha&format=выдумка",
      ),
    );

    expect(filters.tagIds).toEqual(["a", "b"]);
    expect(filters.stages).toEqual(["yogi"]);
    expect(filters.ashram).toEqual(["grihastha"]);
    expect(filters.format).toBeUndefined();
  });

  it("defaults to the first page and to flags turned off", () => {
    const filters = parseContactsSearchFilters(new URLSearchParams(""));

    expect(filters.page).toBe(1);
    expect(filters.verifiedDevoteeOnly).toBe(false);
    expect(filters.photoVerifiedOnly).toBe(false);
    expect(filters.q).toBeUndefined();
  });
});

describe("Contacts API requests", () => {
  it("asks contacts/search with the built query", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          page: 1,
          pageSize: 20,
          hasMore: false,
          total: 0,
          facets: [],
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await searchContacts({ q: "повар", tagIds: ["a", "b"] });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/contacts/search?q=%D0%BF%D0%BE%D0%B2%D0%B0%D1%80&tagIds=a&tagIds=b",
    );
  });


  it("escapes the id in the contacts/users path", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("{}", { headers: { "Content-Type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await getContactsCard("a b/c");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/contacts/users/a%20b%2Fc",
    );
  });

  it("reports a missing card with status 404 so the page can tell them apart", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ message: "Карточка не найдена" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(getContactsCard("ghost")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("puts the built body to contacts/profile with cookies", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(profile), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const body = buildContactsProfileRequest(toContactsDraft(profile));
    await updateContactsProfile(body);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/contacts/profile",
      {
        credentials: "include",
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  });

  it("surfaces the Russian message the backend sent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ message: "Заголовок слишком длинный" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(getContactsTags()).rejects.toThrow("Заголовок слишком длинный");
  });
});

describe("buildContactsCreateRequestBody", () => {
  it("trims the recipient and turns an empty message into null", () => {
    expect(buildContactsCreateRequestBody(" u2 ", "   ")).toEqual({
      toUserId: "u2",
      message: null,
    });
  });

  it("keeps the message and cuts it to the backend limit", () => {
    const long = "я".repeat(CONTACTS_MAX_MESSAGE_LENGTH + 20);
    const body = buildContactsCreateRequestBody("u2", long);

    expect(body.message).toHaveLength(CONTACTS_MAX_MESSAGE_LENGTH);
    expect(buildContactsCreateRequestBody("u2", " ищу повара ").message).toBe(
      "ищу повара",
    );
  });
});

describe("buildContactsRespondBody", () => {
  it("does not send hiding with a plain decline", () => {
    // Отказ дать телефон и желание исчезнуть — разные вещи: галочка выключена,
    // значит поля в теле нет вовсе, а не `false`.
    expect(buildContactsRespondBody(false)).toEqual({ accept: false });
    expect("hideFromRequester" in buildContactsRespondBody(false)).toBe(false);
    expect(buildContactsRespondBody(false, false)).toEqual({ accept: false });
  });

  it("sends hiding only when the checkbox was switched on", () => {
    expect(buildContactsRespondBody(false, true)).toEqual({
      accept: false,
      hideFromRequester: true,
    });
  });

  it("keeps accept as its own decision", () => {
    expect(buildContactsRespondBody(true)).toEqual({ accept: true });
  });
});

describe("requests and disclosures endpoints", () => {
  const requestsState = { incoming: [], outgoing: [], remainingToday: 7 };

  // Новый Response на каждый вызов: тело читается один раз.
  function stub(body: unknown) {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("reads both lists from contacts/requests", async () => {
    const fetchMock = stub(requestsState);

    await expect(getContactsRequests()).resolves.toEqual(requestsState);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/contacts/requests",
      { credentials: "include", method: "GET", signal: undefined },
    );
  });

  it("posts the built body when creating a request", async () => {
    const fetchMock = stub(requestsState);

    await createContactsRequest("u2", " нужен повар ");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/contacts/requests",
      {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: "u2", message: "нужен повар" }),
      },
    );
  });

  it("posts the answer to the request it belongs to", async () => {
    const fetchMock = stub(requestsState);

    await respondToContactsRequest("r 1", false, true);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/contacts/requests/r%201/respond",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ accept: false, hideFromRequester: true }),
    );
  });

  it("cancels an outgoing request by id", async () => {
    const fetchMock = stub(requestsState);

    await cancelContactsRequest("r1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/contacts/requests/r1",
      { credentials: "include", method: "DELETE" },
    );
  });

  it("reads and revokes disclosures", async () => {
    const fetchMock = stub({ items: [] });

    await getContactsDisclosures();
    await revokeContactsDisclosure("d1");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/contacts/disclosures",
    );
    expect(fetchMock.mock.calls[1]).toEqual([
      "http://localhost:4000/contacts/disclosures/d1",
      { credentials: "include", method: "DELETE" },
    ]);
  });
});
