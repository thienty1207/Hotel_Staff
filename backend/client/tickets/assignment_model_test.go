package tickets

import (
	"errors"
	"reflect"
	"testing"
)

func TestValidateAssignRequestRequiresBothArraysAndNormalizesSets(t *testing.T) {
	cases := []struct {
		name    string
		input   AssignRequest
		wantErr error
		want    AssignRequest
	}{
		{name: "missing departments", input: AssignRequest{UserIDs: []int64{}}, wantErr: ErrInvalidAssignmentRequest},
		{name: "missing users", input: AssignRequest{DepartmentIDs: []int64{}}, wantErr: ErrInvalidAssignmentRequest},
		{
			name:  "sorts complete replacement sets",
			input: AssignRequest{DepartmentIDs: []int64{8, 3}, UserIDs: []int64{35, 21}},
			want:  AssignRequest{DepartmentIDs: []int64{3, 8}, UserIDs: []int64{21, 35}},
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			got, err := validateAssignRequest(testCase.input)
			if testCase.wantErr != nil {
				if !errors.Is(err, testCase.wantErr) {
					t.Fatalf("expected %v, got %v", testCase.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("validate assignment request: %v", err)
			}
			if !reflect.DeepEqual(got, testCase.want) {
				t.Fatalf("unexpected normalized request: got=%+v want=%+v", got, testCase.want)
			}
		})
	}
}

func TestValidateAssignRequestRejectsUnsafeIDsDuplicatesAndOversizedSets(t *testing.T) {
	cases := []struct {
		name  string
		input AssignRequest
	}{
		{name: "non-positive department", input: AssignRequest{DepartmentIDs: []int64{0}, UserIDs: []int64{}}},
		{name: "non-positive user", input: AssignRequest{DepartmentIDs: []int64{}, UserIDs: []int64{-1}}},
		{name: "duplicate department", input: AssignRequest{DepartmentIDs: []int64{3, 3}, UserIDs: []int64{}}},
		{name: "duplicate user", input: AssignRequest{DepartmentIDs: []int64{}, UserIDs: []int64{21, 21}}},
		{name: "too many departments", input: AssignRequest{DepartmentIDs: repeatedAssignmentIDs(maxAssignmentIDs + 1), UserIDs: []int64{}}},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if _, err := validateAssignRequest(testCase.input); !errors.Is(err, ErrInvalidAssignmentRequest) {
				t.Fatalf("expected invalid assignment request, got %v", err)
			}
		})
	}
}

func repeatedAssignmentIDs(count int) []int64 {
	ids := make([]int64, count)
	for index := range ids {
		ids[index] = int64(index + 1)
	}
	return ids
}
