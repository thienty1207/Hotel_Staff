import { expect, test } from 'bun:test';
import type { UserLookupOptions } from '../src/lib/client/lookups/api';
import type { LookupUser } from '../src/lib/client/lookups/model';
import { lookupUsersForDepartments } from '../src/lib/client/assign-request';

const user = (id: number, departmentID: number, departmentCode: string): LookupUser => ({
	id,
	full_name: `User ${id}`,
	department_id: departmentID,
	department_code: departmentCode,
	department_name: `${departmentCode} Department`
});

test('zero selected groups uses one bounded all-active user lookup', async () => {
	const calls: UserLookupOptions[] = [];
	const result = await lookupUsersForDepartments([], '  duong  ', async (options) => {
		calls.push(options);
		return [user(1, 3, 'FB')];
	});

	expect(calls).toEqual([{ search: 'duong', limit: 100 }]);
	expect(result).toEqual([user(1, 3, 'FB')]);
});

test('one selected group constrains the user lookup to that department', async () => {
	const calls: UserLookupOptions[] = [];
	await lookupUsersForDepartments([3], 'duong', async (options) => {
		calls.push(options);
		return [user(1, 3, 'FB')];
	});

	expect(calls).toEqual([{ search: 'duong', department_id: 3, limit: 100 }]);
});

test('multiple selected groups query each department and de-duplicate the union', async () => {
	const calls: UserLookupOptions[] = [];
	const result = await lookupUsersForDepartments([3, 8, 3], '', async (options) => {
		calls.push(options);
		return options.department_id === 3 ? [user(1, 3, 'FB'), user(2, 3, 'FB')] : [user(2, 3, 'FB'), user(3, 8, 'FO')];
	});

	expect(calls).toEqual([
		{ search: '', department_id: 3, limit: 100 },
		{ search: '', department_id: 8, limit: 100 }
	]);
	expect(result.map((item) => item.id)).toEqual([1, 2, 3]);
});

test('Assign Request dialog uses the compact tabbed contract', async () => {
	const dialog = await Bun.file(new URL('../src/lib/components/AssignTicketDialog.svelte', import.meta.url)).text();

	expect(dialog).toContain('Assign Request');
	expect(dialog).toContain('Select either to assign the groups or individuals users.');
	expect(dialog).toContain('Groups');
	expect(dialog).toContain('Users');
	expect(dialog).toContain("let activeTab: ActiveTab = $state('groups')");
	expect(dialog).toContain('lookupUsersForDepartments');
	expect(dialog).toContain('Select All');
	expect(dialog).toContain('Clear All');
	expect(dialog).toContain("{submitting ? 'Assigning…' : 'Assign'}");
	expect(dialog).not.toContain('Ticket assignment');
	expect(dialog).not.toContain('Assign ticket');
	expect(dialog).not.toContain('Choose active targets');
	expect(dialog).not.toContain('Save assignment');
	expect(dialog).not.toContain('assign-ticket-lists');
	expect(dialog).not.toContain('authoritativeTicket.title');
});

test('Assign Request search controls stay icon-first and the modal stays compact', async () => {
	const dialog = await Bun.file(new URL('../src/lib/components/AssignTicketDialog.svelte', import.meta.url)).text();
	const styles = await Bun.file(new URL('../src/lib/styles/app.css', import.meta.url)).text();
	const searchShells = [...dialog.matchAll(/<label class="assign-request-search-shell">([\s\S]*?)<\/label>/g)].map((match) => match[1]);

	expect(searchShells).toHaveLength(2);
	expect(dialog).not.toContain('<span class="sr-only">Search groups</span>');
	expect(dialog).not.toContain('<span class="sr-only">Search users</span>');
	expect(dialog).toContain('aria-label="Search groups"');
	expect(dialog).toContain('aria-label="Search users"');
	expect(dialog).toContain('placeholder="Search groups"');
	expect(dialog).toContain('placeholder="Search users"');
	for (const shell of searchShells) {
		expect(shell.indexOf('<svg')).toBeLessThan(shell.indexOf('<input'));
	}

	expect(styles).toContain('width: min(100%, 560px);');
	expect(styles).not.toContain('width: min(100%, 670px);');
	expect(styles).toContain('max-height: min(610px, calc(100dvh - 2rem));');
	expect(styles).not.toContain('max-height: min(760px, calc(100dvh - 2rem));');
	expect(styles).toContain('max-height: min(17rem, 38dvh);');
});

test('Assign Request preserves scoped selection and inactive-assignment behavior', async () => {
	const dialog = await Bun.file(new URL('../src/lib/components/AssignTicketDialog.svelte', import.meta.url)).text();

	expect(dialog).toContain('selectedDepartmentIDs');
	expect(dialog).toContain('selectedUserIDs');
	expect(dialog).toContain('mergeDepartmentOptions');
	expect(dialog).toContain('mergeUserOptions');
	expect(dialog).toContain('inactiveCurrent');
	expect(dialog).toContain('onSubmit(ticketID');
	expect(dialog).toContain('department_ids: [...selectedDepartmentIDs]');
	expect(dialog).toContain('user_ids: [...selectedUserIDs]');
	expect(dialog).toContain('let activeSelectionCount = $derived(activeTab === \'groups\' ? selectedDepartmentIDs.length : selectedUserIDs.length)');
	expect(dialog).toContain('{activeSelectionCount} selected');
});
