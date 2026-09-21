import { afterEach, expect, test } from 'bun:test';
import { getDepartments, getLocations, getUsers } from '../src/lib/client/lookups/api';

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

test('lookup APIs use relative authenticated endpoints and preserve nullable location codes', async () => {
	const requests: string[] = [];
	globalThis.fetch = async (input, init) => {
		requests.push(`${String(input)}:${init?.credentials}`);
		if (String(input) === '/api/v1/departments') {
			return new Response(JSON.stringify({ departments: [{ id: 2, code: 'IT', name: 'IT Department' }] }), { status: 200 });
		}
		return new Response(JSON.stringify({ locations: [{ id: 15, code: null, name: 'Lobby' }] }), { status: 200 });
	};

	await expect(getDepartments()).resolves.toEqual([{ id: 2, code: 'IT', name: 'IT Department' }]);
	await expect(getLocations()).resolves.toEqual([{ id: 15, code: null, name: 'Lobby' }]);
	expect(requests).toEqual(['/api/v1/departments:include', '/api/v1/locations:include']);
});

test('lookup APIs distinguish unauthenticated and retryable/malformed responses', async () => {
	globalThis.fetch = async () => new Response('{}', { status: 401 });
	await expect(getDepartments()).rejects.toMatchObject({ kind: 'unauthenticated', status: 401 });

	globalThis.fetch = async () => new Response('{}', { status: 503 });
	await expect(getLocations()).rejects.toMatchObject({ kind: 'retryable', status: 503 });

	globalThis.fetch = async () => new Response(JSON.stringify({ locations: [{ id: 0, code: 'BAD', name: 'Bad' }] }), { status: 200 });
	await expect(getLocations()).rejects.toMatchObject({ kind: 'retryable', status: 200 });
});

test('location lookup sends trimmed search and bounded limit', async () => {
	let requestURL = '';
	globalThis.fetch = async (input) => {
		requestURL = String(input);
		return new Response(JSON.stringify({ locations: [{ id: 15, code: null, name: 'Server Room' }] }), { status: 200 });
	};

	await expect(getLocations({ q: '  server  ', limit: 10 })).resolves.toEqual([{ id: 15, code: null, name: 'Server Room' }]);
	expect(requestURL).toBe('/api/v1/locations?q=server&limit=10');
});

test('location lookup leaves omitted limits out of search requests', async () => {
	let requestURL = '';
	globalThis.fetch = async (input) => {
		requestURL = String(input);
		return new Response(JSON.stringify({ locations: [] }), { status: 200 });
	};

	await expect(getLocations({ q: '  oasis  ' })).resolves.toEqual([]);
	expect(requestURL).toBe('/api/v1/locations?q=oasis');
});

test('user lookup sends bounded filters and returns only safe staff fields', async () => {
	let requestURL = '';
	globalThis.fetch = async (input) => {
		requestURL = String(input);
		return new Response(
			JSON.stringify({
				users: [
					{
						id: 20,
						full_name: 'Staff Member',
						department_id: 2,
						department_code: 'HK',
						department_name: 'Housekeeping'
					}
				]
			}),
			{ status: 200 }
		);
	};

	await expect(getUsers({ search: '  staff member  ', department_id: 2, limit: 25 })).resolves.toEqual([
		{ id: 20, full_name: 'Staff Member', department_id: 2, department_code: 'HK', department_name: 'Housekeeping' }
	]);
	expect(requestURL).toBe('/api/v1/users?search=staff+member&department_id=2&limit=25');
});

test('user lookup rejects malformed users and preserves unauthenticated typing', async () => {
	globalThis.fetch = async () => new Response(JSON.stringify({ users: [{ id: 20, full_name: 'Missing department' }] }), { status: 200 });
	await expect(getUsers()).rejects.toMatchObject({ kind: 'retryable', status: 200 });

	globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'unauthenticated' } }), { status: 401 });
	await expect(getUsers()).rejects.toMatchObject({ kind: 'unauthenticated', status: 401 });
});

test('RFC3339 ticket timestamps require an explicit timezone-shaped value', async () => {
	const { isRFC3339Timestamp } = await import('../src/lib/client/tickets/api');

	expect(isRFC3339Timestamp('2026-09-12T09:30:00+07:00')).toBe(true);
	expect(isRFC3339Timestamp('2026-09-12T02:30:00.123Z')).toBe(true);
	expect(isRFC3339Timestamp('September 12, 2026 09:30:00')).toBe(false);
	expect(isRFC3339Timestamp('2026-09-12')).toBe(false);
	expect(isRFC3339Timestamp('2026-09-12T09:30:00')).toBe(false);
	expect(isRFC3339Timestamp('2026-02-30T09:30:00Z')).toBe(false);
});
