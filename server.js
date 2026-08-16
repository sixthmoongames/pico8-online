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
		state: 0,
		flashTime: 0,
		cooldownTime: 0,
		respawnTime: 0,
		lastTimer: 0,
		sprite: 1, // Chosen sprite (1 to 9)
		kills: 0, // Scoreboard kills
		ready: false // Has confirmed character selection
	};

	ws.playerId = id;
	ws.send(JSON.stringify({ type: 'init', id: id, color: color }));
	worldDirty = true;

	ws.on('message', (message) => {
		try {
			const data = JSON.parse(message);

			// Select Character Action
			if (data.type === 'select_sprite' && players[data.id]) {
				players[data.id].sprite = data.sprite;
				players[data.id].ready = true;
				worldDirty = true;
			}

			// Movement updates
			if (
				data.type === 'state' &&
				players[data.id] &&
				players[data.id].ready &&
				players[data.id].state !== 2
			) {
				if (players[data.id].x !== data.x || players[data.id].y !== data.y) {
					players[data.id].x = data.x;
					players[data.id].y = data.y;
					worldDirty = true;
				}
			}

			// Flash Action
			if (
				data.type === 'action' &&
				data.action === 'flash' &&
				players[data.id] &&
				players[data.id].ready
			) {
				let p = players[data.id];
				const now = Date.now();
				if (p.state === 0 && now > p.cooldownTime) {
					p.state = 1;
					p.flashTime = now + 1500;
					p.cooldownTime = now + 5000;
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

setInterval(() => {
	const now = Date.now();
	let forceDirty = false;
	const pKeys = Object.keys(players);

	// Timers & States
	for (let i = 0; i < pKeys.length; i++) {
		let p = players[pKeys[i]];
		if (!p.ready) continue;

		if (p.state === 1 && now > p.flashTime) {
			p.state = 0;
			forceDirty = true;
		}
		if (p.state === 2 && now > p.respawnTime) {
			p.state = 0;
			p.x = 30 + ((pKeys[i] * 15) % 80);
			p.y = 64;
			forceDirty = true;
		}

		let currentTimer = 0;
		if (p.state === 2) currentTimer = Math.ceil((p.respawnTime - now) / 1000);
		else if (now < p.cooldownTime)
			currentTimer = Math.ceil((p.cooldownTime - now) / 1000);

		if (p.lastTimer !== currentTimer) {
			p.lastTimer = currentTimer;
			forceDirty = true;
		}
	}

	// Collisions
	for (let i = 0; i < pKeys.length; i++) {
		let p1 = players[pKeys[i]];
		if (p1.ready && p1.state === 1) {
			for (let j = 0; j < pKeys.length; j++) {
				if (i === j) continue;
				let p2 = players[pKeys[j]];
				if (p2.ready && p2.state === 0) {
					if (Math.abs(p1.x - p2.x) < 8 && Math.abs(p1.y - p2.y) < 8) {
						p2.state = 2; // Kill p2
						p2.respawnTime = now + 3000;
						p1.kills += 1; // Increment p1 score
						forceDirty = true;
					}
				}
			}
		}
	}

	// Broadcast State
	if (worldDirty || forceDirty) {
		const payload = { type: 'world', players: {} };
		for (const id in players) {
			let p = players[id];
			payload.players[id] = {
				x: p.x,
				y: p.y,
				color: p.color,
				state: p.state,
				timer: p.lastTimer,
				sprite: p.sprite,
				kills: p.kills,
				ready: p.ready
			};
		}

		const worldState = JSON.stringify(payload);
		wss.clients.forEach((client) => {
			if (client.readyState === 1) client.send(worldState);
		});
		worldDirty = false;
	}
}, 33);
