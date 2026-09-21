import { getUsers, type UserLookupOptions } from './lookups/api';
import type { LookupUser } from './lookups/model';

export const assignRequestUserLimit = 100;

export type UserLookup = (options: UserLookupOptions) => Promise<LookupUser[]>;

export async function lookupUsersForDepartments(
	departmentIDs: number[],
	search: string,
	lookup: UserLookup = getUsers
): Promise<LookupUser[]> {
	const uniqueDepartmentIDs = [...new Set(departmentIDs)];
	const baseOptions: UserLookupOptions = {
		search: search.trim(),
		limit: assignRequestUserLimit
	};

	if (uniqueDepartmentIDs.length === 0) {
		return lookup(baseOptions);
	}

	const results = await Promise.all(
		uniqueDepartmentIDs.map((departmentID) => lookup({ ...baseOptions, department_id: departmentID }))
	);
	const usersByID = new Map<number, LookupUser>();
	for (const users of results) {
		for (const user of users) {
			usersByID.set(user.id, user);
		}
	}
	return [...usersByID.values()];
}
