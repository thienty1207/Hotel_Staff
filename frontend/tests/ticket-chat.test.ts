import { afterEach, expect, test } from 'bun:test';
import { getTicket } from '../src/lib/client/tickets/api';
import { TicketChatStateMachine } from '../src/lib/client/ticket-chat-state';
import { TicketAcceptanceController, type AcceptViewContext } from '../src/lib/client/ticket-acceptance';
import { TicketApiError, type TicketSummary } from '../src/lib/client/tickets/model';

function styleBlock(styles: string, selector: string): string {
	const start = styles.indexOf(selector);
	if (start < 0) {
		return '';
	}
	const end = styles.indexOf('}', start);
	return end < 0 ? styles.slice(start) : styles.slice(start, end + 1);
}

const originalFetch = globalThis.fetch;

const ticket: TicketSummary = {
	id: 101,
	title: 'Air conditioner request',
	description: 'The complete detail description.',
	status: 'accepted',
	priority: true,
	due_at: '2026-09-14T10:00:00Z',
	created_at: '2026-09-14T08:00:00Z',
	updated_at: '2026-09-14T08:30:00Z',
	requester: { id: 10, full_name: 'Requester', department_code: 'REC' },
	department: { id: 1, code: 'HK', name: 'Housekeeping' },
	location: { id: 2, code: 'ROOM-1', name: 'Room 1' },
	accepted_by: { id: 20, full_name: 'Owner', department_code: 'HK' },
	accepted_at: '2026-09-14T08:20:00Z',
	assigned_departments: [{ id: 3, code: 'FO', name: 'Front Office' }],
	assigned_users: [{ id: 30, full_name: 'Assignee', department_code: 'FO' }],
	closed_at: null
};

afterEach(() => {
	globalThis.fetch = originalFetch;
});

test('getTicket sends one authenticated detail GET and parses the ticket envelope strictly', async () => {
	let requestInput: RequestInfo | URL | undefined;
	let requestInit: RequestInit | undefined;
	globalThis.fetch = async (input, init) => {
		requestInput = input;
		requestInit = init;
		return new Response(JSON.stringify({ ticket }), { status: 200, headers: { 'Content-Type': 'application/json' } });
	};

	const result = await getTicket(ticket.id);

	expect(result).toEqual(ticket);
	expect(String(requestInput)).toBe('/api/v1/tickets/101');
	expect(requestInit?.method).toBe('GET');
	expect(requestInit?.credentials).toBe('include');
});

test('getTicket maps validation, auth, not-found, and server failures safely', async () => {
	globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'invalid_request' } }), { status: 400 });
	await expect(getTicket(101)).rejects.toMatchObject({ kind: 'invalid_input', status: 400 });

	globalThis.fetch = async () => new Response('{}', { status: 401 });
	await expect(getTicket(101)).rejects.toMatchObject({ kind: 'unauthenticated', status: 401 });

	globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'ticket_not_found', message: 'do not render backend text' } }), { status: 404 });
	await expect(getTicket(101)).rejects.toMatchObject({ kind: 'not_found', status: 404, code: 'ticket_not_found' });

	globalThis.fetch = async () => new Response('{}', { status: 503 });
	await expect(getTicket(101)).rejects.toMatchObject({ kind: 'retryable', status: 503 });
});

test('getTicket treats malformed successful payloads as retryable', async () => {
	const malformedPayloads = [
		{},
		{ ticket: { ...ticket, description: 42 } },
		{ ticket: { ...ticket, assigned_users: null } },
		{ ticket: { ...ticket, accepted_at: 'not-a-timestamp' } }
	];

	for (const payload of malformedPayloads) {
		globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200 });
		await expect(getTicket(101)).rejects.toMatchObject({ kind: 'retryable', status: 200 });
	}
});

test('getTicket maps network failures to retryable', async () => {
	globalThis.fetch = async () => {
		throw new Error('offline');
	};

	await expect(getTicket(101)).rejects.toMatchObject({ kind: 'retryable' });
});

test('chat selection clears stale content and latest selection wins', () => {
	const machine = new TicketChatStateMachine();
	const ticketA = { ...ticket, id: 1, title: 'Ticket A' };
	const ticketB = { ...ticket, id: 2, title: 'Ticket B' };

	const requestA = machine.begin(ticketA.id);
	expect(machine.state).toMatchObject({ status: 'loading', selectedTicketID: 1, ticket: null });
	expect(machine.succeed(requestA, ticketA)).toBe(true);

	const requestB = machine.begin(ticketB.id);
	expect(machine.state).toMatchObject({ status: 'loading', selectedTicketID: 2, ticket: null });
	expect(machine.succeed(requestB, ticketB)).toBe(true);
	expect(machine.succeed(requestA, ticketA)).toBe(false);
	expect(machine.state).toMatchObject({ status: 'ready', selectedTicketID: 2, ticket: ticketB });
});

test('chat close invalidates in-flight responses without reopening the view', () => {
	const machine = new TicketChatStateMachine();
	const request = machine.begin(ticket.id);

	machine.close();

	expect(machine.succeed(request, ticket)).toBe(false);
	expect(machine.state).toEqual({ status: 'closed', selectedTicketID: null, ticket: null, errorMessage: '' });
});

test('chat selected-ticket updates preserve the active selection and reject stale mutations', () => {
	const machine = new TicketChatStateMachine();
	const request = machine.begin(ticket.id);
	expect(machine.succeed(request, ticket)).toBe(true);
	const acceptedTicket = { ...ticket, status: 'accepted' as const, accepted_at: '2026-09-16T08:05:00Z' };

	expect(machine.updateSelected(ticket.id, acceptedTicket)).toBe(true);
	expect(machine.state).toMatchObject({ status: 'ready', selectedTicketID: ticket.id, ticket: acceptedTicket });

	const otherTicket = { ...ticket, id: 202, title: 'Other ticket' };
	expect(machine.updateSelected(otherTicket.id, otherTicket)).toBe(false);
	machine.close();
	expect(machine.updateSelected(ticket.id, acceptedTicket)).toBe(false);
});

test('Tickets page keeps chat interactions separate from list controls and exposes accessible chat states', async () => {
	const page = await Bun.file(new URL('../src/routes/+page.svelte', import.meta.url)).text();
	const chat = await Bun.file(new URL('../src/lib/components/TicketChat.svelte', import.meta.url)).text();
	const styles = await Bun.file(new URL('../src/lib/styles/app.css', import.meta.url)).text();

	expect(page).toContain('getTicket');
	expect(page).toContain('TicketChatStateMachine');
	expect(page).toContain('ticketRequestInFlight');
	expect(page).toContain('chatState');
	expect(page).toContain('openNewRequest');
	expect(page).toContain('switchView');
	expect(page).toContain('loadMore');
	expect(page).toContain('TicketChat');
	expect(page).not.toContain('TicketDetail');
	expect(chat).not.toContain('Back to Tickets');
	expect(chat).toContain('aria-label="Close Chat"');
	expect(chat).toContain('aria-labelledby="ticket-chat-heading"');
	expect(chat).toContain('role="status"');
	expect(chat).toContain('role="alert"');
	expect(chat).toContain('Chat');
	expect(chat).toContain('Chats');
	expect(chat).toContain('Checklist');
	expect(chat).toContain('aria-selected="true"');
	expect(chat).toContain('aria-disabled="true"');
	expect(chat).toContain('has created a new request');
	expect(chat).toContain('Accepted by');
	expect(chat).toContain('Type a message');
	expect(chat).toContain('disabled');
	expect(chat).not.toContain('Ticket Detail');
	expect(chat).not.toContain('Request information');
	expect(chat).not.toContain('Assigned Departments');
	expect(chat).not.toContain('Assigned Users');
	expect(chat).not.toContain('Due');
	expect(chat).not.toContain('Updated');
	expect(chat).not.toContain('Closed');
	expect(chat).not.toContain('{@html');
	expect(chat).not.toContain('fetch(');
	expect(chat).not.toContain('onsubmit');
	expect(chat).not.toContain('POST');
	expect(styles).toContain('.tickets-workspace');
	expect(styles).toContain('.tickets-workspace.chat-open');
	expect(styles).toContain('grid-template-columns: minmax(0, 1fr) clamp(19rem, 22vw, 22rem)');
	expect(styles).toContain('.ticket-chat');
	expect(styles).not.toContain('.ticket-chat-back');
	expect(styles).toContain('.ticket-chat-close');
	expect(styles).toContain('.ticket-chat-conversation');
	expect(styles).toContain('overflow-y: auto');
	expect(styles).not.toContain('border: 1px solid var(--danger)');

	const switchViewStart = page.indexOf('function switchView');
	const switchViewEnd = page.indexOf('\n\t}\n', switchViewStart);
	expect(page.slice(switchViewStart, switchViewEnd)).toContain('closeTicketChat();');

	const openNewRequestStart = page.indexOf('function openNewRequest');
	const openNewRequestEnd = page.indexOf('\n\t}\n', openNewRequestStart);
	expect(page.slice(openNewRequestStart, openNewRequestEnd)).toContain('closeTicketChat();');

	const retryChatStart = page.indexOf('function retryTicketChat');
	const retryChatEnd = page.indexOf('\n\t}\n', retryChatStart);
	const retryChatBody = page.slice(retryChatStart, retryChatEnd);
	expect(retryChatBody).toContain('loadTicketChat(request)');
	expect(retryChatBody).not.toContain('loadFirstPage');
	expect(page).not.toContain('onBack={closeTicketChat}');
});

test('ticket rows and cards open Chat while the title remains a single semantic activation', async () => {
	const page = await Bun.file(new URL('../src/routes/+page.svelte', import.meta.url)).text();

	const tableRows = page.slice(page.indexOf('<tbody>'), page.indexOf('</tbody>'));
	const mobileCards = page.slice(page.indexOf('<div class="mobile-ticket-cards">'), page.indexOf('{#if page.has_more'));

	expect(tableRows).toContain('class="ticket-row-clickable"');
	expect(tableRows).toContain('class:ticket-row-selected={chatState.selectedTicketID === ticket.id}');
	expect(tableRows).toContain('onclick={() => openTicketChat(ticket.id)}');
	expect(mobileCards).toContain('class="ticket-card ticket-card-clickable"');
	expect(mobileCards).toContain('class:ticket-card-selected={chatState.selectedTicketID === ticket.id}');
	expect(mobileCards).toContain('onclick={() => openTicketChat(ticket.id)}');

	expect(page).toContain('class="ticket-title-button"');
	expect(page).toContain('function openTicketChatFromTitle(event: MouseEvent, ticketID: number)');
	expect(page).toContain('event.stopPropagation();');
	expect(page).toMatch(/openTicketChatFromTitle\(event, ticket\.id\)/);

	const titleActivations = page.match(/openTicketChatFromTitle\(event, ticket\.id\)/g) ?? [];
	expect(titleActivations).toHaveLength(2);
});

test('Chat presentation uses compact Sara-aligned semantics and scoped disabled cursors', async () => {
	const chat = await Bun.file(new URL('../src/lib/components/TicketChat.svelte', import.meta.url)).text();
	const styles = await Bun.file(new URL('../src/lib/styles/app.css', import.meta.url)).text();

	expect(chat).not.toContain('<p class="eyebrow">Tickets</p>');
	expect(chat).toContain('<h2 id="ticket-chat-heading">Chat</h2>');
	expect(chat).toContain('ticket-chat-summary-meta');
	expect(chat).toContain('by {identityLabel(state.ticket.accepted_by)}');
	expect(chat).toContain('class:accepted={state.ticket.status === \'accepted\'}');
	expect(chat).toContain('class:closed={state.ticket.status === \'closed\'}');

	const summaryStart = chat.indexOf('<div class="ticket-chat-summary">');
	const summaryEnd = chat.indexOf('{:else if state.status === \'loading\'}', summaryStart);
	const summaryMarkup = chat.slice(summaryStart, summaryEnd);
	expect(summaryMarkup.match(/{state\.ticket\.title}/g) ?? []).toHaveLength(1);
	expect(chat).not.toContain('ticket-chat-summary-list');

	expect(styles).toContain('.status-badge.accepted');
	expect(styles).toContain('.ticket-row-clickable');
	expect(styles).toContain('.ticket-row-selected');
	expect(styles).toContain('.ticket-card-clickable');
	expect(styles).toContain('.ticket-card-selected');
	expect(styles).toContain('.ticket-chat-tab:disabled');
	expect(styles).toContain('.ticket-chat-icon-button:disabled');
	expect(styles).toContain('.ticket-chat-actions button:disabled');
	expect(styles).toContain('cursor: default;');
	expect(styles).toContain('button:disabled {\n\tcursor: wait;');
});

test('mobile Chat uses dynamic viewport chrome and a touch-scroll conversation region', async () => {
	const chat = await Bun.file(new URL('../src/lib/components/TicketChat.svelte', import.meta.url)).text();
	const styles = await Bun.file(new URL('../src/lib/styles/app.css', import.meta.url)).text();
	const mobileStyles = styles.slice(styles.lastIndexOf('@media (max-width: 900px)'));
	const desktopChatStyles = styleBlock(styles, '.ticket-chat {');
	const mobileViewStyles = styleBlock(mobileStyles, '.app-main.chat-view {');
	const mobileChatStyles = styleBlock(mobileStyles, '.ticket-chat {');
	const conversationStyles = styleBlock(styles, '.ticket-chat-conversation {');

	expect(desktopChatStyles).toContain('position: sticky;');
	expect(desktopChatStyles).toContain('height: 100%;');
	expect(desktopChatStyles).toContain('max-height: 100%;');
	expect(desktopChatStyles).not.toContain('100dvh');
	expect(mobileViewStyles).toContain('height: 100svh;');
	expect(mobileViewStyles).toContain('height: 100dvh;');
	expect(mobileViewStyles).toContain('overflow: hidden;');
	expect(mobileViewStyles).toContain('env(safe-area-inset-top, 0px)');
	expect(mobileViewStyles).toContain('env(safe-area-inset-bottom, 0px)');
	expect(mobileChatStyles).toContain('height: calc(100svh - 1.5rem);');
	expect(mobileChatStyles).toContain(
		'height: calc(100dvh - 1.5rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));'
	);
	expect(mobileChatStyles).toContain(
		'max-height: calc(100dvh - 1.5rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));'
	);
	expect(conversationStyles).toContain('overflow-y: auto;');
	expect(conversationStyles).toContain('overflow-x: hidden;');
	expect(conversationStyles).toContain('min-height: 0;');
	expect(conversationStyles).toContain('touch-action: pan-y;');
	expect(conversationStyles).toContain('-webkit-overflow-scrolling: touch;');
	expect(conversationStyles).toContain('overscroll-behavior: contain;');
	expect(chat).toContain('<button class="secondary-button ticket-chat-close"');
	expect(chat).toContain('aria-label="Close Chat"');
	expect(chat).not.toContain('Back to Tickets');
});

test('Chat summary and created activity follow the compact Sara conversation hierarchy', async () => {
	const chat = await Bun.file(new URL('../src/lib/components/TicketChat.svelte', import.meta.url)).text();
	const styles = await Bun.file(new URL('../src/lib/styles/app.css', import.meta.url)).text();

	const summaryStart = chat.indexOf('<div class="ticket-chat-summary">');
	const summaryEnd = chat.indexOf('{:else if state.status === \'loading\'}', summaryStart);
	const summaryMarkup = chat.slice(summaryStart, summaryEnd);

	expect(summaryMarkup).toContain('ticket-chat-summary-line');
	expect(summaryMarkup).toContain('<svg class="ticket-chat-monitor-icon"');
	expect(summaryMarkup).toContain('summaryTimestamp(state.ticket.created_at)');
	expect(summaryMarkup).toContain('identityLabel(state.ticket.requester)');
	expect(summaryMarkup).toContain('locationLabel(state.ticket.location)');
	expect(summaryMarkup).not.toContain('timestampDate(state.ticket.created_at)');
	expect(summaryMarkup).not.toContain('timestampTime(state.ticket.created_at)');
	expect(summaryMarkup).not.toContain('◈');
	expect(summaryMarkup).not.toContain('ticket-chat-summary-label');
	expect(summaryMarkup).not.toContain('ticket-chat-summary-created-label');
	expect(summaryMarkup).not.toMatch(/>Requester</);
	expect(summaryMarkup).not.toMatch(/>Location</);
	expect(summaryMarkup).not.toMatch(/>Created</);

	const createdStart = chat.indexOf('<article class="ticket-chat-event ticket-chat-event-created">');
	const createdEnd = chat.indexOf('{#if state.ticket.accepted_by', createdStart);
	const createdMarkup = chat.slice(createdStart, createdEnd);

	expect(createdMarkup).toContain('ticket-chat-event-body');
	expect(createdMarkup).toContain('Location: {locationLabel(state.ticket.location)}');
	expect(createdMarkup).toContain('Title: {state.ticket.title}');
	expect(createdMarkup).toContain('{#if state.ticket.description?.trim()}');
	expect(createdMarkup).toContain('<p>{state.ticket.description.trim()}</p>');
	expect(createdMarkup.indexOf('Title: {state.ticket.title}')).toBeLessThan(
		createdMarkup.indexOf('<p>{state.ticket.description.trim()}</p>')
	);
	expect(createdMarkup).not.toContain('ticket-chat-event-details');
	expect(createdMarkup).not.toContain('<dl');
	expect(createdMarkup).not.toContain('<dt>');
	expect(createdMarkup).not.toContain('<dd>');
	expect(createdMarkup).not.toContain('>◈</span>');
	expect(createdMarkup).not.toContain('ticket-chat-monitor-icon');
	expect(createdMarkup).toContain('timestampDate(state.ticket.created_at)');
	expect(createdMarkup).toContain('timestampTime(state.ticket.created_at)');
	expect(createdMarkup).not.toContain('summaryTimestamp(state.ticket.created_at)');

	expect(styles).toContain('.ticket-chat-event-created');
	expect(styles).toContain('.ticket-chat-event-body');
	expect(styles).toContain('.ticket-chat-event-accepted');
	expect(styles).toContain('.ticket-chat-event-created .ticket-chat-event-heading time');
	expect(styles).toContain('align-self: start;');

	const titleRowStyles = styleBlock(styles, '.ticket-chat-title-row {');
	const titleStyles = styleBlock(styles, '.ticket-chat-title {');
	const priorityTitleStyles = styleBlock(styles, '.ticket-title-priority {\n\tdisplay: inline-block;');
	const statusStyles = styleBlock(styles, '.ticket-chat-summary-heading > .status-badge {');
	const summaryLineStyles = styleBlock(styles, '.ticket-chat-summary-line {');
	const summaryTimestampStyles = styleBlock(styles, '.ticket-chat-summary-created {\n\tdisplay: block;');
	const createdHeadingStyles = styleBlock(styles, '.ticket-chat-event-created .ticket-chat-event-heading {');

	expect(titleRowStyles).toContain('flex: 1 1 auto;');
	expect(titleRowStyles).toContain('min-width: 0;');
	expect(titleStyles).toContain('min-width: 0;');
	expect(titleStyles).toContain('flex: 1 1 auto;');
	expect(titleStyles).toContain('white-space: nowrap;');
	expect(titleStyles).toContain('overflow: hidden;');
	expect(titleStyles).toContain('text-overflow: ellipsis;');
	expect(priorityTitleStyles).toContain('background:');
	expect(priorityTitleStyles).toContain('font-weight: inherit;');
	expect(priorityTitleStyles).not.toContain('border: 1px solid var(--danger);');
	expect(statusStyles).toContain('flex: 0 0 auto;');
	expect(statusStyles).toContain('white-space: nowrap;');
	expect(summaryLineStyles).toContain('align-items: baseline;');
	expect(summaryTimestampStyles).toContain('color: var(--accent);');
	expect(summaryTimestampStyles).toContain('white-space: nowrap;');
	expect(summaryTimestampStyles).toContain('text-align: right;');
	expect(summaryTimestampStyles).not.toContain('display: grid;');
	expect(createdHeadingStyles).toContain('grid-template-columns: minmax(0, 1fr) auto;');
	expect(styles).not.toContain('.ticket-chat-event-details');
});

test('desktop rows expose assignment actions while mobile cards keep chat-only actions', async () => {
	const page = await Bun.file(new URL('../src/routes/+page.svelte', import.meta.url)).text();
	const table = page.slice(page.indexOf('<div class="desktop-ticket-table">'), page.indexOf('<div class="mobile-ticket-cards">'));
	const mobileCards = page.slice(page.indexOf('<div class="mobile-ticket-cards">'), page.indexOf('{#if page.has_more'));

	expect(table).toContain('<th scope="col">Action</th>');
	expect(table).toContain('ticket-row-action-button');
	expect(table).toContain('handleRowAccept(event, ticket.id)');
	expect(table).toContain('disabled={ticket.status !== \'pending\' || isAcceptInFlight(ticket.id)}');
	expect(table).toContain('handleRowAssign(event, ticket.id)');
	expect(table).toContain('disabled={ticket.status === \'closed\' || isAssignInFlight(ticket.id)}');
	expect(table).toContain('ticket-location-value');
	expect(table).toContain('Assigning…');
	expect(table).toMatch(/>\s*Close\s*<\/button>/);
	expect(page).toContain('function handleRowAction(event: MouseEvent)');
	expect(page).toContain('event.stopPropagation();');
	expect(page).toContain('class="ticket-card-location"');
	expect(mobileCards).not.toContain('ticket-row-action-button');
});

test('Chat actions share semantic colors and equal aligned columns', async () => {
	const chat = await Bun.file(new URL('../src/lib/components/TicketChat.svelte', import.meta.url)).text();
	const styles = await Bun.file(new URL('../src/lib/styles/app.css', import.meta.url)).text();
	const actionMarkup = chat.slice(chat.indexOf('<div class="ticket-chat-actions"'));
	const actionStyles = styleBlock(styles, '.ticket-chat-actions {');
	const actionButtonStyles = styleBlock(styles, '.ticket-chat-actions .ticket-action-button {');

	expect(actionMarkup).toMatch(/class="[^"]*ticket-action-button[^"]*ticket-action-accept[^"]*"/);
	expect(actionMarkup).toMatch(/class="[^"]*ticket-action-button[^"]*ticket-action-assign[^"]*"/);
	expect(actionMarkup).toMatch(/class="[^"]*ticket-action-button[^"]*ticket-action-close[^"]*"/);
	expect(actionStyles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
	expect(actionStyles).toContain('align-items: stretch;');
	expect(actionButtonStyles).toContain('width: 100%;');
	expect(actionButtonStyles).toContain('min-height: 2.15rem;');
});

test('acceptance controller uses the submitted row ID, prevents duplicate submits, and preserves another Chat selection', async () => {
	const acceptedTicket = { ...ticket, id: 301, status: 'accepted' as const, accepted_at: '2026-09-16T08:05:00Z' };
	let resolveAcceptance: ((value: TicketSummary) => void) | undefined;
	let submittedIDs: number[] = [];
	const inFlight: Array<[number, boolean]> = [];
	const patched: TicketSummary[] = [];
	const chatUpdates: TicketSummary[] = [];
	let view: AcceptViewContext = {
		listSequence: 1,
		listView: 'open',
		chatGeneration: 4,
		chatOpen: true,
		selectedTicketID: 302
	};
	const controller = new TicketAcceptanceController({
		acceptTicket: async (id) => {
			submittedIDs.push(id);
			return new Promise<TicketSummary>((resolve) => {
				resolveAcceptance = resolve;
			});
		},
		getTicket: async () => acceptedTicket
	});

	const callbacks = {
		getCurrentTicket: () => ({ ...ticket, id: 301, status: 'pending' as const }),
		getView: () => view,
		patchList: (updated: TicketSummary) => patched.push(updated),
		updateChat: (updated: TicketSummary) => chatUpdates.push(updated),
		setError: () => undefined,
		clearError: () => undefined,
		onUnauthenticated: async () => undefined,
		onInFlightChange: (id: number, active: boolean) => inFlight.push([id, active])
	};

	const first = controller.acceptTicketByID(301, 'row', callbacks);
	const duplicate = controller.acceptTicketByID(301, 'row', callbacks);
	await Promise.resolve();
	expect(submittedIDs).toEqual([301]);
	view = { ...view, chatGeneration: 5, selectedTicketID: 302 };
	resolveAcceptance?.(acceptedTicket);
	await Promise.all([first, duplicate]);

	expect(patched).toEqual([acceptedTicket]);
	expect(chatUpdates).toEqual([]);
	expect(inFlight).toEqual([
		[301, true],
		[301, false]
	]);
});

test('acceptance conflicts refresh the submitted ticket once without opening or replacing Chat', async () => {
	const conflictTicket = { ...ticket, id: 303, status: 'accepted' as const, accepted_at: '2026-09-16T08:05:00Z' };
	let acceptCalls = 0;
	let refreshCalls = 0;
	const patched: TicketSummary[] = [];
	const chatUpdates: TicketSummary[] = [];
	const errors: Array<[string, number, string, boolean]> = [];
	const controller = new TicketAcceptanceController({
		acceptTicket: async () => {
			acceptCalls += 1;
			throw new TicketApiError('already_accepted', 'conflict', 409, 'ticket_already_accepted');
		},
		getTicket: async (id) => {
			refreshCalls += 1;
			expect(id).toBe(303);
			return conflictTicket;
		}
	});
	const callbacks = {
		getCurrentTicket: () => ({ ...ticket, id: 303, status: 'pending' as const }),
		getView: (): AcceptViewContext => ({
			listSequence: 2,
			listView: 'open',
			chatGeneration: 1,
			chatOpen: false,
			selectedTicketID: null
		}),
		patchList: (updated: TicketSummary) => patched.push(updated),
		updateChat: (updated: TicketSummary) => chatUpdates.push(updated),
		setError: (origin: 'row' | 'chat', id: number, message: string, retryable: boolean) => errors.push([origin, id, message, retryable]),
		clearError: () => undefined,
		onUnauthenticated: async () => undefined,
		onInFlightChange: () => undefined
	};

	await controller.acceptTicketByID(303, 'row', callbacks);

	expect(acceptCalls).toBe(1);
	expect(refreshCalls).toBe(1);
	expect(patched).toEqual([conflictTicket]);
	expect(chatUpdates).toEqual([]);
	expect(errors).toEqual([['row', 303, 'This ticket was already accepted by another staff member.', false]]);
});

test('canonical SPEC makes whole-ticket pointer activation mandatory', async () => {
	const spec = await Bun.file(
		new URL('../../Context-Spec-Hotel-Staff/Spec/SPEC-07-ticket-chat-shell-conversation-foundation.md', import.meta.url)
	).text();

	expect(spec).toContain('pointer click/tap anywhere on the ticket row/card MUST open Chat');
	expect(spec).toContain('whole row/card pointer target');
	expect(spec).toContain('one user activation = one GET request');
	expect(spec).toContain('selected ticket has visible but subtle selection feedback');
	expect(spec).toContain('do not render visible Requester, Owner, Location, or Created field labels in the summary');
	expect(spec).toContain('Do not use a two-column LOCATION/TITLE metadata layout');
	expect(spec).not.toContain('row/card pointer click also opens Chat');
});

test('Ticket Chat keeps the summary compact and uses real persisted activity only', async () => {
	const chat = await Bun.file(new URL('../src/lib/components/TicketChat.svelte', import.meta.url)).text();

	expect(chat).toContain('<h3 class="ticket-chat-title"');
	expect(chat).toContain('class:ticket-title-priority={state.ticket.priority}');
	expect(chat).toContain('location?.name || \'—\'');
	expect(chat).not.toContain('location.code');
	expect(chat).toContain('state.ticket.accepted_by && state.ticket.accepted_at');
	expect(chat).not.toContain('assigned_departments');
	expect(chat).not.toContain('assigned_users');
	expect(chat).not.toContain('closed_at');
	expect(chat).not.toContain('updated_at');
	expect(chat).not.toContain('due_at');
});

test('Ticket Chat activates Accept and Assign while keeping Close non-mutating', async () => {
	const chat = await Bun.file(new URL('../src/lib/components/TicketChat.svelte', import.meta.url)).text();

	expect(chat).toContain('aria-label="Attach file"');
	expect(chat).toContain('aria-label="Voice message"');
	expect(chat).toContain('aria-label="More message options"');
	expect(chat).toContain('Accept');
	expect(chat).toContain('Assigning…');
	expect(chat).toContain('>Close</button>');
	expect(chat).toContain('onclick={onAccept}');
	expect(chat).toContain('onclick={onAssign}');
	expect(chat).toContain('acceptInFlight');
	expect(chat).toContain('assignInFlight');
	expect(chat).toContain('onRetryAccept');
	expect(chat).not.toContain('onclick={onCloseTicket}');
});

test('Assignment dialog uses authoritative ticket state, safe lookup lists, and a semantic save flow', async () => {
	const dialog = await Bun.file(new URL('../src/lib/components/AssignTicketDialog.svelte', import.meta.url)).text();
	const page = await Bun.file(new URL('../src/routes/+page.svelte', import.meta.url)).text();

	expect(dialog).toContain('getTicket(nextTicketID)');
	expect(dialog).toContain('getDepartments()');
	expect(dialog).toContain('getUsers({ limit: 100 })');
	expect(dialog).toContain('selectedDepartmentIDs');
	expect(dialog).toContain('selectedUserIDs');
	expect(dialog).toContain('userSearchSequence');
	expect(dialog).toContain('onSubmit(ticketID');
	expect(dialog).toContain('type="checkbox"');
	expect(dialog).toContain('Save assignment');
	expect(page).toContain('TicketAssignmentController');
	expect(page).toContain('function openAssignDialog(ticketID: number, origin: AssignmentOrigin)');
	expect(page).toContain('onSubmit={handleAssignSubmit}');
});

test('Assignment dialog keeps historical inactive targets visible and removable', async () => {
	const dialog = await Bun.file(new URL('../src/lib/components/AssignTicketDialog.svelte', import.meta.url)).text();

	expect(dialog).toContain('mergeDepartmentOptions(nextDepartments, nextTicket.assigned_departments)');
	expect(dialog).toContain('mergeUserOptions(nextUsers, nextTicket.assigned_users)');
	expect(dialog).toContain('inactiveCurrent: true');
	expect(dialog).toContain('department_id: null');
	expect(dialog).toContain('authoritativeTicket?.assigned_users ?? []');
	expect(dialog).toContain('Existing inactive assignments can be kept or removed.');
	expect(dialog).toContain("currently assigned · inactive");
	expect(dialog).toContain('selectedDepartmentIDs.includes(department.id)');
	expect(dialog).toContain('selectedUserIDs.includes(staff.id)');
});

test('Accept patches only the submitted ticket and cannot replace a newer Chat selection', async () => {
	const page = await Bun.file(new URL('../src/routes/+page.svelte', import.meta.url)).text();
	const acceptStart = page.indexOf('async function handleAcceptTicket');
	const acceptEnd = page.indexOf('\n\t}\n', acceptStart);
	const acceptBody = page.slice(acceptStart, acceptEnd);

	expect(page).toContain('acceptTicket');
	expect(page).toContain('function patchTicketInList');
	expect(page).toContain('ticketChatMachine.updateSelected');
	expect(page).toContain('onAccept={handleAcceptTicket}');
	expect(page).toContain('acceptInFlight={isAcceptInFlight(chatState.selectedTicketID)}');
	expect(page).toContain('acceptErrorMessage={selectedAcceptErrorMessage}');
	expect(acceptBody).toContain('acceptTicketByID(chatState.selectedTicketID, \'chat\')');
	expect(page).toContain('function acceptTicketByID(ticketID: number, origin: AcceptOrigin)');
	expect(page).toContain('patchList: patchTicketInList');
	expect(page).toContain('updateChat: updateSelectedChat');
	expect(page).toContain('listSequence: ticketRequestSequence');
	expect(acceptBody).not.toContain('listTickets(');
	expect(acceptBody).not.toContain('new Date(');
	expect(page).toContain('chatGeneration: chatViewGeneration');
});

test('New Request keeps create-ticket error codes narrowly scoped', async () => {
	const newRequest = await Bun.file(new URL('../src/lib/components/NewRequestDialog.svelte', import.meta.url)).text();

	expect(newRequest).toContain('type CreateTicketErrorCode');
	expect(newRequest).toContain('function createTicketErrorMessage(code?: CreateTicketErrorCode)');
	expect(newRequest).not.toContain('TicketApiErrorCode');
});
