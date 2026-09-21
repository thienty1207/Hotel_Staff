package tickets_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestAssignTicketEndpointPersistsSetsWithoutChangingLifecycle(t *testing.T) {
	pool, ctx := openTicketsTestPool(t)
	fixture := seedAssignmentFixture(t, pool, ctx)
	server := newTicketsApp(pool)

	t.Run("authentication and body validation are safe", func(t *testing.T) {
		unauthenticated := requestAssignTicket(t, server, fixture.PendingTicketID, "", "{\"department_ids\":[],\"user_ids\":[]}")
		defer unauthenticated.Body.Close()
		if unauthenticated.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected unauthenticated status 401, got %d", unauthenticated.StatusCode)
		}

		for _, body := range []string{
			"{}",
			"{\"department_ids\":[1],\"user_ids\":[1,1]}",
			"{\"department_ids\":[0],\"user_ids\":[]}",
			"{\"department_ids\":[],\"user_ids\":\"not-an-array\"}",
		} {
			response := requestAssignTicket(t, server, fixture.PendingTicketID, fixture.ActorToken, body)
			var payload map[string]map[string]string
			decodeTicketResponse(t, response, &payload)
			response.Body.Close()
			if response.StatusCode != http.StatusBadRequest || payload["error"]["code"] != "invalid_request" {
				t.Fatalf("invalid body was not rejected safely: status=%d body=%+v", response.StatusCode, payload)
			}
		}
	})

	t.Run("pending assignment supports mixed sets and preserves request lifecycle", func(t *testing.T) {
		body := fmt.Sprintf("{\"department_ids\":[%d,%d],\"user_ids\":[%d,%d]}", fixture.SecondDepartmentID, fixture.FirstDepartmentID, fixture.SecondUserID, fixture.FirstUserID)
		response := requestAssignTicket(t, server, fixture.PendingTicketID, fixture.ActorToken, body)
		var result ticketDetailResponse
		decodeTicketResponse(t, response, &result)
		response.Body.Close()
		if response.StatusCode != http.StatusOK {
			t.Fatalf("expected assignment status 200, got %d", response.StatusCode)
		}
		if result.Ticket.Status != "pending" || result.Ticket.AcceptedBy != nil || result.Ticket.AcceptedAt != nil {
			t.Fatalf("assignment changed pending lifecycle: %+v", result.Ticket)
		}
		if result.Ticket.Department.ID != fixture.RequestDepartmentID {
			t.Fatalf("assignment changed original request department: %+v", result.Ticket.Department)
		}
		if got := assignmentDepartmentIDs(result.Ticket); !equalInt64s(got, []int64{fixture.FirstDepartmentID, fixture.SecondDepartmentID}) {
			t.Fatalf("unexpected department assignment set: %v", got)
		}
		if got := assignmentUserIDs(result.Ticket); !equalInt64s(got, []int64{fixture.FirstUserID, fixture.SecondUserID}) {
			t.Fatalf("unexpected user assignment set: %v", got)
		}

		var activityActor int64
		var activityAction string
		var metadata string
		if err := pool.QueryRow(ctx, "SELECT actor_user_id, action, metadata::text FROM ticket_activity WHERE ticket_id = $1 AND action = 'assignment_updated' ORDER BY id DESC LIMIT 1", fixture.PendingTicketID).Scan(&activityActor, &activityAction, &metadata); err != nil {
			t.Fatalf("read assignment activity: %v", err)
		}
		if activityActor != fixture.ActorID || activityAction != "assignment_updated" {
			t.Fatalf("assignment activity actor/action incorrect: actor=%d action=%s", activityActor, activityAction)
		}
		var activityMetadata map[string][]int64
		if err := json.Unmarshal([]byte(metadata), &activityMetadata); err != nil {
			t.Fatalf("decode assignment metadata: %v", err)
		}
		if !equalInt64s(activityMetadata["before_department_ids"], []int64{}) ||
			!equalInt64s(activityMetadata["before_user_ids"], []int64{}) ||
			!equalInt64s(activityMetadata["after_department_ids"], []int64{fixture.FirstDepartmentID, fixture.SecondDepartmentID}) ||
			!equalInt64s(activityMetadata["after_user_ids"], []int64{fixture.FirstUserID, fixture.SecondUserID}) {
			t.Fatalf("unexpected assignment activity metadata: %+v", activityMetadata)
		}
	})

	t.Run("semantic replay is idempotent and replacement preserves unchanged timestamps", func(t *testing.T) {
		var firstAssignedAt, secondAssignedAt, beforeUpdatedAt time.Time
		if err := pool.QueryRow(ctx, "SELECT assigned_at FROM ticket_assigned_departments WHERE ticket_id = $1 AND department_id = $2", fixture.PendingTicketID, fixture.FirstDepartmentID).Scan(&firstAssignedAt); err != nil {
			t.Fatalf("read first assignment timestamp: %v", err)
		}
		if err := pool.QueryRow(ctx, "SELECT assigned_at FROM ticket_assigned_departments WHERE ticket_id = $1 AND department_id = $2", fixture.PendingTicketID, fixture.SecondDepartmentID).Scan(&secondAssignedAt); err != nil {
			t.Fatalf("read second assignment timestamp: %v", err)
		}
		if err := pool.QueryRow(ctx, "SELECT updated_at FROM tickets WHERE id = $1", fixture.PendingTicketID).Scan(&beforeUpdatedAt); err != nil {
			t.Fatalf("read ticket update timestamp: %v", err)
		}
		var beforeActivityCount int
		if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM ticket_activity WHERE ticket_id = $1 AND action = 'assignment_updated'", fixture.PendingTicketID).Scan(&beforeActivityCount); err != nil {
			t.Fatalf("count assignment activities: %v", err)
		}

		body := fmt.Sprintf("{\"department_ids\":[%d,%d],\"user_ids\":[%d,%d]}", fixture.SecondDepartmentID, fixture.FirstDepartmentID, fixture.SecondUserID, fixture.FirstUserID)
		replay := requestAssignTicket(t, server, fixture.PendingTicketID, fixture.ActorToken, body)
		var replayResult ticketDetailResponse
		decodeTicketResponse(t, replay, &replayResult)
		replay.Body.Close()
		if replay.StatusCode != http.StatusOK {
			t.Fatalf("expected idempotent replay status 200, got %d", replay.StatusCode)
		}

		var afterUpdatedAt, firstAfter, secondAfter time.Time
		var afterActivityCount int
		if err := pool.QueryRow(ctx, "SELECT updated_at FROM tickets WHERE id = $1", fixture.PendingTicketID).Scan(&afterUpdatedAt); err != nil {
			t.Fatalf("read replay update timestamp: %v", err)
		}
		if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM ticket_activity WHERE ticket_id = $1 AND action = 'assignment_updated'", fixture.PendingTicketID).Scan(&afterActivityCount); err != nil {
			t.Fatalf("count replay assignment activities: %v", err)
		}
		if err := pool.QueryRow(ctx, "SELECT assigned_at FROM ticket_assigned_departments WHERE ticket_id = $1 AND department_id = $2", fixture.PendingTicketID, fixture.FirstDepartmentID).Scan(&firstAfter); err != nil {
			t.Fatalf("read replay first timestamp: %v", err)
		}
		if err := pool.QueryRow(ctx, "SELECT assigned_at FROM ticket_assigned_departments WHERE ticket_id = $1 AND department_id = $2", fixture.PendingTicketID, fixture.SecondDepartmentID).Scan(&secondAfter); err != nil {
			t.Fatalf("read replay second timestamp: %v", err)
		}
		if !afterUpdatedAt.Equal(beforeUpdatedAt) || afterActivityCount != beforeActivityCount || !firstAfter.Equal(firstAssignedAt) || !secondAfter.Equal(secondAssignedAt) {
			t.Fatalf("idempotent replay churned state: before_updated=%s after_updated=%s before_activities=%d after_activities=%d", beforeUpdatedAt, afterUpdatedAt, beforeActivityCount, afterActivityCount)
		}

		replacement := requestAssignTicket(t, server, fixture.PendingTicketID, fixture.ActorToken, fmt.Sprintf("{\"department_ids\":[%d],\"user_ids\":[%d]}", fixture.FirstDepartmentID, fixture.FirstUserID))
		var replacementResult ticketDetailResponse
		decodeTicketResponse(t, replacement, &replacementResult)
		replacement.Body.Close()
		if replacement.StatusCode != http.StatusOK || len(replacementResult.Ticket.AssignedDepartments) != 1 || len(replacementResult.Ticket.AssignedUsers) != 1 {
			t.Fatalf("replacement did not return requested set: status=%d ticket=%+v", replacement.StatusCode, replacementResult.Ticket)
		}
		var preserved time.Time
		if err := pool.QueryRow(ctx, "SELECT assigned_at FROM ticket_assigned_departments WHERE ticket_id = $1 AND department_id = $2", fixture.PendingTicketID, fixture.FirstDepartmentID).Scan(&preserved); err != nil {
			t.Fatalf("read preserved assignment timestamp: %v", err)
		}
		if !preserved.Equal(firstAssignedAt) {
			t.Fatalf("unchanged membership timestamp changed: before=%s after=%s", firstAssignedAt, preserved)
		}

		clearResponse := requestAssignTicket(t, server, fixture.PendingTicketID, fixture.ActorToken, "{\"department_ids\":[],\"user_ids\":[]}")
		var clearResult ticketDetailResponse
		decodeTicketResponse(t, clearResponse, &clearResult)
		clearResponse.Body.Close()
		if clearResponse.StatusCode != http.StatusOK || len(clearResult.Ticket.AssignedDepartments) != 0 || len(clearResult.Ticket.AssignedUsers) != 0 {
			t.Fatalf("clear-all did not remove assignments: status=%d ticket=%+v", clearResponse.StatusCode, clearResult.Ticket)
		}
	})

	t.Run("accepted assignment preserves owner and accepted timestamp", func(t *testing.T) {
		before := readTicketLifecycle(t, pool, ctx, fixture.AcceptedTicketID)
		response := requestAssignTicket(t, server, fixture.AcceptedTicketID, fixture.ActorToken, fmt.Sprintf("{\"department_ids\":[%d],\"user_ids\":[%d]}", fixture.SecondDepartmentID, fixture.SecondUserID))
		var result ticketDetailResponse
		decodeTicketResponse(t, response, &result)
		response.Body.Close()
		after := readTicketLifecycle(t, pool, ctx, fixture.AcceptedTicketID)
		if response.StatusCode != http.StatusOK || after.Status != "accepted" || after.AcceptedByID != before.AcceptedByID || !after.AcceptedAt.Equal(before.AcceptedAt) || result.Ticket.AcceptedBy == nil || result.Ticket.AcceptedBy.ID != fixture.OwnerID {
			t.Fatalf("accepted lifecycle changed during assignment: before=%+v after=%+v response=%+v", before, after, result.Ticket)
		}
	})

	t.Run("closed ticket and unavailable targets are rejected", func(t *testing.T) {
		closed := requestAssignTicket(t, server, fixture.ClosedTicketID, fixture.ActorToken, "{\"department_ids\":[],\"user_ids\":[]}")
		var closedBody map[string]map[string]string
		decodeTicketResponse(t, closed, &closedBody)
		closed.Body.Close()
		if closed.StatusCode != http.StatusConflict || closedBody["error"]["code"] != "ticket_closed" {
			t.Fatalf("closed assignment was not rejected correctly: status=%d body=%+v", closed.StatusCode, closedBody)
		}

		bodies := []string{
			fmt.Sprintf("{\"department_ids\":[%d],\"user_ids\":[]}", fixture.InactiveDepartmentID),
			fmt.Sprintf("{\"department_ids\":[],\"user_ids\":[%d]}", fixture.InactiveUserID),
			"{\"department_ids\":[9223372036854775807],\"user_ids\":[]}",
		}
		for _, body := range bodies {
			response := requestAssignTicket(t, server, fixture.AcceptedTicketID, fixture.ActorToken, body)
			var payload map[string]map[string]string
			decodeTicketResponse(t, response, &payload)
			response.Body.Close()
			if response.StatusCode != http.StatusBadRequest {
				t.Fatalf("unavailable target returned unexpected status %d: %+v", response.StatusCode, payload)
			}
		}
	})
}

func TestAssignTicketConcurrentReplacementsSerializeOnTicketRow(t *testing.T) {
	pool, ctx := openTicketsTestPool(t)
	fixture := seedAssignmentFixture(t, pool, ctx)
	server := newTicketsApp(pool)
	start := make(chan struct{})
	responses := make(chan *http.Response, 2)
	var waitGroup sync.WaitGroup

	bodies := []string{
		fmt.Sprintf("{\"department_ids\":[%d],\"user_ids\":[%d]}", fixture.FirstDepartmentID, fixture.FirstUserID),
		fmt.Sprintf("{\"department_ids\":[%d],\"user_ids\":[%d]}", fixture.SecondDepartmentID, fixture.SecondUserID),
	}
	for _, body := range bodies {
		body := body
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			<-start
			responses <- requestAssignTicket(t, server, fixture.PendingTicketID, fixture.ActorToken, body)
		}()
	}
	close(start)
	waitGroup.Wait()
	close(responses)

	for response := range responses {
		var result ticketDetailResponse
		decodeTicketResponse(t, response, &result)
		response.Body.Close()
		if response.StatusCode != http.StatusOK {
			t.Fatalf("concurrent assignment returned status %d: %+v", response.StatusCode, result)
		}
	}

	departmentRows, err := pool.Query(ctx, "SELECT department_id FROM ticket_assigned_departments WHERE ticket_id = $1 ORDER BY department_id", fixture.PendingTicketID)
	if err != nil {
		t.Fatalf("read concurrent department assignments: %v", err)
	}
	var departmentIDs []int64
	for departmentRows.Next() {
		var id int64
		if err := departmentRows.Scan(&id); err != nil {
			departmentRows.Close()
			t.Fatalf("scan concurrent department assignment: %v", err)
		}
		departmentIDs = append(departmentIDs, id)
	}
	if err := departmentRows.Err(); err != nil {
		departmentRows.Close()
		t.Fatalf("iterate concurrent department assignments: %v", err)
	}
	departmentRows.Close()

	userRows, err := pool.Query(ctx, "SELECT user_id FROM ticket_assigned_users WHERE ticket_id = $1 ORDER BY user_id", fixture.PendingTicketID)
	if err != nil {
		t.Fatalf("read concurrent user assignments: %v", err)
	}
	var userIDs []int64
	for userRows.Next() {
		var id int64
		if err := userRows.Scan(&id); err != nil {
			userRows.Close()
			t.Fatalf("scan concurrent user assignment: %v", err)
		}
		userIDs = append(userIDs, id)
	}
	if err := userRows.Err(); err != nil {
		userRows.Close()
		t.Fatalf("iterate concurrent user assignments: %v", err)
	}
	userRows.Close()

	firstSet := equalInt64s(departmentIDs, []int64{fixture.FirstDepartmentID}) && equalInt64s(userIDs, []int64{fixture.FirstUserID})
	secondSet := equalInt64s(departmentIDs, []int64{fixture.SecondDepartmentID}) && equalInt64s(userIDs, []int64{fixture.SecondUserID})
	if !firstSet && !secondSet {
		t.Fatalf("concurrent assignments left a partial or duplicate state: departments=%v users=%v", departmentIDs, userIDs)
	}

	var activityCount int
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM ticket_activity WHERE ticket_id = $1 AND action = 'assignment_updated'", fixture.PendingTicketID).Scan(&activityCount); err != nil {
		t.Fatalf("count concurrent assignment activities: %v", err)
	}
	if activityCount != 2 {
		t.Fatalf("expected one activity for each committed replacement, got %d", activityCount)
	}
}

type assignmentLifecycle struct {
	Status       string
	AcceptedByID int64
	AcceptedAt   time.Time
}

func readTicketLifecycle(t *testing.T, pool *pgxpool.Pool, ctx context.Context, ticketID int64) assignmentLifecycle {
	t.Helper()
	var lifecycle assignmentLifecycle
	if err := pool.QueryRow(ctx, "SELECT status::text, accepted_by, accepted_at FROM tickets WHERE id = $1", ticketID).Scan(&lifecycle.Status, &lifecycle.AcceptedByID, &lifecycle.AcceptedAt); err != nil {
		t.Fatalf("read ticket lifecycle: %v", err)
	}
	return lifecycle
}

func assignmentDepartmentIDs(ticket ticketResponse) []int64 {
	ids := make([]int64, 0, len(ticket.AssignedDepartments))
	for _, department := range ticket.AssignedDepartments {
		ids = append(ids, department.ID)
	}
	return ids
}

func assignmentUserIDs(ticket ticketResponse) []int64 {
	ids := make([]int64, 0, len(ticket.AssignedUsers))
	for _, user := range ticket.AssignedUsers {
		ids = append(ids, user.ID)
	}
	return ids
}

func equalInt64s(left, right []int64) bool {
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

type assignmentFixture struct {
	ActorToken           string
	ActorID              int64
	OwnerID              int64
	RequestDepartmentID  int64
	FirstDepartmentID    int64
	SecondDepartmentID   int64
	InactiveDepartmentID int64
	FirstUserID          int64
	SecondUserID         int64
	InactiveUserID       int64
	PendingTicketID      int64
	AcceptedTicketID     int64
	ClosedTicketID       int64
}

func seedAssignmentFixture(t *testing.T, pool *pgxpool.Pool, ctx context.Context) assignmentFixture {
	t.Helper()
	requesterDepartmentID := insertDepartment(t, pool, ctx, "SPEC09-REQ", "SPEC-09 Requester")
	requestDepartmentID := insertDepartment(t, pool, ctx, "SPEC09-DEST", "SPEC-09 Destination")
	firstDepartmentID := insertDepartment(t, pool, ctx, "SPEC09-ONE", "SPEC-09 First")
	secondDepartmentID := insertDepartment(t, pool, ctx, "SPEC09-TWO", "SPEC-09 Second")
	inactiveDepartmentID := insertDepartment(t, pool, ctx, "SPEC09-OFF", "SPEC-09 Inactive")
	requesterID := insertUser(t, pool, ctx, "spec09-requester", "SPEC09-REQUESTER", "SPEC-09 Requester", requesterDepartmentID)
	actorID := insertUser(t, pool, ctx, "spec09-actor", "SPEC09-ACTOR", "SPEC-09 Actor", requesterDepartmentID)
	ownerID := insertUser(t, pool, ctx, "spec09-owner", "SPEC09-OWNER", "SPEC-09 Owner", firstDepartmentID)
	firstUserID := insertUser(t, pool, ctx, "spec09-first-user", "SPEC09-FIRST", "SPEC-09 First User", firstDepartmentID)
	secondUserID := insertUser(t, pool, ctx, "spec09-second-user", "SPEC09-SECOND", "SPEC-09 Second User", secondDepartmentID)
	inactiveUserID := insertUser(t, pool, ctx, "spec09-inactive-user", "SPEC09-INACTIVE", "SPEC-09 Inactive User", firstDepartmentID)
	actorToken := insertSession(t, pool, ctx, actorID)
	createdAt := time.Date(2026, 9, 21, 8, 0, 0, 0, time.UTC)
	pendingID := insertAssignmentTicket(t, pool, ctx, requesterID, requestDepartmentID, "SPEC-09 pending", "pending", nil, nil, nil, nil, createdAt)
	acceptedAt := createdAt.Add(time.Hour)
	acceptedID := insertAssignmentTicket(t, pool, ctx, requesterID, requestDepartmentID, "SPEC-09 accepted", "accepted", &ownerID, nil, &acceptedAt, nil, createdAt.Add(time.Minute))
	closedAt := acceptedAt.Add(time.Hour)
	closedID := insertAssignmentTicket(t, pool, ctx, requesterID, requestDepartmentID, "SPEC-09 closed", "closed", &ownerID, &ownerID, &acceptedAt, &closedAt, createdAt.Add(2*time.Minute))
	if _, err := pool.Exec(ctx, "UPDATE departments SET is_active = FALSE WHERE id = $1", inactiveDepartmentID); err != nil {
		t.Fatalf("deactivate assignment department: %v", err)
	}
	if _, err := pool.Exec(ctx, "UPDATE users SET is_active = FALSE WHERE id = $1", inactiveUserID); err != nil {
		t.Fatalf("deactivate assignment user: %v", err)
	}
	return assignmentFixture{
		ActorToken: actorToken, ActorID: actorID, OwnerID: ownerID,
		RequestDepartmentID: requestDepartmentID, FirstDepartmentID: firstDepartmentID,
		SecondDepartmentID: secondDepartmentID, InactiveDepartmentID: inactiveDepartmentID,
		FirstUserID: firstUserID, SecondUserID: secondUserID, InactiveUserID: inactiveUserID,
		PendingTicketID: pendingID, AcceptedTicketID: acceptedID, ClosedTicketID: closedID,
	}
}

func insertAssignmentTicket(t *testing.T, pool *pgxpool.Pool, ctx context.Context, requesterID, departmentID int64, title, status string, acceptedBy, closedBy *int64, acceptedAt, closedAt *time.Time, createdAt time.Time) int64 {
	t.Helper()
	var acceptedByValue, acceptedAtValue, closedByValue, closedAtValue any
	if acceptedBy != nil {
		acceptedByValue = *acceptedBy
	}
	if acceptedAt != nil {
		acceptedAtValue = *acceptedAt
	}
	if closedBy != nil {
		closedByValue = *closedBy
	}
	if closedAt != nil {
		closedAtValue = *closedAt
	}
	var ticketID int64
	if err := pool.QueryRow(ctx, "INSERT INTO tickets (requester_id, department_id, title, status, accepted_by, accepted_at, closed_by, closed_at, created_at, updated_at) VALUES ($1, $2, $3, $4::ticket_status, $5, $6, $7, $8, $9, $9) RETURNING id", requesterID, departmentID, title, status, acceptedByValue, acceptedAtValue, closedByValue, closedAtValue, createdAt).Scan(&ticketID); err != nil {
		t.Fatalf("insert assignment ticket %s: %v", title, err)
	}
	return ticketID
}

func requestAssignTicket(t *testing.T, server *fiber.App, ticketID int64, token, body string) *http.Response {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/tickets/"+fmt.Sprint(ticketID)+"/assign", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	if token != "" {
		request.AddCookie(&http.Cookie{Name: "hotel_staff_session", Value: token})
	}
	response, err := server.Test(request)
	if err != nil {
		t.Fatalf("POST assign ticket %d: %v", ticketID, err)
	}
	return response
}
