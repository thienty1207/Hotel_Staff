import { expect, test } from 'bun:test';
import { TicketAssignmentController, type AssignmentViewContext, type TicketAssignmentCallbacks } from '../src/lib/client/ticket-assignment';
import type { TicketSummary } from '../src/lib/client/tickets/model';

const ticket = (id: number, status: TicketSummary['status'] = 'pending'): TicketSummary => ({
	id,
	title: `Ticket ${id}`,
	description: null,
	status,
	priority: false,
	due_at: null,
	created_at: '2026-09-21T08:00:00Z',
	updated_at: '2026-09-21T08:00:00Z',
	requester: { id: 10, full_name: 'Requester', department_code: 'FO' },
	department: { id: 1, code: 'FO', name: 'Front Office' },
	location: null,
	accepted_by: status === 'pending' ? null : { id: 20, full_name: 'Owner', department_code: 'HK' },
	accepted_at: status === 'pending' ? null : '2026-09-21T08:01:00Z',
	assigned_departments: [],
	assigned_users: [],
	closed_at: status === 'closed' ? '2026-09-21T08:02:00Z' : null
});

function callbacks(view: AssignmentViewContext, current: TicketSummary, patched: TicketSummary[], chat: TicketSummary[]): TicketAssignmentCallbacks {
	return {
		getCurrentTicket: (ticketID) => (ticketID === current.id ? current : null),
		getView: () => view,
		patchList: (updated) => patched.push(updated),
		updateChat: (updated) => chat.push(updated),
		setError: () => undefined,
		clearError: () => undefined,
		onUnauthenticated: async () => undefined,
		onInFlightChange: () => undefined
	};
}

test('assignment controller deduplicates one ticket and applies the authoritative result once', async () => {
	const updated = ticket(301);
	updated.assigned_users = [{ id: 22, full_name: 'Assigned Staff', department_code: 'HK' }];
	let resolveAssignment: ((value: TicketSummary) => void) | undefined;
	let calls = 0;
	const controller = new TicketAssignmentController({
		assignTicket: async () => {
			calls += 1;
			return new Promise<TicketSummary>((resolve) => {
				resolveAssignment = resolve;
			});
		}
	});
	const view: AssignmentViewContext = { listSequence: 4, listView: 'open', chatGeneration: 9, chatOpen: true, selectedTicketID: 301 };
	const patched: TicketSummary[] = [];
	const chat: TicketSummary[] = [];
	const requestCallbacks = callbacks(view, ticket(301), patched, chat);

	const first = controller.assignTicketByID(301, { department_ids: [2], user_ids: [22] }, 'chat', requestCallbacks);
	const duplicate = controller.assignTicketByID(301, { department_ids: [2], user_ids: [22] }, 'chat', requestCallbacks);
	await Promise.resolve();

	expect(calls).toBe(1);
	expect(controller.isInFlight(301)).toBe(true);
	resolveAssignment?.(updated);
	await first;
	await duplicate;

	expect(patched).toEqual([updated]);
	expect(chat).toEqual([updated]);
	expect(controller.isInFlight(301)).toBe(false);
});

test('assignment controller patches the list but ignores a stale Chat selection', async () => {
	const updated = ticket(302);
	let resolveAssignment: ((value: TicketSummary) => void) | undefined;
	const controller = new TicketAssignmentController({
		assignTicket: async () => new Promise<TicketSummary>((resolve) => (resolveAssignment = resolve))
	});
	const initialView: AssignmentViewContext = { listSequence: 7, listView: 'open', chatGeneration: 12, chatOpen: true, selectedTicketID: 302 };
	const currentView: AssignmentViewContext = { ...initialView, chatGeneration: 13, selectedTicketID: 303 };
	const patched: TicketSummary[] = [];
	const chat: TicketSummary[] = [];
	const requestCallbacks = callbacks(initialView, ticket(302), patched, chat);
	requestCallbacks.getView = () => currentView;

	const assignment = controller.assignTicketByID(302, { department_ids: [], user_ids: [] }, 'row', requestCallbacks);
	resolveAssignment?.(updated);
	await assignment;

	expect(patched).toEqual([updated]);
	expect(chat).toEqual([]);
});
