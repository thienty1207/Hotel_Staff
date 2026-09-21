package lookups

import "context"

type Service struct {
	repository *Repository
}

func NewService(repository *Repository) *Service {
	return &Service{repository: repository}
}

func (service *Service) ListDepartments(ctx context.Context) ([]Department, error) {
	if service == nil || service.repository == nil {
		return nil, errLookupServiceNotConfigured
	}
	return service.repository.ListDepartments(ctx)
}

func (service *Service) ListLocations(ctx context.Context, query LocationQuery) ([]Location, error) {
	if service == nil || service.repository == nil {
		return nil, errLookupServiceNotConfigured
	}
	return service.repository.ListLocations(ctx, query)
}

func (service *Service) ListUsers(ctx context.Context, query UserLookupQuery) ([]User, error) {
	if service == nil || service.repository == nil {
		return nil, errLookupServiceNotConfigured
	}
	return service.repository.ListUsers(ctx, query)
}
