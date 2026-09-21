<svelte:options runes={true} />

<script lang="ts">
	import type { TicketChatState } from '$lib/client/ticket-chat-state';
	import type { TicketIdentity, TicketSummary } from '$lib/client/tickets/model';

	type TicketTimestamp = {
		date: string;
		time: string;
	};

	type Props = {
		state: TicketChatState;
		formatTimestamp: (value: string | null) => TicketTimestamp | null;
		onClose: () => void;
		onRetry: () => void;
		onAccept: () => void;
		onRetryAccept: () => void;
		onAssign: () => void;
		acceptInFlight: boolean;
		assignInFlight: boolean;
		acceptErrorMessage: string;
		acceptRetryable: boolean;
	};

	let {
		state,
		formatTimestamp,
		onClose,
		onRetry,
		onAccept,
		onRetryAccept,
		onAssign,
		acceptInFlight,
		assignInFlight,
		acceptErrorMessage,
		acceptRetryable
	}: Props = $props();

	function identityLabel(identity: TicketIdentity | null): string {
		if (!identity) {
			return '—';
		}
		return identity.department_code ? `${identity.full_name} (${identity.department_code})` : identity.full_name;
	}

	function statusLabel(status: TicketSummary['status']): string {
		return status[0].toUpperCase() + status.slice(1);
	}

	function locationLabel(location: TicketSummary['location']): string {
		return location?.name || '—';
	}

	function timestampDate(value: string | null): string {
		return formatTimestamp(value)?.date ?? '—';
	}

	function timestampTime(value: string | null): string | null {
		return formatTimestamp(value)?.time ?? null;
	}

	function summaryTimestamp(value: string | null): string {
		if (!value) {
			return '—';
		}

		const date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			return '—';
		}

		const month = date.toLocaleString('en-US', { month: 'short' });
		return `${month}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
	}

</script>

<section class="ticket-chat" aria-labelledby="ticket-chat-heading">
	<header class="ticket-chat-header">
		<h2 id="ticket-chat-heading">Chat</h2>
		<button class="secondary-button ticket-chat-close" type="button" aria-label="Close Chat" onclick={onClose}>×</button>
	</header>

	{#if state.ticket}
		<div class="ticket-chat-summary">
			<div class="ticket-chat-summary-heading">
				<div class="ticket-chat-title-row">
					<svg class="ticket-chat-monitor-icon" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
						<rect x="3" y="4" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" />
						<path d="M9 20h6M12 16v4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6" />
					</svg>
					<h3 class="ticket-chat-title">
						<span class:ticket-title-priority={state.ticket.priority}>{state.ticket.title}</span>
					</h3>
				</div>
				<span
					class:accepted={state.ticket.status === 'accepted'}
					class:closed={state.ticket.status === 'closed'}
					class="status-badge"
				>
					{statusLabel(state.ticket.status)}
				</span>
			</div>

			<div class="ticket-chat-summary-meta">
				<div class="ticket-chat-summary-line">
					<strong class="ticket-chat-summary-value">{identityLabel(state.ticket.requester)}</strong>
					{#if state.ticket.accepted_by}<span class="ticket-chat-summary-owner">by {identityLabel(state.ticket.accepted_by)}</span>{/if}
				</div>
				<div class="ticket-chat-summary-line">
					<strong class="ticket-chat-summary-value ticket-chat-summary-location">{locationLabel(state.ticket.location)}</strong>
					<time class="ticket-chat-summary-created" datetime={state.ticket.created_at}>{summaryTimestamp(state.ticket.created_at)}</time>
				</div>
			</div>
		</div>
	{:else if state.status === 'loading'}
		<div class="ticket-chat-summary ticket-chat-summary-loading" role="status" aria-live="polite">
			<p>Loading selected ticket…</p>
		</div>
	{/if}

	<div class="ticket-chat-tabs" role="tablist" aria-label="Ticket conversation sections">
		<button class="ticket-chat-tab active" type="button" role="tab" aria-selected="true">Chats</button>
		<button class="ticket-chat-tab" type="button" role="tab" aria-selected="false" aria-disabled="true" disabled>Checklist</button>
	</div>

	<section class="ticket-chat-conversation" role="log" aria-label="Ticket conversation" aria-live="polite" aria-busy={state.status === 'loading'}>
		{#if state.status === 'loading'}
			<p class="ticket-chat-status" role="status">Loading ticket…</p>
		{:else if state.status === 'error' || state.status === 'not_found'}
			<div class="ticket-chat-status" role="alert" aria-live="assertive">
				<p>{state.status === 'not_found' ? 'Ticket not found.' : state.errorMessage}</p>
				{#if state.status === 'error'}
					<button class="secondary-button" type="button" onclick={onRetry}>Retry</button>
				{/if}
			</div>
		{:else if state.ticket}
			<article class="ticket-chat-event ticket-chat-event-created">
				<div class="ticket-chat-event-heading">
					<div class="ticket-chat-event-copy">
						<strong>{identityLabel(state.ticket.requester)}</strong>
						<p>has created a new request</p>
					</div>
					<time datetime={state.ticket.created_at}>
						<span>{timestampDate(state.ticket.created_at)}</span>
						{#if timestampTime(state.ticket.created_at)}<span>{timestampTime(state.ticket.created_at)}</span>{/if}
					</time>
				</div>
				<div class="ticket-chat-event-body">
					<p>Location: {locationLabel(state.ticket.location)}</p>
					<p>Title: {state.ticket.title}</p>
					{#if state.ticket.description?.trim()}<p>{state.ticket.description.trim()}</p>{/if}
				</div>
			</article>

			{#if state.ticket.accepted_by && state.ticket.accepted_at}
				<article class="ticket-chat-event ticket-chat-event-accepted">
					<div class="ticket-chat-event-heading">
						<span class="ticket-chat-event-icon" aria-hidden="true">✓</span>
						<strong>Accepted by {identityLabel(state.ticket.accepted_by)}</strong>
						<time datetime={state.ticket.accepted_at}>
							<span>{timestampDate(state.ticket.accepted_at)}</span>
							{#if timestampTime(state.ticket.accepted_at)}<span>{timestampTime(state.ticket.accepted_at)}</span>{/if}
						</time>
					</div>
				</article>
			{/if}
		{/if}
	</section>

	<div class="ticket-chat-composer" aria-disabled="true">
		<button class="ticket-chat-icon-button" type="button" aria-label="Attach file" aria-disabled="true" disabled>📎</button>
		<button class="ticket-chat-icon-button" type="button" aria-label="Voice message" aria-disabled="true" disabled>🎤</button>
		<span class="ticket-chat-composer-input" role="textbox" aria-readonly="true" aria-disabled="true">Type a message</span>
		<button class="ticket-chat-icon-button" type="button" aria-label="More message options" aria-disabled="true" disabled>⋮</button>
	</div>

	{#if acceptErrorMessage}
		<div class="ticket-chat-action-error" role="alert" aria-live="assertive">
			<span>{acceptErrorMessage}</span>
			{#if acceptRetryable}
				<button class="secondary-button" type="button" disabled={acceptInFlight} onclick={onRetryAccept}>Retry</button>
			{/if}
		</div>
	{/if}

	<div class="ticket-chat-actions" aria-label="Ticket actions">
		<button
			class="secondary-button ticket-action-button ticket-action-accept"
			type="button"
			disabled={!state.ticket || state.ticket.status !== 'pending' || acceptInFlight}
			aria-busy={acceptInFlight}
			onclick={onAccept}
		>
			{acceptInFlight ? 'Accepting…' : 'Accept'}
		</button>
		<button
			class="secondary-button ticket-action-button ticket-action-assign"
			type="button"
			disabled={!state.ticket || state.ticket.status === 'closed' || assignInFlight}
			aria-busy={assignInFlight}
			onclick={onAssign}
		>
			{assignInFlight ? 'Assigning…' : 'Assign'}
		</button>
		<button class="secondary-button ticket-action-button ticket-action-close" type="button" aria-disabled="true" disabled>Close</button>
	</div>
</section>
