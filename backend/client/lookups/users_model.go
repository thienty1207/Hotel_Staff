package lookups

type User struct {
	ID             int64  `json:"id"`
	FullName       string `json:"full_name"`
	DepartmentID   int64  `json:"department_id"`
	DepartmentCode string `json:"department_code"`
	DepartmentName string `json:"department_name"`
}

type UsersResponse struct {
	Users []User `json:"users"`
}
