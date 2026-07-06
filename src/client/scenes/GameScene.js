import Phaser from 'phaser';
import { Predictor } from '../prediction/Predictor.js';
import { InterpolationBuffer, INTERPOLATION_DELAY_MS } from '../entities/InterpolationBuffer.js';

// This scene never decides where anything actually is. It only:
//  - reads local input and predicts the local player's position optimistically
//  - reconciles that prediction against authoritative snapshots from the server
//  - interpolates remote players between past snapshots
//  - renders whatever the above produced
export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init() {
    this.network = this.game.registry.get('network');
    this.self = this.game.registry.get('self');
    this.worldSize = this.game.registry.get('worldSize');
  }

  create() {
    this.cameras.main.setBackgroundColor('#0d1117');
    this.cameras.main.setBounds(0, 0, this.worldSize.width, this.worldSize.height);
    this.drawWorldBorder();

    this.predictor = new Predictor({ x: this.self.x, y: this.self.y });
    this.inputSeq = 0;

    this.localVisual = this.createPlayerVisual(this.self.username, this.self.color, true);
    this.cameras.main.startFollow(this.localVisual.container, true, 0.15, 0.15);

    this.remotePlayers = new Map(); // id -> { visual, buffer }
    this.orbVisuals = new Map(); // orb id -> Phaser.GameObjects.Arc

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');

    this.chatInputEl = document.getElementById('chat-input');

    this.snapshotHandler = (e) => this.onSnapshot(e.detail);
    this.network.addEventListener('snapshot', this.snapshotHandler);
    this.events.once('shutdown', () => this.network.removeEventListener('snapshot', this.snapshotHandler));
  }

  drawWorldBorder() {
    const g = this.add.graphics();
    g.lineStyle(4, 0x30363d, 1);
    g.strokeRect(0, 0, this.worldSize.width, this.worldSize.height);
  }

  createPlayerVisual(username, color, isLocal) {
    const circle = this.add.circle(0, 0, 16, color).setStrokeStyle(2, 0xffffff, isLocal ? 1 : 0.4);
    const label = this.add
      .text(0, -32, username, { fontSize: '13px', color: '#e6edf3', fontFamily: 'monospace' })
      .setOrigin(0.5);
    const bubble = this.add
      .text(0, -50, '', {
        fontSize: '12px',
        color: '#ffd166',
        fontFamily: 'monospace',
        backgroundColor: '#161b22',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setVisible(false);

    const container = this.add.container(0, 0, [circle, label, bubble]);
    return { container, circle, label, bubble };
  }

  getInputState() {
    const chatFocused = document.activeElement === this.chatInputEl;
    if (chatFocused) return { up: false, down: false, left: false, right: false };
    return {
      up: this.cursors.up.isDown || this.wasd.W.isDown,
      down: this.cursors.down.isDown || this.wasd.S.isDown,
      left: this.cursors.left.isDown || this.wasd.A.isDown,
      right: this.cursors.right.isDown || this.wasd.D.isDown,
    };
  }

  update(_time, deltaMs) {
    const dt = Math.min(deltaMs / 1000, 0.1);
    const input = this.getInputState();
    const inputRecord = { ...input, seq: ++this.inputSeq };

    // Predict immediately so local movement feels instant, then tell the
    // server what happened. The server's reply (a future snapshot) is what
    // actually authorizes this movement.
    this.predictor.applyInput(inputRecord, dt);
    this.network.sendInput(inputRecord);
    this.localVisual.container.setPosition(this.predictor.x, this.predictor.y);

    const renderTime = Date.now() - INTERPOLATION_DELAY_MS;
    for (const entry of this.remotePlayers.values()) {
      const pos = entry.buffer.getInterpolated(renderTime);
      if (pos) entry.visual.container.setPosition(pos.x, pos.y);
    }
  }

  onSnapshot(snapshot) {
    const selfData = snapshot.players.find((p) => p.id === this.network.id);
    if (selfData) {
      this.predictor.reconcile(selfData, selfData.lastProcessedInput);
      this.localVisual.label.setText(`${selfData.username} (${selfData.score})`);
      this.setBubble(this.localVisual, selfData.chat);
    }

    const seenIds = new Set();
    for (const p of snapshot.players) {
      if (p.id === this.network.id) continue;
      seenIds.add(p.id);

      let entry = this.remotePlayers.get(p.id);
      if (!entry) {
        entry = { visual: this.createPlayerVisual(p.username, p.color, false), buffer: new InterpolationBuffer() };
        this.remotePlayers.set(p.id, entry);
      }
      entry.buffer.push(snapshot.t, p.x, p.y);
      entry.visual.label.setText(`${p.username} (${p.score})`);
      this.setBubble(entry.visual, p.chat);
    }

    for (const [id, entry] of this.remotePlayers) {
      if (!seenIds.has(id)) {
        entry.visual.container.destroy();
        this.remotePlayers.delete(id);
      }
    }

    const seenOrbIds = new Set();
    for (const orb of snapshot.orbs) {
      seenOrbIds.add(orb.id);
      if (!this.orbVisuals.has(orb.id)) {
        this.orbVisuals.set(orb.id, this.add.circle(orb.x, orb.y, 8, 0xffd166));
      }
    }
    for (const [id, g] of this.orbVisuals) {
      if (!seenOrbIds.has(id)) {
        g.destroy();
        this.orbVisuals.delete(id);
      }
    }
  }

  setBubble(visual, text) {
    if (text) visual.bubble.setText(text).setVisible(true);
    else visual.bubble.setVisible(false);
  }
}
