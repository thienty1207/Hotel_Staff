package lookups

import (
	"errors"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	defaultUserLookupLimit = 30
	maxUserLookupLimit     = 100
	maxUserLookupSearch    = 100
)

var errInvalidUserLookupQuery = errors.New("invalid user lookup query")

type UserLookupQuery struct {
	Search       string
	DepartmentID *int64
	Limit        int
}

func parseUserLookupQueryValues(values map[string]string) (UserLookupQuery, error) {
	search := strings.TrimSpace(values["search"])
	if !utf8.ValidString(search) || utf8.RuneCountInString(search) > maxUserLookupSearch {
		return UserLookupQuery{}, errInvalidUserLookupQuery
	}

	query := UserLookupQuery{Search: search, Limit: defaultUserLookupLimit}
	if rawDepartmentID, ok := values["department_id"]; ok {
		departmentID, err := strconv.ParseInt(rawDepartmentID, 10, 64)
		if err != nil || departmentID <= 0 {
			return UserLookupQuery{}, errInvalidUserLookupQuery
		}
		query.DepartmentID = &departmentID
	}
	if rawLimit, ok := values["limit"]; ok {
		limit, err := strconv.Atoi(rawLimit)
		if err != nil || limit < 1 || limit > maxUserLookupLimit {
			return UserLookupQuery{}, errInvalidUserLookupQuery
		}
		query.Limit = limit
	}
	return query, nil
}
