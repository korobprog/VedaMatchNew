# User Photo Gallery Design

## Goal

Add an independent user photo gallery where owners manage private photos and choose which photos appear to authenticated Union participants in recommendation cards.

## Scope

- Keep the current avatar and its upload flow unchanged.
- Add a gallery to the main profile page.
- Show public gallery photos only in Union recommendation cards.
- Do not add gallery photos to the full Union profile, connections, or chat.
- Do not impose a persistent photo-count limit.

## Data Model

Add a `UserPhoto` model related to `User`:

- `id`: UUID primary key.
- `userId`: owner foreign key with cascade delete.
- `storageKey`: unique private object-storage key.
- `sizeBytes`: processed WebP size used for quota accounting.
- `width` and `height`: processed image dimensions.
- `isPublic`: defaults to `false`.
- `sortOrder`: owner-controlled display order.
- `createdAt` and `updatedAt`: timestamps.

Index photos by owner and order, and by owner, visibility, and order. The current `User.avatarUrl` and `User.avatarKey` fields remain independent.

## Storage and Image Processing

- Accept JPEG, PNG, and WebP uploads.
- Accept files up to 20 MB each before processing.
- Support multiple files in one request.
- Decode every image instead of trusting its extension or declared MIME type.
- Apply EXIF orientation, remove metadata, convert to WebP, and store only the processed result.
- Use generated object keys under `users/{userId}/gallery/`; never expose or derive keys from original file names.
- Store every gallery object privately and never persist signed URLs.
- Return short-lived signed URLs to authorized callers.
- Do not fall back to a public object URL when signing fails.

The gallery has no item-count limit. Processed gallery size is limited by `USER_GALLERY_QUOTA_MB`, with a default of 250 MB.

## Authorization and Visibility

- The owner can list, upload, reorder, change visibility, and delete only their own photos.
- New photos are private by default.
- A public gallery photo is visible only to authenticated users who participate in Union.
- Private photos are visible only to the owner.
- Existing `UnionPrivacySettings.photo` remains the outer visibility gate:
  - `hidden` suppresses the gallery and avatar.
  - `after_match` suppresses both until an accepted connection exists.
  - `everyone` permits public gallery photos.
- When the outer gate permits photos and public gallery photos exist, the recommendation card receives those photos and suppresses the avatar.
- When no public gallery photos exist, the current avatar remains the recommendation-card fallback.

## Owner API

All routes require the existing `AuthGuard`.

- `GET /profile/photos` returns ordered photos, signed owner URLs, used bytes, and quota bytes.
- `POST /profile/photos` accepts multipart `files[]` and returns successes and per-file failures.
- `PATCH /profile/photos/:id` updates `isPublic`.
- `PUT /profile/photos/order` receives the complete ordered list of the owner's photo IDs.
- `DELETE /profile/photos/:id` deletes one owned photo and returns `204`.

Upload responses preserve input order and support partial success. Failure codes distinguish unsupported type, oversized input, invalid image, quota exhaustion, processing failure, and storage failure.

## Profile User Experience

Add a separate “Фотогалерея” section without changing the avatar section:

- Select multiple files.
- Show upload progress and per-file errors.
- Display an ordered thumbnail grid.
- Mark each photo as “Показывать в Union” or private.
- Reorder photos with drag and drop.
- Delete a photo after confirmation.
- Display used storage and configured quota.
- Roll back optimistic visibility or order changes when the API rejects them.
- Revoke local object-preview URLs when they are replaced or the component unmounts.

## Union Recommendation Card

- Extend `UnionUserSummary` with ordered public gallery photos.
- Render a horizontal image carousel with previous/next controls and position dots.
- Do not autoplay.
- Hide controls when only one photo exists.
- Include accessible button labels and image alternative text with the current position.
- Reset or clamp the selected index if the recommendation changes.
- Render the avatar only when the public gallery array is empty.
- Render the existing initials fallback when both gallery and avatar are absent.

## Consistency and Failure Handling

- Serialize quota-sensitive uploads for the same owner, recompute processed usage under lock, and assign order under the same lock.
- Compensate for a successful object upload followed by a failed database insert by deleting the object.
- Delete the database row before object cleanup so a failed object deletion cannot leave a visible row pointing at an intentionally removed image.
- Log failed cleanup for operational recovery without reporting a false gallery item.
- Reorder under an owner lock and require every current owned photo ID exactly once; reject stale, duplicate, omitted, or foreign IDs with conflict or not-found responses.
- Continue processing later files when one file in a batch fails.
- Apply request-level file-count and reverse-proxy body-size safeguards without creating a persistent gallery-count limit.

## Testing

### API

- Image type, size, decoding, WebP conversion, orientation, and metadata removal.
- Private S3 upload and signed URL generation.
- Default and configured quotas, including concurrent upload behavior.
- Partial batch success and stable result ordering.
- Ownership checks for visibility, reorder, and delete.
- S3/database compensation behavior.
- Union privacy gate, public-photo filtering, order, and avatar fallback.
- Avoid signing photos suppressed by privacy or excluded by pagination.

### Web

- Multiple selection, local validation, upload results, and per-file errors.
- Visibility toggle, deletion, drag-and-drop ordering, and rollback.
- Object URL cleanup and avatar independence.
- Carousel navigation, dots, one-photo behavior, accessibility, prop changes, and avatar/initials fallback.

### Validation

Run Prisma generation and validation, scoped API and web tests, shared/API/web lint, API/web builds, and the repository test suite. Validate the migration against a disposable PostgreSQL database before deployment.

## Out of Scope

- Converting the current avatar into a gallery item.
- Showing gallery photos in the full Union profile, connection lists, or chat.
- Public unauthenticated image access.
- Original-image retention.
- Photo moderation, captions, comments, reactions, albums, and a persistent photo-count limit.
