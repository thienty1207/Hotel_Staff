# SPEC-09.1 — Assign Request UI Alignment

**Status:** IMPLEMENTED / OPEN — automated verification passed; manual browser acceptance pending

**Parent:** SPEC-09 — Assign Ticket

**Scope:** Frontend Assign dialog UX/UI only, plus the minimum lookup-state logic required to filter users by selected departments.

**Schema migration required:** No

**Backend assignment contract change required:** No

**Migration ceiling:** `0020_ticket_assignment_and_request_fields.sql`

**Close Ticket:** Out of scope

---

## 1. Purpose

Replace the current information-heavy Assign Ticket dialog with the compact **Assign Request** interaction approved by the product owner.

The new dialog must visually and behaviorally follow the two approved reference states:

1. **Groups tab**
2. **Users tab**

The current two-column fieldset layout must be removed.

The dialog must no longer display the selected ticket's title, description, or other ticket metadata.

The assignment mutation itself remains the existing SPEC-09 contract.

---

## 2. Product intent

The Assign interaction should feel like a small, focused chooser rather than a ticket-detail form.

Target interaction:

```text
Open Assign
↓
Assign Request modal
↓
Groups | Users tabs
↓
Search
↓
Select groups and/or users
↓
Assign
```

If one or more Groups are selected, the Users tab must show only active users who belong to those selected departments.

Example:

```text
Select F&B Group
↓
Open Users
↓
Only F&B users are shown
```

The current verbose presentation such as:

```text
ticket title
"Choose active targets..."
department code + "active target"
large dual fieldsets
```

must be removed from the visible dialog.

---

## 3. Locked backend semantics

Do not redesign the assignment domain model.

Existing request remains:

```json
{
  "department_ids": [3, 8],
  "user_ids": [21, 35]
}
```

Both sets remain independent.

Therefore:

```text
selecting a Group = that department is part of department_ids
selecting a User  = that user is part of user_ids
```

Mixed assignment remains valid.

Do not introduce an `assigned` ticket status.

Do not change:

```text
status
accepted_by
accepted_at
tickets.department_id
requester_id
```

Do not create migration `0021`.

---

## 4. Dialog shell

Desktop target:

```text
┌──────────────────────────────────────────────────────┐
│ Assign Request                                   ×   │
│ Select either to assign the groups or individuals   │
│ users.                                               │
├─────────────────────────┬────────────────────────────┤
│        Groups           │          Users             │
├─────────────────────────┴────────────────────────────┤
│ 🔍 Search...                    Select All  Clear All│
│                                                      │
│ □ / ☑ selectable rows                               │
│                                                      │
├──────────────────────────────────────────────────────┤
│ N selected                        Cancel     Assign   │
└──────────────────────────────────────────────────────┘
```

Recommended desktop width:

```text
min(670px, calc(100vw - 32px))
```

The modal must be centered and must not exceed the viewport.

The body/list region must scroll internally rather than causing page overflow.

---

## 5. Header

Visible header content must be exactly focused on assignment.

Required:

```text
Assign Request
Select either to assign the groups or individuals users.
```

Use the approved reference wording unless the product owner explicitly changes the copy later.

Top-right:

```text
close X
```

Remove from visible UI:

```text
TICKET ASSIGNMENT eyebrow
Assign ticket
ticket title
ticket description
"Choose active targets..."
```

The application may still fetch the authoritative ticket internally to hydrate current assignments. It simply must not display ticket metadata in this dialog.

---

## 6. Tabs

Two equal-width tabs:

```text
Groups
Users
```

### Groups active

Visual requirements:

```text
group icon
Groups label
blue active state
blue bottom border
subtle active background
Users inactive
```

### Users active

Visual requirements:

```text
single-user icon
Users label
blue active state
blue bottom border
subtle active background
Groups inactive
```

Do not use the previous side-by-side Departments / Staff members fieldset layout.

Tab state must remain inside the dialog until it closes.

Switching tabs must not destroy existing selections.

---

## 7. Groups tab

Groups map to existing active departments.

Visible row content should be minimal:

```text
checkbox
department name
```

Examples:

```text
F&B Group
FO Group
Exec Office
FIN Group
```

Do not show a second metadata line such as:

```text
FB · active target
FO · active target
```

unless needed specifically for an inactive historical assignment.

### Selected row

A selected group should use the approved reference treatment:

```text
checked blue checkbox
subtle light-blue row highlight
```

### Groups search

The Groups tab must have a search field.

Search should match at minimum:

```text
department name
department code
```

Search is case-insensitive.

### Select All

`Select All` selects every currently visible eligible Group row.

### Clear All

`Clear All` clears Group selections only.

It must not clear User selections.

---

## 8. Users tab

The Users tab must contain:

```text
search input
Select All
Clear All
user list
```

Visible user row:

```text
checkbox
full name
department code in parentheses where useful
```

Example:

```text
Dương Kim Giàu (FB)
Huỳnh Diễm Quỳnh (FB)
Lê Ngọc Kiều Oanh (FB)
```

Do not show verbose user metadata blocks.

---

## 9. Department-driven user filtering

This behavior is mandatory.

### One selected Group

If:

```text
selected department_ids = [F&B]
```

then Users must contain only users whose:

```text
department_id = F&B
```

### Multiple selected Groups

If several Groups are selected, Users must be the de-duplicated union of active users belonging to the selected departments.

Example:

```text
selected:
F&B
Front Office

Users:
all active F&B users
+
all active FO users
```

No user from any other department may appear.

### No selected Groups

To preserve the ability to assign an individual user without also assigning a department:

```text
if zero Groups are selected
→ Users may show/search all active users
```

This preserves the existing SPEC-09 independent `department_ids` / `user_ids` model.

Selecting a Group is therefore both:

```text
a department assignment selection
and
a filter for the Users tab
```

but users may still be assigned independently when no Group filter is active.

---

## 10. User search

The Users search bar is mandatory.

Search should use the existing user lookup contract:

```text
full_name
username
employee_code
```

When Groups are selected:

```text
search results must remain constrained to those selected departments
```

A search must never leak active users from unselected departments.

Use the existing lookup API where possible.

Do not add a database migration.

Do not introduce a new assignment service.

### Existing endpoint

Reuse:

```text
GET /api/v1/users
```

with the current supported query parameters.

For a single selected department, use the existing `department_id` filter.

For multiple selected departments, either:

1. issue bounded parallel lookup requests per selected department and de-duplicate by user ID, or
2. reuse already loaded active users only if repository inspection proves the result set is complete.

Do not silently truncate the filtered population because of a global 100-user lookup cap.

Preserve stale-response protection for search.

---

## 11. Selected department indicator in Users

When one or more Groups are selected, Users should make the active department filter understandable without becoming verbose.

Approved compact treatment:

```text
F&B Group ×
```

or multiple compact chips when several Groups are selected.

The chip is a filter indicator.

Removing a chip must be equivalent to removing that Group from the current Group selection because Group selection remains the canonical department assignment state.

Do not create a second hidden filter state that can diverge from `selectedDepartmentIDs`.

---

## 12. Selection persistence

Selections must survive:

```text
Groups → Users tab switch
Users → Groups tab switch
search text changes
user lookup refresh
```

Changing the Group filter must not silently delete already selected users.

A selected user may become hidden because the current Group filter no longer contains that user's department, but the selection must remain until the user explicitly clears/removes it.

`Clear All` on Users explicitly clears all selected users.

---

## 13. Footer

Sticky modal footer:

```text
N selected
Cancel
Assign
```

### Count

The count follows the active tab:

```text
Groups active → count selected Groups
Users active  → count selected Users
```

This matches the approved references.

### Cancel

Cancel:

```text
closes dialog
does not mutate persisted assignment
```

### Assign

Primary button label:

```text
Assign
```

Replace:

```text
Save assignment
```

Submitting sends the complete existing assignment request:

```json
{
  "department_ids": [...selectedDepartmentIDs],
  "user_ids": [...selectedUserIDs]
}
```

No mutation retry.

Preserve current per-ticket in-flight protection.

---

## 14. Existing assignment hydration

When opening Assign:

1. fetch authoritative ticket;
2. load active departments;
3. hydrate existing `assigned_departments`;
4. hydrate existing `assigned_users`;
5. set checkbox state before user interaction.

The dialog must not rely only on stale list-row state.

---

## 15. Historical inactive assignments

SPEC-09 historical inactive behavior remains mandatory.

Existing inactive assignment:

```text
must remain visible
must remain selected initially
may be preserved
may be removed
must not become a normal new selectable target
```

The new compact UI must not regress this.

### Minimal visual treatment

Do not restore the old verbose metadata line.

Use compact labels, for example:

```text
F&B Group (Inactive)
Nguyễn Văn A (FB) · Inactive
```

Use muted styling.

Only existing inactive assignments may appear.

Inactive unassigned departments/users must not be offered.

---

## 16. Visual rules

Light theme must closely match the approved reference.

### Light theme

Use:

```text
white modal
soft neutral border
subtle shadow
dark navy/charcoal text
muted gray subtitle
blue active tab
blue checkbox
blue Assign button
red/pink Clear All action
very light blue selected-row background
```

Avoid:

```text
large red eyebrow
large ticket-title block
two dark bordered fieldsets
multiple metadata lines
dense vertical padding
oversized explanatory copy
```

### Dark theme

Dark theme must use the same exact structure and spacing.

Only theme tokens/colors change.

Do not fall back to the old dark layout.

The dialog hierarchy remains:

```text
header
tabs
search/actions
single list
footer
```

---

## 17. Responsive behavior

### Desktop

Target appearance should closely reproduce the approved screenshots.

### Mobile / narrow

Use:

```text
width: calc(100vw - safe horizontal margin)
max-height based on 100dvh
internal scrolling list
sticky header/tabs/footer where required
```

Requirements:

```text
no horizontal overflow
close reachable
search reachable
tabs reachable
Assign reachable
Cancel reachable
list touch-scrolls
keyboard does not permanently hide actions
safe-area respected
```

Do not render Groups and Users as two simultaneous columns on mobile.

---

## 18. Accessibility

Required:

```text
role="dialog"
aria-modal="true"
labelled title
keyboard reachable tabs
semantic buttons
checkbox labels
visible focus state
close button aria-label
search input accessible name
```

Tabs should use semantic tab behavior where practical.

Do not make non-button text the only interactive control for Select All / Clear All.

---

## 19. Loading, empty, and error states

Keep states compact.

### Loading

Examples:

```text
Loading groups…
Loading users…
```

### Empty Groups search

```text
No groups found.
```

### Empty Users with no matching result

```text
No users found.
```

### User lookup error

Show a concise inline error and Retry.

Do not replace the entire modal with a large error panel if only user search failed.

Authentication failure still redirects to `/login` according to current application behavior.

---

## 20. Files likely involved

Inspect first; do not assume edits are limited to this list.

Likely:

```text
frontend/src/lib/components/AssignTicketDialog.svelte
frontend/src/lib/styles/app.css
frontend/src/lib/client/lookups/api.ts
frontend/src/lib/client/lookups/model.ts
frontend/tests/ticket-chat.test.ts
```

If pure filtering/selection helpers improve testability, a small focused helper module is allowed.

Do not restructure unrelated frontend code.

---

## 21. Tests

Add or update frontend regression coverage for at least:

```text
dialog title is Assign Request
ticket title/details are not rendered
Groups and Users tabs exist
Groups is initial tab
group search exists
user search exists
Select All exists
Clear All exists
footer Assign label exists
old "Save assignment" label removed
old dual-fieldset layout removed

selected Group filters Users by department
multiple Groups produce union of matching users
zero selected Groups allows all-active-user search
search remains constrained by selected Groups
tab switch preserves selections
Group Clear All does not clear Users
User Clear All does not clear Groups
selected count follows active tab

existing inactive Group remains visible/removable
existing inactive User remains visible/removable
inactive unassigned target is not introduced

submit still sends complete department_ids + user_ids
no full-list refetch after success
per-ticket in-flight behavior remains
```

Prefer behavior tests over only string-presence checks when current test infrastructure allows it.

Do not weaken existing SPEC-09 tests.

---

## 22. Non-goals

Do not implement:

```text
Close Ticket
chat persistence
attachments
notifications
new RBAC
new assignment schema
new ticket statuses
migration 0021
admin UI
Report
Settings
Staff Meal
Announcements
Baron/Graphify repair
```

---

## 23. Verification

Frontend:

```bash
cd frontend
bun install --frozen-lockfile
bun run check
bun test
bun run build
```

If no backend code changes:

```text
do not modify backend merely for UI alignment
```

Still rely on current CI for backend regression coverage.

If backend lookup code is changed, run:

```bash
cd backend
gofmt -d .
go vet ./...
go test ./... -count=1
go test -race ./... -count=1
go build ./...
```

Repository:

```bash
git diff --check
git status
```

---

## 24. Manual acceptance

The implementation is ready for the manual acceptance below. In the current
environment, browser-control startup failed before a page could be inspected,
so these checks remain open and are not represented as completed evidence.

Verify:

### Light desktop

```text
matches approved Groups screenshot
matches approved Users screenshot
ticket metadata absent
```

### Behavior

```text
select F&B Group
switch Users
only F&B users appear
search "Dương"
only matching F&B users appear
```

### Multi-department

```text
select F&B + FO
Users only contains F&B and FO staff
```

### Independent user assignment

```text
clear all Groups
Users can search/select active staff without forcing department assignment
```

### Responsive

```text
desktop
mobile/narrow
Light
Dark
```

---

## 25. Acceptance criteria

SPEC-09.1 is complete when:

```text
[x] current Assign dialog visual structure is removed
[x] approved Assign Request header exists
[x] no ticket title/details are displayed
[x] Groups/Users tabs match reference structure
[x] Groups search works
[x] Users search works
[x] selected Groups filter Users correctly
[x] multi-Group filtering works
[x] zero-Group individual user assignment remains possible
[x] Select All works per active tab
[x] Clear All works per active tab
[x] selection state survives tab switching
[x] footer count follows active tab
[x] button label is Assign
[x] historical inactive assignment behavior preserved
[ ] desktop layout matches reference closely
[ ] mobile layout is usable
[ ] Light/Dark both work
[x] frontend check passes
[x] frontend tests pass
[x] frontend build passes
[x] no backend assignment contract regression
[x] no migration 0021
[x] Close Ticket remains unimplemented
```

---

## 26. Final state

After implementation:

```text
SPEC-09.1 IMPLEMENTED / OPEN — Assign Request UI Alignment; automated verification
passed and manual browser acceptance remains pending.
```

Parent SPEC-09 remains governed by its own product-closure requirements.

SPEC-09.1 must not falsely close SPEC-09 unless SPEC-09 manual verification is separately complete.

Next product area after SPEC-09 closure remains:

```text
Close Ticket
```
