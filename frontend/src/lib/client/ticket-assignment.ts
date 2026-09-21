import { assignTicket } from './tickets/api';
import { TicketApiError, type AssignTicketRequest, type TicketSummary, type TicketView } from './tickets/model';

export type AssignmentOrigin = 'row' | 'chat';

export type AssignmentViewContext = {
	listSequence: number;
	listView: TicketView;
	chatGeneration: number;
	chatOpen: boolean;
	selectedTicketID: number | null;
};

export type AssignmentMutationRequest = AssignmentViewContext & {
	ticketID: number;
	origin: AssignmentOrigin;
	assignment: AssignTicketRequest;
};

export type TicketAssignmentApi = {
	assignTicket: (ticketID: number, request: AssignTicketRequest) => Promise<TicketSummary>;
};

export type TicketAssignmentCallbacks = {
	getCurrentTicket: (ticketID: number, origin: AssignmentOrigin) => TicketSummary | null;
	getView: () => AssignmentViewContext;
	patchList: (ticket: TicketSummary) => void;
	updateChat: (ticket: TicketSummary) => void;
	setError: (ticketID: number, message: string, retryable: boolean) => void;
	clearError: (ticketID: number) => void;
	onUnauthenticated: (request: AssignmentMutationRequest) => void | Promise<void>;
	onInFlightChange: (ticketID: number, inFlight: boolean) => void;
};

export class TicketAssignmentController {
	private readonly api: TicketAssignmentApi;
	private readonly inFlightTicketIDs = new Set<number>();

	constructor(api: Partial<TicketAssignmentApi> = {}) {
		this.api = {
			assignTicket: api.assignTicket ?? assignTicket
		};
	}

	isInFlight(ticketID: number): boolean {
		return this.inFlightTicketIDs.has(ticketID);
	}

	async assignTicketByID(
		ticketID: number,
		assignment: AssignTicketRequest,
		origin: AssignmentOrigin,
		callbacks: TicketAssignmentCallbacks
	): Promise<TicketSummary | undefined> {
		if (this.inFlightTicketIDs.has(ticketID)) {
			return undefined;
		}

		const currentTicket = callbacks.getCurrentTicket(ticketID, origin);
		if (!currentTicket || currentTicket.id !== ticketID || currentTicket.status === 'closed') {
			return undefined;
		}

		const request: AssignmentMutationRequest = {
			...callbacks.getView(),
			ticketID,
			origin,
			assignment
		};
		this.inFlightTicketIDs.add(ticketID);
		callbacks.onInFlightChange(ticketID, true);
		callbacks.clearError(ticketID);

		try {
			const updatedTicket = await this.api.assignTicket(ticketID, assignment);
			this.applyTicketResult(request, updatedTicket, callbacks);
			return updatedTicket;
		} catch (error) {
			if (error instanceof TicketApiError && error.kind === 'unauthenticated') {
				await callbacks.onUnauthenticated(request);
				throw error;
			}

			if (this.isRequestCurrent(request, callbacks.getView())) {
				callbacks.setError(
					ticketID,
					error instanceof TicketApiError && error.kind === 'closed'
						? 'This ticket is already closed.'
						: error instanceof TicketApiError && error.kind === 'not_found'
							? 'Ticket not found. It may have been removed.'
							: 'Unable to update ticket assignment. Please try again.',
					error instanceof TicketApiError && error.kind !== 'not_found' && error.kind !== 'closed'
				);
			}
			throw error;
		} finally {
			this.inFlightTicketIDs.delete(ticketID);
			callbacks.onInFlightChange(ticketID, false);
		}
	}

	private applyTicketResult(
		request: AssignmentMutationRequest,
		updatedTicket: TicketSummary,
		callbacks: TicketAssignmentCallbacks
	): void {
		const view = callbacks.getView();
		if (this.isListCurrent(request, view)) {
			callbacks.patchList(updatedTicket);
		}
		if (this.isChatCurrent(request, view)) {
			callbacks.updateChat(updatedTicket);
		}
		if (this.isRequestCurrent(request, view)) {
			callbacks.clearError(request.ticketID);
		}
	}

	private isRequestCurrent(request: AssignmentMutationRequest, view: AssignmentViewContext): boolean {
		return this.isListCurrent(request, view) || this.isChatCurrent(request, view);
	}

	private isListCurrent(request: AssignmentMutationRequest, view: AssignmentViewContext): boolean {
		return request.listSequence === view.listSequence && request.listView === view.listView;
	}

	private isChatCurrent(request: AssignmentMutationRequest, view: AssignmentViewContext): boolean {
		return (
			request.chatGeneration === view.chatGeneration &&
			view.chatOpen &&
			view.selectedTicketID === request.ticketID
		);
	}
}
