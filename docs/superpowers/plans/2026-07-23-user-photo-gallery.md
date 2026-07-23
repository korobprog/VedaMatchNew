# User Photo Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent private user gallery whose owner-selected public photos appear as an ordered carousel in authenticated Union recommendation cards.

**Architecture:** Add a `UserPhoto` Prisma model and a focused NestJS gallery controller/service. Process uploads to private WebP objects, return signed URLs only after authorization, and keep the existing avatar independent. Extend the shared Union projection with ordered public photos and add focused React components for gallery management and the recommendation carousel.

**Tech Stack:** pnpm workspace, TypeScript, NestJS 11, Prisma 6, PostgreSQL, AWS S3 SDK, Sharp, Next.js/React, Jest, Vitest, Testing Library.

## Global Constraints

- Keep `User.avatarUrl`, `User.avatarKey`, and existing avatar endpoints unchanged.
- Accept JPEG, PNG, and WebP input up to 20 MB per file.
- Convert to WebP, strip metadata, and never retain originals.
- Store every gallery object privately; never persist or log signed URLs.
- New photos default to private.
- Public gallery photos are visible only to authenticated Union participants and remain gated by `UnionPrivacySettings.photo`.
- Show the gallery only in Union recommendation cards; connections, chat, and full Union profile stay unchanged.
- Do not impose a persistent photo-count limit.
- Enforce `USER_GALLERY_QUOTA_MB`, defaulting to 250 MB of processed files.
- Preserve partial success for multi-file uploads.
- Use the complete owned photo-ID list for atomic reorder operations.
- Do not add unrelated refactors.

## File Structure

### Create

- `apps/api/prisma/migrations/<timestamp>_add_user_gallery/migration.sql`: create `UserPhoto`, indexes, and owner foreign key.
- `apps/api/src/modules/users/user-gallery.controller.ts`: authenticated gallery HTTP API.
- `apps/api/src/modules/users/user-gallery.controller.spec.ts`: multipart and controller delegation tests.
- `apps/api/src/modules/users/user-gallery.service.ts`: processing, storage, quota, ordering, ownership, and URL signing.
- `apps/api/src/modules/users/user-gallery.service.spec.ts`: gallery domain tests.
- `apps/web/src/components/user-gallery-editor.tsx`: owner gallery UI.
- `apps/web/src/components/user-gallery-editor.spec.tsx`: owner gallery UI tests.
- `apps/web/src/components/union/recommendation-photo-carousel.tsx`: accessible image carousel.
- `apps/web/src/components/union/recommendation-photo-carousel.spec.tsx`: carousel tests.
- `apps/web/src/components/union/recommendation-card.spec.tsx`: gallery/avatar fallback tests.

### Modify

- `apps/api/package.json`: direct Sharp and S3 presigner dependencies.
- `pnpm-lock.yaml`: resolved dependencies.
- `.env.example`: gallery quota configuration.
- `apps/api/prisma/schema.prisma`: `User.photos` and `UserPhoto`.
- `packages/shared/src/index.ts`: gallery management contracts.
- `packages/shared/src/union.ts`: `UnionPhoto` and `UnionUserSummary.photos`.
- `apps/api/src/modules/users/users.module.ts`: gallery controller/provider/export.
- `apps/api/src/modules/union/union.module.ts`: import `UsersModule`.
- `apps/api/src/modules/union/union-profile.service.ts`: select, authorize, sign, and map public photos.
- `apps/api/src/modules/union/union-profile.service.spec.ts`: Union gallery/privacy tests.
- `apps/web/src/components/profile-editor.tsx`: render the independent gallery editor.
- `apps/web/src/components/union/recommendation-card.tsx`: carousel and avatar fallback.

---

### Task 1: Persistence, dependencies, and shared contracts

**Files:**

- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.env.example`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_user_gallery/migration.sql`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/union.ts`

**Interfaces:**

- Produces: Prisma `UserPhoto` and `User.photos`.
- Produces: `UserPhotoDto`, `UserGalleryState`, `UserPhotoUploadResponse`, `UpdateUserPhotoRequest`, and `ReorderUserPhotosRequest`.
- Produces: `UnionPhoto` and `UnionUserSummary.photos`.

- [ ] **Step 1: Install direct runtime dependencies**

Run:

```powershell
pnpm --filter @vedamatch/api add sharp@^0.34.5 @aws-sdk/s3-request-presigner@^3.1079.0
```

Expected: `apps/api/package.json` declares both packages and `pnpm-lock.yaml` is updated.

- [ ] **Step 2: Add quota configuration**

Append to `.env.example` near the existing S3 variables:

```dotenv
USER_GALLERY_QUOTA_MB=250
```

- [ ] **Step 3: Add the Prisma relation and model**

Add to `User`:

```prisma
photos UserPhoto[]
```

Add near the other user-owned models:

```prisma
model UserPhoto {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  storageKey String   @unique
  sizeBytes  Int
  width      Int
  height     Int
  isPublic   Boolean  @default(false)
  sortOrder  Int
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([userId, sortOrder, createdAt])
  @@index([userId, isPublic, sortOrder])
}
```

Do not add a unique constraint on `(userId, sortOrder)`, because transactional reorder temporarily updates multiple rows.

- [ ] **Step 4: Generate and inspect the migration**

Run:

```powershell
pnpm --filter @vedamatch/api exec prisma migrate dev --name add_user_gallery --create-only
```

Expected: a new migration creates `UserPhoto`, the unique `storageKey` index, both compound indexes, and a cascade foreign key to `User`.

Inspect the generated SQL and ensure it contains:

```sql
CREATE UNIQUE INDEX "UserPhoto_storageKey_key" ON "UserPhoto"("storageKey");
CREATE INDEX "UserPhoto_userId_sortOrder_createdAt_idx"
  ON "UserPhoto"("userId", "sortOrder", "createdAt");
CREATE INDEX "UserPhoto_userId_isPublic_sortOrder_idx"
  ON "UserPhoto"("userId", "isPublic", "sortOrder");
```

- [ ] **Step 5: Add shared owner-gallery contracts**

Add to `packages/shared/src/index.ts`:

```ts
export interface UserPhotoDto {
  id: string;
  url: string;
  sizeBytes: number;
  width: number;
  height: number;
  isPublic: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserGalleryState {
  photos: UserPhotoDto[];
  usedBytes: number;
  quotaBytes: number;
}

export type UserPhotoUploadFailureCode =
  | "unsupported_type"
  | "file_too_large"
  | "invalid_image"
  | "quota_exceeded"
  | "processing_failed"
  | "storage_error";

export interface UserPhotoUploadFailure {
  fileName: string;
  code: UserPhotoUploadFailureCode;
  message: string;
}

export interface UserPhotoUploadSuccess {
  fileName: string;
  photo: UserPhotoDto;
}

export interface UserPhotoUploadResponse {
  uploaded: UserPhotoUploadSuccess[];
  failed: UserPhotoUploadFailure[];
  usedBytes: number;
  quotaBytes: number;
}

export interface UpdateUserPhotoRequest {
  isPublic: boolean;
}

export interface ReorderUserPhotosRequest {
  photoIds: string[];
}
```

- [ ] **Step 6: Extend the Union contract**

Add to `packages/shared/src/union.ts`:

```ts
export interface UnionPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
}
```

Add to `UnionUserSummary`:

```ts
photos: UnionPhoto[];
```

- [ ] **Step 7: Generate Prisma and validate contracts**

Run:

```powershell
pnpm --filter @vedamatch/api prisma:generate
pnpm --filter @vedamatch/api exec prisma validate
pnpm --filter @vedamatch/shared lint
```

Expected: all commands exit with code 0.

- [ ] **Step 8: Commit the persistence slice**

```powershell
git add .env.example apps/api/package.json pnpm-lock.yaml apps/api/prisma packages/shared/src
git commit -m "feat: add user gallery data contracts"
```

---

### Task 2: Gallery service with private storage and quota safety

**Files:**

- Create: `apps/api/src/modules/users/user-gallery.service.ts`
- Create: `apps/api/src/modules/users/user-gallery.service.spec.ts`

**Interfaces:**

- Consumes: Prisma `UserPhoto`, shared gallery contracts, existing S3 environment variables.
- Produces:

```ts
export interface UploadedGalleryFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export class UserGalleryService {
  getGallery(userId: string): Promise<UserGalleryState>;
  uploadMany(
    userId: string,
    files: UploadedGalleryFile[],
  ): Promise<UserPhotoUploadResponse>;
  updateVisibility(
    userId: string,
    photoId: string,
    body: UpdateUserPhotoRequest,
  ): Promise<UserPhotoDto>;
  reorder(
    userId: string,
    body: ReorderUserPhotosRequest,
  ): Promise<UserGalleryState>;
  remove(userId: string, photoId: string): Promise<void>;
  signPublicPhotos(
    photos: Array<Pick<UserPhoto, "id" | "storageKey" | "width" | "height">>,
  ): Promise<UnionPhoto[]>;
}
```

- [ ] **Step 1: Write failing validation and processing tests**

Create `user-gallery.service.spec.ts` using the repository's Jest mock style. Add tests that assert:

```ts
it.each([
  ["image/gif", Buffer.from("gif"), "unsupported_type"],
  ["image/jpeg", Buffer.alloc(20 * 1024 * 1024 + 1), "file_too_large"],
])(
  "rejects %s without aborting later files",
  async (mimetype, buffer, code) => {
    const result = await service.uploadMany(USER_ID, [
      file({ mimetype, buffer }),
      validJpegFile(),
    ]);

    expect(result.failed[0].code).toBe(code);
    expect(result.uploaded).toHaveLength(1);
  },
);
```

Also cover malformed bytes with an allowed MIME, JPEG/PNG/WebP conversion, EXIF orientation, absent output metadata, and processed dimensions.

- [ ] **Step 2: Run the new service tests and verify failure**

Run:

```powershell
pnpm --filter @vedamatch/api test -- user-gallery.service.spec.ts --runInBand
```

Expected: FAIL because `UserGalleryService` does not exist.

- [ ] **Step 3: Implement image validation and processing**

Use these exact constants and processing behavior:

```ts
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const DEFAULT_QUOTA_MB = 250;
const SIGNED_URL_TTL_SECONDS = 15 * 60;
const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const output = await sharp(file.buffer, {
  failOn: "error",
  limitInputPixels: true,
})
  .rotate()
  .webp()
  .toBuffer({ resolveWithObject: true });
```

Never call `withMetadata()`. Map decode errors to `invalid_image` and conversion failures after decoding to `processing_failed`.

- [ ] **Step 4: Write failing storage, signing, and quota tests**

Cover these observable requirements:

```ts
expect(s3.send).toHaveBeenCalledWith(
  expect.objectContaining({
    input: expect.objectContaining({
      Bucket: "bucket",
      Key: expect.stringMatching(
        new RegExp(`^users/${USER_ID}/gallery/.+\\.webp$`),
      ),
      ContentType: "image/webp",
      CacheControl: "private, max-age=31536000, immutable",
    }),
  }),
);
expect(s3.send.mock.calls[0][0].input).not.toHaveProperty("ACL");
```

Test default 250 MB, configured quota, invalid/non-positive configuration, processed-size accounting, private-by-default inserts, unique generated keys, signed GET URLs, and absence of `S3_PUBLIC_URL` in returned gallery URLs.

- [ ] **Step 5: Implement private object storage and URL signing**

Construct S3 from the same required variables currently used by `UsersService`. Upload only processed bytes with:

```ts
new PutObjectCommand({
  Bucket: bucket,
  Key: storageKey,
  Body: output.data,
  ContentType: "image/webp",
  CacheControl: "private, max-age=31536000, immutable",
});
```

Sign reads with:

```ts
getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: storageKey }), {
  expiresIn: SIGNED_URL_TTL_SECONDS,
});
```

Do not place a URL column on `UserPhoto`.

- [ ] **Step 6: Write failing ownership, reorder, concurrency, and compensation tests**

Add tests for:

- `id + userId` ownership on update/delete.
- A non-boolean `isPublic` request rejected with `BadRequestException`.
- Reorder rejects duplicates, omissions, stale IDs, and foreign IDs.
- Concurrent upload quota checks serialize on the owner row.
- `sortOrder` is `MAX(sortOrder) + 1` under the same lock.
- Successful S3 upload plus failed insert issues `DeleteObjectCommand`.
- One failed batch item does not suppress later successes.
- Batch results preserve input order.
- Database deletion remains complete if S3 cleanup fails.

- [ ] **Step 7: Implement transactional quota, ordering, mutation, and cleanup**

For each processed file:

1. Upload the private object.
2. Enter a Prisma interactive transaction.
3. Lock the owner row:

```ts
await tx.$queryRaw`
  SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
`;
```

4. Recompute `SUM("sizeBytes")` and `MAX("sortOrder")`.
5. Reject with `quota_exceeded` if the processed result exceeds quota.
6. Insert with `isPublic: false`.
7. On transaction failure, delete the uploaded object before returning a per-file failure.

For reorder, lock the same owner row, read every current photo ID, compare exact sets, and update each row inside the transaction:

```ts
await Promise.all(
  photoIds.map((id, sortOrder) =>
    tx.userPhoto.update({
      where: { id },
      data: { sortOrder },
    }),
  ),
);
```

Constrain updates and deletes by ownership through a prior `findFirst({ where: { id, userId } })`; return `NotFoundException` when absent.

- [ ] **Step 8: Run service tests**

Run:

```powershell
pnpm --filter @vedamatch/api test -- user-gallery.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 9: Commit the service slice**

```powershell
git add apps/api/src/modules/users/user-gallery.service.ts apps/api/src/modules/users/user-gallery.service.spec.ts
git commit -m "feat: add private user gallery service"
```

---

### Task 3: Authenticated gallery API and module wiring

**Files:**

- Create: `apps/api/src/modules/users/user-gallery.controller.ts`
- Create: `apps/api/src/modules/users/user-gallery.controller.spec.ts`
- Modify: `apps/api/src/modules/users/users.module.ts`

**Interfaces:**

- Consumes: `UserGalleryService`.
- Produces: `/profile/photos` management endpoints.
- Produces: exported `UserGalleryService` for `UnionModule`.

- [ ] **Step 1: Write failing controller tests**

Cover:

```ts
expect(service.uploadMany).toHaveBeenCalledWith("user-id", files);
expect(service.updateVisibility).toHaveBeenCalledWith("user-id", "photo-id", {
  isPublic: true,
});
expect(service.reorder).toHaveBeenCalledWith("user-id", {
  photoIds: ["a", "b"],
});
```

Verify the upload interceptor uses multipart field `files`, auth comes from `CurrentUser().sub`, and delete returns HTTP 204.

- [ ] **Step 2: Run controller tests and verify failure**

Run:

```powershell
pnpm --filter @vedamatch/api test -- user-gallery.controller.spec.ts --runInBand
```

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement the controller**

Use this route surface:

```ts
@Controller("profile/photos")
@UseGuards(AuthGuard)
export class UserGalleryController {
  constructor(private readonly gallery: UserGalleryService) {}

  @Get()
  getGallery(@CurrentUser() user: AccessTokenPayload) {
    return this.gallery.getGallery(user.sub);
  }

  @Post()
  @UseInterceptors(FilesInterceptor("files", 50))
  upload(
    @CurrentUser() user: AccessTokenPayload,
    @UploadedFiles() files: UploadedGalleryFile[],
  ) {
    return this.gallery.uploadMany(user.sub, files ?? []);
  }

  @Patch(":id")
  updateVisibility(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") photoId: string,
    @Body() body: UpdateUserPhotoRequest,
  ) {
    return this.gallery.updateVisibility(user.sub, photoId, body);
  }

  @Put("order")
  reorder(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: ReorderUserPhotosRequest,
  ) {
    return this.gallery.reorder(user.sub, body);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") photoId: string,
  ): Promise<void> {
    await this.gallery.remove(user.sub, photoId);
  }
}
```

The `50` value is a per-request memory safeguard, not a persistent gallery limit. Do not add Multer `fileSize`, because it would abort the full batch instead of returning per-file failures.

- [ ] **Step 4: Register and export the gallery service**

Update `UsersModule`:

```ts
controllers: [
  UsersController,
  ProfileController,
  UserGalleryController,
  GeoController,
  AdminUsersController,
],
providers: [UsersService, UserGalleryService, AdminUsersService],
exports: [UserGalleryService],
```

- [ ] **Step 5: Run controller and service tests**

Run:

```powershell
pnpm --filter @vedamatch/api test -- user-gallery.controller.spec.ts user-gallery.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit the API slice**

```powershell
git add apps/api/src/modules/users
git commit -m "feat: expose user gallery management API"
```

---

### Task 4: Union public-photo projection and privacy gate

**Files:**

- Modify: `apps/api/src/modules/union/union.module.ts`
- Modify: `apps/api/src/modules/union/union-profile.service.ts`
- Modify: `apps/api/src/modules/union/union-profile.service.spec.ts`

**Interfaces:**

- Consumes: ordered `UserPhoto[]` and `UserGalleryService.signPublicPhotos`.
- Produces: `UnionUserSummary.photos`.

- [ ] **Step 1: Extend fixtures and write failing Union tests**

Add `photos` to every mocked target user to preserve strict DTO coverage. Add cases:

```ts
expect(result.user).toMatchObject({
  photos: [],
  avatarUrl: null,
});
```

for `hidden` and unavailable `after_match`.

For an allowed target with public photos:

```ts
expect(result.user.photos).toEqual([
  { id: "photo-1", url: "signed-1", width: 1200, height: 800 },
  { id: "photo-2", url: "signed-2", width: 800, height: 1200 },
]);
expect(result.user.avatarUrl).toBeNull();
```

Also verify:

- private rows are never selected;
- `sortOrder` controls output;
- no photos preserves visible avatar fallback;
- signing is not called when privacy denies visibility;
- only final paginated recommendation rows are signed.

- [ ] **Step 2: Run the focused Union test and verify failure**

Run:

```powershell
pnpm --filter @vedamatch/api test -- union-profile.service.spec.ts --runInBand
```

Expected: FAIL because recommendations do not include `photos`.

- [ ] **Step 3: Import the users module**

Update `UnionModule`:

```ts
@Module({
  imports: [AuthModule, UsersModule],
  // existing controllers and providers
})
```

Inject `UserGalleryService` into `UnionProfileService`.

- [ ] **Step 4: Select ordered public photo metadata**

Extend the target-user includes used by recommendation list and single recommendation:

```ts
user: {
  include: {
    photos: {
      where: { isPublic: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    },
  },
},
```

Do not add photos to connection or chat queries.

- [ ] **Step 5: Apply privacy before signing and map the fallback**

After compatibility sorting and pagination:

```ts
if (!photoVisible) {
  user.photos = [];
  user.avatarUrl = null;
} else if (candidate.user.photos.length > 0) {
  user.photos = await gallery.signPublicPhotos(candidate.user.photos);
  user.avatarUrl = null;
} else {
  user.photos = [];
  user.avatarUrl = candidate.user.avatarUrl;
}
```

The caller and target must both have Union profiles through the existing recommendation preconditions. Never sign candidates removed by pagination or an outer privacy gate.

- [ ] **Step 6: Run all Union service tests**

Run:

```powershell
pnpm --filter @vedamatch/api test -- union-profile.service.spec.ts union-connection.service.spec.ts union-chat.service.spec.ts --runInBand
```

Expected: PASS, including unchanged connection/chat behavior.

- [ ] **Step 7: Commit the Union slice**

```powershell
git add apps/api/src/modules/union
git commit -m "feat: expose public gallery photos in Union recommendations"
```

---

### Task 5: Profile gallery editor

**Files:**

- Create: `apps/web/src/components/user-gallery-editor.tsx`
- Create: `apps/web/src/components/user-gallery-editor.spec.tsx`
- Modify: `apps/web/src/components/profile-editor.tsx`

**Interfaces:**

- Consumes: owner gallery HTTP API and shared gallery contracts.
- Produces: `UserGalleryEditor`.

- [ ] **Step 1: Write failing editor load and upload tests**

Test that the component:

- fetches `GET /profile/photos` with `credentials: 'include'`;
- renders quota usage and ordered photos;
- has `multiple` and `accept="image/jpeg,image/png,image/webp"`;
- excludes each local file over 20 MB or with an unsupported type while retaining other valid files;
- sends repeated `files` fields in one `FormData`;
- renders every `uploaded` and `failed` entry;
- renders uploaded photos as private.

Use:

```ts
expect(fileInput).toHaveAttribute("multiple");
expect(fileInput).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
```

- [ ] **Step 2: Run editor tests and verify failure**

Run:

```powershell
pnpm --filter @vedamatch/web test -- src/components/user-gallery-editor.spec.tsx
```

Expected: FAIL because `UserGalleryEditor` does not exist.

- [ ] **Step 3: Implement loading, multi-upload, and partial results**

Export:

```ts
export function UserGalleryEditor(): React.ReactNode;
```

Use `credentials: 'include'` for every request. Append files with:

```ts
for (const file of validFiles) {
  formData.append("files", file);
}
```

Display `usedBytes / quotaBytes`, upload progress, and a stable list of per-file error messages. Keep the existing avatar state and requests outside this component.

- [ ] **Step 4: Write failing visibility, deletion, reorder, and cleanup tests**

Verify:

- toggle sends `PATCH /profile/photos/:id` with `{ isPublic }`;
- failed toggle restores its previous value;
- confirmed delete sends `DELETE /profile/photos/:id`;
- drag-and-drop sends every current ID to `PUT /profile/photos/order`;
- failed reorder restores the previous array;
- object previews are revoked when replaced and on unmount.

- [ ] **Step 5: Implement owner mutations and drag-and-drop**

Use native drag events to avoid a new drag library. Keep:

```ts
const [draggedId, setDraggedId] = useState<string | null>(null);
```

On drop, derive the complete reordered ID list, optimistically update, then:

```ts
await fetch("/profile/photos/order", {
  method: "PUT",
  credentials: "include",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ photoIds }),
});
```

Restore the previous array and announce the error if the response is not OK.

- [ ] **Step 6: Mount the separate gallery section**

Import and render `<UserGalleryEditor />` in `profile-editor.tsx` after the existing avatar section. Do not move avatar handlers or merge avatar state into the gallery component.

- [ ] **Step 7: Run editor and existing profile tests**

Run:

```powershell
pnpm --filter @vedamatch/web test -- src/components/user-gallery-editor.spec.tsx src/components/profile-editor.spec.tsx
```

If `profile-editor.spec.tsx` does not exist, run the gallery test plus the full web test suite in Task 7.

Expected: PASS.

- [ ] **Step 8: Commit the profile UI slice**

```powershell
git add apps/web/src/components/user-gallery-editor.tsx apps/web/src/components/user-gallery-editor.spec.tsx apps/web/src/components/profile-editor.tsx
git commit -m "feat: add profile photo gallery editor"
```

---

### Task 6: Union recommendation carousel

**Files:**

- Create: `apps/web/src/components/union/recommendation-photo-carousel.tsx`
- Create: `apps/web/src/components/union/recommendation-photo-carousel.spec.tsx`
- Create: `apps/web/src/components/union/recommendation-card.spec.tsx`
- Modify: `apps/web/src/components/union/recommendation-card.tsx`

**Interfaces:**

- Consumes: `UnionPhoto[]`.
- Produces:

```ts
export function RecommendationPhotoCarousel(props: {
  photos: UnionPhoto[];
  userName: string;
}): React.ReactNode;
```

- [ ] **Step 1: Write failing carousel behavior tests**

Cover:

- first ordered image rendered initially;
- previous/next controls change the image;
- dot buttons select exact indexes;
- one photo hides arrows and dots;
- no autoplay timer;
- image alt is `${userName}, фото ${index + 1} из ${photos.length}`;
- controls have Russian accessible labels;
- index resets to zero when the recommendation photo list changes.

- [ ] **Step 2: Run carousel tests and verify failure**

Run:

```powershell
pnpm --filter @vedamatch/web test -- src/components/union/recommendation-photo-carousel.spec.tsx
```

Expected: FAIL because the carousel does not exist.

- [ ] **Step 3: Implement the accessible carousel**

Use component state only:

```ts
const [index, setIndex] = useState(0);

useEffect(() => {
  setIndex(0);
}, [photos]);
```

Render arrows and dots only when `photos.length > 1`. Preserve the API order and do not add autoplay.

- [ ] **Step 4: Write failing recommendation-card fallback tests**

Test:

```tsx
user.photos.length > 0; // carousel visible, avatar absent
user.photos.length === 0 && user.avatarUrl; // avatar visible
user.photos.length === 0 && !user.avatarUrl; // initials fallback visible
```

- [ ] **Step 5: Integrate carousel with exact fallback order**

Replace the current single-image block with:

```tsx
{
  user.photos.length > 0 ? (
    <RecommendationPhotoCarousel photos={user.photos} userName={user.name} />
  ) : user.avatarUrl ? (
    <img src={user.avatarUrl} alt={user.name} />
  ) : (
    <InitialFallback />
  );
}
```

Adapt `InitialFallback` to the card's existing inline fallback instead of creating a new abstraction when none exists.

- [ ] **Step 6: Run carousel and card tests**

Run:

```powershell
pnpm --filter @vedamatch/web test -- src/components/union/recommendation-photo-carousel.spec.tsx src/components/union/recommendation-card.spec.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the recommendation UI slice**

```powershell
git add apps/web/src/components/union/recommendation-photo-carousel.tsx apps/web/src/components/union/recommendation-photo-carousel.spec.tsx apps/web/src/components/union/recommendation-card.tsx apps/web/src/components/union/recommendation-card.spec.tsx
git commit -m "feat: add Union recommendation photo carousel"
```

---

### Task 7: Full validation and deployment safeguards

**Files:**

- Modify only if validation exposes defects in files from Tasks 1-6.

**Interfaces:**

- Consumes: all completed gallery slices.
- Produces: deployable migration and passing repository validators.

- [ ] **Step 1: Validate Prisma artifacts**

Run:

```powershell
pnpm --filter @vedamatch/api prisma:generate
pnpm --filter @vedamatch/api exec prisma validate
```

Expected: both commands exit with code 0.

- [ ] **Step 2: Validate the migration on disposable PostgreSQL**

Set `DATABASE_URL` to a disposable/test database, then run:

```powershell
pnpm --filter @vedamatch/api exec prisma migrate deploy
```

Expected: the gallery migration applies successfully. Do not run this command against production from a development session.

- [ ] **Step 3: Run focused API tests**

```powershell
pnpm --filter @vedamatch/api test -- user-gallery.service.spec.ts user-gallery.controller.spec.ts union-profile.service.spec.ts union-connection.service.spec.ts union-chat.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 4: Run focused web tests**

```powershell
pnpm --filter @vedamatch/web test -- src/components/user-gallery-editor.spec.tsx src/components/union/recommendation-photo-carousel.spec.tsx src/components/union/recommendation-card.spec.tsx
```

Expected: PASS.

- [ ] **Step 5: Run workspace lint**

```powershell
pnpm --filter @vedamatch/shared lint
pnpm --filter @vedamatch/api lint
pnpm --filter @vedamatch/web lint
```

Expected: all commands exit with code 0 and do not introduce unrelated formatting changes.

- [ ] **Step 6: Run package builds**

```powershell
pnpm --filter @vedamatch/api build
pnpm --filter @vedamatch/web build
```

Expected: both production builds pass.

- [ ] **Step 7: Run the full test suite**

```powershell
pnpm test
```

Expected: the Turbo test graph exits with code 0.

- [ ] **Step 8: Review final changes for scope and secrets**

Run:

```powershell
git status --short
git diff --check
git diff
```

Confirm:

- no credentials, signed URLs, generated image binaries, or local environment files are included;
- avatar, connection, chat, and full Union-profile behavior remain unchanged;
- every new endpoint is guarded;
- no public S3 URL fallback exists.

- [ ] **Step 9: Commit any validator fixes**

If validators required changes:

```powershell
git add <only-files-fixed-during-validation>
git commit -m "fix: harden user gallery validation"
```

Do not create an empty commit.
