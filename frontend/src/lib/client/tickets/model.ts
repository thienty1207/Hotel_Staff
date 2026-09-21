export type TicketView = 'open' | 'closed';

export type TicketIdentity = {
	id: number;
	full_name: string;
	department_code: string;
};

export type TicketDepartment = {
	id: number;
	code: string;
	name: string;
};

export type TicketLocation = TicketDepartment;

export type TicketSummary = {
	id: number;
	title: string;
	description: string | null;
	status: 'pending' | 'accepted' | 'closed';
	priority: boolean;
	due_at: string | null;
	created_at: string;
	updated_at: string;
	requester: TicketIdentity;
	department: TicketDepartment;
	location: TicketLocation | null;
	accepted_by: TicketIdentity | null;
	accepted_at: string | null;
	assigned_departments: TicketDepartment[];
	assigned_users: TicketIdentity[];
	closed_at: string | null;
};

export type TicketListPage = {
	has_more: boolean;
	next_before_created_at: string | null;
	next_before_id: number | null;
};

export type TicketListResponse = {
	tickets: TicketSummary[];
	page: TicketListPage;
};

export type CreateTicketRequest = {
	department_id: number;
	location_id: number | null;
	title: string;
	description: string | null;
	priority: boolean;
	due_at: string | null;
};

export type AssignTicketRequest = {
	department_ids: number[];
	user_ids: number[];
};

export type TicketCursor = {
	before_created_at: string;
	before_id: number;
};

export type TicketApiErrorKind =
	| 'invalid_input'
	| 'unauthenticated'
	| 'not_found'
	| 'already_accepted'
	| 'closed'
	| 'retryable';

export type CreateTicketErrorCode = 'department_unavailable' | 'location_unavailable' | 'invalid_request';

export type TicketDetailErrorCode = 'ticket_not_found';

export type AcceptTicketErrorCode = 'ticket_already_accepted' | 'ticket_closed';

export type AssignTicketErrorCode =
	| 'department_unavailable'
	| 'user_unavailable'
	| 'ticket_closed'
	| 'ticket_not_found'
	| 'invalid_request';

export type TicketApiErrorCode =
	| CreateTicketErrorCode
	| TicketDetailErrorCode
	| AcceptTicketErrorCode
	| AssignTicketErrorCode
	| 'unauthenticated';

export class TicketApiError extends Error {
	readonly kind: TicketApiErrorKind;
	readonly status?: number;
	readonly code?: TicketApiErrorCode;

	constructor(kind: TicketApiErrorKind, message: string, status?: number, code?: TicketApiErrorCode) {
		super(message);
		this.name = 'TicketApiError';
		this.kind = kind;
		this.status = status;
		this.code = code;
	}
}
