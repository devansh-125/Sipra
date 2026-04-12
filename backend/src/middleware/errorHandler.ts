export function notFoundHandler(req, res) {
	res.status(404).json({
		error: 'Not Found',
		message: `Route ${req.method} ${req.originalUrl} does not exist`
	});
}

export function errorHandler(err, req, res, next) {
	const statusCode = err.statusCode || 500;

	if (process.env.NODE_ENV !== 'test') {
		console.error('API Error:', err);
	}

	res.status(statusCode).json({
		error: err.name || 'InternalServerError',
		message: err.message || 'Something went wrong'
	});
}
