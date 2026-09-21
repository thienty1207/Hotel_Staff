import { LookupApiError, type LookupDepartment, type LookupLocation, type LookupUser } from './model';

const departmentsPath = '/api/v1/departments';
const locationsPath = '/api/v1/locations';
const usersPath = '/api/v1/users';

export type LocationLookupOptions = {
	q?: string;
	limit?: number;
};

export async function getDepartments(): Promise<LookupDepartment[]> {
	const payload = await getLookupPayload(departmentsPath);
	if (!isRecord(payload) || !Array.isArray(payload.departments)) {
		throw retryableError(200);
	}

	const departments = payload.departments.map(parseDepartment);
	if (departments.some((department) => department === null)) {
		throw retryableError(200);
	}
	return departments as LookupDepartment[];
}

export async function getLocations(options: LocationLookupOptions = {}): Promise<LookupLocation[]> {
	const query = new URLSearchParams();
	const search = options.q?.trim();
	if (search) {
		query.set('q', search);
	}
	if (options.limit !== undefined) {
		query.set('limit', String(options.limit));
	}
	const path = query.toString() ? `${locationsPath}?${query.toString()}` : locationsPath;
	const payload = await getLookupPayload(path);
	if (!isRecord(payload) || !Array.isArray(payload.locations)) {
		throw retryableError(200);
	}

	const locations = payload.locations.map(parseLocation);
	if (locations.some((location) => location === null)) {
		throw retryableError(200);
	}
	return locations as LookupLocation[];
}

export type UserLookupOptions = {
	search?: string;
	department_id?: number;
	limit?: number;
};

export async function getUsers(options: UserLookupOptions = {}): Promise<LookupUser[]> {
	const query = new URLSearchParams();
	const search = options.search?.trim();
	if (search) {
		query.set('search', search);
	}
	if (options.department_id !== undefined) {
		query.set('department_id', String(options.department_id));
	}
	if (options.limit !== undefined) {
		query.set('limit', String(options.limit));
	}
	const path = query.toString() ? `${usersPath}?${query.toString()}` : usersPath;
	const payload = await getLookupPayload(path);
	if (!isRecord(payload) || !Array.isArray(payload.users)) {
		throw retryableError(200);
	}

	const users = payload.users.map(parseUser);
	if (users.some((user) => user === null)) {
		throw retryableError(200);
	}
	return users as LookupUser[];
}

async function getLookupPayload(path: string): Promise<unknown> {
	let response: Response;
	try {
		response = await fetch(path, { method: 'GET', credentials: 'include' });
	} catch {
		throw retryableError();
	}

	if (response.status === 401) {
		throw new LookupApiError('unauthenticated', 'Unauthenticated.', response.status);
	}
	if (response.status !== 200) {
		throw retryableError(response.status);
	}

	try {
		return await response.json();
	} catch {
		throw retryableError(response.status);
	}
}

function parseDepartment(value: unknown): LookupDepartment | null {
	if (!isRecord(value) || !isPositiveSafeInteger(value.id) || typeof value.code !== 'string' || typeof value.name !== 'string') {
		return null;
	}
	return { id: value.id, code: value.code, name: value.name };
}

function parseLocation(value: unknown): LookupLocation | null {
	if (!isRecord(value) || !isPositiveSafeInteger(value.id) || typeof value.name !== 'string') {
		return null;
	}
	if (value.code !== null && typeof value.code !== 'string') {
		return null;
	}
	return { id: value.id, code: value.code, name: value.name };
}

function parseUser(value: unknown): LookupUser | null {
	if (
		!isRecord(value) ||
		!isPositiveSafeInteger(value.id) ||
		typeof value.full_name !== 'string' ||
		!isPositiveSafeInteger(value.department_id) ||
		typeof value.department_code !== 'string' ||
		typeof value.department_name !== 'string'
	) {
		return null;
	}
	return {
		id: value.id,
		full_name: value.full_name,
		department_id: value.department_id,
		department_code: value.department_code,
		department_name: value.department_name
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isPositiveSafeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function retryableError(status?: number): LookupApiError {
	return new LookupApiError('retryable', 'The lookup service is temporarily unavailable.', status);
}
