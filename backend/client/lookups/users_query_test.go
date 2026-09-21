package lookups

import "testing"

func TestParseUserLookupQueryDefaultsAndTrimsSearch(t *testing.T) {
	query, err := parseUserLookupQueryValues(map[string]string{
		"search":        "  Alice  ",
		"department_id": "8",
		"limit":         "100",
	})
	if err != nil {
		t.Fatalf("parse valid user lookup query: %v", err)
	}
	if query.Search != "Alice" || query.DepartmentID == nil || *query.DepartmentID != 8 || query.Limit != 100 {
		t.Fatalf("unexpected user lookup query: %+v", query)
	}

	defaultQuery, err := parseUserLookupQueryValues(map[string]string{})
	if err != nil {
		t.Fatalf("parse default user lookup query: %v", err)
	}
	if defaultQuery.Search != "" || defaultQuery.DepartmentID != nil || defaultQuery.Limit != defaultUserLookupLimit {
		t.Fatalf("unexpected default user lookup query: %+v", defaultQuery)
	}
}

func TestParseUserLookupQueryRejectsInvalidDepartmentAndLimit(t *testing.T) {
	cases := []map[string]string{
		{"department_id": "0"},
		{"department_id": "not-an-id"},
		{"limit": "0"},
		{"limit": "101"},
		{"limit": "many"},
		{"search": "12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901"},
	}
	for _, values := range cases {
		if _, err := parseUserLookupQueryValues(values); err == nil {
			t.Fatalf("expected invalid user lookup query to be rejected: %#v", values)
		}
	}
}
