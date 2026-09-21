package tickets

import (
	"errors"
	"sort"
)

const maxAssignmentIDs = 100

var ErrInvalidAssignmentRequest = errors.New("invalid assignment request")

type AssignRequest struct {
	DepartmentIDs []int64 `json:"department_ids"`
	UserIDs       []int64 `json:"user_ids"`
}

func validateAssignRequest(input AssignRequest) (AssignRequest, error) {
	if input.DepartmentIDs == nil || input.UserIDs == nil {
		return AssignRequest{}, ErrInvalidAssignmentRequest
	}

	departmentIDs, err := normalizeAssignmentIDs(input.DepartmentIDs)
	if err != nil {
		return AssignRequest{}, err
	}
	userIDs, err := normalizeAssignmentIDs(input.UserIDs)
	if err != nil {
		return AssignRequest{}, err
	}
	return AssignRequest{DepartmentIDs: departmentIDs, UserIDs: userIDs}, nil
}

func normalizeAssignmentIDs(ids []int64) ([]int64, error) {
	if len(ids) > maxAssignmentIDs {
		return nil, ErrInvalidAssignmentRequest
	}

	normalized := append([]int64(nil), ids...)
	seen := make(map[int64]struct{}, len(normalized))
	for _, id := range normalized {
		if id <= 0 {
			return nil, ErrInvalidAssignmentRequest
		}
		if _, exists := seen[id]; exists {
			return nil, ErrInvalidAssignmentRequest
		}
		seen[id] = struct{}{}
	}
	sort.Slice(normalized, func(left, right int) bool {
		return normalized[left] < normalized[right]
	})
	return normalized, nil
}
