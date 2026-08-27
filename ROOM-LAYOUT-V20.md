# Room layout v22 — responsive room overhaul + admin panel

Two new files sit next to the compiled bundle and are wired into
`public/index.html`:

- `public/assets/room-layout-v20.css` — layout/theme overlay (loads after
  `responsive-layout-v19.css`, overrides only what it needs).
- `public/assets/game-room-v20.js` — small vanilla enhancement script (runs
  outside the React root, never reparents React-managed nodes, so
  reconciliation cannot break).

Nothing in the compiled React bundle or the server needed changes.

## Desktop (≥1024px)

- **Team cards**: the red/blue side rails are now large themed cards — team
  gradient + glow, big header pill, golden captain section, dashed empty
  slots. Player chips size themselves to the player's name (`fit-content`)
  instead of stretching to full rail width, so short names no longer leave
  empty space.
- **Remaining words on the card**: each team card header shows a live
  `متبقٍ: N` / `Left: N` pill, mirrored from the game state (localized
  numerals, auto-updates).
- **Floating event log**: the history dock is no longer a column under the
  board. It is a floating drawer (bottom inline-end corner) opened/closed
  from a floating icon button. It starts **collapsed/closed on PC**,
  keeps its own internal collapse + expand ("tall") controls, closes with
  `Esc`, and its open/closed choice persists in `localStorage`
  (`clue-me:log-open`).
- **Clue panel = full bottom row**: with the log gone from the row, the
  clue/role panel spans the whole panel width and stays exactly as wide as
  the word board. The freed space also lets the board grow slightly.

## Mobile / tablet (<1024px)

- Nothing moved: team strip → board → clue panel keep their order.
- The clue panel is now full-width (the log no longer steals half the row),
  and the board absorbs the freed height — noticeably bigger cards on phones.
- A reserved bottom strip keeps content clear of the floating button.
- The compact team-strip chips now hug their content (rows instead of
  full-width bars); the role pill stays only on captains.
- The floating log button gives phones the event history too — on ≤360px
  screens the old layout hid the log completely.

## Everywhere

- The floating button shows the event count and pulses when new events
  arrive while the drawer is closed.
- Works in RTL and LTR (drawer/button mirror automatically), in light, dark
  and mani themes, and in Arabic/English (labels reuse the app's own
  localized strings).
- Fixed a pre-existing phantom horizontal scrollbar on the marketing pages
  (rotated hero decorations bleeding past the viewport) via
  `overflow-x: clip`.
- The drawer sits below modals/overlays (game-over dialog, clue
  announcement) in z-order.

## Why an overlay instead of rebuilding the bundle

The web app ships prebuilt and minified. The overlay approach keeps the
upgrade trivially deployable (drop-in files + two lines in `index.html`)
and impossible to conflict with future bundle rebuilds — delete the two
files and the previous v19 layout returns exactly.


## v20.1 — team cards, phone balance, player profiles

- **Desktop team cards now mirror the lobby team-picker look** (pale team
  tint, bold 2px team border, lift shadow, coloured icon square in the
  header) and **hug their content vertically** — they no longer stretch down
  the whole rail when the room is small; they only scroll if players really
  overflow the rail.
- **Phone re-balance**: the space freed by the floating log is now shared —
  the team strip cards grow (bigger chips, lobby look too) while the board
  takes a moderate share, so word cards stay near-square instead of
  elongated (cap: `max-height ≈ board width`).
- **Player profiles replace cheer particles**: clicking/tapping any roster
  chip opens a profile sheet (avatar, team, role, connection status) with
  actions:
  - 🎉 **تشجيع** — the old cheer, now a deliberate action instead of an
    instant particle burst.
  - **غيّر مقعدك ودورك** — on your own profile; opens the seat menu.
  - **Host/moderator tools** (online rooms, permission-checked server-side):
    move the player between teams or roles, and kick them from the room —
    via the existing `admin/seat` + `admin/kick` APIs.


## v20.2 — exact lobby replicas

- Team cards are now **token-exact replicas of the lobby team-picker cards**,
  verified by comparing computed styles side by side:
  `border: 2px solid var(--cm-red)` · `background:
  color-mix(in srgb, var(--cm-red-pale) 50%, transparent)` (the lobby's 50%
  tint) · `border-radius: 16px (rounded-2xl)` · the same lift shadow · the
  same coloured icon square (`var(--cm-card-*)`, `#00000026` border,
  `rounded-xl`).
- All card measurements scale with `clamp()` per device (padding, icon,
  chips), so the card is never oversized — it just fits.
- Player chips use the lobby role-button recipe: surface card, 2px border,
  rounded-xl, hugging avatar + name (fit-content). Operatives keep the
  neutral border; captains carry the team's brand border (the lobby's
  "selected" accent).
- The header icon square can no longer be squeezed by flex (`flex: 0 0 auto`)
  and the header wraps gracefully when narrow.
- Mobile team cards use the same exact recipe at phone scale, with a tighter
  height cap (9.5rem).


## v20.3 — team-card position + real landscape layout

- Desktop team cards are now **top-aligned with the board** instead of
  floating in the middle of the rail.
- **Landscape phones get a proper two-column layout**: the word board takes
  most of the width and the clue panel becomes a full-height side column —
  always visible, fixed usable width, no inner scrollbar, and the shell
  never scrolls. The team strip collapses to one line. (Previously the clue
  panel was tied to a container-height width formula that collapsed it to
  ~110px and pushed it below the fold behind a page scroll.)
- The clue panel lost its inner scrollbar on every layout (`overflow:
  visible` — it is sized by its content).


## v20.4 — stacked landscape + iOS keyboard fix

- **Landscape is stacked again — the clue panel is ALWAYS under the board,
  never beside it.** The board keeps a healthy explicit height
  (`clamp(10.5rem, 46dvh, 17rem)`), the clue panel sits directly beneath it
  at a full usable width (`min(100%, 36rem)`) with no inner scrollbar, and
  the shell scrolls only a few dozen pixels on very short screens.
- **iOS keyboard safety**: on iPhones, opening the keyboard resizes the
  layout viewport, which used to crush the 100dvh game layout (the word
  board collapsed while typing a clue). While any game input is focused, the
  enhancement script now freezes the game page at its pixel height (both
  `height` and `max-height`, which the stylesheet caps at 100dvh) and allows
  internal scrolling so the field stays reachable. Everything is restored on
  blur and on rotation.


## v20.5 — draggable log, classic card controls, keyboard scroll reset

- **The floating event log is now fully draggable** — grab its header and
  drop it anywhere on screen (movement uses a translate, immune to RTL
  inset quirks; the board row no longer clips it). The position persists in
  `localStorage` and survives reloads; double-click the header to snap it
  back to the default corner. The drawer is also smaller by default on
  phones.
- **Classic card controls everywhere**: tap/click = select the card, hand
  button = point — identical on desktop and phones. The compiled bundle's
  touch layer (tap-to-point + 450ms-hold-to-select + its hint line) is
  neutralised on touch-like pointers by swallowing its pointer/gesture
  events (including the implicit `lostpointercapture` that armed its click
  guard) and re-sending a clean click through the bundle's own desktop
  path. Mouse input is completely untouched. The hand button is re-shown on
  phones and pinned small (1.5rem) to the card's top-right edge so it never
  covers the word.
- **Keyboard lock now resets scroll on release** — iOS scrolled the page to
  reveal the input and the scroll stayed after the keyboard closed, which
  made the header "eat" the top of the board.


## v20.6 — draggable log (fixed), point tags for captains, live clue for all

- **Log dragging fixed for real**: the whole header is now a drag grip
  (including the title button — previously the button swallowed the press),
  pointer capture starts only when a drag actually begins (so header
  buttons keep their natural clicks), the end-of-drag save no longer reads
  mid-flight geometry (a phantom `pointercancel(0,0)` after synthetic
  capture used to snap the dock home), and `sync()` no longer re-places a
  dock that is already wired. Double-click the header to reset the corner.
- **Pointed cards are visible to everyone — captains included.** The app
  renders pointer tags for operatives/spectators but omits them on the
  captain's board; since the pointers data still arrives on every client,
  the enhancement script reads it from the board component and renders
  identical tags for viewers missing them, plus a red ring + glow on the
  pointed card for everyone.
- **Live clue panel for everyone**: while a clue is active, every viewer
  who is not the on-turn operative (other team, captains, spectators) sees
  a "التلميح الحالي / Current clue" card with the word and number, themed
  to the clue team. The end-turn button remains exclusive to the on-turn
  team (bundle behaviour, verified). When the turn ends, the clue panel is
  cleared everywhere and the turn banner shows the next state.


## v20.7 — modern pointer-capture drag recipe

Rewrote the floating-element dragging to the current standard pattern
(MDN / web.dev pointer-events guidance) after research:

- `setPointerCapture()` now happens **on pointerdown** (early capture is
  what keeps the gesture out of the browser's scroll heuristics — capturing
  only after a movement threshold is what made dragging fail on real
  touch devices).
- `pointerdown` on the grip calls `preventDefault()` (no text selection,
  no iOS magnifier); a resulting tap is forwarded manually with
  `btn.click()` because capture retargets the natural click.
- rAF-throttled `translate3d` movement, clamped to the viewport.
- Full lifecycle cleanup on `pointerup` / `pointercancel` /
  `lostpointercapture`; grip CSS now sets `touch-action:none`,
  `user-select:none` and `-webkit-touch-callout:none` on the whole header
  (including its buttons), plus a dotted grip affordance.
- The floating log button is now **draggable too** (park it anywhere), with
  the same tap-vs-drag logic, RTL-safe base measurement, and persistence in
  `clue-me:fab-pos`. A tap still toggles the log.
- Double-tap the drawer header to snap it back to the default corner
  (manual timing detection — iOS never fires dblclick natively).
- Verified with REAL trusted input (Playwright mouse/touchscreen), not
  synthetic dispatch: drawer drag, header tap, double-tap reset, FAB drag,
  FAB tap, plus the full room regression (live clue, captain point tags,
  tap-to-select, end-turn exclusivity).


## v20.8 — dual-path drag (touch never slips) + meteor trail

- **Root cause of "it slips from my finger"**: on phones the browser can
  still claim a pointer-event gesture for scrolling. Dragging now runs on a
  dual path:
  - **Touch** is driven by `touchstart/touchmove/touchend` with
    `preventDefault()` on the very first event — the browser can never
    steal the gesture, so the element follows the finger 1:1 with no
    sticking (verified: strictly monotonic follow samples).
  - **Mouse** keeps pointer events + pointer capture + window-level
    tracking.
- No clamping during the drag (only at the drop), `will-change: transform`
  while dragging, and `touch-action:none` enforced inline on the grips.
- Taps are forwarded manually to the button under the finger; double-tap
  on the drawer header snaps it home.
- **Meteor/comet particle trail** while dragging (drawer and floating
  button): a full-screen canvas overlay emits streaking particles behind
  the element, colored per theme (light: red/blue/gold · dark: ember/bright
  blue/white · mani: pink/violet/white — colors sampled from the live CSS
  tokens). Additive `lighter` compositing for the glow, capped at ~150
  particles, and fully disabled for `prefers-reduced-motion`.


## v20.9 — floating chat above the log + lobby return-to-game button

- **Floating chat button**: the game chat moved from the header to a
  floating button stacked directly ABOVE the log button — it follows the
  log button wherever it is dragged, mirrors the unread-messages badge,
  and opens the same chat dialog on tap. (Positioning is computed from
  the drag coordinates, not rect reads — Chromium can serve a stale
  layout right after a transform change.)
- **Smooth FAB dragging**: the log button's CSS transition is disabled
  during the drag (it made every move lag ~180ms behind the finger) and
  restored at the drop.
- **Lobby return-to-game**: while a game is running, the lobby's "اللعبة
  شغالة" card previously showed "الرجوع للعبة" as plain TEXT (a bundle
  bug — it was never a button). A real, prominent return button is now
  injected under it and navigates back to the running game; it appears
  for the host and everyone else who steps back to the lobby mid-game.


## v21 — lobby reorder + chat button restored

- **Game-view chat button is back in the header** where it always was (the
  floating chat experiment was removed).
- **Lobby reordered** (pure CSS `order` on the already-flex column — no DOM
  moves, React-safe):
  - Share code → seat settings → teams → room management (إدارة الغرفة)
  - **Room chat directly UNDER room management and ABOVE the event log**
  - **Event log (سجل الأحداث)**
  - **"اللعبة شغالة" status card + the return-to-game button UNDER the log**
  - Footer (رجوع للوبي / الخروج من الغرفة) last
  - Same order applies in waiting rooms (chat + log sink together).


## v21.1 — room error diagnostics

- **Root cause found**: the app maps EVERY server error to "الغرفة دي مش
  موجودة" — its error-code lookup is broken (server codes are SNAKE_CASE,
  the client looks for camelCase keys), so full/banned/closed/kicked all
  collapsed into "not found". All those pretty translated strings existed
  but were never reachable.
- **Fix (overlay)**: `window.fetch` is hooked for the create/join/room-
  lookup calls; the REAL error code is captured and the displayed generic
  message is replaced (at the text-node level, keeping icons) with a
  specific bilingual diagnosis:
  - ROOM_NOT_FOUND — wrong code / host closed it; check the 4-letter code
  - ROOM_FULL — every seat taken; wait or ask the host to raise the limit
  - ROOM_CLOSED — the game ended; create/ask for a new room
  - ROOM_IN_PROGRESS — you will join as a spectator until the round ends
  - ACCOUNT_BANNED — account banned from rooms
  - KICK_RESTRICTED — you were kicked and can't rejoin temporarily,
    **with the remaining time computed from the server's until timestamp**
  - NETWORK — connection problem; check the internet
  - INVALID_CODE / INVALID_NAME / INVALID_PAYLOAD / INTERNAL — precise hints
- Verified live: wrong code in the join dialog, a full 2-player room, and a
  kicked player with a 10-minute restriction (shows "after ~10 minutes").


## v22 — admin panel overhaul

### Server (index.js — patches, source kept in sync)
- **Root admin concept**: accounts seeded from `ADMIN_EMAILS` (and the boot
  account on a fresh local server) are ROOT. Only roots can promote or
  demote admins (`NOT_ROOT` otherwise) — a new `demote` action was added.
- **Ban protections**: nobody can block themselves (`CANT_BLOCK_SELF`) or
  any admin (`ADMIN_IMMUNE` — demote first). Root cannot demote himself.
- **Audit log with names**: moderation entries now record the player NAME
  (plus email for promote) instead of `account <uuid>`.
- **Presence**: every authenticated call stamps `lastSeen`; the users API
  exposes `root`, `lastSeen` and `discordId` per account.

### Client (admin overlay — game-room-v20.js v59)
- A rebuilt **players panel** replaces the app's list on /admin:
  - 🔎 **search bar** — by name, email, or Discord id
  - 🟢🔴 **online/offline dots** (lastSeen within 2 minutes = online) with
    "آخر ظهور" text per row
  - tap a player → **profile sheet**: email, **Discord id + profile link**,
    account id, join date, online status, root/admin/muted/banned badges
  - promote/demote buttons visible **to roots only**; block is disabled for
    yourself and for admins (with explanatory tooltips + Arabic error
    toasts from the server codes)
- Audit tab: any displayed `account <uuid>` is replaced by the player name.

> Deploy note: set `ADMIN_EMAILS=your@email` in Wispbyte env — that account
> becomes the ROOT admin. Promoted admins never gain promote/demote rights.
