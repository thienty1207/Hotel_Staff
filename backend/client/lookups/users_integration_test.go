package lookups_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/thienty1207/Hotel_Staff/backend/app"
	"github.com/thienty1207/Hotel_Staff/backend/config"
	"github.com/thienty1207/Hotel_Staff/backend/shared"
	"github.com/thienty1207/Hotel_Staff/backend/shared/security"
)

func TestUsersEndpointRequiresAuthAndReturnsActiveSafeFilteredUsers(t *testing.T) {
	pool, ctx := openUsersTestPool(t)
	departmentA := insertLookupDepartment(t, pool, ctx, "SPEC09-A", "SPEC-09 Alpha")
	departmentB := insertLookupDepartment(t, pool, ctx, "SPEC09-B", "SPEC-09 Beta")
	aliceID := insertLookupUser(t, pool, ctx, "lookup-alice", "EMP-A", "Alice Active", departmentA, true)
	bobID := insertLookupUser(t, pool, ctx, "lookup-bob", "EMP-B", "Bob Active", departmentA, true)
	charlieID := insertLookupUser(t, pool, ctx, "lookup-charlie", "EMP-C", "Charlie Active", departmentB, true)
	insertLookupUser(t, pool, ctx, "lookup-alice-inactive", "EMP-X", "Alice Inactive", departmentA, false)
	token := insertLookupSession(t, pool, ctx, aliceID)
	server := app.New(app.AppState{DB: pool}, config.Config{
		AppEnv: "development", FrontendOrigin: "http://localhost:5173",
		DatabaseAcquireTimeoutSeconds: 1, AuthSessionTTLHours: 12,
	})

	t.Run("requires authentication", func(t *testing.T) {
		response := requestUsers(t, server, "/api/v1/users", "")
		defer response.Body.Close()
		if response.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected unauthenticated status 401, got %d", response.StatusCode)
		}
	})

	t.Run("filters active users by name and excludes inactive users", func(t *testing.T) {
		response := requestUsers(t, server, "/api/v1/users?search=alice", token)
		payload, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil {
			t.Fatalf("read user lookup response: %v", err)
		}
		if response.StatusCode != http.StatusOK {
			t.Fatalf("expected user lookup status 200, got %d: %s", response.StatusCode, payload)
		}
		var body map[string][]map[string]any
		if err := json.Unmarshal(payload, &body); err != nil {
			t.Fatalf("decode user lookup response: %v", err)
		}
		if len(body["users"]) != 1 || int64(body["users"][0]["id"].(float64)) != aliceID || body["users"][0]["full_name"] != "Alice Active" {
			t.Fatalf("unexpected active user results: %+v", body["users"])
		}
		if int64(body["users"][0]["department_id"].(float64)) != departmentA || body["users"][0]["department_code"] != "SPEC09-A" {
			t.Fatalf("unexpected safe department fields: %+v", body["users"][0])
		}
		for _, forbidden := range []string{"password_hash", "session_token_hash", "username", "employee_code"} {
			if strings.Contains(string(payload), forbidden) {
				t.Fatalf("user lookup response exposed forbidden field %q: %s", forbidden, payload)
			}
		}
	})

	t.Run("searches username and employee code, filters department, and applies limit", func(t *testing.T) {
		usernameResponse := requestUsers(t, server, "/api/v1/users?search=lookup-bob", token)
		usernameBody := decodeUsersResponse(t, usernameResponse)
		if len(usernameBody["users"]) != 1 || int64(usernameBody["users"][0]["id"].(float64)) != bobID {
			t.Fatalf("username search returned unexpected users: %+v", usernameBody)
		}

		employeeResponse := requestUsers(t, server, "/api/v1/users?search=EMP-C", token)
		employeeBody := decodeUsersResponse(t, employeeResponse)
		if len(employeeBody["users"]) != 1 || int64(employeeBody["users"][0]["id"].(float64)) != charlieID {
			t.Fatalf("employee code search returned unexpected users: %+v", employeeBody)
		}

		filterResponse := requestUsers(t, server, fmt.Sprintf("/api/v1/users?department_id=%d&limit=1", departmentA), token)
		filterBody := decodeUsersResponse(t, filterResponse)
		if len(filterBody["users"]) != 1 || int64(filterBody["users"][0]["id"].(float64)) != aliceID {
			t.Fatalf("department/limit filter was not stable: %+v", filterBody)
		}
	})
}

func requestUsers(t *testing.T, server *fiber.App, path, token string) *http.Response {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	if token != "" {
		request.AddCookie(&http.Cookie{Name: "hotel_staff_session", Value: token})
	}
	response, err := server.Test(request)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	return response
}

func decodeUsersResponse(t *testing.T, response *http.Response) map[string][]map[string]any {
	t.Helper()
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected user lookup status 200, got %d", response.StatusCode)
	}
	var body map[string][]map[string]any
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode users response: %v", err)
	}
	return body
}

func insertLookupDepartment(t *testing.T, pool *pgxpool.Pool, ctx context.Context, code, name string) int64 {
	t.Helper()
	var id int64
	if err := pool.QueryRow(ctx, "INSERT INTO departments (code, name) VALUES ($1, $2) RETURNING id", code, name).Scan(&id); err != nil {
		t.Fatalf("insert lookup department %s: %v", code, err)
	}
	return id
}

func insertLookupUser(t *testing.T, pool *pgxpool.Pool, ctx context.Context, username, employeeCode, fullName string, departmentID int64, active bool) int64 {
	t.Helper()
	hash, err := security.HashPassword("spec-09-test-password")
	if err != nil {
		t.Fatalf("hash lookup test password: %v", err)
	}
	var id int64
	if err := pool.QueryRow(ctx, "INSERT INTO users (username, employee_code, password_hash, full_name, department_id, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id", username, employeeCode, hash, fullName, departmentID, active).Scan(&id); err != nil {
		t.Fatalf("insert lookup user %s: %v", username, err)
	}
	return id
}

func insertLookupSession(t *testing.T, pool *pgxpool.Pool, ctx context.Context, userID int64) string {
	t.Helper()
	rawToken, tokenHash, err := security.GenerateSessionToken()
	if err != nil {
		t.Fatalf("generate lookup session token: %v", err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO auth_sessions (session_token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')", tokenHash, userID); err != nil {
		t.Fatalf("insert lookup session: %v", err)
	}
	return rawToken
}

func openUsersTestPool(t *testing.T) (*pgxpool.Pool, context.Context) {
	t.Helper()
	if strings.TrimSpace(os.Getenv("DATABASE_URL")) == "" {
		_ = godotenv.Load(filepath.Join("..", "..", ".env"))
	}
	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		t.Skip("set DATABASE_URL to run PostgreSQL-backed user lookup tests")
	}
	parsedURL, err := url.Parse(databaseURL)
	if err != nil || !isLoopbackDatabaseURL(parsedURL) {
		t.Skip("refusing user lookup test unless DATABASE_URL points to loopback PostgreSQL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	t.Cleanup(cancel)
	schema := fmt.Sprintf("spec09_users_%d", time.Now().UnixNano())
	quotedSchema := pgx.Identifier{schema}.Sanitize()
	adminConnection, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		t.Skipf("PostgreSQL is unavailable for user lookup tests: %v", err)
	}
	if _, err := adminConnection.Exec(ctx, "CREATE SCHEMA "+quotedSchema); err != nil {
		_ = adminConnection.Close(ctx)
		t.Skipf("cannot create isolated user lookup schema: %v", err)
	}
	_ = adminConnection.Close(ctx)
	query := parsedURL.Query()
	query.Del("options")
	parsedURL.RawQuery = query.Encode()
	if parsedURL.RawQuery != "" {
		parsedURL.RawQuery += "&"
	}
	parsedURL.RawQuery += "options=" + strings.ReplaceAll(url.QueryEscape("-c search_path="+schema+",public"), "+", "%20")
	poolConfig, err := pgxpool.ParseConfig(parsedURL.String())
	if err != nil {
		dropUsersTestSchema(t, ctx, databaseURL, quotedSchema)
		t.Fatalf("parse user lookup pool config: %v", err)
	}
	poolConfig.MaxConns = 4
	poolConfig.MinConns = 0
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		dropUsersTestSchema(t, ctx, databaseURL, quotedSchema)
		t.Skipf("cannot create user lookup pool: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		dropUsersTestSchema(t, ctx, databaseURL, quotedSchema)
		t.Skipf("PostgreSQL is unavailable for user lookup tests: %v", err)
	}
	if err := shared.RunMigrations(ctx, pool, filepath.Join("..", "..", "migrations"), 5*time.Second); err != nil {
		pool.Close()
		dropUsersTestSchema(t, ctx, databaseURL, quotedSchema)
		t.Fatalf("run user lookup test migrations: %v", err)
	}
	t.Cleanup(func() {
		pool.Close()
		dropUsersTestSchema(t, context.Background(), databaseURL, quotedSchema)
	})
	return pool, ctx
}

func dropUsersTestSchema(t *testing.T, ctx context.Context, databaseURL, quotedSchema string) {
	t.Helper()
	cleanupContext, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	connection, err := pgx.Connect(cleanupContext, databaseURL)
	if err != nil {
		t.Errorf("connect user lookup cleanup connection: %v", err)
		return
	}
	defer connection.Close(cleanupContext)
	if _, err := connection.Exec(cleanupContext, "DROP SCHEMA "+quotedSchema+" CASCADE"); err != nil {
		t.Errorf("drop user lookup schema: %v", err)
	}
}

func isLoopbackDatabaseURL(databaseURL *url.URL) bool {
	if databaseURL == nil || (databaseURL.Scheme != "postgres" && databaseURL.Scheme != "postgresql") {
		return false
	}
	host := strings.TrimSuffix(strings.ToLower(databaseURL.Hostname()), ".")
	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
