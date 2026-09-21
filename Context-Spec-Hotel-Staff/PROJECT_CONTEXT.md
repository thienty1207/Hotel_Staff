# Hotel Staff — PROJECT_CONTEXT (Canonical Current Context)

> **Last context refresh:** 2026-09-21
>
> **Product:** `Hotel Staff`
>
> **Project slug:** `Hotel-Staff`
>
> **GitHub repository:** `thienty1207/Hotel_Staff`
>
> **Verified post-rebrand implementation baseline:** `main` at `7ceb9dc493244350a2408bd572925176c95756f0`
>
> **Local PostgreSQL database:** `hotel_staff`
>
> **Current feature state:** SPEC-01 through SPEC-08.2 are ✅ CLOSED. SPEC-08.3 remains **OPEN / NOT CLOSED** because the native Baron/Graphify lifecycle evidence is still unavailable; it is an independent tooling-maintenance track and does not block the product lifecycle. SPEC-09 Assign Ticket runtime is implemented, including active-target validation and historical inactive-assignment preservation/removal, but SPEC-09 remains **OPEN / NOT CLOSED** pending its own manual persistence, CI, and Baron closure evidence.

---

# 0. Canonical identity

The project was originally developed under the name **BWP SonaSea / BWP-Staff**.

The user has explicitly changed the project identity to:

```text
Display/product name: Hotel Staff
Project slug:         Hotel-Staff
GitHub repository:    thienty1207/Hotel_Staff
Local PostgreSQL DB:  hotel_staff
```

The GitHub repository has already been renamed.

The local PostgreSQL database has already been manually renamed:

```text
bwp-sonasea
→
hotel_staff
```

Current technical identity:

```text
Go module:                  github.com/thienty1207/Hotel_Staff/backend
Session cookie:             hotel_staff_session
Theme storage key:           hotel-staff-theme
Remembered username key:     hotel-staff-remembered-username
Database backup filename:    hotel_staff.dump
Canonical docs directory:    Context-Spec-Hotel-Staff/
```

The implementation baseline is post-rebrand. Historical names in closed SPECs describe the project
state when those SPECs were implemented. They must not be treated as the current product brand.

---

# 1. Instruction priority

Every coding agent must read:

1. `AGENTS.md`
2. this `PROJECT_CONTEXT.md`
3. the current SPEC
4. the affected source code
5. existing tests for the affected behavior

Instruction priority:

```text
1. Latest explicit user instruction
2. Latest later SPEC / explicit amendment
3. This PROJECT_CONTEXT.md
4. Earlier closed SPEC
5. Existing implementation behavior
6. Developer assumptions
```

A later SPEC may supersede an older closed SPEC on selected behavior.

Do not rewrite history merely to make old SPECs look current.

---

# 2. Historical documentation policy

SPEC-01 through SPEC-08 are historical implementation contracts.

Do **not** bulk search/replace every occurrence of:

```text
BWP
BWP SonaSea
BWP-Staff
SonaSea
```

inside old closed SPECs.

That would destroy useful implementation history and can also corrupt legacy dataset terminology.

For the rebrand:

```text
current canonical context → Hotel Staff
new SPECs                  → Hotel Staff
README/current docs        → Hotel Staff
product-facing UI          → Hotel Staff
technical repo/module name → Hotel_Staff
```

Older SPEC bodies may retain historical identity language.

---

# 3. Critical distinction: brand vs persisted master data

The product brand is now Hotel Staff.

However, these existing persisted identifiers are **legacy dataset identifiers**, not automatically brand copy:

```text
BWP-AREA-*
BWP-ROOM-*
Development location seed data: BWP
Development location seed data: BWP Rooms
96 Villas
```

They are referenced by:

```text
PostgreSQL rows
development seed ownership
integration tests
ticket/location foreign keys
historical SPEC-06.x contracts
```

Therefore the Hotel Staff rebrand does **not** authorize:

```text
BWP-AREA-* → HOTEL-AREA-*
BWP-ROOM-* → HOTEL-ROOM-*
```

Do not mutate those codes, descriptions, or existing ticket references in SPEC-08.1.

A future data anonymization/master-data migration requires its own explicit migration/backfill design.

---

# 4. Current post-rebrand identity and verification state

The rebrand closure landed at `7ceb9dc493244350a2408bd572925176c95756f0`. The current
`main`/`origin/main` baseline was verified at that commit on 2026-09-18 before SPEC-08.2 began.

Verified active identity:

```text
Git remote:                  https://github.com/thienty1207/Hotel_Staff.git
Go module/import path:       github.com/thienty1207/Hotel_Staff/backend
Session cookie:              hotel_staff_session
Theme storage key:            hotel-staff-theme
Remembered username key:      hotel-staff-remembered-username
Local PostgreSQL database:    hotel_staff
Backup filename:              hotel_staff.dump
Canonical docs directory:     Context-Spec-Hotel-Staff/
```

The active frontend uses Hotel Staff copy, a neutral hotel icon, and `login-background.jpg`. The
login page was visually inspected and showed no BWP, SonaSea, or Best Western branding. SPEC-08.2
removes the unused `frontend/static/images/bwp-logo.png` and `login-background.png` runtime assets;
historical BWP evidence remains preserved only outside runtime static storage.

The local backend runtime was checked against `hotel_staff`: `/health` and `/ready` succeeded; API
login, `/api/v1/auth/me`, Open/Closed ticket lists, persisted ticket detail for IDs 15 and 16,
logout, and unauthenticated post-logout `/me` were verified. In the authenticated browser, Open
showed the four existing tickets, Closed loaded its empty state, and Chat opened a persisted
accepted ticket with its created and accepted activity. Light and Dark theme selections both
persisted through reload. At the available desktop viewport (1197×912), the document had no
page-level horizontal overflow; the ticket table used its intended internal scroll. The user
manually verified mobile/narrow behavior after the rebrand: no body-level horizontal overflow, a
ticket card opens Chat, the compact close control remains reachable, conversation scrolling stays
contained, composer/actions remain reachable, and Accept / Assign / Close remain correctly laid
out. Read-only database counts remained stable: 16 departments (14 active), 866 locations
(864 active), 155 `BWP-AREA-*`, 564 `BWP-ROOM-*`, and 4 tickets (all accepted).

Baron metadata exception: `.baron/project.toml` still has the internal
`project_slug = "bwp-sonasea"`. The installed Baron CLI exposes no supported rename/rebind
operation in the current trusted-receipt environment; `baron automation reconcile` passed without
identity repair, and repository rules prohibit manually rewriting Baron-owned identity metadata.
The slug is not runtime/product branding and is not exposed in the application UI or API. No fake
trusted execution or review receipt was created. This is an accepted internal-tooling exception,
not a product closure blocker.

### 4.1 SPEC-08.2 post-rebrand hardening state

SPEC-08.2 is **✅ CLOSED**. Hardening implementation commit
`397b097f75a7c6a64d62076ca93668ba86ea6eaa` is pushed to `origin/main` and its GitHub Actions CI
run [35347035603](https://github.com/thienty1207/Hotel_Staff/actions/runs/35347035603) completed
successfully for both Frontend and Backend. The closure documentation is carried by the separate
docs-only closure commit reported in the final Git history. The bounded application hardening
removes retired runtime assets and the Svelte starter favicon; the existing Hotel Staff icon is the
favicon; `robots.txt` disallows crawling; frontend environment-file exceptions are gone; the backup
script refuses any database target other than `hotel_staff` before `pg_dump`; a GitHub Actions
workflow verifies Bun and Go against a synthetic PostgreSQL service; and unsafe requests with a
supplied foreign Origin receive the `forbidden_origin` error envelope while configured and
no-Origin requests remain usable.

`baron automation reconcile` succeeded, and the supported current plan, Harness intent, and
continuity records identify SPEC-08.2. The repository capability contract classifies
`graphify-local` code-map generation as **optional**. Native Baron/Graphify refresh and query were
not made a closure prerequisite because the installed CLI contract does not match Baron 5.0.0;
the managed `docs/baron/platform/STACK_MAP.md` remains at its last supported generated state and
was not hand-edited. A temporary compatibility probe was removed and no wrapper, fake receipt, or
fake Stack Map output was committed. The supported `baron plan complete` command was also refused
because the current environment has no trusted execution receipt; no receipt was fabricated. This
is an accepted optional-tooling/lifecycle exception for the rebrand/hardening history. No migration,
seed, schema, or persisted BWP dataset change was made. SPEC-09 is now the active implementation
area and remains open until its own closure evidence is complete.

Pre-production login rate limiting remains deferred until a deployment and trusted-proxy/client-IP
contract exists. Production frontend/backend routing and deployment architecture are also deferred.
Any future public-CV cleanup or BWP data anonymization requires a separate explicit migration/data
contract.

---

# 5. Locked technology stack

## Frontend

```text
SvelteKit
Svelte 5
TypeScript
Bun
Vite
```

## Backend

```text
Go 1.27
Fiber v3
context.Context
standard logging unless a later observability SPEC changes it
```

## Database

```text
PostgreSQL
pgx v5
pgxpool
explicit parameterized SQL
no ORM
```

Architecture:

```text
modular monolith
```

Do not add Redis, Kafka, RabbitMQ, Kubernetes, microservices, CQRS, event sourcing, or distributed caching without a measured requirement and explicit approval.

---

# 6. Backend layering

Canonical request flow:

```text
HTTP
↓
Handler
↓
Service
↓
Repository
↓
pgx / pgxpool
↓
PostgreSQL
```

Handler owns:

```text
HTTP extraction
validation
auth context
response/error mapping
```

Service owns:

```text
business rules
authorization decisions
workflow coordination
```

Repository owns:

```text
SQL
transactions
database reads/writes
PostgreSQL-specific behavior
```

---

# 7. Source/test filename rule

New source/test filenames must describe domain behavior.

Good:

```text
authentication_integration_test.go
location_search_integration_test.go
ticket_list_integration_test.go
accept_ticket_integration_test.go
```

Do not create new filenames based on SPEC numbers.

Historical naming debt currently exists, including older SPEC-number test filenames. Do not opportunistically combine unrelated housekeeping with feature work.

The historical file:

```text
bwp_room_locations_integration_test.go
```

currently describes the legacy BWP room dataset contract. It is not permission to rename persisted data codes.

---

# 8. Current implemented API

Implemented:

```text
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/me

GET  /api/v1/departments
GET  /api/v1/locations

GET  /api/v1/tickets
GET  /api/v1/tickets/:id
POST /api/v1/tickets
POST /api/v1/tickets/:id/accept
POST /api/v1/tickets/:id/assign
```

Not implemented:

```text
POST /api/v1/tickets/:id/close

persistent chat-message APIs
checklist APIs
attachment upload APIs
notifications/realtime
staff meal
announcements
report
settings
admin UI flows
```

Never fake an unimplemented endpoint.

---

# 9. Authentication — implemented

Authentication:

```text
username + password
server-side PostgreSQL session
HttpOnly cookie
```

There is no:

```text
public signup
email login
forgot-password flow
email reset flow
```

Session token rules:

```text
32 random bytes
base64url raw token
only SHA-256 token hash stored in PostgreSQL
```

TTL:

```text
AUTH_SESSION_TTL_HOURS
default 12
allowed 1..720
```

Inactive users invalidate access.

Logout revokes the DB session before clearing the browser cookie.

Backend-generated request IDs are authoritative.

Password hashing:

```text
Argon2id
password max 1024 bytes
bounded PHC verification parameters
```

Remember Me stores username only.

Current technical names are `hotel_staff_session`, `hotel-staff-theme`, and
`hotel-staff-remembered-username`. Remember Me stores the username only; it must not store a
password, cookie, or raw token.

---

# 10. Local environment and database contract

There is exactly one local environment file:

```text
backend/.env
```

Current canonical local PostgreSQL database name:

```text
hotel_staff
```

`backend/.env` must point `DATABASE_URL` to `hotel_staff`.

Never commit `.env`.

Never expose:

```text
database password
raw session tokens
auth cookies
secret keys
```

Do not create test-only environment files:

```text
.env.example
.env.test
.env.testing
.env.local
.env.development
DATABASE_TEST_URL
TEST_DATABASE_URL
TEST_DB_URL
APP_ENV=test
```

DB-backed tests use:

```text
backend/.env
→ DATABASE_URL
→ local PostgreSQL
→ unique temporary schema
→ test migrations/state
→ drop only temporary schema
```

Never drop/truncate/reset the developer's normal `public` schema.

---

# 11. Database migrations

Active migrations:

```text
0001..0017
0019
0020
```

`0018` is permanently retired.

Current ticket schema amendment:

```text
0020_ticket_assignment_and_request_fields.sql
```

There is currently:

```text
no migration 0021
```

Never rewrite applied migrations.

The rebrand created no migration `0021`. Do not add a branding-only migration or rewrite already-applied migrations.

---

# 12. No mock runtime application data

Runtime product flow:

```text
PostgreSQL
→ Fiber API
→ SvelteKit
```

Forbidden as runtime substitutes:

```text
fake tickets
fake users
fake departments
fake locations
fake chat
static JSON pretending to be API data
frontend fallback arrays
fake success responses
```

Deterministic isolated test fixtures are allowed.

---

# 13. Ticket lifecycle

Locked statuses:

```text
pending
accepted
closed
```

There is no `assigned` status.

Assignment is separate from status.

`tickets.department_id` remains the original request destination/family.

Owner:

```text
Owner = first successful accepter = accepted_by
```

Assignment must not redefine Owner.

Requester:

```text
Requester = requester_id
```

Assignment schema already supports:

```text
one or many departments
one or many users
departments + users simultaneously
```

The Assign mutation is implemented by `POST /api/v1/tickets/:id/assign`.

Only newly added department/user IDs must be active. Existing inactive historical assignments are
returned by ticket reads, may be preserved when still requested, and may be removed explicitly.

---

# 14. Ticket list backend

Implemented:

```text
GET /api/v1/tickets
```

Views:

```text
open = pending + accepted
closed = closed
```

Authenticated active staff currently read a shared ticket workspace.

Pagination:

```text
keyset pagination
ORDER BY created_at DESC, id DESC

default limit = 50
max limit = 100

cursor:
before_created_at
before_id
```

Avoid N+1 query behavior.

---

# 15. Current Ticket List UI

Desktop columns:

```text
Requester
Location
Title
Description
Status
Owner
Created On
Due Date
Action
```

Do not reintroduce:

```text
Ticket ID
Department column
Assignment column
```

Action:

```text
Accept — implemented
Assign — disabled/non-mutating shell
Close  — disabled/non-mutating shell
```

Semantic colors:

```text
Accept = green
Assign = blue
Close  = red
```

The Action cell must not bubble into row Chat activation.

Location is strong/bold metadata.

Priority:

```text
no Priority badge
no red Title text

priority=true:
soft red background
small radius
no outline-only treatment
no priority-caused bold Title
```

---

# 16. Mobile Ticket List / Chat

Mobile cards are compact summaries.

Whole card opens Ticket Chat.

No desktop Action column appears on cards.

Mobile Chat:

```text
compact X close control
Chat constrained to mobile viewport
dynamic viewport sizing
safe-area handling
conversation is the vertical touch-scroll region
composer/actions remain reachable
```

Actions inside Chat:

```text
Accept = implemented
Assign = shell
Close = shell
```

Closing Chat preserves loaded list state.

---

# 17. SPEC-07 — Ticket Chat

Status:

```text
✅ CLOSED
```

Canonical flow:

```text
Ticket List
→ click/tap ticket
→ Ticket Chat
```

Not a Ticket Detail inspector.

Desktop:

```text
Ticket List + sibling right Chat panel
Chat does not overlay list
whole row opens Chat
selected row has subtle feedback
```

Mobile:

```text
whole card opens Chat
Chat becomes dedicated full-width content
compact X closes Chat
```

Summary hierarchy:

```text
Title / Status
Requester / by accepted_by
Location / compact created timestamp
```

Rules:

```text
monitor icon before Title
Title one-line ellipsis
pending omits `by —`
location.name only
timestamp theme-accented
```

Body:

```text
Chats active
Checklist shell only
created activity from persisted ticket data
accepted activity only from persisted accepted_by + accepted_at
conversation scrolls independently
composer shell non-submitting
```

SPEC-08 later activated Accept only.

---

# 18. Create Ticket

Implemented:

```text
POST /api/v1/tickets
```

Fields:

```text
department_id required
location_id optional
title required
description optional
priority boolean
due_at optional RFC3339
```

Requester comes only from authenticated principal.

New ticket:

```text
status = pending
accepted_by = NULL
accepted_at = NULL
closed fields = NULL
```

Creation transaction atomically writes:

```text
ticket
+
ticket_activity(action='created')
```

If activity insertion fails, the transaction rolls back.

Actual image upload is not implemented yet.

---

# 19. SPEC-08 — Accept Ticket

Status:

```text
✅ CLOSED
```

Endpoint:

```text
POST /api/v1/tickets/:id/accept
```

Contract:

```text
pending → accepted

accepted_by:
authenticated server-session actor only

accepted_at:
server/database controlled

updated_at:
same acceptance event

activity:
exactly one ticket_activity(action='accepted') on first transition
```

Concurrency/idempotency:

```text
ticket update + activity are atomic
PostgreSQL controls concurrency
first successful accepter wins
same-user replay is idempotent
different-user replay → 409 ticket_already_accepted
closed ticket → 409 ticket_closed
```

Accept must not:

```text
modify assignments
change original department
trust client actor
trust browser time
```

Frontend:

```text
desktop Action Accept works
Chat Accept works
success patches matching ticket by ID
no normal-success whole-list refetch
late result cannot replace newer Chat selection
per-ticket in-flight protection
```

Manual persistence verification passed for tickets 15 and 16:

```text
status = accepted
accepted_by = authenticated user
accepted_at non-null
accepted_at = updated_at
exactly one accepted activity per ticket
activity actor matches accepted_by
closed fields NULL
assigned users = 0
assigned departments = 0
```

No migration `0021` was created.

---

# 20. Department master data

Approved requestable development departments:

```text
14 total

Concierge
Damaged Asset
F&B
Finance Request
Front Office
Housekeeping
Housekeeping PPM
IT
Kitchen
Laundry
Lost & Found
Maintenance
REC
Security
```

---

# 21. Location master data

Verified development fixture state:

```text
96 Villas               = 141 stored
legacy BWP areas        = 155 stored
legacy BWP rooms        = 564 stored
total locations stored  = 866
active locations        = 864
```

96 Villas:

```text
42 named areas
99 room rows
```

Legacy generic room rows:

```text
ROOM-8020 exists but inactive
ROOM-7309 exists but inactive
```

Canonical current legacy-dataset rows:

```text
BWP-ROOM-8020 active
BWP-ROOM-7309 active
```

Again: `BWP-*` here is a persisted dataset identifier, not current product branding.

---

# 22. Location lookup/search

Implemented:

```text
GET /api/v1/locations
```

Current search behavior:

```text
PostgreSQL source of truth
empty query can expose full active catalogue
explicit limit bounded to 1..30
literal % and _ handling
exact/prefix/token-prefix/contains ranking
name/id stable tie-break
latest-response-wins frontend protection
```

Visible label uses location name, not internal code, where required by current UI contract.

---

# 23. Deferred product areas

Still not implemented:

```text
Close mutation
persistent Chat messages
image upload
Checklist persistence
notifications/realtime
Staff Meal
Announcements
Report
Settings
Admin UI
```

Do not claim them as complete.

---

# 24. Performance philosophy

Default:

```text
measure first
optimize measured bottlenecks
```

Current PostgreSQL pool defaults are approximately:

```text
max connections = 10
min connections = 1
acquire timeout = 5s
```

Future load testing may progressively test higher concurrency, including a long-term ~10k stress target where meaningful.

That is a test target, not a current production throughput claim.

---

# 25. Verification philosophy

Backend where applicable:

```text
gofmt -d .
go vet ./...
go test ./... -count=1
go test -race ./... -count=1
go build ./...
```

Frontend:

```text
bun install --frozen-lockfile
bun run check
bun test
bun run build
```

Repository:

```text
git diff --check
git diff --cached --check
git status
```

Only claim checks actually executed.

Local agent checks are not GitHub CI.

---

# 26. Current SPEC status

```text
SPEC-01   ✅ CLOSED
SPEC-02   ✅ CLOSED
SPEC-03   ✅ CLOSED
SPEC-04   ✅ CLOSED
SPEC-04.1 ✅ CLOSED
SPEC-05   ✅ CLOSED
SPEC-05.1 ✅ CLOSED
SPEC-05.2 ✅ CLOSED
SPEC-06   ✅ CLOSED
SPEC-06.1 ✅ CLOSED
SPEC-06.2 ✅ CLOSED
SPEC-06.3 ✅ CLOSED
SPEC-06.4 ✅ CLOSED
SPEC-06.5 ✅ CLOSED
SPEC-06.6 ✅ CLOSED
SPEC-06.7 ✅ CLOSED
SPEC-07   ✅ CLOSED
SPEC-08   ✅ CLOSED
SPEC-08.1 ✅ CLOSED — Hotel Staff rebrand; runtime, automated, desktop, and user-reported
mobile/narrow verification recorded
SPEC-08.2 ✅ CLOSED — post-rebrand repository hardening; optional Graphify code-map exception
documented without a managed Stack Map refresh claim
SPEC-08.3 OPEN / NOT CLOSED — Baron/Graphify toolchain integrity evidence remains pending
SPEC-09   OPEN / NOT CLOSED — Assign Ticket runtime implemented; closure evidence pending
```

---

# 27. SPEC-08.1 closure state

The product/repository identity transition is implemented:

```text
BWP SonaSea / BWP-Staff
→
Hotel Staff / Hotel_Staff
```

The implementation includes:

```text
Git remote, Go module/imports, canonical docs, README/current docs,
frontend identity, cookie/storage keys, backup naming, and local DB target
```

Do not mutate `BWP-AREA-*` / `BWP-ROOM-*` persisted identifiers or their seed ownership
descriptions.

Do not create migration `0021`.

Do not implement SPEC-09, Assign/Close mutations, or Chat persistence as part of rebrand closure.

SPEC-08.1 is ✅ CLOSED. Authenticated browser checks verified the real Open/Closed ticket views,
persisted accepted-ticket Chat, created/accepted activity, and Light/Dark persistence. The user
also manually verified the mobile/narrow ticket-card and Chat behavior described in Section 4.
Frontend and backend automated verification passed; no GitHub CI result is claimed. The Baron
internal-slug/receipt limitation is documented as an accepted tooling exception and does not
change product runtime identity or block this product closure.

---

# 28. Next roadmap

```text
SPEC-08 ✅ CLOSED
→ SPEC-08.1 ✅ CLOSED — Hotel Staff rebrand
→ SPEC-08.2 ✅ CLOSED — post-rebrand repository hardening
→ SPEC-08.3 OPEN / NOT CLOSED — Baron/Graphify toolchain integrity repair
→ SPEC-09 OPEN / NOT CLOSED — Assign Ticket implementation
```

SPEC-08.3 remains an independent Baron/Graphify maintenance track and is not a prerequisite for
SPEC-09 product closure. SPEC-09 remains open pending its own manual authenticated persistence
verification, responsive checks, GitHub Actions evidence, and supported Baron proof/gate/trace
completion. Close Ticket remains the next product area after SPEC-09 closure.

---

# 29. Quick permanent summary

```text
PROJECT:
Hotel Staff

REPOSITORY:
thienty1207/Hotel_Staff

LOCAL DATABASE:
hotel_staff

STACK:
SvelteKit + Svelte 5 + TypeScript + Bun
Go 1.27 + Fiber v3
PostgreSQL + pgx v5 + pgxpool

ARCHITECTURE:
modular monolith

AUTH:
server-side username/password sessions

TICKET STATUS:
pending / accepted / closed

OWNER:
first accepter = accepted_by

ASSIGNMENT:
separate from status
schema supports multi-user + multi-department
Assign mutation implemented; closure verification pending

TICKET LIST:
Requester / Location / Title / Description / Status / Owner / Created On / Due Date / Action

ACTIONS:
Accept implemented
Assign implemented
Close not implemented

SPEC-07:
✅ CLOSED — Ticket Chat Shell + Conversation Foundation

SPEC-08:
✅ CLOSED — Accept Ticket
manual UI + PostgreSQL persistence verification passed

MASTER DATA:
14 requestable departments
866 stored development locations
864 active development locations
141 96 Villas
155 legacy BWP areas
564 legacy BWP rooms

MIGRATIONS:
0001..0017, 0019, 0020
0018 retired
no 0021

RUNTIME MOCK DATA:
forbidden

CURRENT:
SPEC-09 — OPEN / NOT CLOSED; Assign Ticket runtime is implemented, including historical inactive
assignment preservation/removal and active-target-only validation. Closure evidence is pending.

NEXT FEATURE:
Close Ticket after SPEC-09 closure
```
