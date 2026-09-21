<svelte:options runes={true} />

<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { getDepartments, getUsers } from '$lib/client/lookups/api';
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

	let { open, ticketID, disabled = false, onClose, onSubmit }: Props = $props();

	let authoritativeTicket: TicketSummary | null = $state(null);
	let departments: LookupDepartment[] = $state([]);
	let users: LookupUser[] = $state([]);
	let selectedDepartmentIDs: number[] = $state([]);
	let selectedUserIDs: number[] = $state([]);
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
			const [nextTicket, nextDepartments, nextUsers] = await Promise.all([
				getTicket(nextTicketID),
				getDepartments(),
				getUsers({ limit: 100 })
			]);
			if (!isCurrentLoad(requestSequence, nextTicketID)) {
				return;
			}
			authoritativeTicket = nextTicket;
			departments = nextDepartments;
			users = nextUsers;
			selectedDepartmentIDs = nextTicket.assigned_departments.map((department) => department.id);
			selectedUserIDs = nextTicket.assigned_users.map((user) => user.id);
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

	function toggleDepartment(departmentID: number) {
		selectedDepartmentIDs = selectedDepartmentIDs.includes(departmentID)
			? selectedDepartmentIDs.filter((value) => value !== departmentID)
			: [...selectedDepartmentIDs, departmentID];
	}

	function toggleUser(userID: number) {
		selectedUserIDs = selectedUserIDs.includes(userID)
			? selectedUserIDs.filter((value) => value !== userID)
			: [...selectedUserIDs, userID];
	}

	function scheduleUserSearch(event: Event) {
		userSearch = (event.currentTarget as HTMLInputElement).value;
		if (userSearchTimer) {
			clearTimeout(userSearchTimer);
		}
		userSearchError = '';
		userSearchLoading = true;
		const requestSequence = ++userSearchSequence;
		userSearchTimer = setTimeout(() => {
			userSearchTimer = undefined;
			void searchUsers(userSearch, requestSequence);
		}, 180);
	}

	async function searchUsers(query: string, requestSequence: number) {
		try {
			const nextUsers = await getUsers({ search: query.trim(), limit: 100 });
			if (requestSequence !== userSearchSequence || !open) {
				return;
			}
			users = nextUsers;
		} catch (error) {
			if (requestSequence !== userSearchSequence || !open) {
				return;
			}
			if (error instanceof LookupApiError && error.kind === 'unauthenticated') {
				await goto('/login', { replaceState: true });
				return;
			}
			userSearchError = 'Unable to search staff. Please try again.';
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
		userSearchLoading = true;
		userSearchError = '';
		const requestSequence = ++userSearchSequence;
		void searchUsers(userSearch, requestSequence);
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
	<button class="assign-ticket-backdrop" type="button" aria-label="Close assignment dialog" onclick={handleClose}></button>
	<div class="assign-ticket-dialog" role="dialog" aria-modal="true" aria-labelledby="assign-ticket-title">
		<section class="assign-ticket-panel">
			<header class="assign-ticket-header">
				<div>
					<p class="eyebrow">Ticket assignment</p>
					<h2 id="assign-ticket-title">Assign ticket</h2>
				</div>
				<button class="assign-ticket-close" type="button" aria-label="Close assignment dialog" disabled={submitting} onclick={handleClose}>×</button>
			</header>

			{#if loading}
				<p class="assign-ticket-status" role="status" aria-live="polite">Loading current assignment targets…</p>
			{:else if loadError}
				<div class="assign-ticket-error" role="alert" aria-live="assertive">
					<span>{loadError}</span>
					<button class="secondary-button" type="button" onclick={retryLoad}>Retry</button>
				</div>
			{:else if authoritativeTicket}
				<form class="assign-ticket-form" onsubmit={handleSubmit} aria-busy={submitting}>
					<p class="assign-ticket-context"><strong>{authoritativeTicket.title}</strong><span>Choose active departments and staff members.</span></p>

					<div class="assign-ticket-lists">
						<fieldset class="assign-ticket-list-group">
							<legend>Departments</legend>
							<div class="assign-ticket-options" role="group" aria-label="Departments to assign">
								{#if departments.length === 0}
									<p class="assign-ticket-empty">No active departments are available.</p>
								{:else}
									{#each departments as department (department.id)}
										<label class="assign-ticket-option">
											<input type="checkbox" checked={selectedDepartmentIDs.includes(department.id)} onchange={() => toggleDepartment(department.id)} disabled={submitting} />
											<span><strong>{department.name}</strong><small>{department.code}</small></span>
										</label>
									{/each}
								{/if}
							</div>
						</fieldset>

						<fieldset class="assign-ticket-list-group">
							<legend>Staff members</legend>
							<input class="assign-ticket-search" type="search" placeholder="Search staff" value={userSearch} oninput={scheduleUserSearch} disabled={submitting} />
							<div class="assign-ticket-options" role="group" aria-label="Staff members to assign">
								{#if userSearchLoading}
									<p class="assign-ticket-empty" role="status">Searching…</p>
								{:else if userSearchError}
									<div class="assign-ticket-inline-error" role="alert">
										<span>{userSearchError}</span>
										<button class="secondary-button" type="button" onclick={retryUserSearch}>Retry</button>
									</div>
								{:else if users.length === 0}
									<p class="assign-ticket-empty">No active staff members found.</p>
								{:else}
									{#each users as staff (staff.id)}
										<label class="assign-ticket-option">
											<input type="checkbox" checked={selectedUserIDs.includes(staff.id)} onchange={() => toggleUser(staff.id)} disabled={submitting} />
											<span><strong>{staff.full_name}</strong><small>{staff.department_name} · {staff.department_code}</small></span>
										</label>
									{/each}
								{/if}
							</div>
						</fieldset>
					</div>

					{#if submitError}<p class="assign-ticket-error" role="alert" aria-live="assertive">{submitError}</p>{/if}

					<div class="assign-ticket-actions">
						<button class="secondary-button" type="button" disabled={submitting} onclick={handleClose}>Cancel</button>
						<button class="primary-button" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save assignment'}</button>
					</div>
				</form>
			{/if}
		</section>
	</div>
{/if}
