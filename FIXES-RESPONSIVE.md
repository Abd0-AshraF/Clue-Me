# Responsive game-area and lobby fixes

## Final game layout

- The application header keeps its normal fixed height and stays sticky.
- The 5×5 board is centered in the available game area.
- The clue/role controls and event history are always directly **under the board**.
- The lower panel keeps both sections side by side on desktop, tablets and phones:
  - event history: `1fr`,
  - clue/role controls: `1.7fr`.
- The lower panel always matches the board width.
- Board and lower-panel heights are calculated together from available viewport height; the board is no longer sized independently from the rest of the content.
- Team strips and desktop roster rails also resize with available width/height.
- Desktop team cards are wider, taller, non-shrinking and easier to read; their empty/player slots follow the same responsive sizing and visual rhythm.
- Each desktop team rail is centered inside the gutter between its viewport edge and the board, instead of being attached to the outer edge.
- Low-height landscape screens scroll only the game body to preserve a useful card/control size; the header remains fixed.
- Entering a game resets both page scroll and nested game-body scroll, preventing autofocus from jumping past the top of the board.
- Card words, gaps, forms and event rows compact together on smaller screens.
- Waiting clue panels show only the current waiting message; the duplicate **Switch to red/blue operative/captain** button is removed, while role changes remain available from the fixed top bar.

## Discord Activity shared rooms

- Every Discord Activity `instance_id` now maps to one authoritative Clue Me room on the server.
- The first participant creates the room automatically; everyone joining the same Discord Activity instance is routed to that exact room.
- Rich Presence party size updates from the real connected-player count instead of staying hardcoded at `1 of 12`.
- Activity-instance room mappings are included in PostgreSQL persistence.

## Account identity and clue announcements

- The same authenticated Discord/site account now reuses one player seat in a room across browsers, devices and the Discord Activity.
- Duplicate legacy seats for the same account are merged automatically on rejoin.
- Authenticated room names and avatars come from the canonical account profile instead of per-browser guest names.
- Every clue notification is keyed by its authoritative clue sequence, so each new clue remounts and runs exactly one full animation.
- Duplicate `lastClue`/game-view updates no longer cancel the removal timer or leave an invisible stale notification mounted.
- Clue audio runs from one authoritative update instead of playing twice for the clue giver.
- The duplicate bottom clue toast is removed; the full-screen centered announcement is now the only primary clue notification.
- The centered card remains mounted for 4.6 seconds and runs a 4.4-second high-visibility animation on phones, desktop and reduced-motion systems.
- The clue word scales responsively up to 5.5rem inside a wide centered card and is announced through an assertive accessible alert.
- AudioContext is created/resumed on the first pointer, touch or keyboard interaction so later network-delivered clue sounds work reliably in mobile and Discord WebViews.
- Android/Discord touch WebViews use a stable solid dimmer instead of the fixed backdrop blur that could flicker during the notification animation.

## Mobile card gestures

- Touch devices no longer show the oversized hand button over every card.
- A normal tap points at/unpoints a word for teammates.
- Pressing and holding for 450ms selects/guesses the card.
- Touch-like input is detected using pointer type, coarse-pointer media and touch/hover capability, covering Discord WebViews that incorrectly report a finger as `mouse`.
- A single active pointer owns the gesture; movement over 18px or pointer cancellation aborts it safely.
- Pointer-capture failures are tolerated instead of aborting the tap/hold action.
- Delayed synthetic touch clicks are ignored for 1.5 seconds, preventing single or rapid taps from becoming guesses.
- An immediate guess lock prevents double/triple taps from queuing multiple card selections.
- Desktop keeps the separate hand-button behavior.

## Authoritative synchronization and action lock

- Every server game view now carries a stable game ID and monotonically increasing revision.
- Clients reject an older revision instead of allowing a late socket message to replace newer turn state.
- A lightweight authoritative snapshot is requested every 2.5 seconds and immediately on reconnect, focus, visibility return, network return or a rejected action.
- The server serializes view broadcasts and provides a dedicated `game:sync` snapshot containing the current view, pointers and event history.
- Clue, guess, end-turn and new-round actions include the game ID and revision the player actually saw.
- The server rejects an action based on stale state and silently sends the current authoritative snapshot instead.
- Gameplay controls lock after an action until a newer server revision or explicit sync snapshot arrives, preventing duplicate or conflicting moves.
- Each client also reconciles its own team/role from authoritative lobby updates, preventing a stale local seat from disagreeing with the server view.
- Explicit end-turn actions now increment the authoritative revision just like clues and guesses.

## Stable lobby membership and professional share embeds

- Transient `GET /api/rooms/:code` failures no longer call the lobby exit route or remove a valid socket member.
- Lobby updates are filtered by room code, preventing a cached listener for another room from replacing the current room and making the player appear missing.
- Lobby errors now carry their room code; unrelated `FORBIDDEN`/`ROOM_NOT_FOUND` events are ignored instead of ejecting the current player.
- A temporarily missing local player record shows reconnecting state and retries the authoritative join instead of navigating home.
- The shared socket leaves its previous room before joining a different room, while stale component cleanups cannot unregister the new room.
- Cached chat listeners only rejoin the currently active room and filter history, messages and errors by room code.
- Discord room links now include complete Open Graph and Twitter large-image metadata, a canonical URL, Arabic locale, theme colour, 1200×630 artwork and accessible image text.
- `/room/:code` and `/game/:code` metadata is rendered server-side with the room code, name, waiting/playing status and player count for Discord crawlers.
- The social preview uses the versioned local asset `public/discord-embed-v1.png`, so it needs no external CDN.

## Live connection state and Discord Rich Presence

- The live server tracks active sockets per room seat, while one account connected from several devices still represents one player.
- A player remains online while any one of their devices is connected.
- After the final device disconnects, a 4.5-second reconnection grace period prevents false offline flashes during normal Discord reconnects.
- Disconnected players receive a slashed badge over their avatar, a localized **Disconnected / غير متصل** label and a muted appearance in the lobby, desktop roster and mobile team strips.
- Reconnecting cancels the pending offline state and broadcasts the restored status immediately.
- REST room refreshes preserve the latest socket connectivity instead of overwriting it with stale status.
- Discord Activity Rich Presence now has a stable party ID, `instance` status, room code, current team/phase, elapsed time and connected-player count.
- Rich Presence refreshes in both lobby and game views when the player count, turn, phase or winner changes.
- Presence updates are fingerprinted and rate-limited to one Discord SDK update per four seconds, while retaining the latest pending state.

## Hidden-card contrast and mobile roster

- Words on unrevealed cards use an opaque high-contrast plate, stronger border, heavier type and a small shadow in every theme.
- Mobile team strips always prioritize showing the captain, then operatives, instead of hiding a captain behind the first three players.
- Captain and operative chips now have separate borders, backgrounds and role badges, matching the desktop hierarchy while remaining compact.
- Holding a mobile player chip for 480ms sends the same synchronized particles/effect as clicking that player on desktop.
- Finger movement cancels the player effect safely, and a visible hold-progress line confirms the gesture.

## Dark Mani theme

- Settings includes **Mani Dark / Mani داكن** alongside Light, Dark, Mani and System.
- Dark Mani keeps Mani's assets, playful effects and audio flavour while using a dedicated high-contrast pink-purple dark palette.
- The selection persists in local storage and is applied before first paint to prevent a light-theme flash.

## Spymaster clue targeting

- The active team's spymaster can click unrevealed board cards during the clue phase.
- Selected cards receive a team-coloured outline and an ordered badge.
- Every selected card updates the clue number automatically; deselecting a card reduces the number and reorders the badges.
- Selection is capped at 25, remains local to the spymaster, and clears on clue submission, turn/phase change, role change or a new clue.

## Lobby

- Room management now shows only one bulk lock toggle: **Lock all** while open, then **Open all** while locked. The old team/role lock buttons are removed.
- The server allows both team locks simultaneously; existing players keep their seats while team changes remain blocked.
- Landscape team strips keep a compact normal width (`34rem` maximum) instead of stretching across the full screen.
- Red and blue lobby panels have matching coloured radial backgrounds and outer auras in light and dark themes.
- The maximum-player slider has local live state, moves immediately, and submits a captured value on pointer, keyboard or blur interaction.
- The submitted value is synchronized with room/server state.

## Discord and persistence

- Discord browser login uses the canonical `PUBLIC_URL` and exact configured callback.
- Discord Activity now reads the real Application ID at runtime from the server instead of a build-time placeholder.
- Activity authorization uses `identify`, `email`, `guilds`, `applications.commands`, and `rpc.activities.write` for Rich Presence.
- The Activity calls `setActivity()` after authentication using the uploaded `clue-me-main` and `lobby` art assets.
- Discord SDK initialization is now a module-level singleton, preventing React rerenders/Strict Mode from creating a second SDK instance after Discord has already sent its one-time READY event.
- SDK READY has a 15-second timeout, so a configuration failure shows the retry screen instead of hanging forever.
- Optional PostgreSQL/Neon persistence stores accounts, sessions, stats, admin data, active rooms, games, chat and event history.
- PostgreSQL state is restored before the server accepts traffic and is saved periodically plus on graceful shutdown.

## Wispbyte runtime

- The server is now a self-contained bundle with Express, Socket.IO, Zod and PostgreSQL embedded in `index.js`.
- Production startup no longer needs to create or write to `node_modules`.
- The release includes the prebuilt `.next` marker so Wispbyte skips its unnecessary workspace build.
- npm install runs with zero dependencies, no lifecycle scripts, no package-lock and no `node_modules` writes.
- npm cache/logs remain redirected to writable `/tmp` paths.

## Main modified files

- `index.js`
- `source/index.server.js`
- `public/assets/index-discord-v22.js`
- `public/assets/responsive-layout-v19.css`
- `public/discord-embed-v1.png`
- `public/index.html`
