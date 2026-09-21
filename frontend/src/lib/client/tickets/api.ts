import {
	TicketApiError,
	type AcceptTicketErrorCode,
	type AssignTicketErrorCode,
	type AssignTicketRequest,
	type CreateTicketErrorCode,
	type CreateTicketRequest,
	type TicketDetailErrorCode,
	type TicketCursor,
	type TicketDepartment,
	type TicketIdentity,
	type TicketListResponse,
	type TicketLocation,
	type TicketSummary,
	type TicketView
} from './model';

const ticketsPath = '/api/v1/tickets';

const rfc3339Pattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export async function listTickets(
	view: TicketView,
	options: { limit?: number; cursor?: TicketCursor } = {}
): Promise<TicketListResponse> {
	const query = new URLSearchParams({ view });
	if (options.limit !== undefined) {
		query.set('limit', String(options.limit));
	}
	if (options.cursor) {
		query.set('before_created_at', options.cursor.before_created_at);
		query.set('before_id', String(options.cursor.before_id));
	}

	let response: Response;
	try {
		response = await fetch(`${ticketsPath}?${query.toString()}`, {
			method: 'GET',
			credentials: 'include'
		});
	} catch {
		throw retryableError();
	}

	if (response.status === 401) {
		throw new TicketApiError('unauthenticated', 'Unauthenticated.', response.status);
	}
	if (response.status === 400) {
		throw new TicketApiError('invalid_input', 'Invalid ticket list request.', response.status);
	}
	if (response.status !== 200) {
		throw retryableError(response.status);
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw retryableError(response.status);
	}

	const result = parseTicketListResponse(payload);
	if (!result) {
		throw retryableError(response.status);
	}
	return result;
}

export async function getTicket(id: number): Promise<TicketSummary> {
	let response: Response;
	try {
		response = await fetch(`${ticketsPath}/${id}`, {
			method: 'GET',
			credentials: 'include'
		});
	} catch {
		throw retryableError();
	}

	if (response.status === 401) {
		throw new TicketApiError('unauthenticated', 'Unauthenticated.', response.status);
	}
	if (response.status === 400) {
		throw new TicketApiError('invalid_input', 'Invalid ticket detail request.', response.status);
	}
	if (response.status === 404) {
		const code = await parseTicketDetailErrorCode(response);
		if (code === 'ticket_not_found') {
			throw new TicketApiError('not_found', 'Ticket not found.', response.status, code);
		}
		throw retryableError(response.status);
	}
	if (response.status !== 200) {
		throw retryableError(response.status);
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw retryableError(response.status);
	}
	if (!isRecord(payload)) {
		throw retryableError(response.status);
	}
	const ticket = parseTicket(payload.ticket);
	if (!ticket) {
		throw retryableError(response.status);
	}
	return ticket;
}

export async function acceptTicket(id: number): Promise<TicketSummary> {
	if (!isPositiveSafeInteger(id)) {
		throw new TicketApiError('invalid_input', 'Invalid ticket acceptance request.', 400, 'invalid_request');
	}

	let response: Response;
	try {
		response = await fetch(`${ticketsPath}/${id}/accept`, {
			method: 'POST',
			credentials: 'include'
		});
	} catch {
		throw retryableError();
	}

	if (response.status === 400) {
		const code = await parseAcceptTicketErrorCode(response);
		throw new TicketApiError('invalid_input', 'Invalid ticket acceptance request.', response.status, code);
	}
	if (response.status === 401) {
		throw new TicketApiError('unauthenticated', 'Unauthenticated.', response.status, 'unauthenticated');
	}
	if (response.status === 404) {
		const code = await parseAcceptTicketErrorCode(response);
		if (code === 'ticket_not_found') {
			throw new TicketApiError('not_found', 'Ticket not found.', response.status, code);
		}
		throw retryableError(response.status);
	}
	if (response.status === 409) {
		const code = await parseAcceptTicketErrorCode(response);
		if (code === 'ticket_already_accepted') {
			throw new TicketApiError('already_accepted', 'Ticket has already been accepted.', response.status, code);
		}
		if (code === 'ticket_closed') {
			throw new TicketApiError('closed', 'Ticket is closed.', response.status, code);
		}
		throw retryableError(response.status);
	}
	if (response.status !== 200) {
		throw retryableError(response.status);
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw retryableError(response.status);
	}
	if (!isRecord(payload)) {
		throw retryableError(response.status);
	}
	const ticket = parseTicket(payload.ticket);
	if (!ticket) {
		throw retryableError(response.status);
	}
	return ticket;
}

export async function assignTicket(id: number, request: AssignTicketRequest): Promise<TicketSummary> {
	if (!isPositiveSafeInteger(id) || !isValidAssignmentRequest(request)) {
		throw new TicketApiError('invalid_input', 'Invalid ticket assignment request.', 400, 'invalid_request');
	}

	let response: Response;
	try {
		response = await fetch(`${ticketsPath}/${id}/assign`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify(request)
		});
	} catch {
		throw retryableError();
	}

	if (response.status === 400) {
		const code = await parseAssignTicketErrorCode(response);
		throw new TicketApiError('invalid_input', 'Invalid ticket assignment request.', response.status, code);
	}
	if (response.status === 401) {
		throw new TicketApiError('unauthenticated', 'Unauthenticated.', response.status, 'unauthenticated');
	}
	if (response.status === 404) {
		const code = await parseAssignTicketErrorCode(response);
		if (code === 'ticket_not_found') {
			throw new TicketApiError('not_found', 'Ticket not found.', response.status, code);
		}
		throw retryableError(response.status);
	}
	if (response.status === 409) {
		const code = await parseAssignTicketErrorCode(response);
		if (code === 'ticket_closed') {
			throw new TicketApiError('closed', 'Ticket is closed.', response.status, code);
		}
		throw retryableError(response.status);
	}
	if (response.status !== 200) {
		throw retryableError(response.status);
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw retryableError(response.status);
	}
	if (!isRecord(payload)) {
		throw retryableError(response.status);
	}
	const ticket = parseTicket(payload.ticket);
	if (!ticket) {
		throw retryableError(response.status);
	}
	return ticket;
}

export async function createTicket(request: CreateTicketRequest): Promise<TicketSummary> {
	let response: Response;
	try {
		response = await fetch(ticketsPath, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify(request)
		});
	} catch {
		throw retryableError();
	}

	if (response.status === 401) {
		throw new TicketApiError('unauthenticated', 'Unauthenticated.', response.status);
	}
	if (response.status === 400) {
		const code = await parseCreateTicketErrorCode(response);
		throw new TicketApiError('invalid_input', 'Please review the request details.', response.status, code);
	}
	if (response.status !== 201) {
		throw retryableError(response.status);
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw retryableError(response.status);
	}
	if (!isRecord(payload)) {
		throw retryableError(response.status);
	}
	const ticket = parseTicket(payload.ticket);
	if (!ticket) {
		throw retryableError(response.status);
	}
	return ticket;
}

function parseTicketListResponse(payload: unknown): TicketListResponse | null {
	if (!isRecord(payload) || !Array.isArray(payload.tickets) || !isRecord(payload.page)) {
		return null;
	}

	const tickets: TicketSummary[] = [];
	for (const value of payload.tickets) {
		const ticket = parseTicket(value);
		if (!ticket) {
			return null;
		}
		tickets.push(ticket);
	}

	const page = payload.page;
	const cursorPresent = page.next_before_created_at !== null && page.next_before_id !== null;
	const cursorAbsent = page.next_before_created_at === null && page.next_before_id === null;
	if (
		typeof page.has_more !== 'boolean' ||
		!isNullableTimestamp(page.next_before_created_at) ||
		!isNullableSafeInteger(page.next_before_id) ||
		(page.has_more ? !cursorPresent : !cursorAbsent)
	) {
		return null;
	}

	return {
		tickets,
		page: {
			has_more: page.has_more,
			next_before_created_at: page.next_before_created_at,
			next_before_id: page.next_before_id
		}
	};
}

function parseTicket(value: unknown): TicketSummary | null {
	if (!isRecord(value)) {
		return null;
	}
	const requester = parseIdentity(value.requester);
	const department = parseDepartment(value.department);
	const location = parseNullableDepartment(value.location);
	const acceptedBy = parseNullableIdentity(value.accepted_by);
	if (
		!isPositiveSafeInteger(value.id) ||
		typeof value.title !== 'string' ||
		(value.description !== null && typeof value.description !== 'string') ||
		(value.status !== 'pending' && value.status !== 'accepted' && value.status !== 'closed') ||
		typeof value.priority !== 'boolean' ||
		!isNullableTimestamp(value.due_at) ||
		!isTimestamp(value.created_at) ||
		!isTimestamp(value.updated_at) ||
		!requester ||
		!department ||
		(value.location !== null && !location) ||
		(value.accepted_by !== null && !acceptedBy) ||
		!isNullableTimestamp(value.accepted_at) ||
		!Array.isArray(value.assigned_departments) ||
		!Array.isArray(value.assigned_users) ||
		!value.assigned_departments.every((item) => parseDepartment(item) !== null) ||
		!value.assigned_users.every((item) => parseIdentity(item) !== null) ||
		!isNullableTimestamp(value.closed_at)
	) {
		return null;
	}
	const lifecycleIsValid =
		(value.status === 'pending' && value.accepted_by === null && value.accepted_at === null) ||
		((value.status === 'accepted' || value.status === 'closed') && acceptedBy !== null && value.accepted_at !== null);
	if (!lifecycleIsValid || (value.status === 'closed' && value.closed_at === null)) {
		return null;
	}

	return {
		id: value.id,
		title: value.title,
		description: value.description,
		status: value.status,
		priority: value.priority,
		due_at: value.due_at,
		created_at: value.created_at,
		updated_at: value.updated_at,
		requester,
		department,
		location,
		accepted_by: acceptedBy,
		accepted_at: value.accepted_at,
		assigned_departments: value.assigned_departments.map((item) => parseDepartment(item) as TicketDepartment),
		assigned_users: value.assigned_users.map((item) => parseIdentity(item) as TicketIdentity),
		closed_at: value.closed_at
	};
}

function parseIdentity(value: unknown): TicketIdentity | null {
	if (
		!isRecord(value) ||
		!isPositiveSafeInteger(value.id) ||
		typeof value.full_name !== 'string' ||
		typeof value.department_code !== 'string'
	) {
		return null;
	}
	return { id: value.id, full_name: value.full_name, department_code: value.department_code };
}

function parseNullableIdentity(value: unknown): TicketIdentity | null {
	return value === null ? null : parseIdentity(value);
}

function parseDepartment(value: unknown): TicketDepartment | null {
	if (
		!isRecord(value) ||
		!isPositiveSafeInteger(value.id) ||
		typeof value.code !== 'string' ||
		typeof value.name !== 'string'
	) {
		return null;
	}
	return { id: value.id, code: value.code, name: value.name };
}

function parseNullableDepartment(value: unknown): TicketLocation | null {
	return value === null ? null : parseDepartment(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isPositiveSafeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isValidAssignmentRequest(value: AssignTicketRequest): boolean {
	return isUniquePositiveIDList(value?.department_ids) && isUniquePositiveIDList(value?.user_ids);
}

function isUniquePositiveIDList(value: unknown): value is number[] {
	return (
		Array.isArray(value) &&
		value.length <= 100 &&
		value.every((item) => isPositiveSafeInteger(item)) &&
		new Set(value).size === value.length
	);
}

function isNullableSafeInteger(value: unknown): value is number | null {
	return value === null || isPositiveSafeInteger(value);
}

export function isRFC3339Timestamp(value: unknown): value is string {
	if (typeof value !== 'string') {
		return false;
	}
	const match = rfc3339Pattern.exec(value);
	if (!match || Number.isNaN(Date.parse(value))) {
		return false;
	}

	const calendar = new Date(0);
	calendar.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
	calendar.setUTCHours(Number(match[4]), Number(match[5]), Number(match[6]), 0);
	return (
		calendar.getUTCFullYear() === Number(match[1]) &&
		calendar.getUTCMonth() === Number(match[2]) - 1 &&
		calendar.getUTCDate() === Number(match[3]) &&
		calendar.getUTCHours() === Number(match[4]) &&
		calendar.getUTCMinutes() === Number(match[5]) &&
		calendar.getUTCSeconds() === Number(match[6])
	);
}

function isTimestamp(value: unknown): value is string {
	return isRFC3339Timestamp(value);
}

function isNullableTimestamp(value: unknown): value is string | null {
	return value === null || isTimestamp(value);
}

function retryableError(status?: number): TicketApiError {
	return new TicketApiError('retryable', 'The ticket service is temporarily unavailable.', status);
}

async function parseCreateTicketErrorCode(response: Response): Promise<CreateTicketErrorCode | undefined> {
	try {
		const payload: unknown = await response.json();
		if (!isRecord(payload) || !isRecord(payload.error)) {
			return undefined;
		}
		const code = payload.error.code;
		if (code === 'department_unavailable' || code === 'location_unavailable' || code === 'invalid_request') {
			return code;
		}
	} catch {
		return undefined;
	}
	return undefined;
}

async function parseTicketDetailErrorCode(response: Response): Promise<TicketDetailErrorCode | undefined> {
	try {
		const payload: unknown = await response.json();
		if (!isRecord(payload) || !isRecord(payload.error)) {
			return undefined;
		}
		return payload.error.code === 'ticket_not_found' ? payload.error.code : undefined;
	} catch {
		return undefined;
	}
}

async function parseAcceptTicketErrorCode(
	response: Response
): Promise<AcceptTicketErrorCode | TicketDetailErrorCode | 'invalid_request' | 'unauthenticated' | undefined> {
	try {
		const payload: unknown = await response.json();
		if (!isRecord(payload) || !isRecord(payload.error)) {
			return undefined;
		}
		const code = payload.error.code;
		if (
			code === 'ticket_already_accepted' ||
			code === 'ticket_closed' ||
			code === 'ticket_not_found' ||
			code === 'invalid_request' ||
			code === 'unauthenticated'
		) {
			return code;
		}
	} catch {
		return undefined;
	}
	return undefined;
}

async function parseAssignTicketErrorCode(response: Response): Promise<AssignTicketErrorCode | 'unauthenticated' | undefined> {
	try {
		const payload: unknown = await response.json();
		if (!isRecord(payload) || !isRecord(payload.error)) {
			return undefined;
		}
		const code = payload.error.code;
		if (
			code === 'department_unavailable' ||
			code === 'user_unavailable' ||
			code === 'ticket_closed' ||
			code === 'ticket_not_found' ||
			code === 'invalid_request' ||
			code === 'unauthenticated'
		) {
			return code;
		}
	} catch {
		return undefined;
	}
	return undefined;
}
