# Clue Me — Architecture Audit and Fix Log

## Current architecture

### Runtime entrypoints
- `index.js` — bundled production server actually used by `npm start`
- `source/index.server.js` — readable source snapshot of the same server/game logic
- `public/assets/index-discord-v23.js` — compiled client bundle
- `public/assets/game-room-v20.js` — post-bundle enhancement/patch layer used for UI/audio fixes without rebuilding React source
- `public/assets/room-layout-v20.css` — patch stylesheet layered over compiled CSS

### Authoritative multiplayer path
- Game engine functions in `source/index.server.js` / bundled `index.js`
  - `createGame`
  - `giveClue`
  - `guess`
  - `endTurn`
  - `getView`
- Socket/live sync in `source/index.server.js` / bundled `index.js`
  - `game:sync`
  - `game:action`
  - `game:view`
  - `game:result`
  - `game:pointers`
  - `game:events`
- Room/source of truth stores
  - `RoomStore`
  - `GameRoomStore`
  - `AuthStore`
  - `AdminStore`

### Important constraint
The React client source is not present in the repo; only the compiled browser bundle exists. Server-authoritative fixes are safe and direct. Some client/UI fixes are applied through targeted bundle patches plus `game-room-v20.js` overlay logic.

## Fixes applied in this pass

### Server-authoritative game logic
- Added post-reveal win check so the game ends even if a team’s **last card is revealed by the other team**.
- Strengthened revision checks for authoritative multiplayer actions so clue/guess/end-turn/new-round are rejected when `expectedGameId` or `expectedRevision` is missing/stale.
- Added `stateVersion` as an alias of the authoritative revision for safer client ordering checks.
- Added `actionId`-based deduplication for authoritative multiplayer actions with short-lived server-side replay memory.
- Added clue stat fields to authoritative views:
  - `clueSelections`
  - `clueTarget`
  - `clueRemaining`
- Cleared pointer selections when a guess ends the turn.
- Removed the server hard cap of 3 pointer highlights.

### Client/gameplay sync
- Client local pointer limit of 3 removed from the compiled bundle and local practice state.
- Client now rejects out-of-order authoritative game views using `stateVersion ?? revision` and requests authoritative sync on reconnect/focus/online.
- Default language for first-time users changed to **English**.
- Clue input explicitly configured as normal text input for mobile:
  - `type="text"`
  - `inputMode="text"`
  - `autoCapitalize="none"`
  - `autoCorrect="off"`
  - `spellCheck="false"`
  - `autocomplete="off"`
- Live clue stats are rendered for all viewers through the overlay panel.

### Audio / mute groundwork
- Added immediate audio settings watcher in `game-room-v20.js`.
- Tracked HTMLAudio soundboard clips so mute stops them immediately.
- Tracked newly created WebAudio contexts and suspends/resumes them when mute changes.
- Guess/assassin soundboard playback moved toward authoritative socket result handling.

## Tests added
- `tests/game-engine.test.mjs`
- `npm test`

Current coverage includes:
- clue submission
- assassin ending
- final opponent-card win condition
- duplicate revealed-card rejection
- game-over rejection
- unlimited pointer highlight state + clear

## Local vs Server state review

### Local/UI state only
- Theme
- Language
- Volume / mute preferences
- Open/closed menus and dialogs
- Temporary card highlighting / pointers
- Hover / focus / drag affordances
- Decorative animations and motion preferences

### Server-authoritative state
- Current turn
- Player team / role permissions
- Current clue
- Revealed cards
- Game phase
- Winner / game-over state
- Remaining words
- Revision / stateVersion
- Authoritative action validity

## Game rules review completed
Reviewed engine paths for:
- Team turns
- Captain clue permission
- Operative guess permission
- Card ownership
- Assassin handling
- Neutral/opponent handling
- Win/loss conditions
- Turn ending and pass/end-turn
- Extra guess rule (`number + 1`)
- Restart/new round/reset handling
- Join while waiting / join while playing (spectator)
- Game over rejection for later actions

## Remaining work not fully completed yet
- Rebuild of all admin screens from true React source (current repo only has compiled client bundle)
- Expanded reconnect/join-in-progress integration tests at socket level beyond current smoke/static checks
- Full audio settings UI extension beyond the injected soundboard-volume augmentation

## Verification completed
- `node --check public/assets/game-room-v20.js`
- `node --check public/assets/index-discord-v23.js`
- `node --check source/index.server.js`
- `node --check index.js`
- `npm test`
- server boot smoke test with `node index.js`
