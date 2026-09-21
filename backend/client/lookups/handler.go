package lookups

import (
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thienty1207/Hotel_Staff/backend/client/auth"
	"github.com/thienty1207/Hotel_Staff/backend/shared/httperror"
)

var errLookupServiceNotConfigured = &httperror.AppError{
	Code:       "internal_server_error",
	Message:    "Internal server error",
	HTTPStatus: fiber.StatusInternalServerError,
}

func RegisterRoutes(api fiber.Router, pool *pgxpool.Pool, authService *auth.Service) {
	handler := &handler{service: NewService(NewRepository(pool))}
	api.Get("/departments", authService.RequireAuth(), handler.departments)
	api.Get("/locations", authService.RequireAuth(), handler.locations)
	api.Get("/users", authService.RequireAuth(), handler.users)
}

type handler struct {
	service *Service
}

func (handler *handler) departments(c fiber.Ctx) error {
	departments, err := handler.service.ListDepartments(c.Context())
	if err != nil {
		return err
	}
	return c.Status(fiber.StatusOK).JSON(DepartmentsResponse{Departments: departments})
}

func (handler *handler) locations(c fiber.Ctx) error {
	query, err := parseLocationQueryValues(c.Queries())
	if err != nil {
		return &httperror.AppError{
			Code:       "invalid_request",
			Message:    "Invalid request",
			HTTPStatus: fiber.StatusBadRequest,
		}
	}
	locations, err := handler.service.ListLocations(c.Context(), query)
	if err != nil {
		return err
	}
	return c.Status(fiber.StatusOK).JSON(LocationsResponse{Locations: locations})
}

func (handler *handler) users(c fiber.Ctx) error {
	query, err := parseUserLookupQueryValues(c.Queries())
	if err != nil {
		return &httperror.AppError{
			Code:       "invalid_request",
			Message:    "Invalid request",
			HTTPStatus: fiber.StatusBadRequest,
		}
	}
	users, err := handler.service.ListUsers(c.Context(), query)
	if err != nil {
		return err
	}
	return c.Status(fiber.StatusOK).JSON(UsersResponse{Users: users})
}
