import { randomUUID } from 'crypto';
import { Router } from 'express';

import { PlayerModel } from '../models/Player.js';
import { MAPS } from '../game/maps.js';
import { STARTING_MAP } from '../../shared/constants.js';
import { credentialsSchema } from '../validation/schemas.js';
import { hashPassword, verifyPassword } from './password.js';
import { signSessionToken, verifySessionToken } from './jwt.js';
import { setActiveSession, clearActiveSession } from './sessionStore.js';
import { getActiveSocketId, clearActiveSocketIfCurrent } from '../state/activeConnections.js';

// `io` is needed so a successful login can actively kick whatever socket
// currently holds the previous session for this user (see sockets/index.js
// for the corresponding JWT/session validation on the Socket.io side).
export function createAuthRouter(io) {
  const router = Router();

  router.post('/register', async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0].message });
    }
    const { username, password } = parsed.data;

    const existing = await PlayerModel.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (existing) {
      return res.status(409).json({ ok: false, error: 'That username is already taken.' });
    }

    const startingMap = MAPS.get(STARTING_MAP);
    const passwordHash = await hashPassword(password);

    await PlayerModel.create({
      username,
      passwordHash,
      map: STARTING_MAP,
      row: Math.floor(startingMap.rows / 2),
      col: Math.floor(startingMap.cols / 2),
      lastLogin: new Date(),
    });

    const sessionId = randomUUID();
    await setActiveSession(username, sessionId);
    const token = signSessionToken({ username, sessionId });

    res.json({ ok: true, token });
  });

  router.post('/login', async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0].message });
    }
    const { username, password } = parsed.data;

    const doc = await PlayerModel.findOne({ username: new RegExp(`^${username}$`, 'i') });
    const passwordOk = doc ? await verifyPassword(password, doc.passwordHash) : false;
    if (!doc || !passwordOk) {
      return res.status(401).json({ ok: false, error: 'Invalid username or password.' });
    }

    // Kick whatever session (if any) is currently connected for this user
    // before installing the new one.
    const previousSocketId = getActiveSocketId(doc.username);
    if (previousSocketId) {
      const previousSocket = io.sockets.sockets.get(previousSocketId);
      if (previousSocket) {
        previousSocket.emit('session:kicked', {
          message: 'You were logged out because your account signed in elsewhere.',
        });
        previousSocket.disconnect(true);
      }
    }

    const sessionId = randomUUID();
    await setActiveSession(doc.username, sessionId);
    await PlayerModel.updateOne({ _id: doc._id }, { $set: { lastLogin: new Date() } });
    const token = signSessionToken({ username: doc.username, sessionId });

    res.json({ ok: true, token });
  });

  router.post('/logout', async (req, res) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    if (!token) {
      return res.status(400).json({ ok: false, error: 'Missing session token.' });
    }

    let payload;
    try {
      payload = verifySessionToken(token);
    } catch {
      return res.status(401).json({ ok: false, error: 'Invalid or expired session.' });
    }

    await clearActiveSession(payload.username);
    const socketId = getActiveSocketId(payload.username);
    if (socketId) {
      io.sockets.sockets.get(socketId)?.disconnect(true);
      clearActiveSocketIfCurrent(payload.username, socketId);
    }

    res.json({ ok: true });
  });

  return router;
}
