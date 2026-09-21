<svelte:options runes={true} />

<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { lookupUsersForDepartments } from '$lib/client/assign-request';
	import { getDepartments } from '$lib/client/lookups/api';
	import { LookupApiError, type LookupDepartment, type LookupUser } from '$lib/client/lookups/model';
	import { getTicket } from '$lib/client/tickets/api';
	import { TicketApiError, type AssignTicketRequest, type TicketSummary } from '$lib/client/tickets/model';

	type Props = {
		open: boolean;
		ticketID: number | null;
		disabled?: boolean;
		onClose: () => void;
		onSubmit: (ticketID: number, request: AssignTicketRequest) => Promise<TicketSummary | undefined>;
	};

	type ActiveTab = 'groups' | 'users';

	type AssignmentDepartmentOption = LookupDepartment & {
		inactiveCurrent: boolean;
	};

	type AssignmentUserOption = Omit<LookupUser, 'department_id' | 'department_name'> & {
		department_id: number | null;
		department_name: string;
		inactiveCurrent: boolean;
	};

	let { open, ticketID, disabled = false, onClose, onSubmit }: Props = $props();

	let authoritativeTicket: TicketSummary | null = $state(null);
	let departments: AssignmentDepartmentOption[] = $state([]);
	let users: AssignmentUserOption[] = $state([]);
	let selectedDepartmentIDs: number[] = $state([]);
	let selectedUserIDs: number[] = $state([]);
	let activeTab: ActiveTab = $state('groups');
	let departmentSearch = $state('');
	let userSearch = $state('');
	let loading = $state(false);
	let loadError = $state('');
	let submitting = $state(false);
	let submitError = $state('');
	let userSearchLoading = $state(false);
	let userSearchError = $state('');
	let loadKey = '';
	let loadSequence = 0;
	let userSearchSequence = 0;
	let userSearchTimer: ReturnType<typeof setTimeout> | undefined;

	let visibleDepartments = $derived(
		departments.filter((department) => {
			const query = departmentSearch.trim().toLocaleLowerCase();
			return !query || department.name.toLocaleLowerCase().includes(query) || department.code.toLocaleLowerCase().includes(query);
		})
	);
	let selectedDepartments = $derived(departments.filter((department) => selectedDepartmentIDs.includes(department.id)));
	let visibleUsers = $derived(
		users.filter((user) => {
			if (selectedDepartmentIDs.length === 0) {
				return true;
			}
			const selectedCodes = new Set(selectedDepartments.map((department) => department.code));
			return user.department_id !== null
				? selectedDepartmentIDs.includes(user.department_id)
				: selectedCodes.has(user.department_code);
		})
	);
	let activeSelectionCount = $derived(activeTab === 'groups' ? selectedDepartmentIDs.length : selectedUserIDs.length);

	$effect(() => {
		const nextKey = open && ticketID !== null ? String(ticketID) : '';
		if (nextKey && nextKey !== loadKey) {
			loadKey = nextKey;
			resetDialogState();
			void loadAssignmentData(ticketID as number, ++loadSequence);
		}
		if (!nextKey) {
			loadKey = '';
		}
	});

	onDestroy(() => {
		if (userSearchTimer) {
			clearTimeout(userSearchTimer);
		}
	});

	function resetDialogState() {
		authoritativeTicket = null;
		departments = [];
		users = [];
		selectedDepartmentIDs = [];
		selectedUserIDs = [];
		activeTab = 'groups';
		departmentSearch = '';
		userSearch = '';
		loading = false;
		loadError = '';
		submitError = '';
		userSearchError = '';
		userSearchLoading = false;
		if (userSearchTimer) {
			clearTimeout(userSearchTimer);
			userSearchTimer = undefined;
		}
		userSearchSequence += 1;
	}

	async function loadAssignmentData(nextTicketID: number, requestSequence: number) {
		loading = true;
		loadError = '';
		try {
			const [nextTicket, nextDepartments] = await Promise.all([getTicket(nextTicketID), getDepartments()]);
			if (!isCurrentLoad(requestSequence, nextTicketID)) {
				return;
			}

			const nextSelectedDepartmentIDs = nextTicket.assigned_departments.map((department) => department.id);
			const nextSelectedUserIDs = nextTicket.assigned_users.map((user) => user.id);
			let nextUsers: LookupUser[] = [];
			try {
				nextUsers = await lookupUsersForDepartments(nextSelectedDepartmentIDs, '', undefined);
			} catch (error) {
				if (error instanceof LookupApiError && error.kind === 'unauthenticated') {
					await goto('/login', { replaceState: true });
					return;
				}
				userSearchError = 'Unable to load users. Please try again.';
			}
			if (!isCurrentLoad(requestSequence, nextTicketID)) {
				return;
			}

			authoritativeTicket = nextTicket;
			const nextDepartmentOptions = mergeDepartmentOptions(nextDepartments, nextTicket.assigned_departments);
			departments = nextDepartmentOptions;
			selectedDepartmentIDs = nextSelectedDepartmentIDs;
			selectedUserIDs = nextSelectedUserIDs;
			users = mergeUserOptions(nextUsers, nextTicket.assigned_users, nextSelectedDepartmentIDs, nextDepartmentOptions);
		} catch (error) {
			if (!isCurrentLoad(requestSequence, nextTicketID)) {
				return;
			}
			if (error instanceof LookupApiError && error.kind === 'unauthenticated') {
				await goto('/login', { replaceState: true });
				return;
			}
			if (error instanceof TicketApiError && error.kind === 'unauthenticated') {
				await goto('/login', { replaceState: true });
				return;
			}
			loadError = 'Unable to load current assignment targets. Please try again.';
		} finally {
			if (isCurrentLoad(requestSequence, nextTicketID)) {
				loading = false;
			}
		}
	}

	function mergeDepartmentOptions(activeDepartments: LookupDepartment[], assignedDepartments: TicketSummary['assigned_departments']): AssignmentDepartmentOption[] {
		const options = new Map<number, AssignmentDepartmentOption>();
		for (const department of activeDepartments) {
			options.set(department.id, { ...department, inactiveCurrent: false });
		}
		for (const department of assignedDepartments) {
			if (!options.has(department.id)) {
				options.set(department.id, { ...department, inactiveCurrent: true });
			}
		}
		return [...options.values()];
	}

	function mergeUserOptions(
		activeUsers: LookupUser[],
		assignedUsers: TicketSummary['assigned_users'],
		allowedDepartmentIDs: number[],
		departmentOptions: LookupDepartment[]
	): AssignmentUserOption[] {
		const options = new Map<number, AssignmentUserOption>();
		const allowedDepartmentCodes = new Set(
			departmentOptions.filter((department) => allowedDepartmentIDs.includes(department.id)).map((department) => department.code)
		);
		for (const user of activeUsers) {
			options.set(user.id, { ...user, inactiveCurrent: false });
		}
		for (const user of assignedUsers) {
			if (!options.has(user.id) && (allowedDepartmentIDs.length === 0 || allowedDepartmentCodes.has(user.department_code))) {
				options.set(user.id, {
					...user,
					department_id: null,
					department_name: 'Current assignment',
					inactiveCurrent: true
				});
			}
		}
		return [...options.values()];
	}

	function isCurrentLoad(requestSequence: number, nextTicketID: number): boolean {
		return open && ticketID === nextTicketID && loadSequence === requestSequence;
	}

	function retryLoad() {
		if (loading || ticketID === null) {
			return;
		}
		loadKey = String(ticketID);
		void loadAssignmentData(ticketID, ++loadSequence);
	}

	function setActiveTab(nextTab: ActiveTab) {
		activeTab = nextTab;
	}

	function toggleDepartment(departmentID: number) {
		const nextDepartmentIDs = selectedDepartmentIDs.includes(departmentID)
			? selectedDepartmentIDs.filter((value) => value !== departmentID)
			: [...selectedDepartmentIDs, departmentID];
		selectedDepartmentIDs = nextDepartmentIDs;
		refreshUsers(nextDepartmentIDs);
	}

	function toggleUser(userID: number) {
		selectedUserIDs = selectedUserIDs.includes(userID)
			? selectedUserIDs.filter((value) => value !== userID)
			: [...selectedUserIDs, userID];
	}

	function selectVisibleDepartments() {
		const next = new Set(selectedDepartmentIDs);
		for (const department of visibleDepartments) {
			next.add(department.id);
		}
		selectedDepartmentIDs = [...next];
		refreshUsers(selectedDepartmentIDs);
	}

	function clearDepartments() {
		selectedDepartmentIDs = [];
		refreshUsers([]);
	}

	function selectVisibleUsers() {
		const next = new Set(selectedUserIDs);
		for (const user of visibleUsers) {
			next.add(user.id);
		}
		selectedUserIDs = [...next];
	}

	function clearUsers() {
		selectedUserIDs = [];
	}

	function scheduleUserSearch(event: Event) {
		userSearch = (event.currentTarget as HTMLInputElement).value;
		if (userSearchTimer) {
			clearTimeout(userSearchTimer);
		}
		userSearchError = '';
		userSearchLoading = true;
		const requestSequence = ++userSearchSequence;
		const selectedDepartmentsAtSearch = [...selectedDepartmentIDs];
		userSearchTimer = setTimeout(() => {
			userSearchTimer = undefined;
			void searchUsers(userSearch, selectedDepartmentsAtSearch, requestSequence);
		}, 180);
	}

	function refreshUsers(departmentIDs: number[]) {
		userSearchLoading = true;
		userSearchError = '';
		const requestSequence = ++userSearchSequence;
		void searchUsers(userSearch, [...departmentIDs], requestSequence);
	}

	async function searchUsers(query: string, departmentIDs: number[], requestSequence: number) {
		try {
			const nextUsers = await lookupUsersForDepartments(departmentIDs, query, undefined);
			if (requestSequence !== userSearchSequence || !open) {
				return;
			}
			users = mergeUserOptions(nextUsers, authoritativeTicket?.assigned_users ?? [], departmentIDs, departments);
		} catch (error) {
			if (requestSequence !== userSearchSequence || !open) {
				return;
			}
			if (error instanceof LookupApiError && error.kind === 'unauthenticated') {
				await goto('/login', { replaceState: true });
				return;
			}
			userSearchError = 'Unable to search users. Please try again.';
		} finally {
			if (requestSequence === userSearchSequence) {
				userSearchLoading = false;
			}
		}
	}

	function retryUserSearch() {
		if (userSearchLoading) {
			return;
		}
		refreshUsers(selectedDepartmentIDs);
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (disabled || submitting || loading || ticketID === null || authoritativeTicket === null) {
			return;
		}
		submitting = true;
		submitError = '';
		try {
			const result = await onSubmit(ticketID, {
				department_ids: [...selectedDepartmentIDs],
				user_ids: [...selectedUserIDs]
			});
			if (result) {
				onClose();
			}
		} catch (error) {
			if (error instanceof TicketApiError && error.kind === 'unauthenticated') {
				return;
			}
			submitError = 'Unable to update assignment. Please review the error and try again.';
		} finally {
			submitting = false;
		}
	}

	function handleClose() {
		if (!submitting) {
			onClose();
		}
	}
</script>

{#if open}
	<button class="assign-request-backdrop" type="button" aria-label="Close assignment dialog" onclick={handleClose}></button>
	<div class="assign-request-dialog" role="dialog" aria-modal="true" aria-labelledby="assign-request-title">
		<section class="assign-request-panel">
			<header class="assign-request-header">
				<div>
					<h2 id="assign-request-title">Assign Request</h2>
					<p>Select either to assign the groups or individuals users.</p>
				</div>
				<button class="assign-request-close" type="button" aria-label="Close assignment dialog" disabled={submitting} onclick={handleClose}>×</button>
			</header>

			{#if loading}
				<p class="assign-request-status" role="status" aria-live="polite">Loading groups…</p>
			{:else if loadError}
				<div class="assign-request-error" role="alert" aria-live="assertive">
					<span>{loadError}</span>
					<button class="secondary-button" type="button" onclick={retryLoad}>Retry</button>
				</div>
			{:else if authoritativeTicket}
				<form class="assign-request-form" onsubmit={handleSubmit} aria-busy={submitting}>
					<div class="assign-request-tabs" role="tablist" aria-label="Assignment target type">
						<button class:active={activeTab === 'groups'} class="assign-request-tab" type="button" role="tab" aria-selected={activeTab === 'groups'} aria-controls="assign-request-groups" onclick={() => setActiveTab('groups')}>
							<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7h10M7 12h10M7 17h10" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" /><circle cx="4" cy="7" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="17" r="1" fill="currentColor" /></svg>
							<span>Groups</span>
						</button>
						<button class:active={activeTab === 'users'} class="assign-request-tab" type="button" role="tab" aria-selected={activeTab === 'users'} aria-controls="assign-request-users" onclick={() => setActiveTab('users')}>
							<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.7" /><path d="M5.5 20c.8-3 2.9-4.5 6.5-4.5s5.7 1.5 6.5 4.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.7" /></svg>
							<span>Users</span>
						</button>
					</div>

					{#if activeTab === 'groups'}
						<section id="assign-request-groups" class="assign-request-view" aria-label="Groups">
							<div class="assign-request-toolbar">
								<label class="assign-request-search-shell">
									<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.7" /><path d="m16 16 4.5 4.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.7" /></svg>
									<input type="search" aria-label="Search groups" placeholder="Search groups" value={departmentSearch} oninput={(event) => (departmentSearch = (event.currentTarget as HTMLInputElement).value)} disabled={submitting} />
								</label>
								<div class="assign-request-toolbar-actions">
									<button class="assign-request-link" type="button" disabled={submitting || visibleDepartments.length === 0} onclick={selectVisibleDepartments}>Select All</button>
									<button class="assign-request-link danger" type="button" disabled={submitting || selectedDepartmentIDs.length === 0} onclick={clearDepartments}>Clear All</button>
								</div>
							</div>

							{#if visibleDepartments.length === 0}
								<p class="assign-request-empty">No groups found.</p>
							{:else}
								<div class="assign-request-list" role="group" aria-label="Groups to assign">
									{#each visibleDepartments as department (department.id)}
										<label class:assign-request-option-selected={selectedDepartmentIDs.includes(department.id)} class:assign-request-option-inactive={department.inactiveCurrent} class="assign-request-option">
											<input type="checkbox" checked={selectedDepartmentIDs.includes(department.id)} onchange={() => toggleDepartment(department.id)} disabled={submitting} />
											<span>{department.name}{department.inactiveCurrent ? ' (Inactive)' : ''}</span>
										</label>
									{/each}
								</div>
							{/if}
						</section>
					{:else}
						<section id="assign-request-users" class="assign-request-view" aria-label="Users">
							{#if selectedDepartments.length > 0}
								<div class="assign-request-filter-chips" aria-label="Selected group filters">
									{#each selectedDepartments as department (department.id)}
										<button class="assign-request-filter-chip" type="button" aria-label={`Remove ${department.name} filter`} onclick={() => toggleDepartment(department.id)}>{department.name} ×</button>
									{/each}
								</div>
							{/if}

							<div class="assign-request-toolbar">
								<label class="assign-request-search-shell">
									<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.7" /><path d="m16 16 4.5 4.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.7" /></svg>
									<input type="search" aria-label="Search users" placeholder="Search users" value={userSearch} oninput={scheduleUserSearch} disabled={submitting} />
								</label>
								<div class="assign-request-toolbar-actions">
									<button class="assign-request-link" type="button" disabled={submitting || visibleUsers.length === 0} onclick={selectVisibleUsers}>Select All</button>
									<button class="assign-request-link danger" type="button" disabled={submitting || selectedUserIDs.length === 0} onclick={clearUsers}>Clear All</button>
								</div>
							</div>

							{#if userSearchLoading}
								<p class="assign-request-empty" role="status">Loading users…</p>
							{:else if userSearchError}
								<div class="assign-request-inline-error" role="alert">
									<span>{userSearchError}</span>
									<button class="secondary-button" type="button" onclick={retryUserSearch}>Retry</button>
								</div>
							{:else if visibleUsers.length === 0}
								<p class="assign-request-empty">No users found.</p>
							{:else}
								<div class="assign-request-list" role="group" aria-label="Users to assign">
									{#each visibleUsers as staff (staff.id)}
										<label class:assign-request-option-selected={selectedUserIDs.includes(staff.id)} class:assign-request-option-inactive={staff.inactiveCurrent} class="assign-request-option">
											<input type="checkbox" checked={selectedUserIDs.includes(staff.id)} onchange={() => toggleUser(staff.id)} disabled={submitting} />
											<span>{staff.full_name} ({staff.department_code}){staff.inactiveCurrent ? ' (Inactive)' : ''}</span>
										</label>
									{/each}
								</div>
							{/if}
						</section>
					{/if}

					{#if submitError}<p class="assign-request-error" role="alert" aria-live="assertive">{submitError}</p>{/if}

					<footer class="assign-request-footer">
						<span class="assign-request-count">{activeSelectionCount} selected</span>
						<div class="assign-request-footer-actions">
							<button class="secondary-button" type="button" disabled={submitting} onclick={handleClose}>Cancel</button>
							<button class="primary-button" type="submit" disabled={submitting}>{submitting ? 'Assigning…' : 'Assign'}</button>
						</div>
					</footer>
				</form>
			{/if}
		</section>
	</div>
{/if}
