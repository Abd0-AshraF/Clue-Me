import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../source/index.server.js', import.meta.url), 'utf8');
const clientBundle = fs.readFileSync(new URL('../public/assets/index-discord-v30.js', import.meta.url), 'utf8');

function loadGameEngine() {
  const start = source.indexOf('var ARABIC_DIGITS_START = 1632;');
  const end = source.indexOf('// ../shared/src/words/data/arabic.ts');
  const code = source.slice(start, end);
  const sandbox = { exports: {} };
  vm.runInNewContext(`${code}; exports.api = { createGame, giveClue, guess, endTurn, getView };`, sandbox, { timeout: 1000 });
  return sandbox.exports.api;
}

function loadGameRoomStore() {
  const start = source.indexOf('var MAX_EVENTS = 200;');
  const end = source.indexOf('// src/auth.ts');
  const code = source.slice(start, end);
  const sandbox = { exports: {}, CHAT_MAX_MESSAGES: 80 };
  vm.runInNewContext(`${code}; exports.api = { GameRoomStore };`, sandbox, { timeout: 1000 });
  return sandbox.exports.api.GameRoomStore;
}

const { createGame, giveClue, guess, endTurn, getView } = loadGameEngine();
const GameRoomStore = loadGameRoomStore();

function makeState(board) {
  return {
    id: 'g-test',
    language: 'en',
    board: board.map((color, i) => ({ word: `w${i}`, color, revealed: false })),
    phase: 'clue',
    turnTeam: 'red',
    clue: null,
    clueSeq: 0,
    guessesUsed: 0,
    maxGuesses: 0,
    winner: null,
    winReason: null,
    moveCount: 0
  };
}

test('createGame creates authoritative revisioned state', () => {
  const words = Array.from({ length: 30 }, (_, i) => `word-${i}`);
  const state = createGame({ language: 'en', words, rng: () => 0.5 });
  assert.equal(state.phase, 'clue');
  assert.equal(state.turnTeam, 'red');
  assert.equal(state.moveCount, 0);
  assert.equal(state.board.length, 25);
});

test('captain can submit a clue and state exposes clue stats', () => {
  const state = makeState(['red', 'red', 'blue', 'neutral', 'assassin']);
  const result = giveClue(state, { word: 'planet', number: 2 });
  assert.equal(result.ok, true);
  const view = getView(state, { kind: 'operative', team: 'red' });
  assert.equal(view.clue.word, 'planet');
  assert.equal(view.clueTarget, 2);
  assert.equal(view.clueSelections, 0);
  assert.equal(view.clueRemaining, 2);
});

test('guessing the assassin always ends the game immediately', () => {
  const state = makeState(['assassin', 'red', 'blue']);
  giveClue(state, { word: 'danger', number: 1 });
  const result = guess(state, 0);
  assert.equal(result.ok, true);
  assert.equal(result.cardColor, 'assassin');
  assert.equal(state.phase, 'over');
  assert.equal(state.winner, 'blue');
});

test('revealing the final opponent card ends the game for that opponent', () => {
  const state = makeState(['blue', 'red', 'neutral', 'assassin']);
  // blue has exactly one remaining unrevealed card; red still has at least one
  giveClue(state, { word: 'oops', number: 1 });
  const result = guess(state, 0);
  assert.equal(result.ok, true);
  assert.equal(result.cardColor, 'blue');
  assert.equal(result.winner, 'blue');
  assert.equal(state.phase, 'over');
  assert.equal(state.winReason, 'opponent-agents');
});

test('game over rejects any later authoritative action', () => {
  const state = makeState(['assassin', 'red', 'blue']);
  giveClue(state, { word: 'danger', number: 1 });
  guess(state, 0);
  assert.equal(guess(state, 1).code, 'GAME_OVER');
  assert.equal(endTurn(state).code, 'GAME_OVER');
});

test('already revealed cards cannot be guessed twice', () => {
  const state = makeState(['red', 'red', 'blue', 'neutral']);
  giveClue(state, { word: 'test', number: 2 });
  const first = guess(state, 0);
  assert.equal(first.ok, true);
  const second = guess(state, 0);
  assert.equal(second.ok, false);
  assert.equal(second.code, 'CARD_ALREADY_REVEALED');
});

test('GameRoomStore pointer highlights are not capped at three and can be cleared', () => {
  const store = new GameRoomStore();
  const game = makeState(['red', 'red', 'blue', 'neutral', 'assassin']);
  store.games.set('ABCD', game);
  store.point('ABCD', 'p1', 0);
  store.point('ABCD', 'p1', 1);
  store.point('ABCD', 'p1', 2);
  store.point('ABCD', 'p1', 3);
  assert.equal(JSON.stringify(store.pointersFor('ABCD').filter((p) => p.playerId === 'p1').map((p) => p.index)), JSON.stringify([0, 1, 2, 3]));
  store.clearPointers('ABCD');
  assert.equal(JSON.stringify(store.pointersFor('ABCD')), JSON.stringify([]));
});

test('live layer includes server-side idempotency + revision guards for authoritative actions', () => {
  assert.match(source, /actionId: z4\.string\(\)\.min\(1\)\.max\(96\)\.optional\(\)/);
  assert.match(source, /readProcessedAction/);
  assert.match(source, /rememberProcessedAction/);
  assert.match(source, /duplicate: true/);
  assert.match(source, /expectedGameId === void 0/);
  assert.match(source, /expectedRevision === void 0/);
});

test('game view exposes stateVersion alias and client rejects older state versions', () => {
  assert.match(source, /stateVersion: state\.moveCount/);
  assert.match(clientBundle, /stateVersion\?\?_\.revision/);
  assert.match(clientBundle, /oe<ke/);
});

test('reconnect and refresh paths request authoritative snapshots', () => {
  assert.match(source, /if \(room\.status === "playing"\) sendAuthoritativeSnapshot\(socket, code, player\)/);
  assert.match(source, /socket\.on\("game:sync"/);
  assert.match(source, /sendAuthoritativeSnapshot\(socket, code, player\)/);
  assert.match(clientBundle, /window\.addEventListener\("focus",\$\)/);
  assert.match(clientBundle, /window\.addEventListener\("online",\$\)/);
  assert.match(clientBundle, /window\.setInterval\(\$,2500\)/);
});

test('new round logic supports randomized rematch and START_GAME permission path', () => {
  assert.match(source, /type: z4\.literal\("newRoundRandomized"\)/);
  assert.match(source, /roomStore2\.can\(room, player\.id, "START_GAME"\)/);
  assert.match(source, /roomStore2\.can\(room, player\.id, "MOVE_PLAYERS"\)/);
  assert.match(source, /shuffleTeamsForRematch/);
});

test('client authoritative actions send an actionId for deduplication', () => {
  assert.match(clientBundle, /actionId:Je/);
});

test('dialog focus is desktop-only so mobile text fields do not lose focus to modal container', () => {
  assert.match(clientBundle, /window\.matchMedia\("\(pointer: fine\)"\)\.matches&&m\.current\?\.focus\(\)/);
});

test('game overlay and floating log patches include close control and drag-tail hooks', () => {
  const patch = fs.readFileSync(new URL('../public/assets/game-room-v20.js', import.meta.url), 'utf8');
  assert.match(patch, /cm-gameover-close/);
  assert.match(patch, /cm-gameover-random/);
  assert.match(patch, /applyLinkedTail/);
  assert.match(patch, /blurActiveEditable\(\); setOpen\(!open\);/);
});

test('AI service and native Android home and room link integration are configured', () => {
  const aiServiceCode = fs.readFileSync(new URL('../source/ai-service.js', import.meta.url), 'utf8');
  assert.match(aiServiceCode, /registerAiRoutes/);
  assert.match(aiServiceCode, /\/api\/ai\/generate-pack/);
  assert.match(aiServiceCode, /\/api\/ai\/spymaster-advisor/);
  assert.match(aiServiceCode, /\/api\/ai\/guess-advisor/);
  assert.match(aiServiceCode, /gemini-(2\.5|3\.6)-flash/);

  const aiHudCode = fs.readFileSync(new URL('../public/assets/game-ai-hud-v21.js', import.meta.url), 'utf8');
  assert.match(aiHudCode, /cm-home-android-btn/);
  assert.match(aiHudCode, /cm-home-android-choice/);
  assert.match(aiHudCode, /cm-room-android-cta/);
  assert.match(aiHudCode, /clueme:\/\/room\//);
  assert.match(aiHudCode, /purgeUnsolicitedClutter/);

  const roomLayoutCss = fs.readFileSync(new URL('../public/assets/room-layout-v20.css', import.meta.url), 'utf8');
  assert.match(roomLayoutCss, /cm-room-link-android-banner/);
  assert.match(roomLayoutCss, /cm-menu-choice-android/);
  assert.doesNotMatch(roomLayoutCss, /cm-live-toast-container/);

  const indexHtml = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(indexHtml, /game-ai-hud-v21\.js/);
});
