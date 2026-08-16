// server.js
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// Track connected clients and assigned player IDs (1 or 2)
let clients = new Map();
let nextPlayerId = 1;

console.log(`Server started on port ${PORT}`);

wss.on('connection', (ws) => {
	// Assign Player ID 1 or 2
	const id = nextPlayerId;
	nextPlayerId = nextPlayerId === 1 ? 2 : 1;
	clients.set(ws, id);

	// Inform the client which Player ID they are assigned
	ws.send(JSON.stringify({ type: 'init', id: id }));

	ws.on('message', (message) => {
		try {
			const data = JSON.parse(message);

			// Broadcast movement state to all other connected clients
			if (data.type === 'state') {
				wss.clients.forEach((client) => {
					if (client !== ws && client.readyState === 1) {
						client.send(JSON.stringify(data));
					}
				});
			}
		} catch (e) {
			console.error(e);
		}
	});

	ws.on('close', () => {
		clients.delete(ws);
	});
});
