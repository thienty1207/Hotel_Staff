package tickets

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

var ErrUserUnavailable = errors.New("user unavailable")

type assignmentActivityMetadata struct {
	BeforeDepartmentIDs []int64 `json:"before_department_ids"`
	BeforeUserIDs       []int64 `json:"before_user_ids"`
	AfterDepartmentIDs  []int64 `json:"after_department_ids"`
	AfterUserIDs        []int64 `json:"after_user_ids"`
}

func (repository *Repository) Assign(ctx context.Context, ticketID int64, request AssignRequest, actorUserID int64) (Ticket, error) {
	if repository == nil || repository.pool == nil {
		return Ticket{}, fmt.Errorf("ticket repository is not configured")
	}

	transaction, err := repository.pool.Begin(ctx)
	if err != nil {
		return Ticket{}, fmt.Errorf("begin ticket assignment: %w", err)
	}
	defer func() { _ = transaction.Rollback(ctx) }()

	var status string
	if err := transaction.QueryRow(ctx, `
SELECT status::text
FROM tickets
WHERE id = $1
FOR UPDATE`, ticketID).Scan(&status); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Ticket{}, ErrTicketNotFound
		}
		return Ticket{}, fmt.Errorf("lock ticket for assignment: %w", err)
	}
	if status == "closed" {
		return Ticket{}, ErrTicketClosed
	}
	if status != "pending" && status != "accepted" {
		return Ticket{}, fmt.Errorf("unsupported ticket status %q", status)
	}

	currentDepartments, currentUsers, err := repository.loadAssignmentIDs(ctx, transaction, ticketID)
	if err != nil {
		return Ticket{}, err
	}
	_, addedDepartments := assignmentDiff(currentDepartments, request.DepartmentIDs)
	_, addedUsers := assignmentDiff(currentUsers, request.UserIDs)
	if err := repository.validateAssignmentTargets(ctx, transaction, addedDepartments, addedUsers); err != nil {
		return Ticket{}, err
	}

	departmentsChanged := !equalAssignmentSets(currentDepartments, request.DepartmentIDs)
	usersChanged := !equalAssignmentSets(currentUsers, request.UserIDs)
	if departmentsChanged {
		if err := replaceDepartmentAssignments(ctx, transaction, ticketID, currentDepartments, request.DepartmentIDs); err != nil {
			return Ticket{}, err
		}
	}
	if usersChanged {
		if err := replaceUserAssignments(ctx, transaction, ticketID, currentUsers, request.UserIDs); err != nil {
			return Ticket{}, err
		}
	}
	if departmentsChanged || usersChanged {
		if _, err := transaction.Exec(ctx, `
UPDATE tickets
SET updated_at = CURRENT_TIMESTAMP
WHERE id = $1`, ticketID); err != nil {
			return Ticket{}, fmt.Errorf("update ticket assignment timestamp: %w", err)
		}

		metadata, err := json.Marshal(assignmentActivityMetadata{
			BeforeDepartmentIDs: currentDepartments,
			BeforeUserIDs:       currentUsers,
			AfterDepartmentIDs:  request.DepartmentIDs,
			AfterUserIDs:        request.UserIDs,
		})
		if err != nil {
			return Ticket{}, fmt.Errorf("encode assignment activity: %w", err)
		}
		if _, err := transaction.Exec(ctx, `
INSERT INTO ticket_activity (ticket_id, actor_user_id, action, metadata)
VALUES ($1, $2, 'assignment_updated', $3)`, ticketID, actorUserID, string(metadata)); err != nil {
			return Ticket{}, fmt.Errorf("insert assignment activity: %w", err)
		}
	}

	ticket, err := repository.findByID(ctx, transaction, ticketID)
	if err != nil {
		return Ticket{}, fmt.Errorf("read assigned ticket: %w", err)
	}
	if err := transaction.Commit(ctx); err != nil {
		return Ticket{}, fmt.Errorf("commit ticket assignment: %w", err)
	}
	return ticket, nil
}

func (repository *Repository) loadAssignmentIDs(ctx context.Context, queryer ticketQueryer, ticketID int64) ([]int64, []int64, error) {
	departmentRows, err := queryer.Query(ctx, `
SELECT department_id
FROM ticket_assigned_departments
WHERE ticket_id = $1
ORDER BY department_id ASC`, ticketID)
	if err != nil {
		return nil, nil, fmt.Errorf("query current department assignments: %w", err)
	}
	defer departmentRows.Close()

	departmentIDs := make([]int64, 0)
	for departmentRows.Next() {
		var id int64
		if err := departmentRows.Scan(&id); err != nil {
			return nil, nil, fmt.Errorf("scan current department assignment: %w", err)
		}
		departmentIDs = append(departmentIDs, id)
	}
	if err := departmentRows.Err(); err != nil {
		return nil, nil, fmt.Errorf("iterate current department assignments: %w", err)
	}

	userRows, err := queryer.Query(ctx, `
SELECT user_id
FROM ticket_assigned_users
WHERE ticket_id = $1
ORDER BY user_id ASC`, ticketID)
	if err != nil {
		return nil, nil, fmt.Errorf("query current user assignments: %w", err)
	}
	defer userRows.Close()

	userIDs := make([]int64, 0)
	for userRows.Next() {
		var id int64
		if err := userRows.Scan(&id); err != nil {
			return nil, nil, fmt.Errorf("scan current user assignment: %w", err)
		}
		userIDs = append(userIDs, id)
	}
	if err := userRows.Err(); err != nil {
		return nil, nil, fmt.Errorf("iterate current user assignments: %w", err)
	}
	return departmentIDs, userIDs, nil
}

func (repository *Repository) validateAssignmentTargets(ctx context.Context, queryer ticketQueryer, departmentIDs, userIDs []int64) error {
	if len(departmentIDs) > 0 {
		rows, err := queryer.Query(ctx, `
SELECT id
FROM departments
WHERE is_active = TRUE
  AND id = ANY($1::bigint[])`, departmentIDs)
		if err != nil {
			return fmt.Errorf("validate assignment departments: %w", err)
		}
		count := 0
		for rows.Next() {
			count++
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return fmt.Errorf("iterate assignment departments: %w", err)
		}
		if count != len(departmentIDs) {
			return ErrDepartmentUnavailable
		}
	}
	if len(userIDs) > 0 {
		rows, err := queryer.Query(ctx, `
SELECT id
FROM users
WHERE is_active = TRUE
  AND id = ANY($1::bigint[])`, userIDs)
		if err != nil {
			return fmt.Errorf("validate assignment users: %w", err)
		}
		count := 0
		for rows.Next() {
			count++
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return fmt.Errorf("iterate assignment users: %w", err)
		}
		if count != len(userIDs) {
			return ErrUserUnavailable
		}
	}
	return nil
}

func replaceDepartmentAssignments(ctx context.Context, transaction pgx.Tx, ticketID int64, current, requested []int64) error {
	removed, added := assignmentDiff(current, requested)
	if len(removed) > 0 {
		if _, err := transaction.Exec(ctx, `
DELETE FROM ticket_assigned_departments
WHERE ticket_id = $1
  AND department_id = ANY($2::bigint[])`, ticketID, removed); err != nil {
			return fmt.Errorf("remove ticket department assignments: %w", err)
		}
	}
	if len(added) > 0 {
		if _, err := transaction.Exec(ctx, `
INSERT INTO ticket_assigned_departments (ticket_id, department_id)
SELECT $1, assignment_id
FROM unnest($2::bigint[]) AS assignment_id
ON CONFLICT (ticket_id, department_id) DO NOTHING`, ticketID, added); err != nil {
			return fmt.Errorf("insert ticket department assignments: %w", err)
		}
	}
	return nil
}

func replaceUserAssignments(ctx context.Context, transaction pgx.Tx, ticketID int64, current, requested []int64) error {
	removed, added := assignmentDiff(current, requested)
	if len(removed) > 0 {
		if _, err := transaction.Exec(ctx, `
DELETE FROM ticket_assigned_users
WHERE ticket_id = $1
  AND user_id = ANY($2::bigint[])`, ticketID, removed); err != nil {
			return fmt.Errorf("remove ticket user assignments: %w", err)
		}
	}
	if len(added) > 0 {
		if _, err := transaction.Exec(ctx, `
INSERT INTO ticket_assigned_users (ticket_id, user_id)
SELECT $1, assignment_id
FROM unnest($2::bigint[]) AS assignment_id
ON CONFLICT (ticket_id, user_id) DO NOTHING`, ticketID, added); err != nil {
			return fmt.Errorf("insert ticket user assignments: %w", err)
		}
	}
	return nil
}

func assignmentDiff(current, requested []int64) ([]int64, []int64) {
	requestedSet := make(map[int64]struct{}, len(requested))
	for _, id := range requested {
		requestedSet[id] = struct{}{}
	}
	currentSet := make(map[int64]struct{}, len(current))
	for _, id := range current {
		currentSet[id] = struct{}{}
	}

	removed := make([]int64, 0)
	for _, id := range current {
		if _, ok := requestedSet[id]; !ok {
			removed = append(removed, id)
		}
	}
	added := make([]int64, 0)
	for _, id := range requested {
		if _, ok := currentSet[id]; !ok {
			added = append(added, id)
		}
	}
	return removed, added
}

func equalAssignmentSets(left, right []int64) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}
