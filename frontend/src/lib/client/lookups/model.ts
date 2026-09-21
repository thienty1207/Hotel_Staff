export type LookupDepartment = {
	id: number;
	code: string;
	name: string;
};

export type LookupLocation = {
	id: number;
	code: string | null;
	name: string;
};

export type LookupUser = {
	id: number;
	full_name: string;
	department_id: number;
	department_code: string;
	department_name: string;
};

export type LookupApiErrorKind = 'unauthenticated' | 'retryable';

export class LookupApiError extends Error {
	readonly kind: LookupApiErrorKind;
	readonly status?: number;

	constructor(kind: LookupApiErrorKind, message: string, status?: number) {
		super(message);
		this.name = 'LookupApiError';
		this.kind = kind;
		this.status = status;
	}
}
