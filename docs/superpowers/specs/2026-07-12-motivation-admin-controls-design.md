# Motivation Admin Controls Design

## Goal

Expose VedaMatch Motivation in the administrator navigation and provide reliable controls for generating today's batch and regenerating an individual post.

## Navigation

Administrators and service administrators see a `Motivation` link that opens `/admin/motivation`. The existing full user administration link remains restricted to `admin`.

## Admin Data

The admin posts response includes the existing post fields plus `status`, `generationStage`, `generationErrorCode`, and `attemptCount`. Public feed and public post DTOs remain unchanged.

## Controls

The admin page contains:

- `Сгенерировать на сегодня`, calling `POST /admin/motivation/generate`.
- `Перегенерировать` on each post, calling `POST /admin/motivation/posts/:id/regenerate`.
- A public post link when a post is published.
- Status, generation stage, attempt count, and sanitized error text on each row.

Only the affected action is disabled while its request is running. Success triggers a list refresh. Failure shows an inline Russian error without discarding the current list.

## Live Updates

While any post is `draft` or `generating`, the client refreshes the admin list every five seconds. Polling stops when all visible posts are in terminal states (`published`, `failed`, or `hidden`).

## Authorization

All mutations continue using the existing authenticated API endpoints and browser credentials. Both `admin` and `service-admin` may manage Motivation. No secrets or privileged tokens are exposed to the client.

## Testing

- API tests cover extended admin diagnostics.
- Web component tests cover generating today, regenerating one post, disabled states, errors, and polling conditions.
- Full API and web test suites and production builds pass.
- Production browser verification confirms navigation and both controls are visible to the administrator.
