// server.js
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// Pre-defined PICO-8 color palette IDs (excluding black 0 and green 3 background)
const PICO_COLORS = [8, 12, 10, 9, 14, 7, 15, 6, 11, 13, 2, 4, 5];

let players = {}; // Stores { id: { x, y, color } }
let nextPlayerId = 1;

console.log(`Server started on port ${PORT}`);

wss.on('connection', (ws) => {
	const id = nextPlayerId++;
	const color = PICO_COLORS[(id - 1) % PICO_COLORS.length];

	// Initialize new player position
	players[id] = {
		x: 30 + ((id * 15) % 80),
		y: 64,
		color: color
	};

	ws.playerId = id;

	// Send assignment to newly connected player
	ws.send(JSON.stringify({ type: 'init', id: id, color: color }));

	ws.on('message', (message) => {
		try {
			const data = JSON.parse(message);

			if (data.type === 'state') {
				// Update stored position for sender
				if (players[data.id]) {
					players[data.id].x = data.x;
					players[data.id].y = data.y;
				}

				// Broadcast full world state to ALL connected clients
				const worldState = JSON.stringify({
					type: 'world',
					players: players
				});

				wss.clients.forEach((client) => {
					if (client.readyState === 1) {
						client.send(worldState);
					}
				});
			}
		} catch (e) {
			console.error(e);
		}
	});

	ws.on('close', () => {
		delete players[ws.playerId];

		// Broadcast player disconnect
		wss.clients.forEach((client) => {
			if (client.readyState === 1) {
				client.send(
					JSON.stringify({
						type: 'world',
						players: players
					})
				);
			}
		});
	});
});
