// server.js
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

const PICO_COLORS = [8, 12, 10, 9, 14, 7, 15, 6, 11, 13, 2, 4, 5];
let players = {};
let nextPlayerId = 1;

console.log(`Server started on port ${PORT}`);

wss.on('connection', (ws) => {
	const id = nextPlayerId++;
	const color = PICO_COLORS[(id - 1) % PICO_COLORS.length];

	players[id] = { x: 30 + ((id * 15) % 80), y: 64, color: color };
	ws.playerId = id;

	ws.send(JSON.stringify({ type: 'init', id: id, color: color }));

	ws.on('message', (message) => {
		try {
			const data = JSON.parse(message);
			// ONLY update the internal state here, do not broadcast
			if (data.type === 'state' && players[data.id]) {
				players[data.id].x = data.x;
				players[data.id].y = data.y;
			}
		} catch (e) {
			console.error(e);
		}
	});

	ws.on('close', () => {
		delete players[ws.playerId];
	});
});

// SERVER TICK: Broadcast the world state to everyone 30 times a second
setInterval(() => {
	const worldState = JSON.stringify({ type: 'world', players: players });
	wss.clients.forEach((client) => {
		if (client.readyState === 1) {
			client.send(worldState);
		}
	});
}, 33);
