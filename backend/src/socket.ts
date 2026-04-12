import { Server } from 'socket.io';

let io;

export function initSocket(httpServer) {
	io = new Server(httpServer, {
		cors: {
			origin: '*',
			methods: ['GET', 'POST', 'PATCH']
		}
	});

	io.on('connection', (socket) => {
		console.log('Client connected:', socket.id);

		socket.on('disconnect', () => {
			console.log('Client disconnected:', socket.id);
		});
	});

	return io;
}

export function emitSocketEvent(eventName, payload) {
	if (!io) {
		return;
	}

	io.emit(eventName, payload);
}
