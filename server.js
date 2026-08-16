// server.js
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

const PICO_COLORS = [8, 12, 10, 9, 14, 7, 15, 6, 11, 13, 2, 4, 5];
let players = {};
let nextPlayerId = 1;
let worldDirty = false;

console.log(`Server started on port ${PORT}`);

wss.on('connection', (ws) => {
	const id = nextPlayerId++;
	const color = PICO_COLORS[(id - 1) % PICO_COLORS.length];

	players[id] = {
		x: 30 + ((id * 15) % 80),
		y: 64,
		color: color,
		state: 0, // 0: Normal, 1: Flashing, 2: Dead
		flashTime: 0, // Timestamp when flash ends
		cooldownTime: 0, // Timestamp when cooldown ends
		respawnTime: 0, // Timestamp when respawn ends
		lastTimer: 0 // Tracks visual UI timer to broadcast changes
	};

	ws.playerId = id;
	ws.send(JSON.stringify({ type: 'init', id: id, color: color }));
	worldDirty = true;

	ws.on('message', (message) => {
		try {
			const data = JSON.parse(message);

			// Movement updates (ignored if the server knows you are dead)
			if (
				data.type === 'state' &&
				players[data.id] &&
				players[data.id].state !== 2
			) {
				if (players[data.id].x !== data.x || players[data.id].y !== data.y) {
					players[data.id].x = data.x;
					players[data.id].y = data.y;
					worldDirty = true;
				}
			}

			// Flash action triggered by player
			if (
				data.type === 'action' &&
				data.action === 'flash' &&
				players[data.id]
			) {
				let p = players[data.id];
				const now = Date.now();
				// Only allow flash if normal and cooldown is finished
				if (p.state === 0 && now > p.cooldownTime) {
					p.state = 1;
					p.flashTime = now + 1500; // 1.5 seconds of invincibility/kill power
					p.cooldownTime = now + 5000; // 5 seconds cooldown
					worldDirty = true;
				}
			}
		} catch (e) {
			console.error(e);
		}
	});

	ws.on('close', () => {
		delete players[ws.playerId];
		worldDirty = true;
	});
});

// SERVER TICK: Logic & Broadcast loop (30fps)
setInterval(() => {
	const now = Date.now();
	let forceDirty = false;

	const pKeys = Object.keys(players);

	// 1. Process Timers & State Changes
	for (let i = 0; i < pKeys.length; i++) {
		let p = players[pKeys[i]];

		// Stop flashing
		if (p.state === 1 && now > p.flashTime) {
			p.state = 0;
			forceDirty = true;
		}
		// Respawn from death
		if (p.state === 2 && now > p.respawnTime) {
			p.state = 0;
			p.x = 30 + ((pKeys[i] * 15) % 80); // Reset to a spawn point
			p.y = 64;
			forceDirty = true;
		}

		// Check if the visual UI countdown timer (seconds) changed
		let currentTimer = 0;
		if (p.state === 2) currentTimer = Math.ceil((p.respawnTime - now) / 1000);
		else if (now < p.cooldownTime)
			currentTimer = Math.ceil((p.cooldownTime - now) / 1000);

		if (p.lastTimer !== currentTimer) {
			p.lastTimer = currentTimer;
			forceDirty = true; // Force broadcast so clients see the clock tick down
		}
	}

	// 2. Process Collisions (Flashing vs Normal)
	for (let i = 0; i < pKeys.length; i++) {
		let p1 = players[pKeys[i]];
		if (p1.state === 1) {
			// If p1 is deadly
			for (let j = 0; j < pKeys.length; j++) {
				if (i === j) continue;
				let p2 = players[pKeys[j]];

				if (p2.state === 0) {
					// If p2 is vulnerable
					// Simple 4x4 pixel bounding box collision
					if (Math.abs(p1.x - p2.x) < 4 && Math.abs(p1.y - p2.y) < 4) {
						p2.state = 2; // Kill p2
						p2.respawnTime = now + 3000; // 3 second respawn
						forceDirty = true;
					}
				}
			}
		}
	}

	// 3. Broadcast to all clients
	if (worldDirty || forceDirty) {
		const payload = { type: 'world', players: {} };
		for (const id in players) {
			let p = players[id];
			payload.players[id] = {
				x: p.x,
				y: p.y,
				color: p.color,
				state: p.state,
				timer: p.lastTimer
			};
		}

		const worldState = JSON.stringify(payload);
		wss.clients.forEach((client) => {
			if (client.readyState === 1) client.send(worldState);
		});
		worldDirty = false;
	}
}, 33);
