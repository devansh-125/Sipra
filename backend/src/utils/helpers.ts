export function generateTrackingNumber(prefix = 'TRK') {
	const ts = Date.now().toString(36).toUpperCase();
	const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
	return `${prefix}-${ts}-${rand}`;
}

type PaginationQuery = {
	limit?: string | number | null;
	offset?: string | number | null;
};

function toOptionalString(value: unknown): string | undefined {
	if (typeof value === 'string') {
		return value;
	}

	if (typeof value === 'number') {
		return String(value);
	}

	return undefined;
}

export function parsePagination(query: PaginationQuery = {}) {
	const parsedLimit = Number.parseInt(toOptionalString(query.limit) ?? '', 10);
	const parsedOffset = Number.parseInt(toOptionalString(query.offset) ?? '', 10);

	const limit = Number.isNaN(parsedLimit) ? 25 : Math.min(Math.max(parsedLimit, 1), 100);
	const offset = Number.isNaN(parsedOffset) ? 0 : Math.max(parsedOffset, 0);

	return { limit, offset };
}
