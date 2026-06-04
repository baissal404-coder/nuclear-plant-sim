import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import gameState, { createGameRouter } from './gameState.js';
import { setupNetworking } from './networking.js';
import { setupChat } from './chat.js';
import { setupAdmin } from './admin.js';
import { BROADCAST_RATE, TICK_RATE } from '../shared/constants.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 5000,
});
gameState.setIo(io);

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// Serve shared modules at /shared/ (used by ES module imports from client/)
app.use('/shared', express.static(path.join(__dirname, '../shared')));

// Serve Phaser from node_modules (avoid CDN dependency)
app.use('/phaser', express.static(path.join(__dirname, '../node_modules/phaser/dist')));

// API routes
app.use(createGameRouter(gameState));

io.on('connection', (socket) => {
  console.log(`[Server] Client connected: ${socket.id}`);
  setupNetworking(io, gameState, socket);
  setupChat(io, gameState, socket);
  setupAdmin(io, gameState, socket);
});

setupAdmin(io, gameState, null);

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

server.listen(PORT, () => {
  console.log(`[Server] Nuclear Plant Simulator running on http://localhost:${PORT}`);
  console.log(`[Server] Tick rate: ${TICK_RATE} Hz, Broadcast rate: ${BROADCAST_RATE} Hz`);
});

export { io, app, server };
