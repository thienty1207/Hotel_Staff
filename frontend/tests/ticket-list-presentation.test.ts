import { expect, test } from 'bun:test';

const pagePath = new URL('../src/routes/+page.svelte', import.meta.url);
const stylesPath = new URL('../src/lib/styles/app.css', import.meta.url);

function styleBlock(styles: string, selector: string): string {
	const start = styles.indexOf(selector);
	if (start < 0) {
		return '';
	}
	const end = styles.indexOf('}', start);
	return end < 0 ? styles.slice(start) : styles.slice(start, end + 1);
}

test('desktop ticket columns follow the approved business hierarchy', async () => {
	const page = await Bun.file(pagePath).text();
	const columns = [...page.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((match) => match[1].trim());

	expect(columns).toEqual(['Requester', 'Location', 'Title', 'Description', 'Status', 'Owner', 'Created On', 'Due Date', 'Action']);
	expect(page).not.toContain('ticket-id');
	expect(page).not.toContain('<th scope="col">Assignment</th>');
	expect(page).not.toContain('<th scope="col">Department</th>');
	expect(page).toContain('<th scope="col">Action</th>');
});

test('ticket list renders real descriptions and accepted_by owner labels', async () => {
	const page = await Bun.file(pagePath).text();
	const styles = await Bun.file(stylesPath).text();

	expect(page).toContain('ticket.description');
	expect(page).toContain('ticket.accepted_by');
	expect(page).toContain('identityLabel');
	expect(page).toContain('ticket-description');
	expect(styles).toContain('-webkit-line-clamp: 2');

	expect(page).toContain('ticket-due-cell');
	expect(page).toContain('ticket.priority');
});

test('mobile ticket list uses a compact summary without legacy stacked fields', async () => {
	const page = await Bun.file(pagePath).text();

	expect(page).toContain('ticket-card-meta');
	expect(page).toContain('ticket-card-description');
	expect(page).not.toContain('ticket-card-details');
	expect(page).not.toContain('<dt>Department</dt>');
	expect(page).not.toContain('<dt>Assignment</dt>');
	expect(page).not.toContain('Ticket Detail');
	expect(page).not.toContain('href="/tickets');
});

test('ticket list splits timestamps and styles priority titles without a badge', async () => {
	const page = await Bun.file(pagePath).text();
	const styles = await Bun.file(stylesPath).text();

	expect(page).toContain('ticket-timestamp');
	expect(page).toContain('ticket-timestamp-date');
	expect(page).toContain('ticket-timestamp-time');
	expect(page).toContain('—');
	expect(page).toContain('class:ticket-title-priority={ticket.priority}');
	expect(page).not.toContain('class="priority-badge"');
	expect(page).not.toContain('>Priority</span>');
	expect(styles).toContain('.ticket-title-priority');
	const priorityStart = styles.indexOf('.ticket-title-priority');
	const priorityEnd = styles.indexOf('}', priorityStart);
	const priorityStyles = styles.slice(priorityStart, priorityEnd);
	expect(priorityStyles).not.toContain('border: 1px solid var(--danger)');
	expect(priorityStyles).toContain('display: inline-block');
	expect(priorityStyles).toContain('width: fit-content');
	expect(priorityStyles).toContain('max-width: 100%');
	expect(priorityStyles).toContain('box-sizing: border-box');
	expect(priorityStyles).toContain('background:');
	expect(priorityStyles).toContain('overflow: hidden');
	expect(priorityStyles).toContain('text-overflow: ellipsis');
	expect(priorityStyles).toContain('white-space: nowrap');
	expect(priorityStyles).toContain('font-weight: inherit');
	expect(priorityStyles).not.toContain('color: var(--danger)');
});

test('desktop ticket actions stay on one horizontal row', async () => {
	const styles = await Bun.file(stylesPath).text();
	const actionStart = styles.indexOf('.ticket-row-actions');
	const actionEnd = styles.indexOf('}', actionStart);
	const actionStyles = styles.slice(actionStart, actionEnd);
	const errorStart = styles.indexOf('.ticket-row-action-error');
	const errorEnd = styles.indexOf('}', errorStart);
	const errorStyles = styles.slice(errorStart, errorEnd);

	expect(actionStyles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
	expect(errorStyles).toContain('grid-column: 1 / -1;');
});

test('desktop ticket actions use shared semantic colors and isolate row activation', async () => {
	const page = await Bun.file(pagePath).text();
	const styles = await Bun.file(stylesPath).text();
	const tableStart = page.indexOf('<div class="desktop-ticket-table">');
	const tableEnd = page.indexOf('<div class="mobile-ticket-cards">', tableStart);
	const table = page.slice(tableStart, tableEnd);
	const actionButtonStyles = styleBlock(styles, '.ticket-action-button {');
	const disabledActionStyles = styleBlock(styles, '.ticket-action-button:disabled {');

	expect(table).toMatch(/class="[^"]*ticket-action-button[^"]*ticket-action-accept[^"]*"/);
	expect(table).toMatch(/class="[^"]*ticket-action-button[^"]*ticket-action-assign[^"]*"/);
	expect(table).toMatch(/class="[^"]*ticket-action-button[^"]*ticket-action-close[^"]*"/);
	expect(table).toContain('<td class="ticket-actions-cell" onclick={handleRowAction}>');
	expect(table).toMatch(/ticket-action-assign[\s\S]*?handleRowAssign\(event, ticket\.id\)/);
	expect(table).toMatch(/ticket-action-close[\s\S]*?aria-disabled="true"[\s\S]*?disabled/);

	expect(actionButtonStyles).toContain('display: inline-flex;');
	expect(actionButtonStyles).toContain('white-space: nowrap;');
	expect(disabledActionStyles).toContain('cursor: default;');
	expect(disabledActionStyles).toContain('opacity: 1;');
	expect(styles).toContain('.ticket-action-accept {');
	expect(styles).toContain('.ticket-action-assign {');
	expect(styles).toContain('.ticket-action-close {');
	expect(styles).toContain(":root[data-theme='dark'] .ticket-action-accept {");
	expect(styles).toContain(":root[data-theme='dark'] .ticket-action-assign {");
	expect(styles).toContain(":root[data-theme='dark'] .ticket-action-close {");
	expect(styles).toContain('.ticket-row-actions .ticket-action-button {');
	expect(styles).toContain('width: 100%;');
});
