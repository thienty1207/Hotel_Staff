import { afterEach, expect, test } from 'bun:test';
import { acceptTicket, assignTicket, listTickets } from '../src/lib/client/tickets/api';

const originalFetch = globalThis.fetch;

const page = {
	tickets: [
		{
			id: 101,
			title: 'Air conditioner request',
			description: null,
			status: 'pending',
			priority: true,
			due_at: null,
			created_at: '2026-09-11T10:00:00Z',
			updated_at: '2026-09-11T10:00:00Z',
			requester: { id: 10, full_name: 'Requester', department_code: 'IT' },
			department: { id: 1, code: 'IT', name: 'IT Department' },
			location: null,
			accepted_by: null,
			accepted_at: null,
			assigned_departments: [],
			assigned_users: [],
			closed_at: null
		}
	],
	page: { has_more: true, next_before_created_at: '2026-09-11T10:00:00Z', next_before_id: 101 }
};

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function respondWithJson(payload: unknown) {
	globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200 });
}

async function expectRetryablePayload(payload: unknown) {
	respondWithJson(payload);
	try {
		await listTickets('open');
		throw new Error('invalid ticket page unexpectedly succeeded');
	} catch (error) {
		expect(error).toMatchObject({ kind: 'retryable', status: 200 });
	}
}

test('ticket list sends the selected view through the relative authenticated endpoint', async () => {
	let requestInput: RequestInfo | URL | undefined;
	let requestInit: RequestInit | undefined;
	globalThis.fetch = async (input, init) => {
		requestInput = input;
		requestInit = init;
		return new Response(JSON.stringify(page), { status: 200, headers: { 'Content-Type': 'application/json' } });
	};

	const result = await listTickets('open', { limit: 50 });

	expect(result).toEqual(page);
	expect(String(requestInput)).toBe('/api/v1/tickets?view=open&limit=50');
	expect(requestInit?.method).toBe('GET');
	expect(requestInit?.credentials).toBe('include');
});

test('ticket list preserves description and requester/owner department codes', async () => {
	const acceptedTicket = {
		...page.tickets[0],
		status: 'accepted',
		description: 'The real ticket description.',
		requester: { id: 10, full_name: 'Requester', department_code: 'REC' },
		accepted_by: { id: 20, full_name: 'Owner', department_code: 'IT' },
		accepted_at: '2026-09-11T10:05:00Z'
	};
	respondWithJson({ tickets: [acceptedTicket], page: { has_more: false, next_before_created_at: null, next_before_id: null } });

	const result = await listTickets('open');

	expect(result.tickets[0].description).toBe('The real ticket description.');
	expect(result.tickets[0].requester.department_code).toBe('REC');
	expect(result.tickets[0].accepted_by?.department_code).toBe('IT');
});

test('ticket list sends both cursor fields for keyset pagination', async () => {
	let requestInput: RequestInfo | URL | undefined;
	globalThis.fetch = async (input) => {
		requestInput = input;
		return new Response(JSON.stringify({ tickets: [], page: { has_more: false, next_before_created_at: null, next_before_id: null } }), { status: 200 });
	};

	await listTickets('closed', {
		limit: 1,
		cursor: { before_created_at: '2026-09-11T10:00:00Z', before_id: 101 }
	});

	expect(String(requestInput)).toBe(
		'/api/v1/tickets?view=closed&limit=1&before_created_at=2026-09-11T10%3A00%3A00Z&before_id=101'
	);
});

test('ticket list keeps authentication and retryable failures typed', async () => {
	globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'unauthenticated' } }), { status: 401 });
	try {
		await listTickets('open');
		throw new Error('unauthenticated ticket list unexpectedly succeeded');
	} catch (error) {
		expect(error).toMatchObject({ kind: 'unauthenticated', status: 401 });
	}

	globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'internal_server_error' } }), { status: 500 });
	try {
		await listTickets('open');
		throw new Error('failed ticket list unexpectedly succeeded');
	} catch (error) {
		expect(error).toMatchObject({ kind: 'retryable', status: 500 });
	}
});

test('ticket list accepts an exhausted page without a cursor', async () => {
	respondWithJson({ tickets: [], page: { has_more: false, next_before_created_at: null, next_before_id: null } });

	const result = await listTickets('open');

	expect(result.page).toEqual({ has_more: false, next_before_created_at: null, next_before_id: null });
});

test('ticket list rejects invalid has_more and cursor combinations', async () => {
	const invalidPages = [
		{ has_more: true, next_before_created_at: null, next_before_id: null },
		{ has_more: true, next_before_created_at: '2026-09-11T10:00:00Z', next_before_id: null },
		{ has_more: true, next_before_created_at: null, next_before_id: 101 },
		{ has_more: true, next_before_created_at: 'not-a-timestamp', next_before_id: 101 },
		{ has_more: true, next_before_created_at: '2026-09-11T10:00:00Z', next_before_id: 0 },
		{ has_more: false, next_before_created_at: '2026-09-11T10:00:00Z', next_before_id: 101 }
	];

	for (const invalidPage of invalidPages) {
		await expectRetryablePayload({ tickets: [], page: invalidPage });
	}
});

test('acceptTicket sends an authenticated empty-body POST and parses the canonical ticket envelope', async () => {
	const acceptedTicket = {
		...page.tickets[0],
		status: 'accepted' as const,
		accepted_by: { id: 20, full_name: 'Accepter', department_code: 'HK' },
		accepted_at: '2026-09-16T08:05:00Z',
		updated_at: '2026-09-16T08:05:00Z'
	};
	let requestInput: RequestInfo | URL | undefined;
	let requestInit: RequestInit | undefined;
	globalThis.fetch = async (input, init) => {
		requestInput = input;
		requestInit = init;
		return new Response(JSON.stringify({ ticket: acceptedTicket }), { status: 200 });
	};

	const result = await acceptTicket(101);

	expect(result).toEqual(acceptedTicket);
	expect(String(requestInput)).toBe('/api/v1/tickets/101/accept');
	expect(requestInit?.method).toBe('POST');
	expect(requestInit?.credentials).toBe('include');
	expect(requestInit?.body).toBeUndefined();
});

test('acceptTicket distinguishes lifecycle conflicts and safe failures', async () => {
	const cases = [
		{ status: 400, code: 'invalid_request', kind: 'invalid_input' },
		{ status: 401, code: 'unauthenticated', kind: 'unauthenticated' },
		{ status: 404, code: 'ticket_not_found', kind: 'not_found' },
		{ status: 409, code: 'ticket_already_accepted', kind: 'already_accepted' },
		{ status: 409, code: 'ticket_closed', kind: 'closed' },
		{ status: 503, code: 'internal_server_error', kind: 'retryable' }
	] as const;

	for (const expected of cases) {
		globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: expected.code } }), { status: expected.status });
		const expectedError = { kind: expected.kind, status: expected.status } as Record<string, unknown>;
		if (expected.status !== 503) {
			expectedError.code = expected.code;
		}
		await expect(acceptTicket(101)).rejects.toMatchObject(expectedError);
	}
});

test('acceptTicket rejects malformed successful payloads and network failures safely', async () => {
	globalThis.fetch = async () => new Response(JSON.stringify({ ticket: { ...page.tickets[0], status: 'accepted' } }), { status: 200 });
	await expect(acceptTicket(101)).rejects.toMatchObject({ kind: 'retryable', status: 200 });

	globalThis.fetch = async () => {
		throw new Error('offline');
	};
	await expect(acceptTicket(101)).rejects.toMatchObject({ kind: 'retryable' });
});

test('acceptTicket rejects malformed IDs before making a request', async () => {
	let requests = 0;
	globalThis.fetch = async () => {
		requests += 1;
		return new Response('{}', { status: 500 });
	};

	await expect(acceptTicket(0)).rejects.toMatchObject({ kind: 'invalid_input' });
	await expect(acceptTicket(Number.MAX_SAFE_INTEGER + 1)).rejects.toMatchObject({ kind: 'invalid_input' });
	expect(requests).toBe(0);
});

test('assignTicket sends the canonical assignment body and parses the updated ticket', async () => {
	const assignedTicket = {
		...page.tickets[0],
		assigned_departments: [{ id: 2, code: 'HK', name: 'Housekeeping' }],
		assigned_users: [{ id: 20, full_name: 'Staff Member', department_code: 'HK' }],
		updated_at: '2026-09-21T08:05:00Z'
	};
	let requestInput: RequestInfo | URL | undefined;
	let requestInit: RequestInit | undefined;
	globalThis.fetch = async (input, init) => {
		requestInput = input;
		requestInit = init;
		return new Response(JSON.stringify({ ticket: assignedTicket }), { status: 200 });
	};

	const result = await assignTicket(101, { department_ids: [2], user_ids: [20] });

	expect(result).toEqual(assignedTicket);
	expect(String(requestInput)).toBe('/api/v1/tickets/101/assign');
	expect(requestInit?.method).toBe('POST');
	expect(requestInit?.credentials).toBe('include');
	expect(requestInit?.headers).toEqual({ 'Content-Type': 'application/json' });
	expect(requestInit?.body).toBe(JSON.stringify({ department_ids: [2], user_ids: [20] }));
});

test('assignTicket maps target, lifecycle, authentication, and retryable failures without retrying', async () => {
	const cases = [
		{ status: 400, code: 'department_unavailable', kind: 'invalid_input' },
		{ status: 400, code: 'user_unavailable', kind: 'invalid_input' },
		{ status: 400, code: 'invalid_request', kind: 'invalid_input' },
		{ status: 401, code: 'unauthenticated', kind: 'unauthenticated' },
		{ status: 404, code: 'ticket_not_found', kind: 'not_found' },
		{ status: 409, code: 'ticket_closed', kind: 'closed' },
		{ status: 503, code: 'internal_server_error', kind: 'retryable' }
	] as const;

	for (const expected of cases) {
		let requests = 0;
		globalThis.fetch = async () => {
			requests += 1;
			return new Response(JSON.stringify({ error: { code: expected.code } }), { status: expected.status });
		};
		const expectedError = { kind: expected.kind, status: expected.status } as Record<string, unknown>;
		if (expected.status !== 503) {
			expectedError.code = expected.code;
		}
		await expect(assignTicket(101, { department_ids: [], user_ids: [] })).rejects.toMatchObject(expectedError);
		expect(requests).toBe(1);
	}
});

test('assignTicket rejects malformed successful payloads, bad IDs, duplicate IDs, and network failures safely', async () => {
	globalThis.fetch = async () => new Response(JSON.stringify({ ticket: { ...page.tickets[0], assigned_departments: 'bad' } }), { status: 200 });
	await expect(assignTicket(101, { department_ids: [], user_ids: [] })).rejects.toMatchObject({ kind: 'retryable', status: 200 });

	let requests = 0;
	globalThis.fetch = async () => {
		requests += 1;
		return new Response('{}', { status: 500 });
	};
	await expect(assignTicket(0, { department_ids: [], user_ids: [] })).rejects.toMatchObject({ kind: 'invalid_input' });
	await expect(assignTicket(101, { department_ids: [2, 2], user_ids: [] })).rejects.toMatchObject({ kind: 'invalid_input' });
	await expect(assignTicket(101, { department_ids: [], user_ids: [0] })).rejects.toMatchObject({ kind: 'invalid_input' });
	expect(requests).toBe(0);

	globalThis.fetch = async () => {
		throw new Error('offline');
	};
	await expect(assignTicket(101, { department_ids: [], user_ids: [] })).rejects.toMatchObject({ kind: 'retryable' });
});
