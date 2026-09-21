# SPEC-09 — Assign Ticket

**Status:** **OPEN / NOT CLOSED**

**Predecessors:** SPEC-08 ✅ CLOSED, SPEC-08.1 ✅ CLOSED, SPEC-08.2 ✅ CLOSED, SPEC-08.3 **OPEN / NOT CLOSED**

**Implementation state:** Assign runtime is implemented; SPEC-09 remains **OPEN / NOT CLOSED** pending the closure evidence below.

**Maintenance relationship:** SPEC-08.3 is an independent Baron/Graphify tooling-maintenance
track. Its open tooling state does not block the Hotel Staff Assign Ticket product lifecycle.
SPEC-09 requires its own product verification. Baron/Graphify evidence is optional supporting
project-management/tooling evidence, not a hard product-closure prerequisite. A Baron tooling
outage must not invalidate already-proven Hotel Staff product behavior; SPEC-08.3 independently
tracks Baron/Graphify health and lifecycle repair.

**Next product area after closure:** Close Ticket

**Schema migration required:** **No**

**Canonical endpoint:** `POST /api/v1/tickets/:id/assign`

---

## 1. Purpose

SPEC-09 activates the existing **Assign** shell and implements assignment as a real end-to-end Hotel Staff feature.

Assignment is a separate concept from ticket lifecycle status.

This SPEC must implement:

```text
PostgreSQL assignment persistence
→ Go/Fiber API
→ service/repository transaction
→ authenticated user lookup
→ frontend assignment API/state
→ desktop Ticket List Assign
→ Ticket Chat/mobile Assign
→ verification and closure
```

The assignment schema already exists in:

```text
backend/migrations/0020_ticket_assignment_and_request_fields.sql
```

This SPEC must use that schema rather than inventing a second assignment model.

---

## 2. Non-goals

SPEC-09 does not implement:

```text
Close Ticket
persistent chat messages
chat attachment upload
checklist persistence
notifications
realtime/WebSocket
Staff Meal
Announcements
Report
Settings
Admin UI
new RBAC architecture
Redis
Kafka
RabbitMQ
microservices
CQRS
event sourcing
```

Do not combine unrelated cleanup or product work with this SPEC.

---

## 3. Locked ticket invariants

Ticket statuses remain exactly:

```text
pending
accepted
closed
```

There is no:

```text
assigned
```

status.

Assignment is separate from status.

Original request destination remains:

```text
tickets.department_id
```

Assignment must not mutate or redefine it.

Owner remains:

```text
Owner = first successful accepter = accepted_by
```

Assignment must not redefine Owner.

Requester remains:

```text
Requester = requester_id
```

Assign must not automatically Accept a ticket.

Assign must not modify:

```text
status
accepted_by
accepted_at
closed_by
closed_at
requester_id
department_id
location_id
title
description
priority
due_at
```

`tickets.updated_at` may change when assignment state genuinely changes.

---

## 4. Existing assignment schema

Current assignment truth is stored in:

```text
ticket_assigned_departments
ticket_assigned_users
```

The schema supports:

```text
zero, one, or many departments
zero, one, or many users
departments and users simultaneously
```

Do not restore:

```text
tickets.assigned_to
tickets.assigned_at
```

Do not add a JSON assignment blob to `tickets`.

Do not create migration `0021`.

Do not rewrite migration `0020`.

Expected migration ceiling after this SPEC:

```text
0020_ticket_assignment_and_request_fields.sql
```

---

## 5. API contract

Implement:

```http
POST /api/v1/tickets/:id/assign
```

Authentication:

```text
required
authenticated active staff
current shared-workspace authorization model
```

Request body:

```json
{
  "department_ids": [3, 8],
  "user_ids": [21, 35]
}
```

Rules:

```text
department_ids required
user_ids required

both fields are arrays
IDs must be positive valid integers
duplicate IDs are invalid
array sizes must be bounded
```

Both arrays may be empty:

```json
{
  "department_ids": [],
  "user_ids": []
}
```

This means:

```text
clear all current assignments
```

Missing fields must not mean "leave unchanged".

The request body represents the complete desired current assignment set.

---

## 6. Assignment state rules

Assignment is allowed when the ticket is:

```text
pending
accepted
```

Assignment is rejected when:

```text
closed
```

Closed ticket response:

```text
409 Conflict
error.code = ticket_closed
```

Pending assignment does not accept the ticket.

A pending ticket remains:

```text
status = pending
accepted_by = NULL
accepted_at = NULL
```

An accepted ticket remains accepted with the same Owner.

---

## 7. Assignment target validation

Newly selected departments must:

```text
exist
be active
```

Newly selected users must:

```text
exist
be active
```

Unavailable assignment targets must be rejected deterministically.

Canonical application errors:

```text
department_unavailable
user_unavailable
```

Existing historical inactive assignee references already persisted must remain readable through ticket responses.

Do not silently delete an existing assignment merely because its user or department later becomes inactive.

For assignment replacement, compare the requested IDs with the ticket's current persisted IDs:

```text
current inactive target + requested unchanged → preserve it
current inactive target omitted from request → remove it
inactive target not currently assigned + requested → reject it
```

Only newly added department/user IDs are subject to the active-target validation query. This keeps
historical assignments editable without allowing a new assignment to an inactive or nonexistent target.

---

## 8. Transaction contract

Assignment replacement must execute atomically in PostgreSQL.

Canonical flow:

```text
BEGIN
↓
lock ticket row
↓
verify ticket exists
↓
verify ticket is not closed
↓
load current assignment sets
↓
diff current sets against requested sets
↓
validate only newly added target IDs as active
↓
remove deleted memberships
↓
preserve unchanged memberships
↓
insert added memberships
↓
update tickets.updated_at if and only if assignment changed
↓
insert assignment history activity if and only if assignment changed
↓
load authoritative updated ticket
↓
COMMIT
```

Use parameterized SQL.

Do not perform N+1 target validation queries.

Do not blindly delete and reinsert unchanged memberships.

Unchanged memberships should retain their existing:

```text
assigned_at
```

New memberships use server/database-controlled timestamps.

---

## 9. Idempotency

Assignment replacement is set-based.

Array ordering is not semantically meaningful.

These are equivalent:

```json
{
  "department_ids": [3, 8],
  "user_ids": [21, 35]
}
```

```json
{
  "department_ids": [8, 3],
  "user_ids": [35, 21]
}
```

If the desired assignment set already matches current state:

```text
return 200
return authoritative current ticket
do not create assignment activity
do not change existing assigned_at
do not change tickets.updated_at
```

---

## 10. Concurrency

PostgreSQL is the concurrency authority.

Serialize assignment mutations safely using the target ticket row.

Concurrent requests must not cause:

```text
duplicate memberships
partial department/user state
unique-index violations escaping as raw DB errors
activity records without matching state
state changes without matching activity
```

A deterministic last-committed replacement result is acceptable.

No distributed locking is required.

---

## 11. Assignment history

Current assignment tables represent current state.

Business history belongs in:

```text
ticket_activity
```

Each real assignment state change writes exactly one activity:

```text
action = assignment_updated
actor_user_id = authenticated session actor
```

Do not accept actor identity from the client.

Recommended metadata:

```json
{
  "before_department_ids": [3],
  "before_user_ids": [21],
  "after_department_ids": [3, 8],
  "after_user_ids": [21, 35]
}
```

Metadata arrays must be deterministic and sorted.

Do not store secrets or full user records in metadata.

Assignment mutation and history insertion must commit or rollback together.

Idempotent replay must not produce another `assignment_updated` activity.

---

## 12. Success response

Successful assignment returns:

```http
200 OK
```

Response uses the existing canonical ticket envelope:

```json
{
  "ticket": {
    "...": "...",
    "assigned_departments": [],
    "assigned_users": []
  }
}
```

Do not create a separate incompatible ticket model.

The response must reflect persisted authoritative assignment state.

---

## 13. Error contract

At minimum:

```text
400 invalid_request
401 unauthenticated
404 ticket_not_found
409 ticket_closed
department_unavailable
user_unavailable
500 internal_server_error
```

Use the existing application error envelope.

Do not expose:

```text
SQL
stack traces
database DSN
password hashes
session tokens
internal secrets
```

---

## 14. Active user lookup

SPEC-09 requires a safe authenticated lookup for assignment candidates.

Implement:

```http
GET /api/v1/users
```

Supported query parameters:

```text
search          optional
department_id   optional
limit           optional
```

Recommended limits:

```text
default = 30
max = 100
```

Return only active users.

Search may match:

```text
full_name
username
employee_code
```

Ordering must be stable and deterministic.

Response must expose only assignment-safe identity data.

Canonical shape:

```json
{
  "users": [
    {
      "id": 21,
      "full_name": "Staff Name",
      "department_id": 3,
      "department_code": "FO",
      "department_name": "Front Office"
    }
  ]
}
```

Do not return:

```text
password_hash
auth session data
secrets
```

The existing:

```http
GET /api/v1/departments
```

remains the department lookup source.

---

## 15. Backend architecture

Preserve:

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
input validation
auth principal extraction
response/error mapping
```

Service owns:

```text
business rules
authorization
workflow coordination
```

Repository owns:

```text
SQL
transactions
locking
database reads/writes
```

No ORM.

No SQL in handlers.

---

## 16. Frontend API

Add a typed assignment mutation request:

```ts
type AssignTicketRequest = {
  department_ids: number[];
  user_ids: number[];
};
```

Implement:

```text
assignTicket(ticketID, request)
```

Requirements:

```text
POST /api/v1/tickets/:id/assign
credentials: include
Content-Type: application/json
validate canonical ticket response
map known API errors
treat unknown/network failures as retryable
```

Do not automatically retry assignment mutations.

---

## 17. Assignment UI

Activate the existing blue:

```text
Assign
```

entrypoints.

Required surfaces:

```text
Desktop Ticket List
Ticket Chat
```

Mobile does not gain a desktop Action column.

On mobile, assignment is accessed through Ticket Chat.

Semantic colors remain:

```text
Accept = green
Assign = blue
Close = red
```

Close remains disabled/unimplemented.

---

## 18. Assignment dialog

Implement a focused responsive assignment component.

Preferred name:

```text
AssignTicketDialog.svelte
```

The UI must support:

```text
current assigned departments
current assigned users
multi-select departments
multi-select users
user search
optional department filtering
Save
Cancel
loading
error state
retry where appropriate
```

When opened, authoritative current assignments are preselected.

The dialog must merge active lookup results with the authoritative ticket's currently assigned
departments/users. A currently assigned target that is no longer active must remain visible,
visibly marked as an inactive historical assignment, and preselected. It may be preserved or
removed, but must not be presented as a normal newly available active target. User search must not
drop a currently assigned inactive user from the dialog.

Users must be able to:

```text
add departments
remove departments
add users
remove users
combine departments + users
clear all assignments
```

Do not add an Assignment column to the desktop ticket table.

Do not add assignment controls directly to mobile ticket cards.

---

## 19. Frontend race safety

Required:

```text
per-ticket Assign in-flight protection
no duplicate Save submissions
late mutation results cannot replace a newer Chat selection
stale lookup results cannot overwrite a newer dialog state
latest user-search response wins
```

On success:

```text
patch matching ticket in current loaded list by ID
patch selected Chat ticket only if it is still the same ticket
close/reset assignment UI appropriately
```

Do not perform a normal-success whole-list refetch.

---

## 20. Existing UI contracts to preserve

Desktop Ticket List columns remain:

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

Do not add:

```text
Ticket ID
Department column
Assignment column
```

Whole row continues to open Ticket Chat.

Action cells/buttons must not bubble into row activation.

Mobile cards remain compact.

Ticket Chat remains:

```text
desktop: sibling right panel
mobile: dedicated full-width content
```

Preserve:

```text
safe-area behavior
dynamic viewport sizing
conversation scrolling
reachable composer/actions
compact mobile close control
```

---

## 21. Backend test requirements

Use the existing temporary-schema DB-backed test strategy.

Do not drop/truncate/reset the developer's normal `public` schema.

Cover:

```text
unauthenticated → 401

invalid ticket id
malformed JSON
missing arrays
wrong field types
non-positive IDs
duplicate IDs
oversized input

pending → one department
pending → one user
pending → multiple departments
pending → multiple users
pending → departments + users

accepted ticket assignment
Owner unchanged
accepted_at unchanged
status unchanged

tickets.department_id unchanged

replace assignments
preserve unchanged assigned_at
new membership gets new assigned_at

clear all assignments

exactly one assignment_updated activity per real change
authenticated actor recorded
before/after metadata correct

same semantic replay idempotent
no new activity
no updated_at churn
no assigned_at churn

closed → 409 ticket_closed
missing → 404 ticket_not_found

inactive/nonexistent department rejected
inactive/nonexistent user rejected
current inactive department/user can be preserved
current inactive department/user can be removed
atomic rollback on validation/failure

concurrent assignment requests remain consistent

GET ticket list/detail returns persisted assignment arrays
```

---

## 22. User lookup test requirements

Cover:

```text
authentication required
active users only
search
department filter
bounded limits
stable ordering
no secret fields
inactive users excluded
```

Historical inactive assignees must remain readable in existing ticket responses.

---

## 23. Frontend test requirements

Cover:

```text
assignTicket serialization
error mapping
response validation
no automatic mutation retry

per-ticket in-flight state
success patch
retryable failure
late result protection
dialog stale-result protection
latest user-search response wins

Desktop Assign enabled
Assign click does not trigger row Chat
Chat Assign opens assignment UI
preselected current assignments
multi-department
multi-user
clear all
Save loading
Cancel
error rendering
Close remains disabled
mobile access through Chat
no Assignment table column
```

Update tests that previously asserted Assign was disabled.

Do not weaken tests merely to make them pass.

---

## 24. Verification

Backend:

```bash
cd backend
gofmt -d .
go vet ./...
go test ./... -count=1
go test -race ./... -count=1
go build ./...
```

Frontend:

```bash
cd frontend
bun install --frozen-lockfile
bun run check
bun test
bun run build
```

Repository:

```bash
git diff --check
git diff --cached --check
git status
```

Only claim checks actually executed.

---

## 25. Manual persistence verification

Before closure, verify with the real local Hotel Staff runtime:

```text
login
open ticket
open Assign
select department/user
save
mutation succeeds
UI patches
reload page
assignment persists
open Assign again
persisted selections remain
```

Also verify:

```text
replace assignment
remove assignment
clear assignment
```

Use controlled dev/test data only.

Do not run destructive database resets.

---

## 26. Responsive verification

Desktop:

```text
Assign fits existing Action layout
assignment UI readable
selection content does not overflow
Ticket List remains usable
Chat remains sibling panel
```

Mobile/narrow:

```text
Assign accessible from Ticket Chat
assignment UI fits viewport
selection area scrolls
Save/Cancel reachable
no page-level horizontal overflow
search keyboard does not make actions unreachable
```

Verify both Light and Dark themes.

---

## 27. Security verification

Review:

```text
broken access control / IDOR
mass assignment
SQL injection
inactive target assignment
closed-ticket mutation
request-body abuse
race conditions
unbounded lookup
user-data leakage
origin/CSRF behavior under current application contract
```

Bind only explicit request fields.

Do not persist arbitrary JSON fields from the client.

---

## 28. Performance constraints

Avoid:

```text
N+1 assignment reads
N+1 target validation
unbounded user lookup
unbounded request arrays
whole-list refetch after successful assignment
```

Use set-based SQL where practical.

No new caching infrastructure is required.

---

## 29. Closure checklist

SPEC-09 stays OPEN until all items are verified:

- [ ] SPEC-08.3 remains tracked independently; it is not a prerequisite for SPEC-09 product closure.
- [ ] Assign endpoint implemented.
- [ ] Auth required.
- [ ] Pending assignment works.
- [ ] Accepted assignment works.
- [ ] Closed assignment rejected.
- [ ] Multi-department assignment works.
- [ ] Multi-user assignment works.
- [ ] Mixed department + user assignment works.
- [ ] Replace works.
- [ ] Clear all works.
- [ ] `tickets.department_id` remains unchanged.
- [ ] Owner remains `accepted_by`.
- [ ] No `assigned` status exists.
- [ ] Activity history is atomic.
- [ ] Idempotency proven.
- [ ] Concurrency behavior verified.
- [ ] Active-user lookup implemented.
- [ ] Inactive targets cannot be newly assigned.
- [ ] Existing inactive department/user assignments can be preserved.
- [ ] Existing inactive department/user assignments can be removed.
- [ ] Desktop Assign activated.
- [ ] Ticket Chat/mobile Assign activated.
- [ ] Close remains unimplemented.
- [ ] Success patches local state without whole-list refetch.
- [ ] Frontend stale/late result safety verified.
- [ ] Backend tests pass.
- [ ] Backend race tests pass.
- [ ] Frontend check/tests/build pass.
- [ ] Manual persistence verification passes.
- [ ] Responsive verification passes.
- [ ] Git diff checks pass.
- [ ] No migration `0021`.
- [ ] No unrelated feature implemented.
- [ ] No unresolved blocker remains.

Baron/Graphify proof, gates, trace, and plan state are intentionally not hard SPEC-09 product
closure criteria. If available, they may be recorded as supplemental evidence; failures remain
independent tooling warnings tracked by SPEC-08.3.

---

## 30. Conditional closure state

Only after every closure criterion passes may this document change to:

```text
Status: ✅ CLOSED only after every closure criterion above is proven
```

Then update:

```text
Context-Spec-Hotel-Staff/PROJECT_CONTEXT.md
```

to record:

```text
SPEC-09 ✅ CLOSED — Assign Ticket only after every closure criterion above is proven
```

and move the roadmap to:

```text
Close Ticket
```

Do not implement Close Ticket as part of SPEC-09 closure.

---

## 31. Conditional final successful state

```text
SPEC-09 ✅ CLOSED only after every closure criterion above is proven

Assign Ticket is implemented end-to-end.

Assignment:
- separate from status
- supports multiple departments
- supports multiple users
- supports departments + users simultaneously
- preserves Owner = accepted_by
- preserves tickets.department_id
- writes assignment_updated history
- is idempotent for identical assignment sets

No migration 0021 exists.

Close Ticket remains unimplemented.

Remaining warnings: none.
```

The conditional block above is not the current state. Until the checklist is actually complete,
the status at the top of this document remains **OPEN / NOT CLOSED**.
