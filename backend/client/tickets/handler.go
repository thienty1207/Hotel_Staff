package tickets

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thienty1207/Hotel_Staff/backend/client/auth"
	"github.com/thienty1207/Hotel_Staff/backend/shared/httperror"
)

var errTicketServiceNotConfigured = &httperror.AppError{
	Code:       "internal_server_error",
	Message:    "Internal server error",
	HTTPStatus: fiber.StatusInternalServerError,
}

func RegisterRoutes(api fiber.Router, pool *pgxpool.Pool, authService *auth.Service) {
	handler := &handler{service: NewService(NewRepository(pool))}
	api.Get("/tickets", authService.RequireAuth(), handler.list)
	api.Get("/tickets/:id", authService.RequireAuth(), handler.detail)
	api.Post("/tickets", authService.RequireAuth(), handler.create)
	api.Post("/tickets/:id/accept", authService.RequireAuth(), handler.accept)
	api.Post("/tickets/:id/assign", authService.RequireAuth(), handler.assign)
}

type handler struct {
	service *Service
}

func (handler *handler) list(c fiber.Ctx) error {
	query, err := parseListQueryValues(c.Queries())
	if err != nil {
		return &httperror.AppError{
			Code:       "invalid_request",
			Message:    "Invalid request",
			HTTPStatus: fiber.StatusBadRequest,
		}
	}
	response, err := handler.service.List(c.Context(), query)
	if err != nil {
		return err
	}
	return c.Status(fiber.StatusOK).JSON(response)
}

func (handler *handler) detail(c fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id <= 0 {
		return invalidTicketDetailIDError()
	}

	ticket, err := handler.service.FindByID(c.Context(), id)
	if errors.Is(err, ErrTicketNotFound) {
		return &httperror.AppError{
			Code:       "ticket_not_found",
			Message:    "Ticket not found",
			HTTPStatus: fiber.StatusNotFound,
		}
	}
	if err != nil {
		return err
	}
	return c.Status(fiber.StatusOK).JSON(struct {
		Ticket Ticket `json:"ticket"`
	}{Ticket: ticket})
}

func (handler *handler) accept(c fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id <= 0 {
		return invalidTicketDetailIDError()
	}

	principal, ok := auth.CurrentPrincipal(c)
	if !ok {
		return &httperror.AppError{
			Code:       "unauthenticated",
			Message:    "Authentication required",
			HTTPStatus: fiber.StatusUnauthorized,
		}
	}
	ticket, err := handler.service.Accept(c.Context(), id, IdentitySummary{
		ID:             principal.User.ID,
		FullName:       principal.User.FullName,
		DepartmentCode: principal.User.Department.Code,
	})
	if errors.Is(err, ErrTicketNotFound) {
		return &httperror.AppError{Code: "ticket_not_found", Message: "Ticket not found", HTTPStatus: fiber.StatusNotFound}
	}
	if errors.Is(err, ErrTicketAlreadyAccepted) {
		return &httperror.AppError{Code: "ticket_already_accepted", Message: "Ticket has already been accepted", HTTPStatus: fiber.StatusConflict}
	}
	if errors.Is(err, ErrTicketClosed) {
		return &httperror.AppError{Code: "ticket_closed", Message: "Ticket is closed", HTTPStatus: fiber.StatusConflict}
	}
	if err != nil {
		return err
	}
	return c.Status(fiber.StatusOK).JSON(struct {
		Ticket Ticket `json:"ticket"`
	}{Ticket: ticket})
}

func (handler *handler) assign(c fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id <= 0 {
		return invalidTicketDetailIDError()
	}

	var input AssignRequest
	decoder := json.NewDecoder(bytes.NewReader(c.Body()))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		return invalidAssignmentRequestError()
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return invalidAssignmentRequestError()
	}
	validated, err := validateAssignRequest(input)
	if err != nil {
		return invalidAssignmentRequestError()
	}

	principal, ok := auth.CurrentPrincipal(c)
	if !ok {
		return &httperror.AppError{
			Code:       "unauthenticated",
			Message:    "Authentication required",
			HTTPStatus: fiber.StatusUnauthorized,
		}
	}
	ticket, err := handler.service.Assign(c.Context(), id, validated, principal.User.ID)
	if errors.Is(err, ErrTicketNotFound) {
		return &httperror.AppError{Code: "ticket_not_found", Message: "Ticket not found", HTTPStatus: fiber.StatusNotFound}
	}
	if errors.Is(err, ErrTicketClosed) {
		return &httperror.AppError{Code: "ticket_closed", Message: "Ticket is closed", HTTPStatus: fiber.StatusConflict}
	}
	if errors.Is(err, ErrDepartmentUnavailable) {
		return &httperror.AppError{Code: "department_unavailable", Message: "Department is unavailable", HTTPStatus: fiber.StatusBadRequest}
	}
	if errors.Is(err, ErrUserUnavailable) {
		return &httperror.AppError{Code: "user_unavailable", Message: "User is unavailable", HTTPStatus: fiber.StatusBadRequest}
	}
	if err != nil {
		return err
	}
	return c.Status(fiber.StatusOK).JSON(struct {
		Ticket Ticket `json:"ticket"`
	}{Ticket: ticket})
}

func invalidTicketDetailIDError() error {
	return &httperror.AppError{Code: "invalid_request", Message: "Invalid request", HTTPStatus: fiber.StatusBadRequest}
}

func invalidAssignmentRequestError() error {
	return &httperror.AppError{Code: "invalid_request", Message: "Invalid request", HTTPStatus: fiber.StatusBadRequest}
}

type createTicketRequest struct {
	DepartmentID int64      `json:"department_id"`
	LocationID   *int64     `json:"location_id"`
	Title        string     `json:"title"`
	Description  *string    `json:"description"`
	Priority     bool       `json:"priority"`
	DueAt        *time.Time `json:"due_at"`
}

func (handler *handler) create(c fiber.Ctx) error {
	var input createTicketRequest
	decoder := json.NewDecoder(bytes.NewReader(c.Body()))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		return invalidCreateTicketRequestError()
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return invalidCreateTicketRequestError()
	}

	validated, err := validateCreateTicketRequest(input)
	if err != nil {
		return invalidCreateTicketRequestError()
	}
	principal, ok := auth.CurrentPrincipal(c)
	if !ok {
		return &httperror.AppError{
			Code:       "unauthenticated",
			Message:    "Authentication required",
			HTTPStatus: fiber.StatusUnauthorized,
		}
	}
	ticket, err := handler.service.Create(c.Context(), IdentitySummary{
		ID:             principal.User.ID,
		FullName:       principal.User.FullName,
		DepartmentCode: principal.User.Department.Code,
	}, validated)
	if errors.Is(err, ErrDepartmentUnavailable) {
		return &httperror.AppError{Code: "department_unavailable", Message: "Department is unavailable", HTTPStatus: fiber.StatusBadRequest}
	}
	if errors.Is(err, ErrLocationUnavailable) {
		return &httperror.AppError{Code: "location_unavailable", Message: "Location is unavailable", HTTPStatus: fiber.StatusBadRequest}
	}
	if err != nil {
		return err
	}
	return c.Status(fiber.StatusCreated).JSON(struct {
		Ticket Ticket `json:"ticket"`
	}{Ticket: ticket})
}

func validateCreateTicketRequest(input createTicketRequest) (CreateRequest, error) {
	if input.DepartmentID <= 0 || (input.LocationID != nil && *input.LocationID <= 0) {
		return CreateRequest{}, errors.New("invalid ticket reference")
	}

	title := strings.TrimSpace(input.Title)
	if title == "" || utf8.RuneCountInString(title) > 255 {
		return CreateRequest{}, errors.New("invalid ticket title")
	}

	var description *string
	if input.Description != nil {
		trimmed := strings.TrimSpace(*input.Description)
		if utf8.RuneCountInString(trimmed) > 5000 {
			return CreateRequest{}, errors.New("invalid ticket description")
		}
		if trimmed != "" {
			description = &trimmed
		}
	}

	var dueAt *time.Time
	if input.DueAt != nil {
		value := input.DueAt.UTC()
		dueAt = &value
	}
	return CreateRequest{
		DepartmentID: input.DepartmentID,
		LocationID:   input.LocationID,
		Title:        title,
		Description:  description,
		Priority:     input.Priority,
		DueAt:        dueAt,
	}, nil
}

func invalidCreateTicketRequestError() error {
	return &httperror.AppError{Code: "invalid_request", Message: "Invalid request", HTTPStatus: fiber.StatusBadRequest}
}
