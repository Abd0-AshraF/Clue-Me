/* ============================================================================
   Clue Me — game room enhancement v20.1
   ----------------------------------------------------------------------------
   Works alongside the compiled React bundle WITHOUT touching React-managed
   DOM (no reparenting — that would break reconciliation):

   1. Floating event-log toggle (on <body>, outside the React root); the
      drawer itself is the existing .cm-dock element, floated with pure CSS
      (room-layout-v20.css). Badge + pulse on new events.
   2. Remaining-words pills mirrored onto the desktop team cards.
   3. Player profiles: clicking/tapping a roster chip opens a profile sheet
      with actions — cheer, change your own seat, and (for the host /
      moderators) move & kick. This replaces the old instant cheer particles,
      which now only fire from the sheet's "cheer" action.

   Everything is driven by a throttled MutationObserver, so it survives
   re-renders, role changes, round changes and route changes.
   ========================================================================== */
(function () {
  "use strict";
  if (window.__cmRoomV20) return;
  window.__cmRoomV20 = true;

  var html = document.documentElement;
  html.classList.add("cm-v20");

  /* ============================================================== strings */
  var STRINGS = {
    ar: {
      profile: "الملف الشخصي",
      profileCard: "بطاقة اللاعب",
      profileHintSelf: "إجراءات سريعة لك داخل الغرفة",
      profileHintOther: "إجراءات سريعة داخل الغرفة",
      cheer: "ابعتر تشجيع 🎉",
      seat: "غيّر مقعدك ودورك",
      kick: "طرد من الغرفة",
      moveTeam: "نقل اللاعب — الفريق",
      moveRole: "نقل اللاعب — الدور",
      red: "الفريق الأحمر",
      blue: "الفريق الأزرق",
      captain: "قائد",
      operative: "عميل",
      me: "أنت",
      online: "متصل",
      offline: "غير متصل",
      close: "إغلاق",
      done: "تم ✓",
      working: "ثانية واحدة…",
      err: "حصل خطأ — جرّب تاني",
      forbidden: "معاكش الصلاحية دي",
      hostTools: "أدوات المضيف"
    },
    en: {
      profile: "Profile",
      profileCard: "Player card",
      profileHintSelf: "Quick room actions for you",
      profileHintOther: "Quick room actions in this room",
      cheer: "Send a cheer 🎉",
      seat: "Change your seat",
      kick: "Kick from room",
      moveTeam: "Move player — team",
      moveRole: "Move player — role",
      red: "Red team",
      blue: "Blue team",
      captain: "Captain",
      operative: "Operative",
      me: "You",
      online: "Online",
      offline: "Offline",
      close: "Close",
      done: "Done ✓",
      working: "One moment…",
      err: "Something went wrong — try again",
      forbidden: "You don't have that permission",
      hostTools: "Host tools"
    }
  };

  function t(key) {
    var lang = html.lang === "en" ? "en" : "ar";
    return STRINGS[lang][key];
  }

  /* ======================================================= game sounds */
  var SOUNDBOARD = {
    correct: [
      "/sounds/Wing_it_1.mp3",
      "/sounds/Wing_it_2.mp3",
      "/sounds/Wing_it_3.mp3"
    ],
    wrong: [
      "/sounds/wrong_1.mp3",
      "/sounds/wrong_2.mp3",
      "/sounds/wrong_3.mp3"
    ],
    assassin: "/sounds/black.mp3"
  };
  var soundUnlockBound = false;
  var AUDIO_SETTINGS_KEY = "clue-me:audio";
  var discordConfigCache = { at: 0, data: null, pending: null };
  var visualEffectsSig = null;
  var lastGameView = null;
  var activeSoundboardAudios = [];
  var trackedAudioContexts = [];
  var soundSocketBound = false;
  var soundSocketRef = null;
  var lastAudioSettingsSig = null;
  var homeMenuDismissBound = false;

  function pickVariant(list, seed) {
    if (!list || !list.length) return null;
    if (!seed) return list[0] || null;
    var hash = 0;
    var str = String(seed);
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return list[Math.abs(hash) % list.length] || list[0] || null;
  }

  function clamp(num, min, max) {
    num = Number(num);
    if (!Number.isFinite(num)) num = min;
    return Math.min(Math.max(num, min), max);
  }

  function readAudioSettings() {
    var out = { master: 80, ui: 70, game: 85, soundboard: 100, muted: false, haptics: true, effects: true };
    try {
      var raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
      if (!raw) return out;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (var k in parsed) out[k] = parsed[k];
        out.muted = parsed.muted === true;
      }
    } catch (e) {}
    return out;
  }

  function soundboardVolume() {
    var settings = readAudioSettings();
    if (settings.muted) return 0;
    var master = clamp(settings.master, 0, 100) / 100;
    var game = clamp(settings.game, 0, 100) / 100;
    var soundboard = clamp(settings.soundboard != null ? settings.soundboard : 100, 0, 100) / 100;
    return clamp(master * game * soundboard, 0, 1);
  }

  function effectsEnabled() {
    var settings = readAudioSettings();
    return settings.effects !== false;
  }

  function rememberSoundboardAudio(audio) {
    activeSoundboardAudios = activeSoundboardAudios.filter(function (item) {
      return item && !item.ended && !item.paused;
    });
    activeSoundboardAudios.push(audio);
    var forget = function () {
      activeSoundboardAudios = activeSoundboardAudios.filter(function (item) { return item !== audio; });
      audio.removeEventListener('ended', forget);
      audio.removeEventListener('pause', forget);
    };
    audio.addEventListener('ended', forget);
    audio.addEventListener('pause', forget);
  }

  function stopAllSoundboardAudio() {
    activeSoundboardAudios.forEach(function (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (e) {}
    });
    activeSoundboardAudios = [];
  }

  function trackAudioContext(ctx) {
    if (!ctx) return ctx;
    if (trackedAudioContexts.indexOf(ctx) === -1) trackedAudioContexts.push(ctx);
    return ctx;
  }

  function patchAudioContexts() {
    if (patchAudioContexts.done) return;
    patchAudioContexts.done = true;
    ['AudioContext', 'webkitAudioContext'].forEach(function (key) {
      var Native = window[key];
      if (typeof Native !== 'function' || Native.__cmTracked) return;
      function Wrapped() {
        var ctx = Reflect.construct(Native, arguments, Wrapped);
        return trackAudioContext(ctx);
      }
      Wrapped.prototype = Native.prototype;
      Object.setPrototypeOf(Wrapped, Native);
      Wrapped.__cmTracked = true;
      window[key] = Wrapped;
    });
  }
  patchAudioContexts.done = false;

  function applyAudioSettingsNow() {
    var settings = readAudioSettings();
    var sig = JSON.stringify(settings);
    if (sig === lastAudioSettingsSig && visualEffectsSig === String(settings.effects !== false)) return;
    lastAudioSettingsSig = sig;
    visualEffectsSig = String(settings.effects !== false);
    html.classList.toggle('cm-min-effects', settings.effects === false);
    if (settings.effects === false) {
      try { trail && trail.hide && trail.hide(); } catch (e) {}
      try { clearLinkedTail(); } catch (e) {}
    }
    var volume = soundboardVolume();
    activeSoundboardAudios = activeSoundboardAudios.filter(function (audio) {
      if (!audio) return false;
      try {
        if (settings.muted || volume <= 0.001) {
          audio.pause();
          audio.currentTime = 0;
          return false;
        }
        if (!audio.paused) audio.volume = volume;
        return !audio.ended;
      } catch (e) {
        return false;
      }
    });
    trackedAudioContexts = trackedAudioContexts.filter(function (ctx) {
      if (!ctx) return false;
      try {
        if (settings.muted) {
          if (ctx.state !== 'closed' && ctx.state !== 'suspended') ctx.suspend().catch(function () {});
        } else if (ctx.state === 'suspended') {
          ctx.resume().catch(function () {});
        }
        return ctx.state !== 'closed';
      } catch (e) {
        return false;
      }
    });
  }

  function watchAudioSettings() {
    if (watchAudioSettings.done) return;
    watchAudioSettings.done = true;
    patchAudioContexts();
    applyAudioSettingsNow();
    try {
      var rawSetItem = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function (key, value) {
        rawSetItem(key, value);
        if (key === AUDIO_SETTINGS_KEY) window.setTimeout(applyAudioSettingsNow, 0);
      };
      var rawRemoveItem = localStorage.removeItem.bind(localStorage);
      localStorage.removeItem = function (key) {
        rawRemoveItem(key);
        if (key === AUDIO_SETTINGS_KEY) window.setTimeout(applyAudioSettingsNow, 0);
      };
    } catch (e) {}
    window.addEventListener('storage', function (ev) {
      if (!ev || ev.key === AUDIO_SETTINGS_KEY) applyAudioSettingsNow();
    });
    window.setInterval(applyAudioSettingsNow, 500);
  }
  watchAudioSettings.done = false;

  function primeSoundboard() {
    if (primeSoundboard.done) return;
    primeSoundboard.done = true;
    try {
      var probe = new Audio(pickVariant(SOUNDBOARD.correct, 'prime'));
      probe.preload = "auto";
      probe.volume = 0;
      var p = probe.play();
      if (p && typeof p.then === "function") {
        p.then(function () {
          probe.pause();
          probe.currentTime = 0;
        }).catch(function () {});
      }
    } catch (e) {}
  }
  primeSoundboard.done = false;

  function bindSoundUnlock() {
    if (soundUnlockBound) return;
    soundUnlockBound = true;
    var once = function () {
      primeSoundboard();
      ["pointerdown", "keydown", "touchstart"].forEach(function (type) {
        document.removeEventListener(type, once, true);
      });
    };
    ["pointerdown", "keydown", "touchstart"].forEach(function (type) {
      document.addEventListener(type, once, { capture: true, passive: true });
    });
  }

  function playSoundEffect(kind, seed) {
    var src =
      kind === "correct" ? pickVariant(SOUNDBOARD.correct, 'correct|' + (seed || '')) :
      kind === "wrong" ? pickVariant(SOUNDBOARD.wrong, 'wrong|' + (seed || '')) :
      kind === "assassin" ? SOUNDBOARD.assassin : null;
    var volume = soundboardVolume();
    if (!src || volume <= 0.001) return;
    try {
      var audio = new Audio(src);
      audio.preload = "auto";
      audio.volume = volume;
      rememberSoundboardAudio(audio);
      audio.play().catch(function () {});
    } catch (e) {}
  }

  function reactFiberKey(node) {
    if (!node) return null;
    for (var k in node) {
      if (k.indexOf("__reactFiber$") === 0) return k;
    }
    return null;
  }

  function detectViewerRoleFallback(view) {
    var out = { kind: null, team: null };
    var seatBtn = document.querySelector('.cm-game-page > header .cm-seat-btn');
    if (seatBtn) {
      var txt = ((seatBtn.textContent || '') + '').trim();
      if (/\bcaptain\b|\bspymaster\b|قائد/.test(txt)) out.kind = 'captain';
      else if (/\boperative\b|عميل/.test(txt)) out.kind = 'operative';
      var dot = seatBtn.querySelector('.cm-seat-dot');
      var cls = (dot && dot.className) || '';
      if (cls.indexOf('bg-red') !== -1) out.team = 'red';
      else if (cls.indexOf('bg-blue') !== -1) out.team = 'blue';
    }
    if (!out.kind && view && view.canClue && document.querySelector('textarea[name="clue-input"], input[name="clue-input"]')) {
      out.kind = 'captain';
    }
    if (!out.team && view && view.canClue && (view.turnTeam === 'red' || view.turnTeam === 'blue')) {
      out.team = view.turnTeam;
    }
    return out.kind || out.team ? out : null;
  }

  function readGameViewState() {
    var nodes = [
      document.querySelector('.cm-game-page > header'),
      document.querySelector('.cm-side-clue'),
      document.querySelector('.cm-board-frame .grid')
    ];
    var foundView = null;
    var foundRole = null;
    for (var n = 0; n < nodes.length; n++) {
      var node = nodes[n];
      if (!node) continue;
      var key = reactFiberKey(node);
      if (!key) continue;
      var fiber = node[key];
      var hops = 0;
      while (fiber && hops < 48) {
        var props = fiber.memoizedProps;
        if (props && !foundView && props.view && typeof props.view === 'object') {
          foundView = props.view;
        }
        if (props && !foundRole && props.role && typeof props.role === 'object') {
          foundRole = props.role;
        }
        if (foundView && foundRole) break;
        fiber = fiber.return;
        hops++;
      }
      if (foundView && foundRole) break;
    }
    if (!foundView) return null;
    var resolvedRole = foundRole ? {
      kind: foundRole.kind || null,
      team: foundRole.team || null
    } : detectViewerRoleFallback(foundView);
    return {
      phase: foundView.phase || null,
      turnTeam: foundView.turnTeam || null,
      clue: foundView.clue || null,
      winner: foundView.winner || null,
      gameId: foundView.gameId || null,
      canClue: !!foundView.canClue,
      canGuess: !!foundView.canGuess,
      revision: Number(foundView.revision || foundView.moveCount || 0),
      stateVersion: Number(foundView.stateVersion != null ? foundView.stateVersion : (foundView.revision || foundView.moveCount || 0)),
      guessesUsed: Number(foundView.guessesUsed || 0),
      maxGuesses: Number(foundView.maxGuesses || 0),
      clueNumber: foundView.clue && Number.isFinite(Number(foundView.clue.number)) ? Number(foundView.clue.number) : 0,
      clueSelections: Number(foundView.clueSelections || foundView.guessesUsed || 0),
      clueTarget: Number(foundView.clueTarget || (foundView.clue && foundView.clue.number) || 0),
      clueRemaining: Number(foundView.clueRemaining != null ? foundView.clueRemaining : Math.max(0, Number((foundView.clue && foundView.clue.number) || 0) - Number(foundView.guessesUsed || 0))),
      moveCount: Number(foundView.revision || foundView.moveCount || 0),
      cards: Array.isArray(foundView.cards) ? foundView.cards : null,
      role: resolvedRole || null
    };
  }

  function isBonusGuessView(view) {
    return !!(
      view &&
      view.phase === 'guess' &&
      (view.turnTeam === 'red' || view.turnTeam === 'blue') &&
      view.clueNumber > 0 &&
      view.guessesUsed === view.clueNumber &&
      view.maxGuesses > view.clueNumber
    );
  }

  function guessSoundKind(cardState, preGuessView) {
    if (cardState === 'assassin') return 'assassin';
    if (!isBonusGuessView(preGuessView)) return null;
    if (cardState === preGuessView.turnTeam) return 'correct';
    if (cardState === 'red' || cardState === 'blue' || cardState === 'neutral') return 'wrong';
    return null;
  }

  function handleAuthoritativeGuessResult(result) {
    if (!result || result.kind !== 'guess') return;
    var kind = guessSoundKind(result.cardColor, lastGameView);
    if (!kind) return;
    playSoundEffect(kind, [result.actorTeam, result.cardColor, result.index, result.winner || ''].join('|'));
  }

  function bindGuessSoundboard() {
    var socket = window.__clueMeSocket;
    if (!socket || typeof socket.on !== 'function') return;
    if (soundSocketRef === socket && soundSocketBound) return;
    if (soundSocketRef && soundSocketBound && typeof soundSocketRef.off === 'function') {
      try { soundSocketRef.off('game:result', handleGuessSoundboardEvent); } catch (e) {}
    }
    soundSocketRef = socket;
    soundSocketBound = true;
    socket.on('game:result', handleGuessSoundboardEvent);
  }

  function handleGuessSoundboardEvent(payload) {
    try { handleAuthoritativeGuessResult(payload && payload.result); } catch (e) {}
  }

  function syncGuessSoundboard() {
    bindGuessSoundboard();
  }

  /* ================================================== public discord link */
  function isHomeView() {
    return location.pathname === "/" || location.pathname === "/index.html";
  }

  function fetchDiscordPublicConfig(force) {
    var now = Date.now();
    if (!force && discordConfigCache.data && now - discordConfigCache.at < 60000) {
      return Promise.resolve(discordConfigCache.data);
    }
    if (!force && discordConfigCache.pending) return discordConfigCache.pending;
    discordConfigCache.pending = fetch("/api/auth/discord/config", {
      headers: { accept: "application/json" }
    }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (data) {
      discordConfigCache.at = Date.now();
      discordConfigCache.data = data || {};
      discordConfigCache.pending = null;
      return discordConfigCache.data;
    }).catch(function () {
      discordConfigCache.pending = null;
      return discordConfigCache.data || null;
    });
    return discordConfigCache.pending;
  }

  function ensureDiscordHomeButtonStyles() {
    if (document.getElementById("cm-home-discord-style")) return;
    var style = document.createElement("style");
    style.id = "cm-home-discord-style";
    style.textContent = '' +
      '.cm-home-discord{' +
        'flex:0 0 auto;' +
        'border-radius:.5rem !important;' +
        'background:var(--cm-surface) !important;' +
        'border:1px solid var(--cm-border) !important;' +
        'color:var(--cm-ink-soft) !important;' +
        'box-shadow:var(--cm-shadow-card) !important;' +
        'transition:transform .14s var(--cm-ease),border-color .14s var(--cm-ease),color .14s var(--cm-ease),box-shadow .14s var(--cm-ease);' +
      '}' +
      '.cm-home-discord:hover{' +
        'border-color:var(--cm-border-strong) !important;' +
        'background:var(--cm-surface) !important;' +
        'color:var(--cm-ink) !important;' +
        'box-shadow:var(--cm-shadow-lift) !important;' +
      '}' +
      '.cm-home-discord:active{transform:scale(.95)}' +
      '.cm-home-discord:focus-visible{outline:2px solid rgba(88,101,242,.35);outline-offset:2px}' +
      '.cm-home-discord svg{width:15px;height:15px;display:block;flex:0 0 auto}';
    document.head.appendChild(style);
  }

  function findHeaderActionsHost() {
    var radio = document.querySelector('header [role="radiogroup"]');
    return radio ? radio.parentElement : null;
  }

  function renderDiscordHeaderButton(inviteUrl) {
    var existing = document.querySelector('.cm-home-discord');
    var host = findHeaderActionsHost();
    if (!host || !inviteUrl) {
      if (existing) existing.remove();
      return;
    }
    ensureDiscordHomeButtonStyles();
    var label = html.lang === 'en' ? 'Discord server' : 'سيرفر الديسكورد';
    if (!existing) {
      existing = document.createElement('a');
      existing.className = 'cm-home-discord';
      existing.target = '_blank';
      existing.rel = 'noopener noreferrer';
      existing.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.369A19.791 19.791 0 0 0 15.885 3c-.191.328-.403.769-.554 1.117a18.27 18.27 0 0 0-5.487 0A12.64 12.64 0 0 0 9.29 3a19.736 19.736 0 0 0-4.438 1.372C2.045 8.53 1.285 12.58 1.66 16.57a19.9 19.9 0 0 0 5.995 3.03 14.3 14.3 0 0 0 1.285-2.106 12.955 12.955 0 0 1-2.02-.977c.17-.124.336-.255.497-.39 3.898 1.82 8.13 1.82 11.982 0 .162.135.328.266.498.39-.647.378-1.323.705-2.02.977.37.728.799 1.432 1.284 2.106a19.86 19.86 0 0 0 6-3.03c.5-4.626-.838-8.64-3.844-12.201ZM8.02 14.803c-1.182 0-2.156-1.085-2.156-2.419 0-1.333.955-2.418 2.156-2.418 1.21 0 2.174 1.095 2.156 2.418 0 1.334-.955 2.419-2.156 2.419Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.209 0 2.173 1.095 2.155 2.418 0 1.334-.946 2.419-2.155 2.419Z"></path></svg>';
    }
    existing.href = inviteUrl;
    existing.title = label;
    existing.setAttribute('aria-label', label);
    existing.style.position = '';
    existing.style.width = '';
    existing.style.height = '';
    existing.style.display = '';
    existing.style.alignItems = '';
    existing.style.justifyContent = '';
    existing.style.top = '';
    existing.style.left = '';
    existing.style.zIndex = '';
    existing.className = 'cm-home-discord inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-ink-soft shadow-card transition-all duration-150 hover:border-border-strong hover:text-ink active:scale-95';
    if (existing.parentElement !== host || existing !== host.lastElementChild) {
      host.appendChild(existing);
    }
  }

  function syncDiscordHomeButton() {
    fetchDiscordPublicConfig(false).then(function (cfg) {
      renderDiscordHeaderButton(cfg && cfg.serverInviteUrl ? cfg.serverInviteUrl : null);
      try { syncMobileHomeHeader(); } catch (e) {}
    });
  }

  function writeAudioSettingsPatch(patch) {
    var next = readAudioSettings();
    for (var k in patch) next[k] = patch[k];
    try { localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(next)); } catch (e) {}
    applyAudioSettingsNow();
  }

  function isSettingsDialog(dialog) {
    if (!dialog) return false;
    var txt = ((dialog.textContent || '') + '').trim();
    return txt.indexOf('الإعدادات') !== -1 || txt.indexOf('Settings') !== -1;
  }

  function syncSettingsPanel() {
    var dialogs = document.querySelectorAll('[role="dialog"]');
    var dialog = null;
    for (var i = 0; i < dialogs.length; i++) {
      if (isSettingsDialog(dialogs[i])) { dialog = dialogs[i]; break; }
    }
    if (!dialog) return;
    if (dialog.querySelector('.cm-sb-settings')) return;
    var body = dialog.querySelector('.overflow-y-auto') || dialog;
    var settings = readAudioSettings();
    var block = document.createElement('section');
    block.className = 'cm-sb-settings';
    block.innerHTML =
      '<div class="cm-sb-settings-head">' +
        '<div class="cm-sb-settings-title">' + (html.lang === 'en' ? 'Soundboard volume' : 'مستوى صوت الساوند بورد') + '</div>' +
        '<div class="cm-sb-settings-val"></div>' +
      '</div>' +
      '<input class="cm-sb-settings-range" type="range" min="0" max="100" step="1" />' +
      '<p class="cm-sb-settings-note">' + (html.lang === 'en' ? 'Controls custom MP3 effects only.' : 'بيتحكم في أصوات الـ MP3 الإضافية فقط.') + '</p>' +
      '<label class="cm-fx-settings">' +
        '<input class="cm-fx-settings-check" type="checkbox" />' +
        '<span class="cm-fx-settings-copy">' +
          '<strong class="cm-fx-settings-title">' + (html.lang === 'en' ? 'Reduce animations & effects' : 'تقليل الحركات والمؤثرات') + '</strong>' +
          '<span class="cm-fx-settings-note">' + (html.lang === 'en' ? 'Disable room/game visual effects for this player only.' : 'يعطّل المؤثرات والحركات بصريًا لهذا اللاعب فقط.') + '</span>' +
        '</span>' +
      '</label>';
    var range = block.querySelector('.cm-sb-settings-range');
    var val = block.querySelector('.cm-sb-settings-val');
    var effectsCheck = block.querySelector('.cm-fx-settings-check');
    function paint() {
      var cur = readAudioSettings();
      var sb = clamp(cur.soundboard != null ? cur.soundboard : 100, 0, 100);
      range.value = String(sb);
      val.textContent = sb + '%';
      if (effectsCheck) effectsCheck.checked = cur.effects === false;
    }
    range.addEventListener('input', function () {
      writeAudioSettingsPatch({ soundboard: Number(range.value) });
      paint();
    });
    if (effectsCheck) {
      effectsCheck.addEventListener('change', function () {
        writeAudioSettingsPatch({ effects: effectsCheck.checked ? false : true });
        paint();
      });
    }
    paint();
    body.appendChild(block);
  }

  function homeActionsHost() {
    return isHomeView() ? findHeaderActionsHost() : null;
  }

  function hideHomeActionsForMenu(host, hide) {
    if (!host) return;
    var nodes = host.children;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.classList.contains('cm-home-menu-btn') || el.classList.contains('cm-home-mobile-menu')) continue;
      el.style.display = hide ? 'none' : '';
    }
  }

  function buttonText(btn) {
    return ((btn && btn.textContent) || '').replace(/\s+/g, ' ').trim();
  }

  function findHomeAccountTrigger(host) {
    if (!host || !host.children) return null;
    var fallback = null;
    var nodes = host.children;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!node) continue;
      if (node.classList && (node.classList.contains('cm-home-menu-btn') || node.classList.contains('cm-home-discord'))) continue;
      if (node.getAttribute && node.getAttribute('role') === 'radiogroup') continue;
      if (node.querySelector && node.querySelector('[role="radiogroup"]')) continue;
      if (node.matches && node.matches('button')) {
        if (buttonText(node)) return node;
        if (!fallback) fallback = node;
        continue;
      }
      var buttons = node.querySelectorAll ? node.querySelectorAll('button') : [];
      for (var j = 0; j < buttons.length; j++) {
        var btn = buttons[j];
        if (!btn) continue;
        if (btn.closest && btn.closest('[role="radiogroup"]')) continue;
        if (buttonText(btn)) return btn;
        if (!fallback) fallback = btn;
      }
    }
    return fallback;
  }

  function cycleThemePref() {
    try {
      var list = ['light', 'dark', 'mani', 'mani-dark', 'mot', 'system'];
      var cur = localStorage.getItem('clue-me:theme') || 'system';
      var idx = list.indexOf(cur);
      var next = list[(idx + 1 + list.length) % list.length];
      localStorage.setItem('clue-me:theme', next);
    } catch (e) {}
    location.reload();
  }

  function setHomeLang(lang) {
    try { localStorage.setItem('clue-me:lang', lang === 'ar' ? 'ar' : 'en'); } catch (e) {}
    location.reload();
  }

  function setHomeMenuOpen(open) {
    var btn = document.querySelector('.cm-home-menu-btn');
    var menu = document.querySelector('.cm-home-mobile-menu');
    var backdrop = document.querySelector('.cm-home-mobile-backdrop');
    if (!btn || !menu || !backdrop) return;
    btn.setAttribute('data-open', open ? '1' : '0');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.hidden = !open;
    backdrop.hidden = !open;
    html.classList.toggle('cm-home-menu-open', open);
  }

  function syncMobileHomeHeader() {
    var host = homeActionsHost();
    var btn = document.querySelector('.cm-home-menu-btn');
    var menu = document.querySelector('.cm-home-mobile-menu');
    var backdrop = document.querySelector('.cm-home-mobile-backdrop');
    var mobile = !!host && window.innerWidth <= 640;
    if (!mobile) {
      if (btn) btn.remove();
      if (menu) menu.remove();
      if (backdrop) backdrop.remove();
      hideHomeActionsForMenu(host, false);
      html.classList.remove('cm-home-menu-open');
      return;
    }
    if (!discordConfigCache.data && !discordConfigCache.pending) {
      fetchDiscordPublicConfig(false).then(function () {
        try { syncMobileHomeHeader(); } catch (e) {}
      });
    }
    hideHomeActionsForMenu(host, true);
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cm-home-menu-btn';
      btn.setAttribute('aria-label', html.lang === 'en' ? 'Open menu' : 'فتح القائمة');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h16"></path></svg>';
      host.appendChild(btn);
    }
    if (!backdrop) {
      backdrop = document.createElement('button');
      backdrop.type = 'button';
      backdrop.className = 'cm-home-mobile-backdrop';
      backdrop.hidden = true;
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.appendChild(backdrop);
    }
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'cm-home-mobile-menu';
      menu.hidden = true;
      menu.setAttribute('role', 'menu');
      document.body.appendChild(menu);
    }
    if (!homeMenuDismissBound) {
      homeMenuDismissBound = true;
      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') setHomeMenuOpen(false);
      }, true);
    }
    var cfg = discordConfigCache.data || {};
    var me = window.__cmMe || null;
    var accountLabel = me ? cmEsc(me.name || 'Account') : (html.lang === 'en' ? 'Login / Account' : 'الدخول / الحساب');
    var discordLabel = html.lang === 'en' ? 'Discord' : 'ديسكورد';
    var themeLabel = html.lang === 'en' ? 'Theme' : 'الثيم';
    var langLabel = html.lang === 'en' ? 'Language' : 'اللغة';
    var curTheme = (function(){ try { return localStorage.getItem('clue-me:theme') || 'mot'; } catch(e) { return 'mot'; } })();
    var menuSig = [
      html.lang === 'en' ? 'en' : 'ar',
      accountLabel,
      cfg.serverInviteUrl || '',
      curTheme
    ].join('\u0001');

    /* This function runs from the page MutationObserver. Rebuilding the
       menu on every sync creates another childList mutation, which starts
       an endless refresh loop on phone home screens. Only rebuild when the
       visible menu content actually changed. */
    if (menu.getAttribute('data-cm-menu-sig') !== menuSig) {
      menu.innerHTML = '' +
        '<div class="cm-home-mobile-menu-head">' +
          '<strong>' + (html.lang === 'en' ? 'Menu' : 'القائمة') + '</strong>' +
          '<button type="button" class="cm-home-mobile-close" aria-label="' + (html.lang === 'en' ? 'Close menu' : 'إغلاق القائمة') + '">✕</button>' +
        '</div>' +
        '<div class="cm-home-mobile-group">' +
          '<div class="cm-home-mobile-group-label">' + cmEsc(accountLabel) + '</div>' +
          '<button type="button" class="cm-home-mobile-item cm-home-mobile-account">' + accountLabel + '</button>' +
        '</div>' +
        (cfg.serverInviteUrl ? '<div class="cm-home-mobile-group"><div class="cm-home-mobile-group-label">' + discordLabel + '</div><a class="cm-home-mobile-item cm-home-mobile-discord" target="_blank" rel="noopener noreferrer" href="' + cmEsc(cfg.serverInviteUrl) + '">Discord</a></div>' : '') +
        '<div class="cm-home-mobile-group"><div class="cm-home-mobile-group-label">' + langLabel + '</div><div class="cm-home-mobile-row"><button type="button" class="cm-home-mobile-item cm-home-mobile-lang' + (html.lang === 'en' ? ' is-active' : '') + '" data-lang="en">English</button><button type="button" class="cm-home-mobile-item cm-home-mobile-lang' + (html.lang === 'ar' ? ' is-active' : '') + '" data-lang="ar">عربي</button></div></div>' +
        '<div class="cm-home-mobile-group cm-home-mobile-theme-group"><div class="cm-home-mobile-group-label">' + themeLabel + '</div><div class="cm-home-mobile-theme-grid">' +
  '<button type="button" class="cm-home-mobile-item cm-home-mobile-theme' + (curTheme === 'mot' ? ' is-active' : '') + '" data-theme="mot">👁️ Mot</button>' +
  '<button type="button" class="cm-home-mobile-item cm-home-mobile-theme' + (curTheme === 'light' ? ' is-active' : '') + '" data-theme="light">☀️ ' + (html.lang === 'en' ? 'Light' : 'فاتح') + '</button>' +
  '<button type="button" class="cm-home-mobile-item cm-home-mobile-theme' + (curTheme === 'dark' ? ' is-active' : '') + '" data-theme="dark">🌙 ' + (html.lang === 'en' ? 'Dark' : 'داكن') + '</button>' +
  '<button type="button" class="cm-home-mobile-item cm-home-mobile-theme' + (curTheme === 'mani' ? ' is-active' : '') + '" data-theme="mani">🌸 ' + (html.lang === 'en' ? 'Mani' : 'ماني') + '</button>' +
  '<button type="button" class="cm-home-mobile-item cm-home-mobile-theme' + (curTheme === 'mani-dark' ? ' is-active' : '') + '" data-theme="mani-dark">🔮 ' + (html.lang === 'en' ? 'Mani Dark' : 'ماني داكن') + '</button>' +
  '<button type="button" class="cm-home-mobile-item cm-home-mobile-theme' + (curTheme === 'system' ? ' is-active' : '') + '" data-theme="system">⚙️ ' + (html.lang === 'en' ? 'System' : 'تلقائي') + '</button>' +
'</div></div>' +
        '<div class="cm-home-mobile-group"><button type="button" class="cm-home-mobile-item cm-home-mobile-open-settings">⚙️ ' + (html.lang === "en" ? "Settings & Audio" : "الإعدادات والأصوات") + '</button></div>';
      menu.setAttribute('data-cm-menu-sig', menuSig);

      var closeBtn = menu.querySelector('.cm-home-mobile-close');
      if (closeBtn) closeBtn.onclick = function () { setHomeMenuOpen(false); };
      var settingsMobileBtn = menu.querySelector('.cm-home-mobile-open-settings');      if (settingsMobileBtn) {        settingsMobileBtn.onclick = function() {          setHomeMenuOpen(false);          var host = homeActionsHost();          if (host) {            var allBtns = host.querySelectorAll("button");            for (var b = 0; b < allBtns.length; b++) {              var al = allBtns[b].getAttribute("aria-label") || "";              var txt = allBtns[b].textContent || "";              if (al.indexOf("الإعدادات") !== -1 || al.indexOf("Settings") !== -1 || txt.indexOf("الإعدادات") !== -1 || txt.indexOf("Settings") !== -1) {                allBtns[b].click(); return;              }            }          }        };      }      var accountBtn = menu.querySelector('.cm-home-mobile-account');
      if (accountBtn) {
        accountBtn.onclick = function () {
          var activeHost = homeActionsHost();
          var clickable = findHomeAccountTrigger(activeHost);
          hideHomeActionsForMenu(activeHost, false);
          setHomeMenuOpen(false);
          window.requestAnimationFrame(function () {
            if (clickable) clickable.click();
            else location.assign('/login');
            window.setTimeout(function () {
              try { syncMobileHomeHeader(); } catch (e) {}
            }, 0);
          });
        };
      }
      var themeBtns = menu.querySelectorAll('.cm-home-mobile-theme');
      for (var tb = 0; tb < themeBtns.length; tb++) {
        themeBtns[tb].onclick = function (ev) {
          var chosen = ev.currentTarget.getAttribute('data-theme');
          setHomeMenuOpen(false);
          if (chosen) {
            try {
              localStorage.setItem('clue-me:theme', chosen);
              var isDark = chosen === 'dark' || chosen === 'mani-dark' || chosen === 'mot' || (chosen === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
              html.classList.toggle('dark', isDark);
              html.classList.toggle('mani', chosen === 'mani' || chosen === 'mani-dark');
              html.classList.toggle('mani-dark', chosen === 'mani-dark');
              html.classList.toggle('mot', chosen === 'mot');
              location.reload();
            } catch (e) {}
          } else {
            cycleThemePref();
          }
        };
      }
      var langBtns = menu.querySelectorAll('.cm-home-mobile-lang');
      for (var j = 0; j < langBtns.length; j++) {
        langBtns[j].onclick = function (ev) {
          setHomeMenuOpen(false);
          setHomeLang(ev.currentTarget.getAttribute('data-lang'));
        };
      }
    }

    var rect = btn.getBoundingClientRect();
    var menuWidth = Math.min(Math.round(window.innerWidth * 0.84), 320);
    menu.style.top = Math.round(rect.bottom + 8) + 'px';
    menu.style.left = Math.round(Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.left))) + 'px';
    menu.style.width = menuWidth + 'px';
    btn.onclick = function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      setHomeMenuOpen(btn.getAttribute('data-open') !== '1');
    };
    backdrop.onclick = function () { setHomeMenuOpen(false); };
  }

  /* ============================================================ log FAB */
  var STORAGE_KEY = "clue-me:log-open";
  var open = false;
  try {
    open = localStorage.getItem(STORAGE_KEY) === "1";
  } catch (e) { /* storage unavailable */ }

  var ICON_HIST =
    '<svg class="cm-log-fab-hist" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>' +
    '<path d="M3 3v5h5"></path>' +
    '<path d="M12 7v5l4 2"></path>' +
    "</svg>";
  var ICON_CLOSE =
    '<svg class="cm-log-fab-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M18 6 6 18"></path>' +
    "<path d=\"m6 6 12 12\"></path>" +
    "</svg>";
  var ICON_X =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
  var ICON_SEAT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10h13a4 4 0 0 1 4 4v0a2 2 0 0 1-2 2H7a4 4 0 0 1-4-4Z"></path><path d="M6 16v5"></path><path d="M14 16v5"></path><path d="M7 10V6a2 2 0 0 1 2-2h7"></path><path d="M19 7h2"></path><path d="M19 11h2"></path></svg>';
  var ICON_CHEER =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 14 9 12"></path><path d="m13.5 5.5 5 5"></path><path d="M21 3 12.4 11.6"></path><path d="m15 3 6 6"></path><path d="M11.5 6.5 4 14a2 2 0 0 0 0 3l3 3a2 2 0 0 0 3 0l7.5-7.5"></path></svg>';

  var fab = document.createElement("button");
  fab.type = "button";
  fab.className = "cm-log-fab";
  fab.hidden = true;
  fab.innerHTML = ICON_HIST + ICON_CLOSE + '<span class="cm-log-fab-badge" aria-hidden="true"></span>';
  document.body.appendChild(fab);


  /* ============================================================================
     Admin panel enhancement — a self-contained players panel built from the
     captured /api/admin/users data:
       • search bar (name / email / discord id)
       • online/offline dots (lastSeen within 2 minutes = online)
       • click a player → profile sheet (email, Discord id + profile link,
         root/admin badges, moderation state, last seen)
       • promote/demote visible to ROOT admins only (server-enforced too);
         block is disabled for admins and for yourself
       • audit entries: "account <uuid>" replaced by the player's name
   ============================================================================ */
  function cmAdminData() {
    return (window.__cmAdminUsers && Date.now() - window.__cmAdminUsers.at < 120000)
      ? window.__cmAdminUsers.users : null;
  }

  /* Direct data source — the bundle keeps its own fetch reference, so the
     response hook can miss the app's calls. We fetch the admin data
     ourselves with the app's stored token. */
  var cmAdminTimer = null;
  function cmAdminFetch(force) {
    if (location.pathname !== "/admin") return;
    var token = null;
    try { token = localStorage.getItem("clue-me:token") || ""; } catch (e) {}
    if (!token) return;
    var fresh = !force && window.__cmAdminUsers && Date.now() - window.__cmAdminUsers.at < 20000;
    if (!fresh) {
      fetch("/api/admin/users", { headers: { authorization: "Bearer " + token } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (d && d.users) {
            window.__cmAdminUsers = { at: Date.now(), users: d.users };
            window.__cmAdminToken = "Bearer " + token;
            try { syncAdminPanel(); } catch (e) {}
          }
        }).catch(function () {});
    }
    if (!window.__cmMe) {
      fetch("/api/auth/me", { headers: { authorization: "Bearer " + token } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (d && d.user) {
            window.__cmMe = d.user;
            try { syncAdminPanel(); } catch (e) {}
          }
        }).catch(function () {});
    }
    if (!window.__cmAdminAudit) {
      fetch("/api/admin/audit", { headers: { authorization: "Bearer " + token } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (d && d.entries) window.__cmAdminAudit = { at: Date.now(), entries: d.entries };
        }).catch(function () {});
    }
  }
  function cmIsRoot() {
    return window.__cmMe && window.__cmMe.root === true;
  }
  function cmOnline(u) {
    return !!u.lastSeen && Date.now() - u.lastSeen < 120000;
  }
  function cmSeenText(u) {
    if (!u.lastSeen) return "آخر ظهور: غير معروف";
    var mins = Math.floor((Date.now() - u.lastSeen) / 60000);
    if (mins < 1) return "أونلاين الآن";
    if (mins < 60) return "آخر ظهور: قبل " + mins + " دقيقة";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return "آخر ظهور: قبل " + hrs + " ساعة";
    return "آخر ظهور: قبل " + Math.floor(hrs / 24) + " يوم";
  }
  function cmEsc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function adminActiveTab() {
    var active = document.querySelector('main [role="radiogroup"] [role="radio"][aria-checked="true"]');
    var text = ((active && active.textContent) || '').trim().toLowerCase();
    if (text.indexOf('لاعب') !== -1 || text.indexOf('player') !== -1) return 'users';
    if (text.indexOf('بلاغ') !== -1 || text.indexOf('report') !== -1) return 'reports';
    if (text.indexOf('كلم') !== -1 || text.indexOf('word') !== -1) return 'words';
    if (text.indexOf('تدقيق') !== -1 || text.indexOf('audit') !== -1) return 'audit';
    return null;
  }

  function revealNativeAdminUsersList() {
    var hidden = document.querySelectorAll('.cm-admin-hide-app');
    for (var i = 0; i < hidden.length; i++) hidden[i].classList.remove('cm-admin-hide-app');
  }

  var adminPanelState = { q: "" };
  var adminShellState = {
    activeTab: "users",
    reports: null,
    reportsAt: 0,
    words: null,
    wordsAt: 0,
    wordsQuery: "",
    wordsLanguage: html.lang === "en" ? "en" : "ar",
    newWord: "",
    newWordLanguage: html.lang === "en" ? "en" : "ar",
    selectedUserId: null
  };
  try { window.__cmAdminShellState = adminShellState; } catch (e) {}

  function adminUiText(key) {
    var lang = html.lang === "en" ? "en" : "ar";
    var map = {
      ar: {
        reports: "البلاغات",
        users: "اللاعبين",
        words: "الكلمات",
        audit: "سجل التدقيق",
        loading: "جارٍ التحميل…",
        refresh: "تحديث",
        noReports: "مفيش بلاغات حالياً.",
        noAudit: "مفيش سجل تدقيق حالياً.",
        searchWords: "ابحث عن كلمة…",
        addWord: "إضافة كلمة",
        wordPlaceholder: "اكتب الكلمة…",
        add: "إضافة",
        disable: "تعطيل",
        enable: "تفعيل",
        custom: "مخصصة",
        library: "الأساسية",
        resolve: "إغلاق",
        ignore: "تجاهل",
        reporter: "المُبلّغ",
        reason: "السبب",
        room: "الغرفة",
        statusOpen: "مفتوح",
        statusDone: "مغلق",
        reportsHint: "إدارة البلاغات من هنا بشكل مباشر.",
        wordsHint: "إضافة وتعطيل الكلمات من نفس لوحة الإدارة.",
        auditHint: "كل العمليات الإدارية المهمة بتظهر هنا.",
        online: "أونلاين",
        offline: "أوفلاين"
      },
      en: {
        reports: "Reports",
        users: "Players",
        words: "Words",
        audit: "Audit log",
        loading: "Loading…",
        refresh: "Refresh",
        noReports: "No reports right now.",
        noAudit: "No audit entries right now.",
        searchWords: "Search for a word…",
        addWord: "Add word",
        wordPlaceholder: "Type the word…",
        add: "Add",
        disable: "Disable",
        enable: "Enable",
        custom: "Custom",
        library: "Library",
        resolve: "Resolve",
        ignore: "Ignore",
        reporter: "Reporter",
        reason: "Reason",
        room: "Room",
        statusOpen: "Open",
        statusDone: "Closed",
        reportsHint: "Manage player reports from here.",
        wordsHint: "Add and disable words from one place.",
        auditHint: "Important admin actions are listed here.",
        online: "Online",
        offline: "Offline"
      }
    };
    return map[lang][key] || key;
  }

  function adminAuthToken() {
    try {
      var token = localStorage.getItem("clue-me:token") || "";
      return token ? "Bearer " + token : "";
    } catch (e) {
      return "";
    }
  }

  function adminJson(url, init) {
    var token = adminAuthToken();
    if (!token) return Promise.reject(new Error("no token"));
    return fetch(url, Object.assign({
      headers: Object.assign({ accept: "application/json", authorization: token }, (init && init.headers) || {})
    }, init || {})).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error((d.error && d.error.code) || "ERR");
        return d;
      });
    });
  }

  function adminShellSignature() {
    return [
      adminShellState.activeTab,
      (window.__cmAdminUsers && window.__cmAdminUsers.at) || 0,
      (window.__cmAdminAudit && window.__cmAdminAudit.at) || 0,
      adminShellState.reportsAt || 0,
      adminShellState.wordsAt || 0,
      adminShellState.wordsQuery,
      adminShellState.wordsLanguage,
      adminShellState.newWord,
      adminShellState.newWordLanguage,
      adminShellState.selectedUserId || '',
      (window.__cmMe && window.__cmMe.id) || ""
    ].join("|");
  }

  function buildAdminPanel() {
    var users = cmAdminData();
    if (!users || !users.length) return null;
    var me = window.__cmMe || {};
    var root = cmIsRoot();
    var wrap = document.createElement("div");
    wrap.className = "cm-admin-panel";

    /* search bar */
    var bar = document.createElement("div");
    bar.className = "cm-admin-search";
    bar.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>' +
      '<input type="search" dir="auto" placeholder="' + (html.lang === "en" ? "Search players, email, Discord id…" : "ابحث بالاسم أو الإيميل أو الديسكورد…") + '" />';
    wrap.appendChild(bar);
    var refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "cm-admin-refresh";
    refresh.title = "تحديث";
    refresh.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"></path><path d="M21 3v5h-5"></path></svg>';
    refresh.addEventListener("click", function () {
      window.__cmAdminUsers = null;
      window.__cmAdminAudit = null;
      cmAdminFetch();
    });
    bar.appendChild(refresh);
    var input = bar.querySelector("input");
    input.value = adminPanelState.q;
    input.addEventListener("input", function () {
      adminPanelState.q = input.value;
      renderRows();
    });

    var list = document.createElement("div");
    list.className = "cm-admin-rows";
    wrap.appendChild(list);

    function matches(u, q) {
      if (!q) return true;
      q = q.toLowerCase();
      return (
        (u.name || "").toLowerCase().indexOf(q) !== -1 ||
        (u.email || "").toLowerCase().indexOf(q) !== -1 ||
        String(u.discordId || "").toLowerCase().indexOf(q) !== -1
      );
    }

    function renderRows() {
      var q = adminPanelState.q.trim();
      var shown = users.filter(function (u) { return matches(u, q); });
      list.innerHTML = "";
      if (!shown.length) {
        var empty = document.createElement("p");
        empty.className = "cm-admin-empty";
        empty.textContent = html.lang === "en" ? "No players match your search." : "مفيش لاعب مطابق للبحث.";
        list.appendChild(empty);
        return;
      }
      shown.forEach(function (u) {
        var row = document.createElement("div");
        row.className = "cm-admin-row" + (u.id === me.id ? " cm-admin-row-me" : "");
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        var online = cmOnline(u);
        row.innerHTML =
          '<span class="cm-admin-avatar" aria-hidden="true">' +
            (u.avatar ? '<img src="' + cmEsc(u.avatar) + '" alt="" />' : cmEsc((u.name || "?").replace(/^\s+/, "").charAt(0))) +
          '</span>' +
          '<span class="cm-admin-dot' + (online ? " cm-on" : "") + '" title="' + (online ? adminUiText('online') : adminUiText('offline')) + '"></span>' +
          '<button type="button" class="cm-admin-name" dir="auto">' + cmEsc(u.name || "—") + "</button>" +
          '<span class="cm-admin-tags">' +
            (u.root ? '<span class="cm-tag cm-tag-root">مالك</span>' : u.admin ? '<span class="cm-tag cm-tag-admin">أدمن</span>' : "") +
            (u.banned ? '<span class="cm-tag cm-tag-bad">محظور</span>' : "") +
            (u.muted ? '<span class="cm-tag cm-tag-warn">مكتوم</span>' : "") +
          "</span>" +
          '<span class="cm-admin-seen">' + cmSeenText(u) + "</span>" +
          '<span class="cm-admin-open">↗</span>';
        var open = function () { openAdminProfile(u, root, me); };
        row.addEventListener('click', open);
        row.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            open();
          }
        });
        var nameBtn = row.querySelector('.cm-admin-name');
        if (nameBtn) {
          nameBtn.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            open();
          });
        }
        list.appendChild(row);
      });
    }
    renderRows();
    return wrap;
  }

  function fetchAdminReports(force) {
    if (!force && adminShellState.reports && Date.now() - adminShellState.reportsAt < 20000) {
      return Promise.resolve(adminShellState.reports);
    }
    return adminJson('/api/admin/reports').then(function (d) {
      adminShellState.reports = d && d.reports ? d.reports : [];
      adminShellState.reportsAt = Date.now();
      return adminShellState.reports;
    }).catch(function () {
      return adminShellState.reports || [];
    });
  }

  function fetchAdminWords(force) {
    var q = encodeURIComponent(adminShellState.wordsQuery || '');
    var language = encodeURIComponent(adminShellState.wordsLanguage || '');
    if (!force && adminShellState.words && Date.now() - adminShellState.wordsAt < 10000) {
      return Promise.resolve(adminShellState.words);
    }
    return adminJson('/api/admin/words?q=' + q + '&language=' + language).then(function (d) {
      adminShellState.words = d && d.words ? d.words : [];
      adminShellState.wordsAt = Date.now();
      return adminShellState.words;
    }).catch(function () {
      return adminShellState.words || [];
    });
  }

  function revealNativeAdminUi() {
    var main = document.querySelector('main');
    if (!main) return;
    var kids = main.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el.classList.contains('cm-admin-shell')) continue;
      if (el.hasAttribute('data-cm-admin-hidden')) {
        var prev = el.getAttribute('data-cm-admin-display');
        el.style.display = prev || '';
        el.removeAttribute('data-cm-admin-hidden');
        el.removeAttribute('data-cm-admin-display');
      }
      el.classList.remove('cm-admin-hide-app');
    }
  }

  function hideNativeAdminUi(shell) {
    var main = document.querySelector('main');
    if (!main) return;
    var kids = main.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el === shell) continue;
      if (!el.hasAttribute('data-cm-admin-hidden')) {
        el.setAttribute('data-cm-admin-hidden', '1');
        el.setAttribute('data-cm-admin-display', el.style.display || '');
      }
      el.classList.add('cm-admin-hide-app');
      el.style.display = 'none';
    }
  }

  function ensureAdminShell() {
    var main = document.querySelector('main');
    if (!main) return null;
    var shell = main.querySelector('.cm-admin-shell');
    if (!shell) {
      shell = document.createElement('section');
      shell.className = 'cm-admin-shell';
      main.appendChild(shell);
    }
    hideNativeAdminUi(shell);
    return shell;
  }

  function renderAdminReports(container) {
    var reports = adminShellState.reports;
    if (!reports) {
      container.innerHTML = '<p class="cm-admin-shell-empty">' + adminUiText('loading') + '</p>';
      fetchAdminReports(true).then(function () { try { syncAdminPanel(); } catch (e) {} });
      return;
    }
    if (!reports.length) {
      container.innerHTML = '<p class="cm-admin-shell-empty">' + adminUiText('noReports') + '</p>';
      return;
    }
    var list = document.createElement('div');
    list.className = 'cm-admin-stack';
    reports.forEach(function (rep) {
      var card = document.createElement('article');
      card.className = 'cm-admin-card';
      var status = rep.status === 'open' ? adminUiText('statusOpen') : adminUiText('statusDone');
      var title = rep.kind === 'chat' ? '💬 ' + (html.lang === 'en' ? 'Chat report' : 'بلاغ رسالة') : '👤 ' + (html.lang === 'en' ? 'Player report' : 'بلاغ لاعب');
      card.innerHTML =
        '<div class="cm-admin-card-head">' +
          '<div><h3 class="cm-admin-card-title">' + title + '</h3><p class="cm-admin-card-sub" dir="auto">' + cmEsc(rep.targetName || '—') + '</p></div>' +
          '<span class="cm-admin-pill' + (rep.status === 'open' ? ' cm-admin-pill-open' : '') + '">' + status + '</span>' +
        '</div>' +
        '<div class="cm-admin-meta">' +
          '<span><strong>' + adminUiText('reporter') + ':</strong> ' + cmEsc(rep.reporterName || '—') + '</span>' +
          '<span><strong>' + adminUiText('reason') + ':</strong> ' + cmEsc(rep.reason || '—') + '</span>' +
          '<span><strong>' + adminUiText('room') + ':</strong> ' + cmEsc(rep.roomCode || '—') + '</span>' +
        '</div>' +
        '<div class="cm-admin-actions"></div>';
      var acts = card.querySelector('.cm-admin-actions');
      if (rep.status === 'open') {
        var resolveBtn = document.createElement('button');
        resolveBtn.type = 'button';
        resolveBtn.className = 'cm-admin-btn cm-admin-btn-primary';
        resolveBtn.textContent = adminUiText('resolve');
        resolveBtn.addEventListener('click', function () {
          adminJson('/api/admin/reports/' + rep.id + '/resolve', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ resolution: 'resolved' })
          }).then(function () {
            adminShellState.reports = null;
            window.__cmAdminAudit = null;
            syncAdminPanel();
          }).catch(function () {});
        });
        var ignoreBtn = document.createElement('button');
        ignoreBtn.type = 'button';
        ignoreBtn.className = 'cm-admin-btn';
        ignoreBtn.textContent = adminUiText('ignore');
        ignoreBtn.addEventListener('click', function () {
          adminJson('/api/admin/reports/' + rep.id + '/resolve', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ resolution: 'ignored' })
          }).then(function () {
            adminShellState.reports = null;
            window.__cmAdminAudit = null;
            syncAdminPanel();
          }).catch(function () {});
        });
        acts.appendChild(resolveBtn);
        acts.appendChild(ignoreBtn);
      }
      list.appendChild(card);
    });
    container.innerHTML = '';
    container.appendChild(list);
  }

  function renderAdminWords(container) {
    var wrap = document.createElement('div');
    wrap.className = 'cm-admin-stack';
    var controls = document.createElement('section');
    controls.className = 'cm-admin-card';
    controls.innerHTML =
      '<div class="cm-admin-fields">' +
        '<div class="cm-admin-field"><label>' + adminUiText('addWord') + '</label><input class="cm-admin-input cm-admin-new-word" type="text" dir="auto" placeholder="' + adminUiText('wordPlaceholder') + '" /></div>' +
        '<div class="cm-admin-field"><label>Language</label><select class="cm-admin-select cm-admin-new-word-lang"><option value="ar">العربية</option><option value="en">English</option></select></div>' +
        '<button type="button" class="cm-admin-btn cm-admin-btn-primary cm-admin-add-word">' + adminUiText('add') + '</button>' +
      '</div>' +
      '<div class="cm-admin-fields">' +
        '<div class="cm-admin-field cm-admin-field-grow"><label>' + adminUiText('searchWords') + '</label><input class="cm-admin-input cm-admin-word-search" type="search" dir="auto" placeholder="' + adminUiText('searchWords') + '" /></div>' +
        '<div class="cm-admin-field"><label>Language</label><select class="cm-admin-select cm-admin-word-lang"><option value="ar">العربية</option><option value="en">English</option></select></div>' +
        '<button type="button" class="cm-admin-btn cm-admin-word-refresh">' + adminUiText('refresh') + '</button>' +
      '</div>';
    wrap.appendChild(controls);
    controls.querySelector('.cm-admin-new-word').value = adminShellState.newWord || '';
    controls.querySelector('.cm-admin-new-word-lang').value = adminShellState.newWordLanguage || 'ar';
    controls.querySelector('.cm-admin-word-search').value = adminShellState.wordsQuery || '';
    controls.querySelector('.cm-admin-word-lang').value = adminShellState.wordsLanguage || 'ar';
    controls.querySelector('.cm-admin-new-word').addEventListener('input', function (e) { adminShellState.newWord = e.target.value; });
    controls.querySelector('.cm-admin-new-word-lang').addEventListener('change', function (e) { adminShellState.newWordLanguage = e.target.value; });
    controls.querySelector('.cm-admin-add-word').addEventListener('click', function () {
      var word = (adminShellState.newWord || '').trim();
      if (!word) return;
      adminJson('/api/admin/words', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayForm: word, language: adminShellState.newWordLanguage || 'ar' })
      }).then(function () {
        adminShellState.newWord = '';
        adminShellState.words = null;
        window.__cmAdminAudit = null;
        syncAdminPanel();
      }).catch(function () {});
    });
    controls.querySelector('.cm-admin-word-search').addEventListener('input', function (e) {
      adminShellState.wordsQuery = e.target.value;
      adminShellState.words = null;
      fetchAdminWords(true).then(function () { try { syncAdminPanel(); } catch (e) {} });
    });
    controls.querySelector('.cm-admin-word-lang').addEventListener('change', function (e) {
      adminShellState.wordsLanguage = e.target.value;
      adminShellState.words = null;
      fetchAdminWords(true).then(function () { try { syncAdminPanel(); } catch (e) {} });
    });
    controls.querySelector('.cm-admin-word-refresh').addEventListener('click', function () {
      adminShellState.words = null;
      fetchAdminWords(true).then(function () { try { syncAdminPanel(); } catch (e) {} });
    });

    var words = adminShellState.words;
    if (!words) {
      var loading = document.createElement('p');
      loading.className = 'cm-admin-shell-empty';
      loading.textContent = adminUiText('loading');
      wrap.appendChild(loading);
      fetchAdminWords(true).then(function () { try { syncAdminPanel(); } catch (e) {} });
    } else {
      var list = document.createElement('div');
      list.className = 'cm-admin-stack';
      words.slice(0, 80).forEach(function (word) {
        var row = document.createElement('article');
        row.className = 'cm-admin-card cm-admin-word-row';
        row.innerHTML =
          '<div class="cm-admin-word-main">' +
            '<strong dir="auto">' + cmEsc(word.displayForm || '—') + '</strong>' +
            '<div class="cm-admin-word-tags">' +
              '<span class="cm-admin-pill">' + (word.source === 'custom' ? adminUiText('custom') : adminUiText('library')) + '</span>' +
              '<span class="cm-admin-pill">' + cmEsc(word.language || '—') + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="cm-admin-actions"></div>';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cm-admin-btn ' + (word.enabled ? '' : 'cm-admin-btn-primary');
        btn.textContent = word.enabled ? adminUiText('disable') : adminUiText('enable');
        btn.addEventListener('click', function () {
          adminJson('/api/admin/words/' + encodeURIComponent(word.id), {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ enabled: !word.enabled })
          }).then(function () {
            adminShellState.words = null;
            window.__cmAdminAudit = null;
            syncAdminPanel();
          }).catch(function () {});
        });
        row.querySelector('.cm-admin-actions').appendChild(btn);
        list.appendChild(row);
      });
      wrap.appendChild(list);
    }
    container.innerHTML = '';
    container.appendChild(wrap);
  }

  function renderAdminAudit(container) {
    var entries = window.__cmAdminAudit && window.__cmAdminAudit.entries;
    if (!entries) {
      container.innerHTML = '<p class="cm-admin-shell-empty">' + adminUiText('loading') + '</p>';
      cmAdminFetch(true);
      return;
    }
    if (!entries.length) {
      container.innerHTML = '<p class="cm-admin-shell-empty">' + adminUiText('noAudit') + '</p>';
      return;
    }
    var list = document.createElement('div');
    list.className = 'cm-admin-stack';
    entries.forEach(function (entry) {
      var card = document.createElement('article');
      card.className = 'cm-admin-card';
      card.innerHTML =
        '<div class="cm-admin-card-head">' +
          '<div><h3 class="cm-admin-card-title" dir="auto">' + cmEsc(entry.actor || '—') + '</h3><p class="cm-admin-card-sub">' + cmEsc(entry.action || '—') + '</p></div>' +
          '<span class="cm-admin-time">' + cmEsc(new Date(entry.at).toLocaleString()) + '</span>' +
        '</div>' +
        '<p class="cm-admin-detail" dir="auto">' + cmEsc(entry.detail || '—') + '</p>';
      list.appendChild(card);
    });
    container.innerHTML = '';
    container.appendChild(list);
  }

  function renderAdminUsers(container) {
    var users = cmAdminData();
    if (!users || !users.length) {
      container.innerHTML = '<p class="cm-admin-shell-empty">' + adminUiText('loading') + '</p>';
      cmAdminFetch(true);
      return;
    }

    function matches(u, q) {
      if (!q) return true;
      q = q.toLowerCase();
      return (
        (u.name || '').toLowerCase().indexOf(q) !== -1 ||
        (u.email || '').toLowerCase().indexOf(q) !== -1 ||
        String(u.discordId || '').toLowerCase().indexOf(q) !== -1
      );
    }

    var q = (adminPanelState.q || '').trim().toLowerCase();
    var shown = users.filter(function (u) { return matches(u, q); });
    if (!shown.length) {
      container.innerHTML = '<p class="cm-admin-shell-empty">' + (html.lang === 'en' ? 'No players match your search.' : 'مفيش لاعب مطابق للبحث.') + '</p>';
      return;
    }

    var me = window.__cmMe || {};
    var root = cmIsRoot();
    var selected = shown.find(function (u) { return u.id === adminShellState.selectedUserId; }) || shown[0];
    adminShellState.selectedUserId = selected.id;

    var layout = document.createElement('div');
    layout.className = 'cm-admin-users-grid';

    var listPanel = document.createElement('section');
    listPanel.className = 'cm-admin-panel cm-admin-panel-list';
    var bar = document.createElement('div');
    bar.className = 'cm-admin-search';
    bar.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>' +
      '<input type="search" dir="auto" placeholder="' + (html.lang === 'en' ? 'Search players, email, or Discord id…' : 'ابحث بالاسم أو الإيميل أو الديسكورد…') + '" />';
    var refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'cm-admin-refresh';
    refresh.title = adminUiText('refresh');
    refresh.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"></path><path d="M21 3v5h-5"></path></svg>';
    refresh.addEventListener('click', function () {
      window.__cmAdminUsers = null;
      window.__cmAdminAudit = null;
      window.__cmMe = null;
      cmAdminFetch(true);
      syncAdminPanel();
    });
    bar.appendChild(refresh);
    var input = bar.querySelector('input');
    input.value = adminPanelState.q;
    input.addEventListener('input', function () {
      adminPanelState.q = input.value;
      syncAdminPanel();
    });
    listPanel.appendChild(bar);

    var list = document.createElement('div');
    list.className = 'cm-admin-rows';
    shown.forEach(function (u) {
      var online = cmOnline(u);
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'cm-admin-row' + (u.id === me.id ? ' cm-admin-row-me' : '') + (u.id === selected.id ? ' cm-admin-row-active' : '');
      row.innerHTML =
        '<span class="cm-admin-avatar" aria-hidden="true">' +
          (u.avatar ? '<img src="' + cmEsc(u.avatar) + '" alt="" />' : cmEsc((u.name || '?').replace(/^\s+/, '').charAt(0))) +
        '</span>' +
        '<span class="cm-admin-row-main">' +
          '<span class="cm-admin-row-top">' +
            '<span class="cm-admin-name" dir="auto">' + cmEsc(u.name || '—') + '</span>' +
            '<span class="cm-admin-tags">' +
              (u.root ? '<span class="cm-tag cm-tag-root">مالك</span>' : u.admin ? '<span class="cm-tag cm-tag-admin">أدمن</span>' : '') +
              (u.banned ? '<span class="cm-tag cm-tag-bad">محظور</span>' : '') +
              (u.muted ? '<span class="cm-tag cm-tag-warn">مكتوم</span>' : '') +
            '</span>' +
          '</span>' +
          '<span class="cm-admin-row-sub">' + cmSeenText(u) + '</span>' +
        '</span>' +
        '<span class="cm-admin-row-side">' +
          '<span class="cm-admin-dot' + (online ? ' cm-on' : '') + '" title="' + (online ? adminUiText('online') : adminUiText('offline')) + '"></span>' +
          '<span class="cm-admin-open">↗</span>' +
        '</span>';
      row.addEventListener('click', function () {
        adminShellState.selectedUserId = u.id;
        syncAdminPanel();
      });
      list.appendChild(row);
    });
    listPanel.appendChild(list);
    layout.appendChild(listPanel);

    var detail = document.createElement('aside');
    detail.className = 'cm-admin-user-detail';
    var selectedOnline = cmOnline(selected);
    detail.innerHTML =
      '<div class="cm-admin-user-head">' +
        '<span class="cm-profile-avatar ' + (selected.root ? 'cm-profile-avatar-red' : selected.admin ? 'cm-profile-avatar-blue' : 'cm-profile-avatar-none') + '">' +
          (selected.avatar ? '<img src="' + cmEsc(selected.avatar) + '" alt="" />' : cmEsc((selected.name || '?').charAt(0))) +
        '</span>' +
        '<div class="cm-admin-user-head-main">' +
          '<div class="cm-profile-name" dir="auto">' + cmEsc(selected.name || '—') + '</div>' +
          '<div class="cm-profile-badges">' +
            '<span class="cm-profile-badge ' + (selectedOnline ? '' : 'cm-profile-badge-off') + '">' + (selectedOnline ? adminUiText('online') : adminUiText('offline')) + '</span>' +
            (selected.root ? '<span class="cm-profile-badge cm-profile-badge-captain">المالك</span>' : '') +
            (selected.admin && !selected.root ? '<span class="cm-profile-badge cm-profile-badge-team-blue">أدمن</span>' : '') +
            (selected.banned ? '<span class="cm-profile-badge cm-profile-badge-off">محظور</span>' : '') +
            (selected.muted ? '<span class="cm-profile-badge cm-profile-badge-warn2">مكتوم</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="cm-admin-info">' +
        '<div class="cm-admin-info-row"><span class="cm-admin-info-k">' + (html.lang === 'en' ? 'Username' : 'اسم المستخدم') + '</span><span class="cm-admin-info-v" dir="auto">' + cmEsc(selected.name || '—') + '</span></div>' +
        '<div class="cm-admin-info-row"><span class="cm-admin-info-k">' + (html.lang === 'en' ? 'Email' : 'الإيميل') + '</span><span class="cm-admin-info-v" dir="ltr">' + cmEsc(selected.email || '—') + '</span></div>' +
        '<div class="cm-admin-info-row"><span class="cm-admin-info-k">' + (html.lang === 'en' ? 'Discord ID' : 'معرّف الديسكورد') + '</span><span class="cm-admin-info-v" dir="ltr">' + (selected.discordId ? '<a href="https://discord.com/users/' + cmEsc(selected.discordId) + '" target="_blank" rel="noopener noreferrer">' + cmEsc(selected.discordId) + ' ↗</a>' : (html.lang === 'en' ? 'Not linked' : 'مش متوصل')) + '</span></div>' +
        '<div class="cm-admin-info-row"><span class="cm-admin-info-k">' + (html.lang === 'en' ? 'Account ID' : 'معرّف الحساب') + '</span><span class="cm-admin-info-v" dir="ltr"><span style="font-size:.72rem;word-break:break-all">' + cmEsc(selected.id || '—') + '</span></span></div>' +
        '<div class="cm-admin-info-row"><span class="cm-admin-info-k">' + (html.lang === 'en' ? 'Created' : 'تاريخ التسجيل') + '</span><span class="cm-admin-info-v">' + cmEsc(selected.createdAt ? new Date(selected.createdAt).toLocaleDateString(html.lang === 'en' ? 'en-GB' : 'ar-EG') : '—') + '</span></div>' +
      '</div>' +
      '<div class="cm-profile-actions"></div>' +
      '<p class="cm-profile-note"></p>';

    var acts = detail.querySelector('.cm-profile-actions');
    var note = detail.querySelector('.cm-profile-note');
    var isSelf = selected.id === me.id;
    var isAdmin = selected.admin === true;

    if (root && !selected.root) {
      var roleBtn = document.createElement('button');
      roleBtn.type = 'button';
      roleBtn.className = 'cm-profile-act';
      roleBtn.textContent = isAdmin ? (html.lang === 'en' ? 'Remove admin' : 'شيل منه الأدمن') : (html.lang === 'en' ? 'Make admin' : 'خليه أدمن');
      roleBtn.addEventListener('click', function () {
        adminModeration(isAdmin ? 'demote' : 'promote', selected.id, note);
      });
      acts.appendChild(roleBtn);
    } else if (!root) {
      var hint = document.createElement('p');
      hint.className = 'cm-admin-note-soft';
      hint.textContent = html.lang === 'en' ? 'Only the root account can manage admin roles.' : 'حساب المالك الأساسي فقط هو اللي يقدر يدي أو يشيل أدمن.';
      acts.appendChild(hint);
    }

    var blockBtn = document.createElement('button');
    blockBtn.type = 'button';
    blockBtn.className = 'cm-profile-act cm-profile-act-danger';
    blockBtn.textContent = selected.banned ? (html.lang === 'en' ? 'Unblock account' : 'فك الحظر') : (html.lang === 'en' ? 'Block account' : 'احظر الحساب');
    if (isSelf || isAdmin) {
      blockBtn.disabled = true;
      blockBtn.title = isSelf ? (html.lang === 'en' ? 'You cannot block yourself' : 'مينفعش تحظر نفسك') : (html.lang === 'en' ? 'Admins cannot block another admin' : 'الأدمنز ميقدروش يحظروا بعض');
    }
    blockBtn.addEventListener('click', function () {
      if (blockBtn.disabled) return;
      adminModeration(selected.banned ? 'unblock' : 'block', selected.id, note);
    });
    acts.appendChild(blockBtn);

    var muteBtn = document.createElement('button');
    muteBtn.type = 'button';
    muteBtn.className = 'cm-profile-act';
    muteBtn.textContent = selected.muted ? (html.lang === 'en' ? 'Unmute account' : 'فك الكتم') : (html.lang === 'en' ? 'Mute account' : 'اكتم');
    if (isSelf || isAdmin) {
      muteBtn.disabled = true;
      muteBtn.title = isSelf ? (html.lang === 'en' ? 'You cannot mute yourself' : 'مينفعش تكتم نفسك') : (html.lang === 'en' ? 'Admins cannot mute another admin' : 'الأدمنز ميقدروش يكتموا بعض');
    }
    muteBtn.addEventListener('click', function () {
      if (muteBtn.disabled) return;
      adminModeration(selected.muted ? 'unmute' : 'mute', selected.id, note);
    });
    acts.appendChild(muteBtn);

    layout.appendChild(detail);
    container.innerHTML = '';
    container.appendChild(layout);
  }

  function renderAdminShell() {
    var shell = ensureAdminShell();
    if (!shell) return;
    var sig = adminShellSignature();
    if (shell.getAttribute('data-sig') === sig) return;
    shell.setAttribute('data-sig', sig);
    shell.innerHTML =
      '<div class="cm-admin-shell-head">' +
        '<div class="cm-admin-tabs">' +
          '<button type="button" class="cm-admin-tab" data-tab="reports">' + adminUiText('reports') + '</button>' +
          '<button type="button" class="cm-admin-tab" data-tab="users">' + adminUiText('users') + '</button>' +
          '<button type="button" class="cm-admin-tab" data-tab="words">' + adminUiText('words') + '</button>' +
          '<button type="button" class="cm-admin-tab" data-tab="audit">' + adminUiText('audit') + '</button>' +
        '</div>' +
        '<button type="button" class="cm-admin-btn cm-admin-shell-refresh">' + adminUiText('refresh') + '</button>' +
      '</div>' +
      '<div class="cm-admin-shell-content"></div>';
    var tabs = shell.querySelectorAll('.cm-admin-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('is-active', tabs[i].getAttribute('data-tab') === adminShellState.activeTab);
      tabs[i].addEventListener('click', function (ev) {
        var next = ev.currentTarget.getAttribute('data-tab');
        if (!next || next === adminShellState.activeTab) return;
        adminShellState.activeTab = next;
        syncAdminPanel();
      });
    }
    shell.querySelector('.cm-admin-shell-refresh').addEventListener('click', function () {
      adminShellState.reports = null;
      adminShellState.words = null;
      window.__cmAdminUsers = null;
      window.__cmAdminAudit = null;
      window.__cmMe = null;
      cmAdminFetch(true);
      syncAdminPanel();
    });
    var content = shell.querySelector('.cm-admin-shell-content');
    if (adminShellState.activeTab === 'reports') renderAdminReports(content);
    else if (adminShellState.activeTab === 'users') renderAdminUsers(content);
    else if (adminShellState.activeTab === 'words') renderAdminWords(content);
    else renderAdminAudit(content);
  }

  function adminModeration(action, targetId, noteEl) {
    var token = window.__cmAdminToken;
    if (!token) return Promise.reject(new Error("no token"));
    return fetch("/api/admin/moderation", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: token },
      body: JSON.stringify({ action: action, targetId: targetId })
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error((d.error && d.error.code) || "ERR");
        return d;
      });
    }).then(function () {
      if (noteEl) noteEl.textContent = "تم ✓";
      window.__cmAdminUsers = null;
      window.__cmAdminAudit = null;
      window.__cmMe = null;
      if (window.__cmAdminShellState) {
        window.__cmAdminShellState.reports = null;
        window.__cmAdminShellState.words = null;
        window.__cmAdminShellState.wordsAt = 0;
        window.__cmAdminShellState.reportsAt = 0;
      }
      window.setTimeout(function () {
        cmAdminFetch(true);
        try { syncAdminPanel(); } catch (e) {}
      }, 180);
    }).catch(function (e) {
      var map = {
        NOT_ROOT: "العملية دي للمالك بس",
        CANT_BLOCK_SELF: "مينفعش تحظر نفسك",
        ADMIN_IMMUNE: "مينفعش حظر أدمن — شيله من الأدمن الأول",
        ROOT_IMMUNE: "مينفعش تشيل صلاحيات مالك أساسي",
        CANT_DEMOTE_SELF: "مينفعش تشيل نفسك"
      };
      if (noteEl) noteEl.textContent = map[e.message] || ("فشلت: " + e.message);
    });
  }

  function openAdminProfile(u, root, me) {
    closeProfile();
    var bd = document.createElement("div");
    bd.className = "cm-profile-backdrop";
    var card = document.createElement("div");
    card.className = "cm-profile-sheet cm-admin-profile";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", u.name || "player");

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "cm-profile-close";
    closeBtn.innerHTML = ICON_X;
    closeBtn.addEventListener("click", closeProfile);
    card.appendChild(closeBtn);

    var head = document.createElement("div");
    head.className = "cm-profile-head " + (u.root ? "cm-profile-head-red" : u.admin ? "cm-profile-head-blue" : "cm-profile-head-none");
    head.innerHTML =
      '<span class="cm-profile-avatar ' + (u.root ? "cm-profile-avatar-red" : u.admin ? "cm-profile-avatar-blue" : "cm-profile-avatar-none") + '">' +
        (u.avatar ? '<img src="' + cmEsc(u.avatar) + '" alt="" />' : cmEsc((u.name || "?").charAt(0))) +
      '</span>' +
      '<div style="min-width:0;flex:1"><div class="cm-profile-name" dir="auto">' + cmEsc(u.name || "—") + "</div>" +
      '<div class="cm-profile-badges">' +
        '<span class="cm-profile-badge ' + (cmOnline(u) ? "" : "cm-profile-badge-off") + '">' + (cmOnline(u) ? "أونلاين" : "أوفلاين") + "</span>" +
        (u.root ? '<span class="cm-profile-badge cm-profile-badge-captain">المالك</span>' : "") +
        (u.admin && !u.root ? '<span class="cm-profile-badge cm-profile-badge-team-blue">أدمن</span>' : "") +
        (u.banned ? '<span class="cm-profile-badge cm-profile-badge-off">محظور</span>' : "") +
        (u.muted ? '<span class="cm-profile-badge cm-profile-badge-warn2">مكتوم</span>' : "") +
      "</div></div>";
    card.appendChild(head);

    var body = document.createElement("div");
    body.className = "cm-profile-body";
    var rows = [
      [html.lang === 'en' ? 'Username' : 'اسم المستخدم', u.name || '—'],
      [html.lang === 'en' ? 'Email' : 'الإيميل', u.email || '—'],
      [html.lang === 'en' ? 'Discord ID' : 'معرّف الديسكورد', u.discordId
        ? '<a href="https://discord.com/users/' + cmEsc(u.discordId) + '" target="_blank" rel="noopener noreferrer" dir="ltr">' + cmEsc(u.discordId) + " ↗</a>"
        : (html.lang === 'en' ? 'Not linked to Discord' : 'مش متوصل بديسكورد')],
      [html.lang === 'en' ? 'Status' : 'الحالة', cmSeenText(u)],
      [html.lang === 'en' ? 'Created' : 'تاريخ التسجيل', u.createdAt ? new Date(u.createdAt).toLocaleDateString(html.lang === "en" ? "en-GB" : "ar-EG") : "—"],
      [html.lang === 'en' ? 'Account ID' : 'معرّف الحساب', '<span dir="ltr" style="font-size:.72rem;word-break:break-all">' + cmEsc(u.id) + "</span>"]
    ];
    var info = document.createElement("div");
    info.className = "cm-admin-info";
    rows.forEach(function (r) {
      var line = document.createElement("div");
      line.className = "cm-admin-info-row";
      line.innerHTML = '<span class="cm-admin-info-k">' + r[0] + '</span><span class="cm-admin-info-v" dir="auto">' + r[1] + "</span>";
      info.appendChild(line);
    });
    body.appendChild(info);

    /* actions */
    var acts = document.createElement("div");
    acts.className = "cm-profile-actions";
    var note = document.createElement("p");
    note.className = "cm-profile-note";
    var isSelf = u.id === me.id;
    var isAdmin = u.admin === true;

    if (root && !u.root) {
      var roleBtn = document.createElement("button");
      roleBtn.type = "button";
      roleBtn.className = "cm-profile-act";
      roleBtn.textContent = isAdmin ? "شيله من الأدمن" : "رقّيه أدمن";
      roleBtn.addEventListener("click", function () {
        adminModeration(isAdmin ? "demote" : "promote", u.id, note);
      });
      acts.appendChild(roleBtn);
    } else if (!root) {
      var hint = document.createElement("p");
      hint.className = "cm-admin-note-soft";
      hint.textContent = "الترقية/الإزالة دي متاحة للمالك بس.";
      acts.appendChild(hint);
    }

    var blockBtn = document.createElement("button");
    blockBtn.type = "button";
    blockBtn.className = "cm-profile-act cm-profile-act-danger";
    blockBtn.textContent = u.banned ? "فك الحظر" : "احظر الحساب";
    if (!u.banned && (isSelf || isAdmin)) {
      blockBtn.disabled = true;
      blockBtn.title = isSelf ? "مينفعش تحظر نفسك" : "مينفعش حظر أدمن";
    }
    blockBtn.addEventListener("click", function () {
      if (blockBtn.disabled) return;
      adminModeration(u.banned ? "unblock" : "block", u.id, note);
    });
    acts.appendChild(blockBtn);

    var muteBtn = document.createElement("button");
    muteBtn.type = "button";
    muteBtn.className = "cm-profile-act";
    muteBtn.textContent = u.muted ? "فك الكتم" : "اكتم";
    if (isAdmin) {
      muteBtn.disabled = true;
      muteBtn.title = "مينفعش تكتم أدمن";
    }
    muteBtn.addEventListener("click", function () {
      if (muteBtn.disabled) return;
      adminModeration(u.muted ? "unmute" : "mute", u.id, note);
    });
    acts.appendChild(muteBtn);

    body.appendChild(acts);
    body.appendChild(note);
    card.appendChild(body);
    bd.appendChild(card);
    bd.addEventListener("pointerdown", function (ev) {
      if (ev.target === bd) closeProfile();
    });
    document.body.appendChild(bd);
    sheet = bd;
  }

  function syncAdminPanel() {
    if (location.pathname !== '/admin') {
      if (cmAdminTimer) { window.clearInterval(cmAdminTimer); cmAdminTimer = null; }
      revealNativeAdminUi();
      var shellGone = document.querySelector('.cm-admin-shell');
      if (shellGone) shellGone.remove();
      return;
    }
    if (!cmAdminTimer) {
      cmAdminTimer = window.setInterval(function () { cmAdminFetch(true); }, 30000);
      cmAdminFetch();
    }
    renderAdminShell();
  }

  /* ============================================================================
     Room error diagnostics — the app maps EVERY server error to "room not
     found" (its key match is broken: server codes are SNAKE_CASE, the client
     looks up camelCase keys). This hook watches the join/create calls,
     remembers the REAL error code, and replaces the displayed generic
     message with a specific, actionable diagnosis (bilingual), including
     remaining time for temporary kick-bans and connection problems.
   ============================================================================ */
  var GENERIC_ERROR_TEXTS = {};
  ["الغرفة دي مش موجودة", "الغرفة مليانة", "الغرفة اتقفلت", "اللعبة بدأت بالفعل",
   "الحساب ده محظور من الغرف", "الرمز لازم يكون ٤ حروف", "الاسم لازم يكون بين ١ و٢٤ حرف",
   "في حاجة غلط في الطلب", "مش مسموح بالحركة دي", "المضيف بس اللي يقدر يعمل كده",
   "This room doesn\u2019t exist", "The room is full", "The room has closed",
   "The game already started", "This account is banned from rooms",
   "The code must be 4 letters", "The name must be 1\u201324 characters",
   "Something is wrong with the request", "You can\u2019t do that",
   "Only the host can do that"].forEach(function (t) {
    GENERIC_ERROR_TEXTS[t] = true;
  });

  var lastRoomError = null; /* {code, message} */

  function fmtRemaining(untilMs) {
    var lang = html.lang === "en" ? "en" : "ar";
    var ms = Math.max(0, untilMs - Date.now());
    var mins = Math.ceil(ms / 60000);
    if (mins < 60) {
      return lang === "ar" ? " (تقدر ترجع بعد " + mins + " دقيقة تقريبًا)" : " (you can rejoin in about " + mins + " min)";
    }
    var hrs = Math.ceil(mins / 60);
    return lang === "ar" ? " (تقدر ترجع بعد " + hrs + " ساعة تقريبًا)" : " (you can rejoin in about " + hrs + " h)";
  }

  function diagnoseRoomError() {
    var lang = html.lang === "en" ? "en" : "ar";
    var err = lastRoomError;
    if (!err || !err.code) return null;
    var code = err.code;
    var msg = err.message || "";
    var M = {
      ar: {
        ROOM_NOT_FOUND: "الغرفة دي مش موجودة \u2022 تشخيص: الرمز غلط أو المضيف قفل الغرفة. راجع الرمز (٤ حروف إنجليزية) أو اطلب من صاحبك رمز جديد.",
        ROOM_FULL: "الغرفة مليانة \u2022 كل المقاعد اتاخدت. استنى حد يخرج، أو قول للمضيف يزوّد الحد الأقصى من إدارة الغرفة.",
        ROOM_CLOSED: "الغرفة اتقفلت \u2022 اللعبة انهت خلاص. اعمل غرفة جديدة أو اطلب رمز جديد.",
        ROOM_IN_PROGRESS: "اللعبة شغالة دلوقتي \u2022 هتدخل كمشاهد لحد ما الجولة تخلص وتقدر تلعب بعدها.",
        ACCOUNT_BANNED: "حسابك محظور من الغرف \u2022 لو مش متأكد من السبب كلم إدارة الموقع.",
        KICK_RESTRICTED: "اتطردت من الغرفة دي وممنوع ترجع مؤقتًا{time} \u2022 ممكن تلعب في غرفة تانية لحد ما المدة تخلص.",
        NETWORK: "مشكلة في الاتصال بالسيرفر \u2022 اتأكد من الإنترنت وجرّب تاني بعد شوية.",
        INVALID_CODE: "الرمز مش صالح \u2022 لازم ٤ حروف إنجليزية.",
        INVALID_NAME: "الاسم مش صالح \u2022 لازم من حرف واحد لـ ٢٤ حرف.",
        INVALID_PAYLOAD: "فيه حاجة غلط في الطلب \u2022 حدّث الصفحة وجرّب تاني.",
        INTERNAL: "مشكلة مؤقتة في السيرفر \u2022 جرّب تاني بعد لحظات."
      },
      en: {
        ROOM_NOT_FOUND: "Room not found \u2022 Diagnosis: wrong code or the host closed the room. Double-check the 4-letter code or ask for a fresh one.",
        ROOM_FULL: "Room is full \u2022 every seat is taken. Wait for someone to leave or ask the host to raise the player limit.",
        ROOM_CLOSED: "Room closed \u2022 the game has ended. Create a new room or ask for a new code.",
        ROOM_IN_PROGRESS: "Game in progress \u2022 you will join as a spectator until the round ends.",
        ACCOUNT_BANNED: "This account is banned from rooms \u2022 contact the site admins if you believe this is a mistake.",
        KICK_RESTRICTED: "You were kicked from this room and can\u2019t rejoin for a while{time} \u2022 you can play in another room meanwhile.",
        NETWORK: "Connection problem \u2022 check your internet and try again shortly.",
        INVALID_CODE: "Invalid code \u2022 it must be 4 letters.",
        INVALID_NAME: "Invalid name \u2022 it must be 1\u201324 characters.",
        INVALID_PAYLOAD: "Something is wrong with the request \u2022 refresh the page and try again.",
        INTERNAL: "Temporary server problem \u2022 try again in a moment."
      }
    };
    var text = (M[lang] && M[lang][code]) || (M[lang] && M[lang][code.toUpperCase()]) || null;
    if (!text) return null;
    if (code === "KICK_RESTRICTED") {
      var m = msg.match(/until\s+(\d{4}-\d{2}-\d{2}T[^\s]+)/i);
      var t = m ? fmtRemaining(new Date(m[1].replace("Z", "Z")).getTime()) : "";
      text = text.replace("{time}", t);
    }
    return text;
  }

  /* ---- capture real errors from the join/create calls ---- */
  try {
    var _fetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      /* watch: create room, join room, and the join page's room lookup */
      var isRoomCall =
        (/\/api\/rooms(\/join)?(?:$|\?)/.test(url) && (!init || !init.method || /post/i.test(init.method || ""))) ||
        (/\/api\/rooms\/[A-Za-z0-9]{4}(?:$|\?)/.test(url) && (!init || /get/i.test(init.method || "GET")));
      if (!isRoomCall) return _fetch(input, init);
      return _fetch(input, init).then(
        function (res) {
          /* capture auth header for our own admin calls */
          try {
            var h = init && init.headers;
            if (h && h.authorization && /\/api\/admin/.test(url)) {
              window.__cmAdminToken = h.authorization;
            }
          } catch (e) {}
          if (res.ok && /\/api\/admin\/users|\/api\/admin\/audit|\/api\/auth\/(profile|me)/.test(url)) {
            try {
              var c2 = res.clone ? res.clone() : null;
              if (c2) c2.json().then(function (d) {
                if (d && d.users) window.__cmAdminUsers = { at: Date.now(), users: d.users };
                if (d && d.entries) window.__cmAdminAudit = { at: Date.now(), entries: d.entries };
                if (d && d.user && !d.users) window.__cmMe = d.user;
                if (d && d.users && !window.__cmMe && window.__cmAdminToken) {
                  fetch("/api/auth/me", { headers: { authorization: window.__cmAdminToken } })
                    .then(function (r) { return r.json(); })
                    .then(function (md) {
                      if (md && md.user) {
                        window.__cmMe = md.user;
                        try { syncAdminPanel(); } catch (e) {}
                      }
                    }).catch(function () {});
                }
                try { syncAdminPanel(); } catch (e) {}
              }).catch(function () {});
            } catch (e) {}
          }
          if (res.ok) {
            lastRoomError = null;
          } else {
            var cloned = res.clone ? res.clone() : null;
            if (cloned) {
              cloned.json().then(function (data) {
                lastRoomError = { code: (data && data.error && data.error.code) || "INTERNAL", message: (data && data.error && data.error.message) || "" };
              }).catch(function () {
                lastRoomError = { code: "INTERNAL", message: "" };
              });
            }
          }
          return res;
        },
        function (networkErr) {
          lastRoomError = { code: "NETWORK", message: String(networkErr && networkErr.message || "") };
          throw networkErr;
        }
      );
    };
  } catch (e) { /* fetch unhookable — degrade silently */ }

  /* ---- replace the generic message with the real diagnosis ----
     Works at the TEXT-NODE level so error lines that contain icons keep
     their structure. */
  function syncRoomErrorDiagnosis() {
    if (!lastRoomError) return;
    var diagnosis = diagnoseRoomError();
    if (!diagnosis) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while ((node = walker.nextNode())) {
      var txt = (node.nodeValue || "").trim();
      if (GENERIC_ERROR_TEXTS[txt]) {
        node.nodeValue = " " + diagnosis + " ";
        var host = node.parentElement;
        if (host) {
          host.classList.add("cm-error-diag");
          host.setAttribute("dir", "auto");
        }
        return;
      }
    }
  }

  var badge = fab.querySelector(".cm-log-fab-badge");
  var lastCount = -1;
  var lastPulsedCount = -1;
  var pulseTimer = null;

  function logLabel() {
    return html.lang === 'en' ? 'Event log' : 'سجل الأحداث';
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    } catch (e) { /* ignore */ }
  }

  function setOpen(next) {
    open = !!next;
    if (open) {
      delete fab.dataset.cmDockCloseAnchor;
      try { localStorage.removeItem(FAB_CLOSE_ANCHOR_KEY); } catch (e) {}
      /* The FAB still has geometry at this point, so restore the drawer's
         shared transform before hiding it. */
      if (!isFloatDragging()) applyLinkedSavedTransform(true);
    }
    html.classList.toggle("cm-log-open", open);
    fab.setAttribute("aria-expanded", open ? "true" : "false");
    var inRoom = /^\/room\//.test(location.pathname) || /^\/game\//.test(location.pathname) || !!query('.cm-game-page');
    fab.hidden = !inRoom || open;
    persist();
    /* A hidden FAB has a zero bounding box. Reapply/clamp a saved transform
       only after it becomes visible again, never while the drawer is open. */
    if (!open && inRoom) {
      window.requestAnimationFrame(function () {
        if (!open && !isFloatDragging()) applyLinkedSavedTransform(true);
      });
    }
  }


  /* ==================================================== profile module */
  var CHIP_SELECTOR = ".cm-roster-chip, .cm-teambar-player";
  var bypassCheer = false;
  var lastChipOpen = 0;
  var sheet = null; /* open profile sheet element */

  function inGameView() {
    return !!document.querySelector(".cm-game-page");
  }

  function isPractice() {
    return location.pathname.indexOf("/local") === 0;
  }

  function closeProfile() {
    if (!sheet) return;
    var el = sheet;
    sheet = null;
    el.remove();
  }

  var modalInputState = null;
  var modalRestoreTimer = null;
  var keyboardBaseHeight = 0;
  var keyboardActiveInput = null;
  var keyboardViewportHandler = null;
  var lastUserFocusIntentAt = 0;

  function isMobileTouchEnv() {
    try {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
      if ((navigator.maxTouchPoints || 0) > 0 && window.matchMedia && window.matchMedia('(hover: none)').matches) return true;
      var ua = navigator.userAgent || '';
      return /Android|iP(?:ad|hone|od)/.test(ua);
    } catch (e) {
      return false;
    }
  }

  function shouldUseModalInputRestore() {
    return !isMobileTouchEnv();
  }

  function noteUserFocusIntent() {
    lastUserFocusIntentAt = Date.now();
  }

  ['pointerdown', 'touchstart', 'keydown'].forEach(function (type) {
    document.addEventListener(type, noteUserFocusIntent, true);
  });

  function isRecentUserFocusIntent() {
    return Date.now() - lastUserFocusIntentAt < 1200;
  }

  function isGameTextField(el) {
    if (!el || !el.matches) return false;
    return !!(el.matches('input[name="clue-input"], textarea[name="clue-input"], input[name="room-chat"], textarea[name="room-chat"]'));
  }

  function isTextEditable(el) {
    if (!el || !el.matches) return false;
    if (el.matches('textarea')) return !el.disabled && !el.readOnly;
    if (!el.matches('input')) return false;
    var type = String(el.type || 'text').toLowerCase();
    if (['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].indexOf(type) !== -1) {
      return false;
    }
    return !el.disabled && !el.readOnly;
  }

  function dialogSig(dialog) {
    if (!dialog) return '';
    var heading = dialog.querySelector('h1, h2, [aria-labelledby]');
    return ((heading && heading.textContent) || dialog.getAttribute('aria-label') || '').trim();
  }

  function inputSig(el) {
    if (!el) return '';
    return [
      el.getAttribute('aria-label') || '',
      el.getAttribute('placeholder') || '',
      el.getAttribute('name') || '',
      el.getAttribute('id') || ''
    ].join('|');
  }

  function rememberModalInput(el) {
    if (!shouldUseModalInputRestore()) return;
    var dialog = el.closest ? el.closest('[role="dialog"]') : null;
    if (!dialog) return;
    modalInputState = {
      at: Date.now(),
      dialogSig: dialogSig(dialog),
      inputSig: inputSig(el),
      selStart: typeof el.selectionStart === 'number' ? el.selectionStart : null,
      selEnd: typeof el.selectionEnd === 'number' ? el.selectionEnd : null
    };
  }

  function findRestoreInput() {
    if (!modalInputState) return null;
    var dialogs = document.querySelectorAll('[role="dialog"]');
    var fallback = null;
    for (var i = 0; i < dialogs.length; i++) {
      var dialog = dialogs[i];
      if (modalInputState.dialogSig && dialogSig(dialog) && dialogSig(dialog) !== modalInputState.dialogSig) continue;
      var candidates = dialog.querySelectorAll('input, textarea');
      for (var j = 0; j < candidates.length; j++) {
        var el = candidates[j];
        if (!isTextEditable(el)) continue;
        if (!fallback) fallback = el;
        if (inputSig(el) === modalInputState.inputSig) return el;
      }
    }
    return fallback;
  }

  function maybeRestoreModalInputFocus() {
    if (!shouldUseModalInputRestore() || !modalInputState || Date.now() - modalInputState.at > 1800) return;
    var active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement) {
      if (isTextEditable(active)) return;
      if (active.matches && active.matches('button, a, select')) return;
    }
    var input = findRestoreInput();
    if (!input) return;
    try {
      input.focus({ preventScroll: true });
      if (typeof input.setSelectionRange === 'function' && typeof modalInputState.selEnd === 'number') {
        var pos = Math.max(0, Math.min(input.value.length, modalInputState.selEnd));
        input.setSelectionRange(pos, pos);
      }
    } catch (e) {}
  }

  function scheduleModalInputRestore() {
    if (!shouldUseModalInputRestore()) return;
    if (modalRestoreTimer) window.clearTimeout(modalRestoreTimer);
    modalRestoreTimer = window.setTimeout(function () {
      modalRestoreTimer = null;
      maybeRestoreModalInputFocus();
    }, 40);
  }

  document.addEventListener('focusin', function (ev) {
    if (isTextEditable(ev.target) && ev.target.closest && ev.target.closest('[role="dialog"]')) {
      rememberModalInput(ev.target);
    }
  }, true);

  document.addEventListener('input', function (ev) {
    if (isTextEditable(ev.target) && ev.target.closest && ev.target.closest('[role="dialog"]')) {
      rememberModalInput(ev.target);
    }
  }, true);

  document.addEventListener('focusout', function (ev) {
    if (isTextEditable(ev.target) && ev.target.closest && ev.target.closest('[role="dialog"]')) {
      rememberModalInput(ev.target);
      scheduleModalInputRestore();
    }
  }, true);

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    if (sheet) {
      closeProfile();
      return;
    }
    if (open) setOpen(false);
  });

  /* --- capture chip interactions: open the profile instead of cheering --- */
  function interceptChip(ev) {
    if (bypassCheer || !inGameView()) return;
    var chip = ev.target && ev.target.closest ? ev.target.closest(CHIP_SELECTOR) : null;
    if (!chip || chip.disabled) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    if (ev.type === "click" && Date.now() - lastChipOpen < 450) return;
    lastChipOpen = Date.now();
    openProfile(chip);
  }
  document.addEventListener("pointerdown", interceptChip, { capture: true });
  document.addEventListener("click", interceptChip, { capture: true });

  /* Fire the original cheer once, from the sheet's cheer button. */
  function cheerVia(chip) {
    bypassCheer = true;
    try {
      chip.click();
    } finally {
      window.setTimeout(function () { bypassCheer = false; }, 60);
    }
  }

  /* ------------------------------------------------ read a chip's data */
  function readChip(chip) {
    var nameEl = chip.querySelector(".truncate");
    var name = (nameEl ? nameEl.textContent : chip.textContent || "").trim();
    var team = null;
    if (chip.classList.contains("cm-roster-chip-red") || chip.closest(".cm-teambar-red")) team = "red";
    else if (chip.classList.contains("cm-roster-chip-blue") || chip.closest(".cm-teambar-blue")) team = "blue";

    var captain = false;
    if (chip.classList.contains("cm-mobile-roster-captain")) captain = true;
    else {
      /* desktop rail: the captains' section follows the hairline divider */
      var section = chip.parentElement;
      while (section && !section.classList.contains("cm-roster-col")) {
        var prev = section.previousElementSibling;
        if (prev && prev.classList.contains("h-px")) captain = true;
        section = section.parentElement;
      }
    }

    /* avatar: clone the chip's own avatar box (initial or photo) */
    var avatarImg = null;
    var avatarText = null;
    var avatarBox = chip.querySelector(".cm-player-avatar-status");
    if (avatarBox) {
      var img = avatarBox.querySelector("img");
      if (img && img.src) avatarImg = img.src;
      else {
        var inner = avatarBox.querySelector("span");
        avatarText = ((inner || avatarBox).textContent || "").trim().slice(0, 2);
      }
    }

    return {
      el: chip,
      name: name,
      team: team,
      role: captain ? "captain" : "operative",
      me: chip.classList.contains("cm-roster-chip-me") || chip.classList.contains("cm-mobile-roster-me"),
      offline: chip.classList.contains("cm-player-disconnected"),
      avatarImg: avatarImg,
      avatarText: avatarText
    };
  }

  /* ------------------------------------------------------- room helpers */
  var roomCache = { at: 0, room: null };
  function fetchRoom(force) {
    var code = window.__clueMeRoom;
    if (!code || isPractice()) return Promise.resolve(null);
    var now = Date.now();
    if (!force && roomCache.room && now - roomCache.at < 4000) {
      return Promise.resolve(roomCache.room);
    }
    return fetch("/api/rooms/" + encodeURIComponent(code), { headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.room) {
          roomCache = { at: now, room: data.room };
          return data.room;
        }
        return null;
      })
      .catch(function () { return null; });
  }

  var ALL_PERMS = ["KICK_PLAYERS", "MOVE_PLAYERS", "CHANGE_ROLES", "CHANGE_TEAMS"];

  function myPermissions(room) {
    if (!room || !window.__clueMePlayer) return [];
    var me = null;
    for (var i = 0; i < room.players.length; i++) {
      if (room.players[i].id === window.__clueMePlayer) { me = room.players[i]; break; }
    }
    if (!me) return [];
    if (room.ownerId === me.id) return ALL_PERMS.slice();
    return me.permissions || [];
  }

  function resolveTargetId(room, info) {
    if (!room) return null;
    var want = (info.name || "").trim();
    var out = [];
    for (var i = 0; i < room.players.length; i++) {
      var p = room.players[i];
      if ((p.name || "").trim() === want) out.push(p);
    }
    if (out.length > 1 && info.team) {
      var byTeam = out.filter(function (p) { return p.team === info.team; });
      if (byTeam.length) out = byTeam;
    }
    if (out.length > 1 && info.role) {
      var byRole = out.filter(function (p) { return p.role === info.role; });
      if (byRole.length) out = byRole;
    }
    return out.length ? out[0].id : null;
  }

  function adminCall(action, body) {
    var code = window.__clueMeRoom;
    if (!code) return Promise.reject(new Error("no room"));
    return fetch("/api/rooms/" + encodeURIComponent(code) + "/admin/" + action, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) {
          var code2 = data && data.error && data.error.code;
          throw new Error(code2 === "FORBIDDEN" ? "forbidden" : "err");
        }
        return data;
      });
    });
  }

  /* ------------------------------------------------------- profile UI */
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function actionButton(cls, icon, label, handler) {
    var btn = el("button", "cm-profile-act" + (cls ? " " + cls : ""));
    btn.type = "button";
    btn.innerHTML = icon;
    btn.appendChild(document.createTextNode(label));
    btn.addEventListener("click", handler);
    return btn;
  }

  function openProfile(chip) {
    closeProfile();
    var info = readChip(chip);

    var backdrop = el("div", "cm-profile-backdrop");
    var card = el("div", "cm-profile-sheet cm-profile-sheet-room");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", (info.name || t("profile")) + " — " + t("profile"));

    var closeBtn = el("button", "cm-profile-close");
    closeBtn.type = "button";
    closeBtn.title = t("close");
    closeBtn.setAttribute("aria-label", t("close"));
    closeBtn.innerHTML = ICON_X;
    closeBtn.addEventListener("click", closeProfile);
    card.appendChild(closeBtn);

    /* head */
    var head = el("div", "cm-profile-head cm-profile-head-" + (info.team || "none"));
    var avatar = el("span", "cm-profile-avatar" + (info.team ? " cm-profile-avatar-" + info.team : " cm-profile-avatar-none"));
    if (info.avatarImg) {
      var img = document.createElement("img");
      img.src = info.avatarImg;
      img.alt = "";
      avatar.appendChild(img);
    } else {
      avatar.textContent = info.avatarText || (info.name || "?").replace(/^\s+/, "").charAt(0);
    }
    head.appendChild(avatar);

    var titleWrap = el("div");
    titleWrap.style.minWidth = "0";
    titleWrap.style.flex = "1";
    titleWrap.appendChild(el("div", "cm-profile-kicker", t("profileCard")));
    var nameEl2 = el("div", "cm-profile-name", info.name || "—");
    titleWrap.appendChild(nameEl2);

    var badges = el("div", "cm-profile-badges");
    if (info.team) {
      var teamBadge = el("span", "cm-profile-badge cm-profile-badge-team-" + info.team);
      teamBadge.appendChild(el("span", "cm-profile-dot"));
      teamBadge.appendChild(document.createTextNode(t(info.team)));
      badges.appendChild(teamBadge);
    }
    var roleBadge = el("span", "cm-profile-badge" + (info.role === "captain" ? " cm-profile-badge-captain" : null), t(info.role));
    badges.appendChild(roleBadge);
    if (info.me) badges.appendChild(el("span", "cm-profile-badge cm-profile-badge-me", t("me")));
    var statusBadge = el("span", "cm-profile-badge " + (info.offline ? "cm-profile-badge-off" : null), info.offline ? t("offline") : t("online"));
    badges.appendChild(statusBadge);
    titleWrap.appendChild(badges);
    head.appendChild(titleWrap);
    card.appendChild(head);

    /* body */
    var body = el("div", "cm-profile-body");
    var intro = el("div", "cm-profile-intro");
    intro.innerHTML = '<p class="cm-profile-intro-title">' + cmEsc(t("profile")) + '</p>' +
      '<p class="cm-profile-intro-sub">' + cmEsc(info.me ? t("profileHintSelf") : t("profileHintOther")) + '</p>';
    body.appendChild(intro);
    var actions = el("div", "cm-profile-actions");
    var note = el("p", "cm-profile-note");

    function setNote(msg, isErr) {
      note.textContent = msg || "";
      note.classList.toggle("cm-profile-note-err", !!isErr);
    }

    actions.appendChild(actionButton("cm-profile-act-cheer", ICON_CHEER, t("cheer"), function () {
      cheerVia(chip);
      closeProfile();
    }));

    if (info.me) {
      actions.appendChild(actionButton(null, ICON_SEAT, t("seat"), function () {
        var seatBtn = document.querySelector(".cm-game-page > header .cm-seat-btn");
        closeProfile();
        if (seatBtn) seatBtn.click();
      }));
    }
    body.appendChild(actions);

    card.appendChild(body);
    backdrop.appendChild(card);

    backdrop.addEventListener("pointerdown", function (ev) {
      if (ev.target === backdrop) closeProfile();
    });

    /* host tools (online rooms only) */
    fetchRoom().then(function (room) {
      if (!sheet) return; /* closed meanwhile */
      if (!room) return;
      var perms = myPermissions(room);
      var targetId = resolveTargetId(room, info);
      var mayManage = !!targetId && !info.me;
      var canMove = mayManage && perms.indexOf("MOVE_PLAYERS") !== -1;
      var canKick = mayManage && perms.indexOf("KICK_PLAYERS") !== -1;
      if (!canMove && !canKick) return;

      var hostWrap = el("div", "cm-profile-move");
      hostWrap.appendChild(el("div", "cm-profile-move-label", "🛠 " + t("hostTools")));

      if (canMove) {
        hostWrap.appendChild(el("div", "cm-profile-move-label", t("moveTeam")));
        var teamBtns = el("div", "cm-profile-move-row");
        var redBtn = el("button", "cm-profile-move-red", t("red"));
        var blueBtn = el("button", "cm-profile-move-blue", t("blue"));
        teamBtns.appendChild(redBtn);
        teamBtns.appendChild(blueBtn);
        hostWrap.appendChild(teamBtns);

        hostWrap.appendChild(el("div", "cm-profile-move-label", t("moveRole")));
        var roleBtns = el("div", "cm-profile-move-row");
        var capBtn = el("button", null, t("captain"));
        var opBtn = el("button", null, t("operative"));
        roleBtns.appendChild(capBtn);
        roleBtns.appendChild(opBtn);
        hostWrap.appendChild(roleBtns);

        function move(patch, btn) {
          if (btn.disabled) return;
          btn.disabled = true;
          setNote(t("working"));
          adminCall("seat", {
            byPlayerId: window.__clueMePlayer,
            targetId: targetId,
            team: patch.team,
            role: patch.role
          }).then(function () {
            setNote(t("done"));
            window.setTimeout(closeProfile, 650);
          }).catch(function (err) {
            btn.disabled = false;
            setNote(err.message === "forbidden" ? t("forbidden") : t("err"), true);
          });
        }
        redBtn.addEventListener("click", function () { move({ team: "red" }, redBtn); });
        blueBtn.addEventListener("click", function () { move({ team: "blue" }, blueBtn); });
        capBtn.addEventListener("click", function () { move({ role: "captain" }, capBtn); });
        opBtn.addEventListener("click", function () { move({ role: "operative" }, opBtn); });
      }

      if (canKick) {
        var kickBtn = actionButton("cm-profile-act-danger", ICON_X, t("kick"), function () {
          if (kickBtn.disabled) return;
          kickBtn.disabled = true;
          setNote(t("working"));
          adminCall("kick", {
            byPlayerId: window.__clueMePlayer,
            targetId: targetId,
            restrictMinutes: 0
          }).then(function () {
            setNote(t("done"));
            window.setTimeout(closeProfile, 650);
          }).catch(function (err) {
            kickBtn.disabled = false;
            setNote(err.message === "forbidden" ? t("forbidden") : t("err"), true);
          });
        });
        hostWrap.appendChild(kickBtn);
      }

      body.appendChild(hostWrap);
      body.appendChild(note);
    });

    body.appendChild(note);
    document.body.appendChild(backdrop);
    sheet = backdrop;
    closeBtn.focus({ preventScroll: true });
  }

  /* ============================================================================
     iOS / WebView keyboard safety — on iPhones the keyboard resizes the
     layout viewport, which used to crush the whole 100dvh game layout (the
     word board collapsed while typing). While any game input is focused we
     freeze the game page at its pixel height and allow scrolling so the
     keyboard can never re-flow the board.
   ============================================================================ */
  var keyboardLocked = false;
  var keyboardTimer = null;

  function shouldUseKeyboardLock() {
    try {
      if (!isMobileTouchEnv()) return false;
      return !!document.querySelector('.cm-game-page') || html.classList.contains('cm-discord-activity');
    } catch (e) {
      return false;
    }
  }

  function releaseKeyboardLock() {
    keyboardLocked = false;
    keyboardBaseHeight = 0;
    keyboardActiveInput = null;
    if (window.visualViewport && keyboardViewportHandler) {
      try { window.visualViewport.removeEventListener('resize', keyboardViewportHandler); } catch (e) {}
      try { window.visualViewport.removeEventListener('scroll', keyboardViewportHandler); } catch (e) {}
      keyboardViewportHandler = null;
    }
    var page = document.querySelector(".cm-game-page");
    if (page) {
      page.style.height = "";
      page.style.maxHeight = "";
      page.style.overflow = "";
      page.style.paddingBottom = "";
      page.style.boxSizing = "";
    }
    /* The keyboard may have scrolled the page to reveal the input — put
       the game back to the top or the header "eats" the board's first row. */
    try {
      window.scrollTo(0, 0);
      if (page) page.scrollTop = 0;
      var shell = document.querySelector(".cm-game-shell");
      if (shell) shell.scrollTop = 0;
    } catch (e) {}
  }

  document.addEventListener("focusin", function (ev) {
    var target = ev.target;
    if (isMobileTouchEnv() && isGameTextField(target) && !isRecentUserFocusIntent()) {
      try { target.blur(); } catch (e) {}
      return;
    }
    if (!shouldUseKeyboardLock()) return;
    if (!target || !target.matches || !target.matches("input, textarea, select")) return;
    if (target.closest && target.closest('[role="dialog"]')) return;
    var page = document.querySelector(".cm-game-page");
    if (!page) return;
    keyboardActiveInput = target;
    if (!keyboardLocked) {
      keyboardLocked = true;
      keyboardBaseHeight = Math.max(
        page.getBoundingClientRect().height || 0,
        window.innerHeight || 0,
        window.visualViewport ? window.visualViewport.height || 0 : 0
      );
      if (keyboardBaseHeight > 0) {
        page.style.height = keyboardBaseHeight + "px";
        page.style.maxHeight = keyboardBaseHeight + "px";
        page.style.overflow = "auto";
        page.style.boxSizing = "border-box";
      }
      if (window.visualViewport) {
        keyboardViewportHandler = function () {
          if (!keyboardLocked) return;
          var vv = window.visualViewport;
          var inset = Math.max(0, Math.round(keyboardBaseHeight - (vv.height + vv.offsetTop)));
          page.style.height = keyboardBaseHeight + "px";
          page.style.maxHeight = keyboardBaseHeight + "px";
          page.style.paddingBottom = inset > 0 ? inset + 'px' : '';
          if (keyboardActiveInput && keyboardActiveInput.scrollIntoView) {
            try { keyboardActiveInput.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
          }
        };
        try { window.visualViewport.addEventListener('resize', keyboardViewportHandler); } catch (e) {}
        try { window.visualViewport.addEventListener('scroll', keyboardViewportHandler); } catch (e) {}
        keyboardViewportHandler();
      }
    }
    if (keyboardTimer) window.clearTimeout(keyboardTimer);
    keyboardTimer = window.setTimeout(function () {
      try {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch (e) { }
    }, 180);
  }, true);

  document.addEventListener("focusout", function (ev) {
    if (!shouldUseKeyboardLock() || !keyboardLocked) return;
    if (ev.target && ev.target.closest && ev.target.closest('[role="dialog"]')) return;
    if (keyboardTimer) window.clearTimeout(keyboardTimer);
    keyboardTimer = window.setTimeout(function () {
      var active = document.activeElement;
      if (active && active.matches && active.matches("input, textarea, select")) {
        keyboardActiveInput = active;
        return;
      }
      releaseKeyboardLock();
    }, 160);
  }, true);

  /* Safety net: if the viewport changes a lot while locked (rotation with
     keyboard open), re-read the real height after the fact. */
  window.addEventListener("orientationchange", function () {
    if (!shouldUseKeyboardLock() || !keyboardLocked) return;
    var active = document.activeElement;
    releaseKeyboardLock();
    if (active && active.matches && active.matches("input, textarea, select")) {
      try { active.focus({ preventScroll: true }); } catch (e) {}
    }
  });

  /* ============================================================================
     Classic card controls — identical on desktop AND phones:
     • tap/click the CARD = point/highlight it,
     • tap/click the HAND = choose/reveal the word.
     Sensitive game logic still stays authoritative on the server; this only
     swaps the local interaction wiring.
   ============================================================================ */
  var CARD_BUTTON = ".cm-flip > button";
  var cardBypass = false;

  function isTouchLike(ev) {
    if (ev && ev.pointerType && ev.pointerType !== "mouse") return true;
    try {
      return (
        window.matchMedia("(pointer: coarse)").matches === true ||
        window.matchMedia("(hover: none)").matches === true
      );
    } catch (e) { return false; }
  }

  function mainCardButtonFrom(node) {
    var flip = node && node.closest ? node.closest('.cm-flip') : null;
    if (!flip) return null;
    return flip.querySelector(':scope > button:not(.cm-point-btn)');
  }

  function pointButtonFrom(node) {
    var flip = node && node.closest ? node.closest('.cm-flip') : null;
    if (!flip) return null;
    return flip.querySelector(':scope > .cm-point-btn');
  }

  function dispatchSyntheticClick(btn, ev) {
    if (!btn) return;
    cardBypass = true;
    try {
      btn.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: ev && typeof ev.clientX === 'number' ? ev.clientX : 0,
        clientY: ev && typeof ev.clientY === 'number' ? ev.clientY : 0
      }));
    } finally {
      window.setTimeout(function () { cardBypass = false; }, 0);
    }
  }

  function cardInterceptor(ev) {
    if (cardBypass) return;
    var btn = ev.target && ev.target.closest ? ev.target.closest(CARD_BUTTON) : null;
    if (!btn || btn.disabled) return;

    var isPointBtn = btn.classList.contains('cm-point-btn');
    var mainBtn = isPointBtn ? mainCardButtonFrom(btn) : btn;
    var pointBtn = isPointBtn ? btn : pointButtonFrom(btn);

    if (ev.type === 'click') {
      if (isPointBtn && mainBtn && !mainBtn.disabled) {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        dispatchSyntheticClick(mainBtn, ev);
        return;
      }
      if (!isPointBtn && pointBtn && !pointBtn.disabled) {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        dispatchSyntheticClick(pointBtn, ev);
        return;
      }
    }

    if (isPointBtn) return;
    if (!isTouchLike(ev)) return;

    if (ev.type === 'contextmenu') {
      ev.preventDefault();
      return;
    }
    if (ev.type !== 'click') {
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    if (pointBtn && !pointBtn.disabled) {
      dispatchSyntheticClick(pointBtn, ev);
      return;
    }
    dispatchSyntheticClick(btn, ev);
  }
  ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture", "click", "contextmenu"].forEach(function (type) {
    document.addEventListener(type, cardInterceptor, { capture: true, passive: false });
  });

  /* ============================================================================
     Floating draggable elements — dual-path hardened recipe:
       • TOUCH: driven by touchstart/touchmove/touchend with preventDefault()
         on the very FIRST touch event — the browser can never claim the
         gesture for scrolling, so the element never "slips" from the finger.
       • MOUSE: pointer events with pointerdown capture + window-level
         tracking (survives capture loss).
       • No clamping mid-drag (no "sticking"); the drop point is clamped.
       • will-change: transform while dragging for GPU-smooth movement.
       • Taps are forwarded manually (preventDefault suppresses native
         clicks); double-tap on the drawer header snaps it home.
       • A themed meteor/comet particle trail follows the drag (canvas
         overlay; disabled for prefers-reduced-motion).
   ============================================================================ */
  var LOG_POS_KEY = "clue-me:log-pos";
  var FAB_POS_KEY = "clue-me:fab-pos";
  var FAB_CLOSE_ANCHOR_KEY = "clue-me:fab-close-anchor";
  var DRAG_THRESHOLD = 6;
  var lastLinkedFloatSignature = null;
  var lastLinkedFloatDock = null;

  function clampToViewport(left, top, w, h) {
    var winW = window.innerWidth || document.documentElement.clientWidth || 360;
    var winH = window.innerHeight || document.documentElement.clientHeight || 600;
    var minX = 6;
    var minY = 6;
    var maxX = Math.max(minX, winW - (w || 48) - 6);
    var maxY = Math.max(minY, winH - (h || 48) - 6);
    return {
      left: Math.min(Math.max(left, minX), maxX),
      top: Math.min(Math.max(top, minY), maxY)
    };
  }

  /* ------------------------------------------------- smooth comet ribbon */
  function svgNode(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
  }

  var trail = {
    root: null,
    svg: null,
    haloGrad: null,
    coreGrad: null,
    hotGrad: null,
    haloPath: null,
    corePath: null,
    hotPath: null,
    headGlow: null,
    headCore: null,
    headHot: null,
    points: [],
    active: false,
    targetEl: null,
    raf: 0,
    fade: 0,
    lastSampleAt: 0,
    paletteSig: '',
    palette: null,
    ensure: function () {
      if (!effectsEnabled()) return false;
      if (this.root) return true;
      try {
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
        var root = document.createElement('div');
        root.className = 'cm-log-ribbon';
        root.setAttribute('aria-hidden', 'true');
        root.hidden = true;
        var svg = svgNode('svg');
        svg.setAttribute('viewBox', '0 0 ' + Math.max(1, window.innerWidth) + ' ' + Math.max(1, window.innerHeight));
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        var defs = svgNode('defs');
        var haloGrad = svgNode('linearGradient');
        haloGrad.setAttribute('id', 'cm-log-ribbon-halo');
        haloGrad.setAttribute('gradientUnits', 'userSpaceOnUse');
        haloGrad.innerHTML =
          '<stop offset="0%" stop-color="transparent"></stop>' +
          '<stop offset="26%" stop-color="rgba(255,255,255,0.02)"></stop>' +
          '<stop offset="72%" stop-color="rgba(255,255,255,0.3)"></stop>' +
          '<stop offset="100%" stop-color="rgba(255,255,255,0.82)"></stop>';
        var coreGrad = svgNode('linearGradient');
        coreGrad.setAttribute('id', 'cm-log-ribbon-core');
        coreGrad.setAttribute('gradientUnits', 'userSpaceOnUse');
        coreGrad.innerHTML =
          '<stop offset="0%" stop-color="transparent"></stop>' +
          '<stop offset="18%" stop-color="rgba(255,255,255,0.08)"></stop>' +
          '<stop offset="72%" stop-color="rgba(255,255,255,0.88)"></stop>' +
          '<stop offset="100%" stop-color="rgba(255,255,255,1)"></stop>';
        var hotGrad = svgNode('linearGradient');
        hotGrad.setAttribute('id', 'cm-log-ribbon-hot');
        hotGrad.setAttribute('gradientUnits', 'userSpaceOnUse');
        hotGrad.innerHTML =
          '<stop offset="0%" stop-color="transparent"></stop>' +
          '<stop offset="52%" stop-color="rgba(255,255,255,0.12)"></stop>' +
          '<stop offset="100%" stop-color="rgba(255,255,255,1)"></stop>';
        defs.appendChild(haloGrad);
        defs.appendChild(coreGrad);
        defs.appendChild(hotGrad);
        svg.appendChild(defs);
        var haloPath = svgNode('path');
        haloPath.setAttribute('fill', 'none');
        haloPath.setAttribute('stroke', 'url(#cm-log-ribbon-halo)');
        haloPath.setAttribute('stroke-linecap', 'round');
        haloPath.setAttribute('stroke-linejoin', 'round');
        var corePath = svgNode('path');
        corePath.setAttribute('fill', 'none');
        corePath.setAttribute('stroke', 'url(#cm-log-ribbon-core)');
        corePath.setAttribute('stroke-linecap', 'round');
        corePath.setAttribute('stroke-linejoin', 'round');
        var hotPath = svgNode('path');
        hotPath.setAttribute('fill', 'none');
        hotPath.setAttribute('stroke', 'url(#cm-log-ribbon-hot)');
        hotPath.setAttribute('stroke-linecap', 'round');
        hotPath.setAttribute('stroke-linejoin', 'round');
        var headGlow = svgNode('circle');
        var headCore = svgNode('circle');
        var headHot = svgNode('circle');
        svg.appendChild(haloPath);
        svg.appendChild(corePath);
        svg.appendChild(hotPath);
        svg.appendChild(headGlow);
        svg.appendChild(headCore);
        svg.appendChild(headHot);
        root.appendChild(svg);
        document.body.appendChild(root);
        this.root = root;
        this.svg = svg;
        this.haloGrad = haloGrad;
        this.coreGrad = coreGrad;
        this.hotGrad = hotGrad;
        this.haloPath = haloPath;
        this.corePath = corePath;
        this.hotPath = hotPath;
        this.headGlow = headGlow;
        this.headCore = headCore;
        this.headHot = headHot;
        var self = this;
        window.addEventListener('resize', function () { self.resize(); });
        this.resize();
        return true;
      } catch (e) {
        return false;
      }
    },
    resize: function () {
      if (!this.svg) return;
      this.svg.setAttribute('viewBox', '0 0 ' + Math.max(1, window.innerWidth) + ' ' + Math.max(1, window.innerHeight));
    },
    themePalette: function () {
      var htmlEl = document.documentElement;
      var sig = [htmlEl.className, htmlEl.getAttribute('data-theme') || ''].join('|');
      if (this.palette && this.paletteSig === sig) return this.palette;
      this.paletteSig = sig;
      var cs = getComputedStyle(htmlEl);
      var grab = function (name, fallback) {
        var v = (cs.getPropertyValue(name) || '').trim();
        return v || fallback;
      };
      this.palette = {
        tail: grab('--cm-log-flame-tail', 'rgba(127,146,255,0.28)'),
        core: grab('--cm-log-flame-core', '#b38cff'),
        hot: grab('--cm-log-flame-hot', '#ecddff'),
        glow: grab('--cm-log-flame-shadow', 'rgba(176,140,255,0.16)')
      };
      return this.palette;
    },
    syncPalette: function () {
      if (!this.root) return;
      var pal = this.themePalette();
      var haloStops = this.haloGrad.querySelectorAll('stop');
      if (haloStops[1]) haloStops[1].setAttribute('stop-color', pal.tail);
      if (haloStops[2]) haloStops[2].setAttribute('stop-color', pal.core);
      if (haloStops[3]) haloStops[3].setAttribute('stop-color', pal.hot);
      var coreStops = this.coreGrad.querySelectorAll('stop');
      if (coreStops[1]) coreStops[1].setAttribute('stop-color', pal.tail);
      if (coreStops[2]) coreStops[2].setAttribute('stop-color', pal.core);
      if (coreStops[3]) coreStops[3].setAttribute('stop-color', pal.hot);
      var hotStops = this.hotGrad.querySelectorAll('stop');
      if (hotStops[1]) hotStops[1].setAttribute('stop-color', pal.core);
      if (hotStops[2]) hotStops[2].setAttribute('stop-color', pal.hot);
      this.headGlow.setAttribute('fill', pal.tail);
      this.headCore.setAttribute('fill', pal.core);
      this.headHot.setAttribute('fill', pal.hot);
    },
    buildPath: function (pts) {
      if (!pts || !pts.length) return '';
      if (pts.length === 1) return 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1) + ' L ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
      var d = 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
      for (var i = 1; i < pts.length - 1; i++) {
        var xc = (pts[i].x + pts[i + 1].x) / 2;
        var yc = (pts[i].y + pts[i + 1].y) / 2;
        d += ' Q ' + pts[i].x.toFixed(1) + ' ' + pts[i].y.toFixed(1) + ' ' + xc.toFixed(1) + ' ' + yc.toFixed(1);
      }
      var last = pts[pts.length - 1];
      var prev = pts[pts.length - 2];
      d += ' Q ' + prev.x.toFixed(1) + ' ' + prev.y.toFixed(1) + ' ' + last.x.toFixed(1) + ' ' + last.y.toFixed(1);
      return d;
    },
    syncGradientLine: function (grad, from, to) {
      if (!grad || !from || !to) return;
      grad.setAttribute('x1', from.x.toFixed(1));
      grad.setAttribute('y1', from.y.toFixed(1));
      grad.setAttribute('x2', to.x.toFixed(1));
      grad.setAttribute('y2', to.y.toFixed(1));
    },
    pushPoint: function (pt, force) {
      var last = this.points[this.points.length - 1];
      if (!last || force) {
        this.points.push(pt);
      } else {
        var dist = Math.hypot(pt.x - last.x, pt.y - last.y);
        if (dist < 1.2) {
          last.x = last.x * 0.42 + pt.x * 0.58;
          last.y = last.y * 0.42 + pt.y * 0.58;
          last.speed = Math.max(last.speed * 0.6, pt.speed || 0);
          last.at = pt.at;
        } else {
          this.points.push(pt);
        }
      }
      if (this.points.length > 12) this.points.shift();
    },
    sample: function (targetEl, motion, force) {
      if (!this.ensure()) return;
      this.targetEl = targetEl || this.targetEl || fab;
      if (!this.targetEl) return;
      var px = Number(motion && motion.centerX);
      var py = Number(motion && motion.centerY);
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        var rect = this.targetEl.getBoundingClientRect();
        px = rect.left + rect.width / 2;
        py = rect.top + rect.height / 2;
      }
      var pt = {
        x: px,
        y: py,
        speed: Math.max(0, Math.min(42, Number(motion && motion.speed || 0))),
        at: performance.now()
      };
      this.pushPoint(pt, !!force);
      this.lastSampleAt = pt.at;
      this.fade = 1;
      this.root.hidden = false;
      this.root.style.opacity = '1';
      if (!this.raf) this.loop();
    },
    start: function (targetEl) {
      if (!this.ensure()) return;
      this.points = [];
      this.active = true;
      this.fade = 1;
      this.sample(targetEl || fab, { speed: 0 }, true);
    },
    end: function () {
      this.active = false;
      if (!this.raf && this.points.length) this.loop();
    },
    hide: function () {
      if (!this.root) return;
      this.root.style.opacity = '0';
      this.root.hidden = true;
      this.haloPath.setAttribute('d', '');
      this.corePath.setAttribute('d', '');
      this.hotPath.setAttribute('d', '');
      this.points = [];
      this.fade = 0;
      this.lastSampleAt = 0;
    },
    render: function () {
      if (!this.root) return;
      this.syncPalette();
      if (!this.points.length) {
        this.hide();
        return;
      }
      if (!this.active) {
        this.fade *= 0.86;
        if (this.fade < 0.04) {
          this.hide();
          return;
        }
        if (this.points.length > 2) this.points.shift();
      }
      var pts = this.points.slice();
      var from = pts[0];
      var to = pts[pts.length - 1];
      var d = this.buildPath(pts);
      var speed = 0;
      for (var i = Math.max(0, pts.length - 4); i < pts.length; i++) speed = Math.max(speed, Number(pts[i].speed || 0));
      var haloW = Math.max(14, Math.min(22, 14 + speed * 0.2));
      var coreW = Math.max(5, Math.min(8.5, 5 + speed * 0.08));
      var hotW = Math.max(1.8, Math.min(3.2, 1.8 + speed * 0.035));
      this.syncGradientLine(this.haloGrad, from, to);
      this.syncGradientLine(this.coreGrad, from, to);
      this.syncGradientLine(this.hotGrad, from, to);
      this.haloPath.setAttribute('d', d);
      this.corePath.setAttribute('d', d);
      this.hotPath.setAttribute('d', d);
      this.haloPath.setAttribute('stroke-width', haloW.toFixed(2));
      this.corePath.setAttribute('stroke-width', coreW.toFixed(2));
      this.hotPath.setAttribute('stroke-width', hotW.toFixed(2));
      this.haloPath.setAttribute('opacity', Math.max(0.12, this.fade * 0.26).toFixed(3));
      this.corePath.setAttribute('opacity', Math.max(0.22, this.fade * 0.82).toFixed(3));
      this.hotPath.setAttribute('opacity', Math.max(0.24, this.fade * 0.95).toFixed(3));
      this.headGlow.setAttribute('cx', to.x.toFixed(1));
      this.headGlow.setAttribute('cy', to.y.toFixed(1));
      this.headGlow.setAttribute('r', Math.max(8, Math.min(14, 8 + speed * 0.12)).toFixed(2));
      this.headGlow.setAttribute('opacity', Math.max(0.12, this.fade * 0.24).toFixed(3));
      this.headCore.setAttribute('cx', to.x.toFixed(1));
      this.headCore.setAttribute('cy', to.y.toFixed(1));
      this.headCore.setAttribute('r', Math.max(4, Math.min(7.5, 4 + speed * 0.06)).toFixed(2));
      this.headCore.setAttribute('opacity', Math.max(0.28, this.fade * 0.88).toFixed(3));
      this.headHot.setAttribute('cx', to.x.toFixed(1));
      this.headHot.setAttribute('cy', to.y.toFixed(1));
      this.headHot.setAttribute('r', Math.max(2.1, Math.min(4.2, 2.1 + speed * 0.03)).toFixed(2));
      this.headHot.setAttribute('opacity', Math.max(0.34, this.fade).toFixed(3));
      this.root.style.opacity = Math.max(0, Math.min(1, this.fade)).toFixed(3);
    },
    loop: function () {
      var self = this;
      self.raf = window.requestAnimationFrame(function () {
        self.raf = 0;
        self.render();
        var recentlyMoved = self.active && performance.now() - self.lastSampleAt < 90;
        if (recentlyMoved || (!self.active && self.fade > 0.04 && self.points.length)) {
          self.loop();
        }
      });
    }
  };
  /* exposed for tests/debugging */
  try { window.__cmTrail = trail; } catch (e) {}

  function emitTrail(el, dx, dy) {
    return;
  }

  /* ------------------------------------------------------ drag controller */
  function readTranslate(el) {
    var m = el.style.transform.match(/translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/);
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
  }

  function makeDraggable(opts) {
    /* opts: { grip, el, storageKey, resettable, onTap } */
    var grip = opts.grip;
    var el = opts.el;
    var drag = null;
    var lastTap = 0;
    var suppressNativeClickUntil = 0;
    var dragThreshold = Number(opts.dragThreshold);
    if (!Number.isFinite(dragThreshold) || dragThreshold < 0) dragThreshold = DRAG_THRESHOLD;

    grip.style.touchAction = "none";
    grip.addEventListener('click', function (ev) {
      if (opts.ignoreDragTarget && opts.ignoreDragTarget(ev.target)) return;
      if (Date.now() > suppressNativeClickUntil) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    }, true);

    function baseOf() {
      var r = el.getBoundingClientRect();
      var cur = readTranslate(el);
      return { left: r.left - cur.x, top: r.top - cur.y, width: r.width, height: r.height };
    }

    function applyAt(px, py, base) {
      el.style.transform = "translate3d(" + (px - base.left) + "px," + (py - base.top) + "px,0)";
    }

    function start(x, y, target, id) {
      if (drag) return false;
      if (opts.ignoreDragTarget && opts.ignoreDragTarget(target)) return false;
      var r = el.getBoundingClientRect();
      var cur = readTranslate(el);
      drag = {
        id: id,
        sx: x,
        sy: y,
        lastX: x,
        lastY: y,
        pendingX: x,
        pendingY: y,
        frame: 0,
        gx: x - r.left,
        gy: y - r.top,
        base: { left: r.left - cur.x, top: r.top - cur.y },
        baseW: r.width,
        baseH: r.height,
        moved: false,
        target: target,
        lastV: null
      };
      return true;
    }

    function flushMove(state, x, y) {
      if (!state) return;
      var dx = x - state.sx;
      var dy = y - state.sy;
      if (!state.moved) {
        if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
        state.moved = true;
        if (opts.onStart) opts.onStart();
      }
      var stepDx = x - state.lastX;
      var stepDy = y - state.lastY;
      var rawLeft = x - state.gx;
      var rawTop = y - state.gy;
      var clamped = clampToViewport(rawLeft, rawTop, state.baseW, state.baseH);
      state.lastV = clamped;
      applyAt(clamped.left, clamped.top, state.base);
      emitTrail(el, stepDx, stepDy);
      state.lastX = x;
      state.lastY = y;
      if (opts.onMove) {
        opts.onMove(state.lastV, {
          dx: stepDx,
          dy: stepDy,
          speed: Math.sqrt(stepDx * stepDx + stepDy * stepDy),
          pointerX: x,
          pointerY: y,
          centerX: state.lastV.left + state.baseW / 2,
          centerY: state.lastV.top + state.baseH / 2
        });
      }
    }

    function scheduleMove(x, y) {
      if (!drag) return;
      drag.pendingX = x;
      drag.pendingY = y;
      if (drag.frame) return;
      drag.frame = window.requestAnimationFrame(function () {
        var state = drag;
        if (!state) return;
        state.frame = 0;
        flushMove(state, state.pendingX, state.pendingY);
      });
    }

    function move(x, y) {
      scheduleMove(x, y);
    }

    function end(kind) {
      if (!drag) return;
      var d = drag;
      if (d.frame) {
        window.cancelAnimationFrame(d.frame);
        d.frame = 0;
      }
      flushMove(d, d.pendingX, d.pendingY);
      drag = null;
      if (d.moved) {
        /* A native click follows mouseup/touchend after a drag. Suppress that
           one click so dragging a drawer title never also collapses it. */
        suppressNativeClickUntil = Date.now() + 500;
        if (opts.onEnd) opts.onEnd();
        var base = { left: d.base.left, top: d.base.top, width: d.baseW, height: d.baseH };
        var pos = clampToViewport(d.lastV.left, d.lastV.top, base.width, base.height);
        applyAt(pos.left, pos.top, base);
        try {
          localStorage.setItem(opts.storageKey, JSON.stringify({
            x: pos.left / window.innerWidth,
            y: pos.top / window.innerHeight
          }));
        } catch (e) {}
        if (opts.onDrop) opts.onDrop(pos);
        return;
      }
      if (kind !== "up") return;
      /* a tap: forward the click manually (preventDefault killed the native one) */
      var btn = d.target && d.target.closest ? d.target.closest("button") : null;
      var now = Date.now();
      if (opts.resettable && now - lastTap < 320) {
        lastTap = 0;
        suppressNativeClickUntil = Date.now() + 500;
        try { localStorage.removeItem(opts.storageKey); } catch (e) {}
        invalidateLinkedSavedTransform();
        el.style.transform = "";
        el.style.transition = "";
        if (opts.onReset) opts.onReset();
        return;
      }
      lastTap = now;
      if (opts.onTap) {
        opts.onTap(d.target);
        suppressNativeClickUntil = Date.now() + 500;
      } else if (btn) {
        btn.click();
        suppressNativeClickUntil = Date.now() + 500;
      }
    }

    /* ---------------- TOUCH path (authoritative on phones) ---------------- */
    function windowTouchMove(ev) {
      if (!drag || drag.id.charAt(0) !== "t") return;
      var touches = ev.changedTouches;
      for (var i = 0; i < touches.length; i++) {
        if ("t" + touches[i].identifier === drag.id) {
          move(touches[i].clientX, touches[i].clientY);
          if (ev.cancelable) ev.preventDefault();
          return;
        }
      }
    }

    function touchFinish(ev) {
      if (!drag || drag.id.charAt(0) !== "t") return;
      var touches = ev.changedTouches;
      for (var i = 0; i < touches.length; i++) {
        if ("t" + touches[i].identifier === drag.id) {
          window.removeEventListener("touchmove", windowTouchMove, true);
          window.removeEventListener("touchend", touchFinish, true);
          window.removeEventListener("touchcancel", touchFinish, true);
          end(ev.type === "touchend" ? "up" : "cancel");
          if (ev.cancelable) ev.preventDefault();
          return;
        }
      }
    }

    grip.addEventListener("touchstart", function (ev) {
      if (drag || ev.touches.length !== 1 || ev.changedTouches.length !== 1) return;
      var t = ev.changedTouches[0];
      if (!start(t.clientX, t.clientY, t.target, "t" + t.identifier)) return;
      window.addEventListener("touchmove", windowTouchMove, { capture: true, passive: false });
      window.addEventListener("touchend", touchFinish, { capture: true, passive: false });
      window.addEventListener("touchcancel", touchFinish, { capture: true, passive: false });
      ev.preventDefault(); /* the browser can NEVER steal this gesture */
    }, { passive: false });

    /* ---------------- DESKTOP mouse path ---------------- */
    grip.addEventListener("mousedown", function (ev) {
      if (ev.button !== 0) return;
      if (!start(ev.clientX, ev.clientY, ev.target, "m")) return;
      ev.preventDefault();
      window.addEventListener("mousemove", mouseMove, true);
      window.addEventListener("mouseup", mouseUp, true);
      window.addEventListener("blur", mouseCancel, true);
    });

    function mouseMove(ev) {
      if (!drag || drag.id !== "m") return;
      move(ev.clientX, ev.clientY);
      ev.preventDefault();
    }
    function mouseUp(ev) {
      if (!drag || drag.id !== "m") return;
      window.removeEventListener("mousemove", mouseMove, true);
      window.removeEventListener("mouseup", mouseUp, true);
      window.removeEventListener("blur", mouseCancel, true);
      end("up");
      ev.preventDefault();
    }
    function mouseCancel() {
      if (!drag || drag.id !== "m") return;
      window.removeEventListener("mousemove", mouseMove, true);
      window.removeEventListener("mouseup", mouseUp, true);
      window.removeEventListener("blur", mouseCancel, true);
      end("cancel");
    }

    grip.addEventListener("dragstart", function (ev) {
      ev.preventDefault();
    });

    grip.addEventListener("contextmenu", function (ev) {
      if (drag) ev.preventDefault();
    });

    return {
      applySaved: function () {
        var s = null;
        try { s = JSON.parse(localStorage.getItem(opts.storageKey) || "null"); } catch (e) {}
        if (!s || typeof s.x !== "number") return;
        var base = baseOf();
        var pos = clampToViewport(s.x * window.innerWidth, s.y * window.innerHeight, base.width, base.height);
        applyAt(pos.left, pos.top, base);
      }
    };
  }

  function linkedDock() {
    return document.querySelector('.cm-side-row > .cm-dock, .cm-dock');
  }

  function mirrorFloatTransform(sourceEl) {
    var dock = linkedDock();
    if (!sourceEl) return;
    var tr = sourceEl.style.transform || '';
    if (sourceEl !== fab) fab.style.transform = tr;
    if (dock && sourceEl !== dock) dock.style.transform = tr;
  }

  function clearLinkedFloatTransform() {
    var dock = linkedDock();
    fab.style.transform = '';
    if (dock) dock.style.transform = '';
  }

  function setFloatDraggingActive(active) {
    html.classList.toggle('cm-float-dragging', !!active);
  }

  function applyLinkedTail(sourceEl, motion) {
    if (!sourceEl || !motion) return;
    trail.sample(fab, motion, false);
  }

  function clearLinkedTail() {
    trail.end();
  }

  function isFloatDragging() {
    var dock = linkedDock();
    return !!(fab.dataset.cmDragging || (dock && dock.dataset.cmDragging));
  }

  function invalidateLinkedSavedTransform() {
    lastLinkedFloatSignature = null;
    lastLinkedFloatDock = null;
  }

  function applyLinkedSavedTransform(force) {
    if (isFloatDragging()) return;
    if (!force && fab.dataset.cmDockCloseAnchor === '1') return;

    var raw = '';
    var anchorRaw = '';
    try {
      raw = localStorage.getItem(FAB_POS_KEY) || '';
      anchorRaw = localStorage.getItem(FAB_CLOSE_ANCHOR_KEY) || '';
    } catch (e) {}
    var dock = linkedDock();
    var signature = [raw, anchorRaw, open ? 1 : 0, window.innerWidth || 0, window.innerHeight || 0].join('|');

    /* The FAB lives outside React. Re-applying an unchanged translate on every
       DOM sync can make it drift or shake horizontally. Recalculate only after
       a real resize, a new dock node, or a changed saved position. */
    if (!force && signature === lastLinkedFloatSignature && dock === lastLinkedFloatDock) return;

    var saved = null;
    var closeAnchor = null;
    try {
      saved = raw ? JSON.parse(raw) : null;
      closeAnchor = anchorRaw ? JSON.parse(anchorRaw) : null;
    } catch (e) {}

    /* A closed drawer presents the icon exactly at the X button's last
       position. This is intentionally independent from the drawer transform. */
    if (!open && !fab.hidden && closeAnchor && closeAnchor.v === 2 &&
        Number.isFinite(closeAnchor.tx) && Number.isFinite(closeAnchor.ty)) {
      var anchorRect = fab.getBoundingClientRect();
      var anchorCurrent = readTranslate(fab);
      var anchorBase = {
        left: anchorRect.left - anchorCurrent.x,
        top: anchorRect.top - anchorCurrent.y,
        width: anchorRect.width,
        height: anchorRect.height
      };
      var anchored = clampToViewport(
        anchorBase.left + closeAnchor.tx,
        anchorBase.top + closeAnchor.ty,
        anchorBase.width,
        anchorBase.height
      );
      var anchorTx = anchored.left - anchorBase.left;
      var anchorTy = anchored.top - anchorBase.top;
      fab.style.transform = 'translate3d(' + anchorTx + 'px,' + anchorTy + 'px,0)';
      fab.dataset.cmDockCloseAnchor = '1';
      if (anchorTx !== closeAnchor.tx || anchorTy !== closeAnchor.ty) {
        try {
          anchorRaw = JSON.stringify({ v: 2, tx: anchorTx, ty: anchorTy });
          localStorage.setItem(FAB_CLOSE_ANCHOR_KEY, anchorRaw);
          signature = [raw, anchorRaw, 0, window.innerWidth || 0, window.innerHeight || 0].join('|');
        } catch (e) {}
      }
      lastLinkedFloatSignature = signature;
      lastLinkedFloatDock = dock;
      return;
    }

    if (!saved || (typeof saved.tx !== 'number' && typeof saved.x !== 'number')) {
      clearLinkedFloatTransform();
      lastLinkedFloatSignature = signature;
      lastLinkedFloatDock = dock;
      return;
    }

    /* When the floating dock is open, clamp the dock itself strictly to the screen */
    if (open && dock) {
      var dockRect = dock.getBoundingClientRect();
      var dockCurrent = readTranslate(dock);
      var dockBase = {
        left: dockRect.left - dockCurrent.x,
        top: dockRect.top - dockCurrent.y,
        width: dockRect.width || 320,
        height: dockRect.height || 260
      };
      var targetDock;
      if (saved && saved.v === 2 && Number.isFinite(saved.tx) && Number.isFinite(saved.ty)) {
        targetDock = clampToViewport(
          dockBase.left + saved.tx,
          dockBase.top + saved.ty,
          dockBase.width,
          dockBase.height
        );
      } else if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        targetDock = clampToViewport(
          saved.x * window.innerWidth,
          saved.y * window.innerHeight,
          dockBase.width,
          dockBase.height
        );
      } else {
        targetDock = clampToViewport(
          dockBase.left,
          dockBase.top,
          dockBase.width,
          dockBase.height
        );
      }
      var dTx = targetDock.left - dockBase.left;
      var dTy = targetDock.top - dockBase.top;
      dock.style.transform = 'translate3d(' + dTx + 'px,' + dTy + 'px,0)';
      fab.style.transform = dock.style.transform;
      lastLinkedFloatSignature = signature;
      lastLinkedFloatDock = dock;
      return;
    }

    /* While the hybrid drawer is open the FAB is intentionally hidden and its
       rect is 0 × 0. Keep the stored v2 offset verbatim so a React redraw of
       the dock cannot corrupt its position from a zero-sized measurement. */
    if (fab.hidden && saved.v === 2 && Number.isFinite(saved.tx) && Number.isFinite(saved.ty)) {
      fab.style.transform = 'translate3d(' + saved.tx + 'px,' + saved.ty + 'px,0)';
      if (dock) dock.style.transform = fab.style.transform;
      lastLinkedFloatSignature = signature;
      lastLinkedFloatDock = dock;
      return;
    }

    /* v2 stores the FAB's transform offset, not a normalized coordinate from
       the drawer's different fixed base. It restores exactly at the same size
       and clamps safely once when the viewport truly changes. */
    var fabRect = fab.getBoundingClientRect();
    var current = readTranslate(fab);
    var fabBase = {
      left: fabRect.left - current.x,
      top: fabRect.top - current.y,
      width: fabRect.width,
      height: fabRect.height
    };
    var target;
    if (saved.v === 2 && Number.isFinite(saved.tx) && Number.isFinite(saved.ty)) {
      target = clampToViewport(
        fabBase.left + saved.tx,
        fabBase.top + saved.ty,
        fabBase.width,
        fabBase.height
      );
    } else {
      /* Read older normalized saved positions once, then migrate them to the
         stable transform-offset format below. */
      target = clampToViewport(
        saved.x * window.innerWidth,
        saved.y * window.innerHeight,
        fabBase.width,
        fabBase.height
      );
    }
    var tx = target.left - fabBase.left;
    var ty = target.top - fabBase.top;
    fab.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0)';
    mirrorFloatTransform(fab);

    if (saved.v !== 2 || !Number.isFinite(saved.tx) || !Number.isFinite(saved.ty)) {
      try {
        raw = JSON.stringify({ v: 2, tx: tx, ty: ty });
        localStorage.setItem(FAB_POS_KEY, raw);
        signature = [raw, anchorRaw, open ? 1 : 0, window.innerWidth || 0, window.innerHeight || 0].join('|');
      } catch (e) {}
    }
    lastLinkedFloatSignature = signature;
    lastLinkedFloatDock = dock;
  }

  /* ---------------------------------------------------------------- drawer */
  function disableDockCollapse(dock, head) {
    var title = head && head.querySelector('.cm-dock-title');
    if (!title) return;

    /* Reset a collapse state saved by the compiled dock once. From now on the
       title is a drag surface, while the explicit × is the only close action. */
    if (dock.classList.contains('cm-dock-collapsed') && !dock.dataset.cmCollapseReset) {
      dock.dataset.cmCollapseReset = '1';
      title.dataset.cmAllowProgrammaticToggle = '1';
      try { title.click(); } catch (e) {}
      delete title.dataset.cmAllowProgrammaticToggle;
      try { localStorage.setItem('clue-me:history-dock', 'open'); } catch (e) {}
    }

    title.tabIndex = -1;
    title.setAttribute('aria-disabled', 'true');
    if (title.dataset.cmCollapseDisabled) return;
    title.dataset.cmCollapseDisabled = '1';
    title.addEventListener('click', function (ev) {
      if (title.dataset.cmAllowProgrammaticToggle === '1') return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    }, true);
    title.addEventListener('keydown', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    }, true);
  }

  function anchorFabAtCloseButton(closeRect) {
    if (!closeRect) return;
    window.requestAnimationFrame(function () {
      if (fab.hidden) return;
      var fabRect = fab.getBoundingClientRect();
      if (!fabRect.width || !fabRect.height) return;
      var current = readTranslate(fab);
      var base = {
        left: fabRect.left - current.x,
        top: fabRect.top - current.y,
        width: fabRect.width,
        height: fabRect.height
      };
      var target = clampToViewport(
        closeRect.left + (closeRect.width - base.width) / 2,
        closeRect.top + (closeRect.height - base.height) / 2,
        base.width,
        base.height
      );
      fab.style.transition = 'none';
      var tx = target.left - base.left;
      var ty = target.top - base.top;
      fab.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0)';
      fab.dataset.cmDockCloseAnchor = '1';
      try {
        localStorage.setItem(FAB_CLOSE_ANCHOR_KEY, JSON.stringify({ v: 2, tx: tx, ty: ty }));
      } catch (e) {}
      window.requestAnimationFrame(function () {
        if (fab.dataset.cmDockCloseAnchor === '1') fab.style.transition = '';
      });
    });
  }

  function ensureDockCloseButton(dock, head) {
    if (!dock || !head) return;
    disableDockCollapse(dock, head);

    /* Android Floating Window top handle */
    if (!dock.querySelector('.cm-dock-android-handle')) {
      var handle = document.createElement('div');
      handle.className = 'cm-dock-android-handle';
      handle.setAttribute('aria-hidden', 'true');
      dock.insertBefore(handle, dock.firstChild);
    }

    var controls = head.querySelector('.cm-dock-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'cm-dock-controls';
      head.appendChild(controls);
    }

    var sizeToggle = controls.querySelector('.cm-dock-size-toggle');
    if (!sizeToggle) {
      sizeToggle = document.createElement('button');
      sizeToggle.type = 'button';
      sizeToggle.className = 'cm-dock-size-toggle';
      sizeToggle.setAttribute('aria-label', (html.getAttribute('lang') || 'ar').startsWith('en') ? 'Toggle size' : 'تكبير / تصغير');
      sizeToggle.title = (html.getAttribute('lang') || 'ar').startsWith('en') ? 'Toggle size' : 'تكبير / تصغير';
      sizeToggle.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
      sizeToggle.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        dock.classList.toggle('cm-dock-tall');
      });
      controls.appendChild(sizeToggle);
    }

    var close = controls.querySelector('.cm-dock-close');
    if (!close) {
      close = document.createElement('button');
      close.type = 'button';
      close.className = 'cm-dock-close';
      close.setAttribute('aria-label', t('close'));
      close.title = t('close');
      close.textContent = '×';
      close.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var rect = close.getBoundingClientRect();
        try { localStorage.removeItem(FAB_CLOSE_ANCHOR_KEY); } catch (e) {}
        delete fab.dataset.cmDockCloseAnchor;
        setOpen(false);
        anchorFabAtCloseButton({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        });
      });
      controls.appendChild(close);
    } else {
      close.setAttribute('aria-label', t('close'));
      close.title = t('close');
    }
  }

  function persistFabTransformOffset() {
    try {
      var dock = linkedDock();
      var source = (open && dock) ? dock : fab;
      var offset = readTranslate(source);
      localStorage.setItem(FAB_POS_KEY, JSON.stringify({
        v: 2,
        tx: offset.x,
        ty: offset.y
      }));
    } catch (e) {}
    invalidateLinkedSavedTransform();
  }

  function attachDockDrag(dock) {
    var head = dock && dock.querySelector('.cm-dock-head');
    if (!head) return;
    ensureDockCloseButton(dock, head);
    if (dock.__cmDragDock === dock) {
      if (!isFloatDragging()) applyLinkedSavedTransform();
      return;
    }

    dock.dataset.cmDrag = '1';
    dock.__cmDragDock = dock;
    dockDragCtl = makeDraggable({
      grip: dock,
      el: dock,
      storageKey: FAB_POS_KEY,
      resettable: true,
      /* Interactive controls work normally, while anywhere on the dock surface drags the window */
      ignoreDragTarget: function (target) {
        if (!target || !target.closest) return false;
        return !!target.closest('.cm-dock-close, .cm-dock-size-toggle, .cm-dock-size, input, select, textarea, a');
      },
      onTap: function () {},
      onStart: function () {
        blurActiveEditable();
        setFloatDraggingActive(true);
        dock.dataset.cmDragging = '1';
        dock.classList.add('cm-dock-dragging');
        dock.style.transition = 'none';
        dock.style.willChange = 'transform';
      },
      onMove: function () {
        mirrorFloatTransform(dock);
      },
      onEnd: function () {
        setFloatDraggingActive(false);
        delete dock.dataset.cmDragging;
        dock.classList.remove('cm-dock-dragging');
        dock.style.transition = '';
        dock.style.willChange = '';
        mirrorFloatTransform(dock);
      },
      onReset: function () {
        setFloatDraggingActive(false);
        try { localStorage.removeItem(FAB_POS_KEY); } catch (e) {}
        invalidateLinkedSavedTransform();
        clearLinkedFloatTransform();
      },
      onDrop: function () {
        persistFabTransformOffset();
      }
    });
    applyLinkedSavedTransform(true);
  }

  /* ------------------------------------------------------------ log button */
  function attachFabDrag() {
    if (fab.dataset.cmDrag) {
      if (!isFloatDragging()) applyLinkedSavedTransform();
      return;
    }
    fab.dataset.cmDrag = '1';
    fabDragCtl = makeDraggable({
      grip: fab,
      el: fab,
      storageKey: FAB_POS_KEY,
      resettable: false,
      /* A deliberate movement repositions the closed icon; a normal tap opens
         the drawer. The larger threshold avoids accidental drag on touchpads. */
      dragThreshold: 12,
      onStart: function () {
        delete fab.dataset.cmDockCloseAnchor;
        try { localStorage.removeItem(FAB_CLOSE_ANCHOR_KEY); } catch (e) {}
        blurActiveEditable();
        setFloatDraggingActive(true);
        trail.start(fab);
        fab.dataset.cmDragging = '1';
        fab.classList.add('cm-fab-dragging');
        fab.style.willChange = 'transform';
        fab.style.transition = 'none';
      },
      onMove: function (pos, motion) {
        mirrorFloatTransform(fab);
        applyLinkedTail(fab, motion);
      },
      onEnd: function () {
        setFloatDraggingActive(false);
        delete fab.dataset.cmDragging;
        fab.classList.remove('cm-fab-dragging');
        fab.style.willChange = '';
        fab.style.transition = '';
        clearLinkedTail();
        mirrorFloatTransform(fab);
      },
      onDrop: function () {
        persistFabTransformOffset();
      },
      onTap: function () {
        delete fab.dataset.cmDockCloseAnchor;
        try { localStorage.removeItem(FAB_CLOSE_ANCHOR_KEY); } catch (e) {}
        blurActiveEditable(); setOpen(!open);
      }
    });
    applyLinkedSavedTransform(true);
  }

  var dockDragCtl = null;
  var fabDragCtl = null;

  window.addEventListener('resize', function () {
    if (!fab.dataset.cmDragging && !(linkedDock() && linkedDock().dataset.cmDragging)) {
      applyLinkedSavedTransform(true);
    }
  });

  /* ============================================================================
     Live clue for everyone — the compiled panel only renders for the on-turn
     team's operatives. This mirrors the current clue (word · number, from the
     turn banner's chip) into the side panel for every other viewer: the other
     team, the captain, spectators. The end-turn button stays exclusive to the
     on-turn team (the bundle already enforces that).
   ============================================================================ */
  function liveClueData() {
    var authoritative = lastGameView || readGameViewState();
    if (authoritative && authoritative.phase === 'guess' && authoritative.turnTeam && authoritative.clue && authoritative.clue.word) {
      return {
        word: authoritative.clue.word,
        num: authoritative.clue.number != null ? String(authoritative.clue.number) : '',
        team: authoritative.turnTeam
      };
    }
    var main = document.querySelector(".cm-game-shell > main");
    if (!main) return null;
    var banner = main.querySelector(':scope > [aria-live="polite"]');
    if (!banner) return null;
    var chip = banner.querySelector(":scope > span.rounded-full");
    if (!chip) return null;
    var text = (chip.textContent || "").trim();
    var idx = text.lastIndexOf("\u00B7");
    var word = idx > 0 ? text.slice(0, idx).trim() : text;
    var num = idx > 0 ? text.slice(idx + 1).trim() : "";
    if (!word) return null;
    var cls = banner.className || "";
    return {
      word: word,
      num: num,
      team: cls.indexOf("bg-red-pale") !== -1 ? "red" : "blue"
    };
  }

  /* ============================================================================
     Point tags for captains — the app renders pointer tags for operatives
     and spectators, but the captain's board render omits them. The data IS
     delivered to every client (it lives in the board component's props), so
     we read it from there and render identical tags for viewers missing
     them. Falls back silently if React internals are unavailable.
   ============================================================================ */
  function readBoardPointers() {
    var grid = document.querySelector(".cm-board-frame .grid");
    if (!grid) return null;
    var fiberKey = null;
    for (var k in grid) {
      if (k.indexOf("__reactFiber$") === 0) { fiberKey = k; break; }
    }
    if (!fiberKey) return null;
    var f = grid[fiberKey];
    var hops = 0;
    while (f && hops < 20) {
      if (f.memoizedProps && f.memoizedProps.pointers) return f.memoizedProps.pointers;
      f = f.return;
      hops++;
    }
    return null;
  }

  function syncCaptainPointTags() {
    var mine = document.querySelectorAll("[data-cm-pointers-mine]");
    if (document.querySelector(".cm-flip .cm-point-tag")) {
      for (var i = 0; i < mine.length; i++) mine[i].remove();
      return;
    }
    var pointers = readBoardPointers();
    var cells = document.querySelectorAll(".cm-cell");
    var byIndex = {};
    if (pointers && pointers.length) {
      for (var p = 0; p < pointers.length; p++) {
        var idx = pointers[p].index;
        if (typeof idx === "number" && idx >= 0 && idx < cells.length) {
          (byIndex[idx] = byIndex[idx] || []).push(pointers[p].name || "?");
        }
      }
    }
    /* drop containers whose pointer is gone */
    for (var m = 0; m < mine.length; m++) {
      if (!byIndex[+mine[m].getAttribute("data-cm-pointers-mine")]) mine[m].remove();
    }
    for (var key in byIndex) {
      var cell = cells[key];
      if (!cell) continue;
      var names = byIndex[key];
      var sig = names.slice(0, 2).join("\u0001") + (names.length > 2 ? "\u0002" + (names.length - 2) : "");
      var host = cell.querySelector(".cm-point-tags[data-cm-pointers-mine]");
      if (!host) {
        host = document.createElement("span");
        host.className = "cm-point-tags";
        host.setAttribute("data-cm-pointers-mine", key);
        host.setAttribute("aria-hidden", "true");
        cell.appendChild(host);
      }
      if (host.getAttribute("data-cm-sig") !== sig) {
        host.setAttribute("data-cm-sig", sig);
        host.innerHTML = "";
        names.slice(0, 2).forEach(function (n) {
          var pill = document.createElement("span");
          pill.className = "cm-point-tag";
          pill.textContent = n;
          host.appendChild(pill);
        });
        if (names.length > 2) {
          var more = document.createElement("span");
          more.className = "cm-point-tag";
          more.textContent = "+" + (names.length - 2);
          host.appendChild(more);
        }
      }
    }
  }

  function clueProgressState() {
    var view = lastGameView || readGameViewState();
    if (!view || !view.clueTarget) return null;
    return {
      selected: Math.max(0, Number(view.clueSelections || 0)),
      target: Math.max(0, Number(view.clueTarget || 0)),
      total: Math.max(1, Number(view.maxGuesses || (Number(view.clueTarget || 0) + 1))),
      team: view.turnTeam || 'red'
    };
  }

  function currentCaptainTeamFromUi() {
    var seatBtn = document.querySelector('.cm-game-page > header .cm-seat-btn, .cm-seat-btn');
    if (!seatBtn) return null;

    var seatText = [
      seatBtn.textContent || '',
      seatBtn.title || '',
      seatBtn.getAttribute('aria-label') || ''
    ].join(' ');
    if (!/(captain|spymaster|قائد)/i.test(seatText)) return null;

    var dot = seatBtn.querySelector('.cm-seat-dot');
    var dotClassName = dot ? String(dot.className || '') : '';
    if (dotClassName.indexOf('bg-red') !== -1) return 'red';
    if (dotClassName.indexOf('bg-blue') !== -1) return 'blue';
    return null;
  }

  function syncCaptainOwnCards() {
    var flips = document.querySelectorAll('.cm-board-frame .cm-flip');
    for (var i = 0; i < flips.length; i++) {
      var flip = flips[i];
      var cell = flip.parentElement;
      flip.classList.remove('cm-captain-own-card');
      if (cell && cell.classList.contains('cm-cell')) {
        cell.classList.remove('cm-captain-own-card');
      }
    }

    var team = currentCaptainTeamFromUi();
    if (!team) return;

    for (var j = 0; j < flips.length; j++) {
      var ownFlip = flips[j];
      var keyFaceVisible = ownFlip.getAttribute('data-revealed') === 'true';
      var cardActuallyRevealed = ownFlip.getAttribute('data-chosen') === 'true';
      /* Captains see every key face, so data-revealed alone is not the
         gameplay reveal state in this view. data-chosen is the DOM marker
         for a card already selected on the board. */
      if (keyFaceVisible && cardActuallyRevealed) continue;
      if (ownFlip.getAttribute('data-state') !== team) continue;

      ownFlip.classList.add('cm-captain-own-card');
      var ownCell = ownFlip.parentElement;
      if (ownCell && ownCell.classList.contains('cm-cell')) {
        ownCell.classList.add('cm-captain-own-card');
      }
    }
  }

  function applyClueProgress(host, team) {
    if (!host) return;
    var progress = clueProgressState();
    var box = host.querySelector('.cm-clue-live-progress');
    if (!progress) {
      if (box) box.remove();
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.className = 'cm-clue-live-progress';
      host.appendChild(box);
    }
    var progressTeam = team || progress.team || 'red';
    var progressSig = [progressTeam, progress.selected, progress.target, progress.total].join('|');
    if (box.getAttribute('data-cm-progress-sig') === progressSig) return;

    box.setAttribute('data-cm-progress-sig', progressSig);
    box.className = 'cm-clue-live-progress cm-clue-live-progress-' + progressTeam;
    box.innerHTML = '';
    for (var i = 0; i < progress.total; i++) {
      var dot = document.createElement('span');
      dot.className = 'cm-clue-live-dot' +
        (i < progress.selected ? ' cm-clue-live-dot-on' : '') +
        (i === progress.total - 1 && progress.total > progress.target ? ' cm-clue-live-dot-bonus' : '');
      dot.setAttribute('aria-hidden', 'true');
      box.appendChild(dot);
    }
  }

  function syncMobileOperativeClueLayout() {
    var host = document.querySelector('.cm-side-clue');
    if (!host) return;
    host.classList.remove('cm-side-clue-mobile-guess');
    if (window.innerWidth > 640) return;
    var buttons = host.querySelectorAll('button');
    var endTurnBtn = null;
    for (var i = 0; i < buttons.length; i++) {
      var txt = ((buttons[i].textContent || '') + '').replace(/\s+/g, ' ').trim();
      if (txt.indexOf('End turn') !== -1 || txt.indexOf('إنهاء الدور') !== -1) {
        endTurnBtn = buttons[i];
        break;
      }
    }
    if (!endTurnBtn) return;
    var actions = endTurnBtn.parentElement;
    var progress = actions ? actions.firstElementChild : null;
    var layout = actions ? actions.parentElement : null;
    var main = actions ? actions.previousElementSibling : null;
    var wordRow = main ? main.querySelector('div.flex.items-baseline.gap-2') : null;
    if (!actions || !progress || progress === endTurnBtn || progress.children.length < 2 || !layout) return;
    host.classList.add('cm-side-clue-mobile-guess');
    layout.classList.add('cm-side-clue-guess-layout');
    main && main.classList.add('cm-side-clue-guess-main');
    actions.classList.add('cm-side-clue-guess-actions');
    progress.classList.add('cm-side-clue-guess-progress');
    wordRow && wordRow.classList.add('cm-side-clue-guess-wordrow');
  }

  function syncClueComposerLayout() {
    var host = document.querySelector('.cm-side-clue');
    if (!host) return;
    host.classList.remove('cm-side-clue-compose-active');
    var form = host.querySelector('form');
    var clueField = form ? form.querySelector('textarea[name="clue-input"], input[name="clue-input"]') : null;
    if (!form || !clueField) return;
    var topRow = form.firstElementChild;
    var fieldWrap = clueField.closest ? clueField.closest('div') : null;
    var metaWrap = topRow && fieldWrap && fieldWrap.parentElement === topRow ? fieldWrap.nextElementSibling : null;
    var submitBtn = form.querySelector('button[type="submit"]');
    host.classList.add('cm-side-clue-compose-active');
    form.classList.add('cm-side-clue-compose-form');
    topRow && topRow.classList.add('cm-side-clue-compose-top');
    fieldWrap && fieldWrap.classList.add('cm-side-clue-compose-field');
    metaWrap && metaWrap.classList.add('cm-side-clue-compose-meta');
    submitBtn && submitBtn.classList.add('cm-side-clue-compose-submit');
    clueField.setAttribute('dir', 'auto');
    markManagedNoTranslate(clueField);
  }

  var hiddenGameOverSig = null;
  var gameOverOverlayBound = false;
  var gameOverActionSeq = 0;

  function currentGameOverSig() {
    var view = lastGameView || readGameViewState();
    if (!view || !view.winner) return null;
    return [view.gameId || '', view.stateVersion || view.revision || view.moveCount || 0, view.winner].join('|');
  }

  function blurActiveEditable() {
    var active = document.activeElement;
    if (!active || !active.matches) return;
    if (active.matches('input, textarea')) {
      try { active.blur(); } catch (e) {}
    }
  }

  function emitAuthoritativeGameAction(type) {
    var socket = window.__clueMeSocket;
    var view = lastGameView || readGameViewState();
    var code = window.__clueMeRoom;
    var playerId = window.__clueMePlayer;
    if (!socket || !view || !code || !playerId) return false;
    gameOverActionSeq += 1;
    socket.emit('game:action', {
      code: code,
      playerId: playerId,
      expectedGameId: view.gameId,
      expectedRevision: Number(view.stateVersion != null ? view.stateVersion : (view.revision != null ? view.revision : view.moveCount || 0)),
      actionId: ['overlay', type, Date.now().toString(36), gameOverActionSeq.toString(36)].join(':'),
      action: { type: type }
    });
    return true;
  }

  function findGameOverOverlay() {
    var dialogs = document.querySelectorAll('[role="dialog"]');
    for (var i = 0; i < dialogs.length; i++) {
      var dialog = dialogs[i];
      var txt = ((dialog.textContent || '') + '').trim();
      if (txt.indexOf(html.lang === 'en' ? 'New round' : 'جولة جديدة') !== -1 && txt.indexOf(html.lang === 'en' ? 'Home' : 'الرئيسية') !== -1) {
        return dialog.parentElement || dialog;
      }
    }
    return null;
  }

  function ensureGameOverOverlayControls(dialog) {
    if (!dialog) return;
    if (!dialog.querySelector('.cm-gameover-close')) {
      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'cm-gameover-close';
      close.textContent = '✕';
      close.setAttribute('aria-label', html.lang === 'en' ? 'Close' : 'إغلاق');
      close.addEventListener('click', function () {
        hiddenGameOverSig = currentGameOverSig() || 'manual-hidden';
        var host = findGameOverOverlay();
        if (host) host.style.display = 'none';
      });
      dialog.appendChild(close);
    }
    var actionRow =
      dialog.querySelector('.mt-6.flex.items-center.justify-center.gap-2\\.5') ||
      dialog.querySelector('.flex.items-center.justify-center[class*="gap-2.5"]') ||
      dialog.querySelector('.flex.items-center.justify-center');
    if (actionRow && !actionRow.querySelector('.cm-gameover-random')) {
      var randomBtn = document.createElement('button');
      randomBtn.type = 'button';
      randomBtn.className = 'cm-gameover-random';
      randomBtn.textContent = html.lang === 'en' ? 'Randomize teams' : 'رندمة الفرق';
      randomBtn.addEventListener('click', function () {
        emitAuthoritativeGameAction('newRoundRandomized');
      });
      actionRow.insertBefore(randomBtn, actionRow.lastElementChild);
    }
  }

  function syncGameOverOverlay() {
    var overlay = findGameOverOverlay();
    if (!overlay) {
      hiddenGameOverSig = null;
      return;
    }
    var sig = currentGameOverSig() || 'game-over-visible';
    overlay.style.display = hiddenGameOverSig === sig ? 'none' : '';
    var dialog = overlay.querySelector('[role="dialog"]');
    if (!dialog) return;
    ensureGameOverOverlayControls(dialog);
    if (!gameOverOverlayBound || dialog.getAttribute('data-cm-go-sig') !== sig) {
      dialog.setAttribute('data-cm-go-sig', sig);
      gameOverOverlayBound = true;
    }
  }

  function syncLiveClue() {
    var side = document.querySelector(".cm-side-clue");
    var existing = document.querySelector(".cm-clue-live");
    if (!side) {
      if (existing) existing.remove();
      return;
    }
    var data = liveClueData();
    if (!data) {
      if (existing) existing.remove();
      return;
    }
    var lang = html.lang === "en" ? "en" : "ar";
    var hasRealPanel = !!side.querySelector(".text-2xl");
    if (!existing) {
      existing = document.createElement("div");
      existing.className = "cm-clue-live";
      existing.setAttribute("aria-live", "polite");
    }
    if (hasRealPanel) {
      if (existing.parentElement) existing.remove();
      return;
    }
    if (!existing.parentElement) side.insertBefore(existing, side.firstChild);

    var liveSig = [lang, data.team || '', data.word || '', data.num || ''].join('\u0001');
    if (existing.getAttribute('data-cm-live-sig') !== liveSig) {
      existing.className = "cm-clue-live cm-clue-live-" + data.team;
      var label = lang === "ar" ? "التلميح الحالي" : "Current clue";
      existing.innerHTML =
        '<span class="cm-clue-live-label">' + label + "</span>" +
        '<div class="cm-clue-live-row">' +
          '<span class="cm-clue-live-word" dir="auto"></span>' +
          (data.num ? '<span class="cm-clue-live-num"></span>' : "") +
        "</div>";
      existing.querySelector(".cm-clue-live-word").textContent = data.word;
      var numEl = existing.querySelector(".cm-clue-live-num");
      if (numEl) numEl.textContent = data.num;
      existing.setAttribute('data-cm-live-sig', liveSig);
    }
    applyClueProgress(existing, data.team);
  }

  /* ------------------------------------------------- observer-driven sync */
  function query(sel) { return document.querySelector(sel); }

  var adaptiveViewportBound = false;
  var cluePanelDomRevision = 0;
  var lastAdaptiveLayoutKey = '';
  var adaptiveViewportSyncQueued = false;
  var adaptiveViewportSettleTimer = null;
  var adaptiveViewportWatchTimer = null;
  var viewportSensor = null;
  var viewportSensorObserver = null;
  var viewportSensorBox = null;
  var clueComposerFitQueued = false;
  var clueComposerFit = null;
  var clueViewportObserver = null;
  var observedClueViewportTargets = [];
  var clueViewportSyncQueued = false;

  function markManagedNoTranslate(el) {
    if (!el || !el.setAttribute) return;
    if (!el.hasAttribute('data-cm-translate-managed')) {
      el.setAttribute('data-cm-translate-managed', '1');
      el.setAttribute('data-cm-prev-translate', el.hasAttribute('translate') ? (el.getAttribute('translate') || '') : '__absent__');
    }
    el.setAttribute('translate', 'no');
    if (el.classList) el.classList.add('notranslate', 'cm-no-translate');
  }

  function unmarkManagedNoTranslate(el) {
    if (!el || !el.getAttribute || !el.hasAttribute('data-cm-translate-managed')) return;
    if (el.classList) el.classList.remove('notranslate', 'cm-no-translate');
    if (el.hasAttribute('data-cm-prev-translate')) {
      var prev = el.getAttribute('data-cm-prev-translate');
      if (prev === '__absent__') el.removeAttribute('translate');
      else el.setAttribute('translate', prev);
      el.removeAttribute('data-cm-prev-translate');
    } else {
      el.removeAttribute('translate');
    }
    el.removeAttribute('data-cm-translate-managed');
  }

  function syncGameplayNoTranslate() {
    var inRoomRoute = /^\/room\//.test(location.pathname) || /^\/game\//.test(location.pathname) || /^\/results\//.test(location.pathname);
    var activeRoots = [];
    var gamePage = query('.cm-game-page');
    if (gamePage) activeRoots.push(gamePage);
    if (inRoomRoute) {
      var main = document.querySelector('main');
      if (main) activeRoots.push(main);
      var dialogs = document.querySelectorAll('[role="dialog"]');
      for (var i = 0; i < dialogs.length; i++) activeRoots.push(dialogs[i]);
    }
    var managed = document.querySelectorAll('[data-cm-translate-managed="1"]');
    for (var j = 0; j < managed.length; j++) {
      var keep = activeRoots.indexOf(managed[j]) !== -1;
      if (!keep) unmarkManagedNoTranslate(managed[j]);
    }
    for (var k = 0; k < activeRoots.length; k++) markManagedNoTranslate(activeRoots[k]);
  }

  function viewportBox() {
    var vv = window.visualViewport;
    var root = document.documentElement;
    var widths = [
      vv && Number(vv.width),
      root && Number(root.clientWidth),
      Number(window.innerWidth),
      viewportSensorBox && Number(viewportSensorBox.width)
    ].filter(function (value) { return Number.isFinite(value) && value > 0; });
    var heights = [
      vv && Number(vv.height),
      root && Number(root.clientHeight),
      Number(window.innerHeight),
      viewportSensorBox && Number(viewportSensorBox.height)
    ].filter(function (value) { return Number.isFinite(value) && value > 0; });
    return {
      /* The smallest positive reading is the safe visible region when a host
         chrome/keyboard reports different layout and visual dimensions. */
      width: widths.length ? Math.round(Math.min.apply(Math, widths)) : 0,
      height: heights.length ? Math.round(Math.min.apply(Math, heights)) : 0
    };
  }

  function detectAdaptiveViewportMode(box) {
    var width = Number(box && box.width || 0);
    var height = Number(box && box.height || 0);
    var touchEnv = isMobileTouchEnv();
    var finePointer = false;
    try { finePointer = !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches); } catch (e) {}
    if (touchEnv) {
      var shortSide = Math.min(width, height);
      var longSide = Math.max(width, height);
      if (shortSide >= 700 && longSide >= 960) return 'tablet';
      if (width > height || height <= 540) return 'phone-landscape';
      return 'phone';
    }
    if (finePointer && width >= 1100) return 'desktop';
    if (width >= 768) return 'tablet';
    if (width > height || height <= 540) return 'phone-landscape';
    return 'phone';
  }

  function setAdaptiveViewportClasses(mode, box) {
    html.classList.remove('cm-ui-phone', 'cm-ui-phone-landscape', 'cm-ui-tablet', 'cm-ui-desktop', 'cm-ui-short', 'cm-ui-side-teams');
    if (mode === 'desktop') html.classList.add('cm-ui-desktop');
    else if (mode === 'tablet') html.classList.add('cm-ui-tablet');
    else if (mode === 'phone-landscape') html.classList.add('cm-ui-phone-landscape');
    else html.classList.add('cm-ui-phone');
    if (box && box.height && box.height < 640) html.classList.add('cm-ui-short');
    if (box && box.width >= 820 && box.width / Math.max(1, box.height) >= 1.08) html.classList.add('cm-ui-side-teams');
  }

  function measureRectHeight(el) {
    if (!el || !el.getBoundingClientRect) return 0;
    return Math.max(0, Math.round(el.getBoundingClientRect().height || 0));
  }

  function applyAdaptiveStageMetrics(box, mode) {
    if (!box) return;
    html.style.setProperty('--cm-vp-w', box.width + 'px');
    html.style.setProperty('--cm-vp-h', box.height + 'px');
    var header = query('.cm-game-page > header');
    var headerH = measureRectHeight(header) || 56;
    html.style.setProperty('--cm-header-h', headerH + 'px');
    var main = query('.cm-game-shell > main');
    if (!main) return;
    var mainRect = main.getBoundingClientRect();
    var mainStyles = getComputedStyle(main);
    var padTop = parseFloat(mainStyles.paddingTop || '0') || 0;
    var padBottom = parseFloat(mainStyles.paddingBottom || '0') || 0;
    var gap = parseFloat(mainStyles.rowGap || mainStyles.gap || '0') || 0;
    var teambar = query('.cm-teambar');
    var banner = main.querySelector(':scope > [aria-live="polite"]');
    var teambarH = measureRectHeight(teambar);
    var bannerH = measureRectHeight(banner);
    var mainHeight = Math.max(220, Math.round(mainRect.height || Math.max(0, box.height - headerH)));
    var reserveWithinMain = padTop + padBottom + bannerH + teambarH + gap * 4 + 8;

    /* Reserve a stable, fixed height for the bottom panel (clue composer, live clue,
       operative guess controls) based purely on viewport geometry so the board NEVER
       shrinks or grows when turns or roles switch. */
    var sideTarget =
      mode === 'desktop' ? clamp(mainHeight * 0.16, 128, 156) :
      mode === 'tablet' ? clamp(mainHeight * 0.16, 116, 146) :
      mode === 'phone-landscape' ? clamp(mainHeight * 0.2, 78, 100) :
      clamp(mainHeight * 0.16, 96, 128);
    var sideMin = mode === 'desktop' ? 116 : mode === 'tablet' ? 106 : mode === 'phone-landscape' ? 76 : 90;

    var usableHeight = Math.max(180, mainHeight - reserveWithinMain);
    var boardHeight = Math.max(120, usableHeight - sideTarget);
    var sideTeamsActive = html.classList.contains('cm-ui-side-teams');
    var wideViewport = sideTeamsActive;
    var rosterWidth = mode === 'desktop' || sideTeamsActive ? clamp(box.width * 0.13, 176, 244) : 0;
    var availableWidth =
      mode === 'desktop' || sideTeamsActive
        ? Math.max(360, (mainRect.width || box.width) - rosterWidth * 2 - gap * 2)
        : Math.max(220, Math.min(mainRect.width || box.width, box.width - 8));
    var stageMax =
      mode === 'desktop' ? Math.min(availableWidth, Math.max(720, box.width * 0.92)) :
      mode === 'tablet' ? Math.min(availableWidth, Math.max(500, box.width * 0.96)) :
      mode === 'phone-landscape' ? Math.min(availableWidth, Math.max(300, box.width * 0.95)) :
      availableWidth;
    var boardFitMaxWidth = Math.floor(Math.min(stageMax, availableWidth));
    var boardWidth = Math.min(stageMax, availableWidth, Math.max(180, Math.floor(boardHeight * (4 / 3))));
    var desiredMinBoard = mode === 'desktop' ? 620 : mode === 'tablet' ? 380 : mode === 'phone-landscape' ? 270 : 290;
    if (boardWidth < desiredMinBoard) {
      sideTarget = Math.max(sideMin, sideTarget - (desiredMinBoard - boardWidth) * 0.72);
      boardHeight = Math.max(120, usableHeight - sideTarget);
      boardWidth = Math.min(stageMax, availableWidth, Math.max(180, Math.floor(boardHeight * (4 / 3))));
    }
    boardWidth = Math.max(210, Math.floor(boardWidth));
    sideTarget = Math.max(sideMin, Math.floor(sideTarget));

    /* Preserve corrective fit for this exact viewport dimensions */
    var fitKey = clueComposerViewportKey(box, mode);
    if (clueComposerFit && clueComposerFit.key !== fitKey) {
      clueComposerFit = null;
    }
    if (clueComposerFit && clueComposerFit.boardWidth > 0) {
      boardWidth = clueComposerFit.lockWidth
        ? Math.min(boardFitMaxWidth, clueComposerFit.boardWidth)
        : Math.min(boardWidth, clueComposerFit.boardWidth);
    }

    var useHeightDrivenStage = mode === 'desktop' || sideTeamsActive;
    var stageWidth = useHeightDrivenStage ? boardWidth : Math.max(boardWidth, Math.floor(availableWidth));
    html.classList.toggle('cm-ui-height-fit', useHeightDrivenStage);
    html.classList.toggle('cm-ui-width-fit', !useHeightDrivenStage);
    html.style.setProperty('--cm-roster-width-fit', Math.round(rosterWidth) + 'px');
    html.style.setProperty('--cm-board-fit-width', boardWidth + 'px');
    html.style.setProperty('--cm-stage-fit-width', stageWidth + 'px');
    html.style.setProperty('--cm-board-fit-max-width', boardFitMaxWidth + 'px');
    html.style.setProperty('--cm-side-fit-height', sideTarget + 'px');
  }

  /* A Discord Activity can expose a shorter visual viewport than the browser
     window. Fit the stage from the rendered DOM only when lower clue controls
     would otherwise be off screen, then hold that fitted size until the user
     resizes the viewport. */
  function clueComposerViewportKey(box, mode) {
    return [
      Math.round(Number(box && box.width) || 0),
      Math.round(Number(box && box.height) || 0),
      mode || ''
    ].join('x');
  }

  function cluePanelLayoutSignature() {
    var clue = query('.cm-side-clue');
    if (!clue) return '';
    if (clue.querySelector('textarea[name="clue-input"], input[name="clue-input"]')) return 'composer';
    if (clue.querySelector('.cm-side-clue-guess-layout, .text-2xl')) return 'guess';
    if (clue.querySelector('.cm-clue-live')) return 'live';
    if (clue.querySelector('button')) return 'actions';
    return 'waiting';
  }

  function fitClueComposerIntoViewport() {
    var game = query('.cm-game-page');
    if (!game) {
      clueComposerFit = null;
      return false;
    }
    if (!html.classList.contains('cm-ui-height-fit')) return false;

    var board = query('.cm-play-center > .cm-board-frame.cm-game-width');
    var side = query('.cm-play-center > .cm-side');
    if (!board || !side) return false;

    var box = viewportBox();
    var mode = detectAdaptiveViewportMode(box);
    var fitKey = clueComposerViewportKey(box, mode);
    if (clueComposerFit && clueComposerFit.key !== fitKey) {
      clueComposerFit = null;
    }

    var boardRect = board.getBoundingClientRect();
    if (!box.height || !boardRect.width) return false;

    var content = side.querySelectorAll(
      '.cm-side-clue > *, .cm-side-clue button, .cm-side-clue input, .cm-side-clue textarea'
    );
    var contentBottom = 0;
    for (var i = 0; i < content.length; i++) {
      var rect = content[i].getBoundingClientRect();
      if (rect && rect.height > 0) contentBottom = Math.max(contentBottom, rect.bottom);
    }
    if (!contentBottom) return false;

    var safeBottom = Math.max(8, Math.min(16, Math.round(box.height * 0.02)));
    var overflow = Math.ceil(contentBottom - (box.height - safeBottom));

    if (overflow <= 1) {
      return false;
    }

    /* A 4:3 board loses 0.75px of height for every 1px of width removed. */
    var minBoardWidth = html.classList.contains('cm-ui-desktop') ? 400 : 260;
    var nextBoardWidth = Math.max(
      minBoardWidth,
      Math.floor(boardRect.width - (overflow + 8) * (4 / 3))
    );
    if (clueComposerFit && clueComposerFit.key === fitKey) {
      nextBoardWidth = Math.min(nextBoardWidth, clueComposerFit.boardWidth);
    }
    if (nextBoardWidth >= boardRect.width - 1) return false;

    clueComposerFit = {
      key: fitKey,
      boardWidth: nextBoardWidth,
      lockWidth: true
    };
    html.style.setProperty('--cm-board-fit-width', nextBoardWidth + 'px');
    html.style.setProperty('--cm-stage-fit-width', nextBoardWidth + 'px');
    return true;
  }

  function queueClueComposerViewportFit() {
    if (clueComposerFitQueued) return;
    clueComposerFitQueued = true;
    window.requestAnimationFrame(function () {
      var changed = fitClueComposerIntoViewport();
      if (!changed) {
        clueComposerFitQueued = false;
        return;
      }
      window.requestAnimationFrame(function () {
        fitClueComposerIntoViewport();
        clueComposerFitQueued = false;
      });
    });
  }

  function queueClueViewportSync() {
    if (clueViewportSyncQueued) return;
    clueViewportSyncQueued = true;
    window.requestAnimationFrame(function () {
      clueViewportSyncQueued = false;
      if (!query('.cm-game-page')) return;
      scheduleAdaptiveViewportSync(false);
    });
  }

  function syncClueViewportObserver() {
    /* Clue observer no longer resizes the board dynamically on every turn/mutation */
    if (clueViewportObserver) {
      clueViewportObserver.disconnect();
      clueViewportObserver = null;
      observedClueViewportTargets = [];
    }
  }

  function currentSeatLayoutSignature() {
    var seat = document.querySelector('.cm-game-page > header .cm-seat-btn, .cm-seat-btn');
    if (!seat) return '';
    var dot = seat.querySelector('.cm-seat-dot');
    return [
      (seat.textContent || '').replace(/\s+/g, ' ').trim(),
      seat.title || '',
      seat.getAttribute('aria-label') || '',
      dot ? String(dot.className || '') : ''
    ].join('\u0001');
  }

  function adaptiveLayoutKey(box, mode) {
    var game = query('.cm-game-page');
    return [
      game ? 'game' : 'other',
      Math.round(Number(box && box.width) || 0),
      Math.round(Number(box && box.height) || 0),
      mode || ''
    ].join('|');
  }

  function syncAdaptiveViewportMode(force) {
    var box = viewportBox();
    var mode = detectAdaptiveViewportMode(box);
    var key = adaptiveLayoutKey(box, mode);
    if (!force && key === lastAdaptiveLayoutKey) return false;

    setAdaptiveViewportClasses(mode, box);
    if (query('.cm-game-page')) applyAdaptiveStageMetrics(box, mode);
    lastAdaptiveLayoutKey = key;
    return true;
  }

  function scheduleAdaptiveViewportSync(withSettle) {
    if (!adaptiveViewportSyncQueued) {
      adaptiveViewportSyncQueued = true;
      window.requestAnimationFrame(function () {
        adaptiveViewportSyncQueued = false;
        try {
          syncAdaptiveViewportMode();
          queueClueComposerViewportFit();
        } catch (e) {}
      });
    }
    if (!withSettle) return;

    /* Discord/embedded webviews can update their final drawable bounds a beat
       after the first resize signal. One delayed, key-cached recheck handles
       that case without polling or responding to ordinary clicks/typing. */
    if (adaptiveViewportSettleTimer) window.clearTimeout(adaptiveViewportSettleTimer);
    adaptiveViewportSettleTimer = window.setTimeout(function () {
      adaptiveViewportSettleTimer = null;
      try {
        syncAdaptiveViewportMode();
        queueClueComposerViewportFit();
      } catch (e) {}
    }, 180);
  }

  function ensureViewportSensor() {
    if (!document.body || typeof window.ResizeObserver !== 'function') return;
    if (!viewportSensor) {
      viewportSensor = document.createElement('div');
      viewportSensor.setAttribute('aria-hidden', 'true');
      viewportSensor.setAttribute('data-cm-viewport-sensor', '1');
      viewportSensor.style.cssText =
        'position:fixed;inset:0;width:100vw;height:100dvh;visibility:hidden;' +
        'pointer-events:none;contain:strict;z-index:-1;';
      document.body.appendChild(viewportSensor);
    }
    if (viewportSensorObserver) return;
    viewportSensorObserver = new window.ResizeObserver(function (entries) {
      var entry = entries && entries[0];
      var rect = entry && entry.contentRect;
      if (!rect || !rect.width || !rect.height) return;
      var next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      if (viewportSensorBox &&
          viewportSensorBox.width === next.width &&
          viewportSensorBox.height === next.height) return;
      viewportSensorBox = next;
      scheduleAdaptiveViewportSync(true);
    });
    viewportSensorObserver.observe(viewportSensor);
  }

  function syncAdaptiveViewportWatch() {
    var game = query('.cm-game-page');
    if (!game) {
      if (adaptiveViewportWatchTimer) window.clearInterval(adaptiveViewportWatchTimer);
      adaptiveViewportWatchTimer = null;
      return;
    }
    if (adaptiveViewportWatchTimer) return;

    /* Some Discord Activity hosts update their iframe bounds or role content
       without forwarding a DOM/window resize event. This cheap key check runs
       only while a game is visible; it reads no element geometry unless an
       actual viewport/role/panel change is detected. */
    adaptiveViewportWatchTimer = window.setInterval(function () {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      var box = viewportBox();
      var mode = detectAdaptiveViewportMode(box);
      if (adaptiveLayoutKey(box, mode) !== lastAdaptiveLayoutKey) {
        scheduleAdaptiveViewportSync(true);
      }
    }, 350);
  }

  function bindAdaptiveViewportMode() {
    if (adaptiveViewportBound) return;
    adaptiveViewportBound = true;
    ensureViewportSensor();
    function run() {
      scheduleAdaptiveViewportSync(true);
    }
    window.addEventListener('resize', run, { passive: true });
    window.addEventListener('orientationchange', run, { passive: true });
    if (window.visualViewport) {
      try { window.visualViewport.addEventListener('resize', run, { passive: true }); } catch (e) {}
      try { window.visualViewport.addEventListener('scroll', function () { scheduleAdaptiveViewportSync(false); }, { passive: true }); } catch (e) {}
    }
  }

  function isMobileTextEntryActive() {
    if (!isMobileTouchEnv()) return false;
    var active = document.activeElement;
    if (!isTextEditable(active)) return false;
    return !!(active && active.closest && (active.closest('.cm-game-page') || active.closest('[role="dialog"]')));
  }

  function sync() {
    syncAdaptiveViewportMode();
    syncGameplayNoTranslate();
    var preGuessView = lastGameView;
    var game = query(".cm-game-page");
    var dock = linkedDock();
    var inRoomContext = /^\/room\//.test(location.pathname) || /^\/game\//.test(location.pathname) || !!game;
    var canFloatLog = !!inRoomContext;

    fab.hidden = !canFloatLog || open;
    syncRoomErrorDiagnosis();
    syncAdminPanel();
    syncDiscordHomeButton();
    syncSettingsPanel();
    syncMobileHomeHeader();
    syncAdaptiveViewportWatch();
    if (isMobileTextEntryActive()) {
      lastGameView = readGameViewState() || lastGameView;
      return;
    }
    if (!canFloatLog) {
      html.classList.remove("cm-log-open");
      badge.textContent = "";
      lastCount = -1;
      lastPulsedCount = -1;
      if (pulseTimer) window.clearTimeout(pulseTimer);
      pulseTimer = null;
      fab.classList.remove("cm-fab-pulse");
      lastGameView = null;
      clearLinkedTail();
      trail.hide && trail.hide();
      if (location.pathname !== '/admin') closeProfile();
      syncLobbyReturn();
      return;
    }
    syncLobbyReturn();

    html.classList.toggle("cm-log-open", open);
    attachFabDrag();
    if (dock) attachDockDrag(dock);

    var title = (dock && dock.getAttribute("aria-label")) || logLabel();
    fab.setAttribute("aria-label", title);
    fab.title = title;
    fab.setAttribute("aria-expanded", open ? "true" : "false");

    var countEl = dock ? dock.querySelector(".cm-dock-count") : null;
    var count = -1;
    if (countEl) {
      var n = parseInt((countEl.textContent || "").replace(/[^\d]/g, ""), 10);
      if (Number.isFinite(n)) count = n;
    }

    /* A React re-render can briefly remove the dock count. Keep the last known
       value through that transient instead of treating it as a new event when
       it comes back. Also keep the FAB quiet while the clue notice owns the
       screen; its unread badge remains visible without competing animation. */
    var clueNoticeActive = !!document.querySelector('.cm-clue-announce');
    if (clueNoticeActive) {
      if (pulseTimer) window.clearTimeout(pulseTimer);
      pulseTimer = null;
      fab.classList.remove("cm-fab-pulse");
    }
    if (count >= 0) {
      var shown = count > 99 ? "99+" : String(count);
      if (badge.textContent !== shown) badge.textContent = shown;
      if (lastCount >= 0 && count < lastCount) lastPulsedCount = -1;
      if (
        lastCount >= 0 &&
        count > lastCount &&
        count !== lastPulsedCount &&
        !open &&
        !clueNoticeActive
      ) {
        fab.classList.remove("cm-fab-pulse");
        void fab.offsetWidth; /* restart one genuine new-event pulse */
        fab.classList.add("cm-fab-pulse");
        lastPulsedCount = count;
        if (pulseTimer) window.clearTimeout(pulseTimer);
        pulseTimer = window.setTimeout(function () {
          fab.classList.remove("cm-fab-pulse");
          pulseTimer = null;
        }, 1600);
      }
      lastCount = count;
    }

    /* Remaining words → team card pills (rendered by CSS ::after). */
    var teambar = query(".cm-teambar");
    var label = teambar ? teambar.getAttribute("aria-label") : null;
    var redLeft = query(".cm-teambar-red .cm-teambar-count");
    var blueLeft = query(".cm-teambar-blue .cm-teambar-count");
    var heads = document.querySelectorAll(
      ".cm-board-row > .cm-roster-col .cm-roster-head"
    );
    if (heads.length >= 2) {
      applyPill(heads[0], label, redLeft && redLeft.textContent);
      applyPill(heads[1], label, blueLeft && blueLeft.textContent);
    }

    lastGameView = readGameViewState() || lastGameView;
    syncLiveClue();
    syncClueComposerLayout();
    syncMobileOperativeClueLayout();
    syncClueViewportObserver();
    queueClueComposerViewportFit();
    syncCaptainPointTags();
    syncCaptainOwnCards();
    syncGuessSoundboard(preGuessView);
    maybeRestoreModalInputFocus();
    syncGameOverOverlay();
  }

  /* Lobby: when a game is running, the app renders a plain-text hint
     ("الرجوع للعبة") instead of a button — inject a real, prominent
     return-to-game button inside that status card. */
  function syncLobbyReturn() {
    if (!/^\/room\/[A-Za-z0-9]+$/.test(location.pathname)) return;
    var m = location.pathname.match(/^\/room\/([A-Za-z0-9]+)/);
    var code = m ? m[1].toUpperCase() : null;
    if (!code) return;
    var playingTexts = html.lang === "en" ? ["Game in progress"] : ["\u0627\u0644\u0644\u0639\u0628\u0629 \u0634\u063A\u0627\u0644\u0629"];
    var ps = document.querySelectorAll("main p, .cm-lobby-spectators ~ * p, body p");
    var card = null;
    for (var i = 0; i < ps.length; i++) {
      var txt = (ps[i].textContent || "").trim();
      if (playingTexts.indexOf(txt) !== -1) {
        card = ps[i].parentElement;
        break;
      }
    }
    /* ---- lobby card ordering (the container is already a flex column):
       share/seats/teams/management stay, then CHAT, then EVENT LOG, then
       the game-running status card (with the return button), then footer.
       Runs in waiting rooms too. */
    var ar = html.lang !== "en";
    var chatTitleTexts = ar ? ["شات الغرفة"] : ["Chat"];
    var chatCard = null;
    var heads = document.querySelectorAll("main p, main h2, main h3");
    for (var h = 0; h < heads.length; h++) {
      if (chatTitleTexts.indexOf((heads[h].textContent || "").trim()) !== -1) {
        chatCard = heads[h].closest(".rounded-2xl");
        break;
      }
    }
    var historyCard = document.querySelector(".cm-ev-list");
    historyCard = historyCard ? historyCard.closest(".rounded-2xl") : null;
    var footer = null;
    var mdivs = document.querySelectorAll("main > div");
    for (var f = 0; f < mdivs.length; f++) {
      if (/\u0631\u062C\u0648\u0639 \u0644\u0644\u0648\u0628\u064A|\u0627\u0644\u062E\u0631\u0648\u062C \u0645\u0646 \u0627\u0644\u063A\u0631\u0641\u0629|Back to lobby|Leave room/i.test(mdivs[f].textContent || "")) {
        footer = mdivs[f];
        break;
      }
    }
    if (chatCard) chatCard.style.order = "6";
    if (historyCard) historyCard.style.order = "7";
    if (footer) footer.style.order = "9";
    if (card) card.style.order = "8";

    if (!card) return;
    if (card.querySelector(".cm-lobby-return-btn")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cm-lobby-return-btn";
    btn.textContent = html.lang === "en" ? "Back to the game" : "\u0627\u0644\u0631\u062C\u0648\u0639 \u0644\u0644\u0639\u0628\u0629";
    btn.addEventListener("click", function () {
      location.assign("/room/" + code + "/game");
    });
    card.appendChild(btn);
  }

  function applyPill(head, label, value) {
    if (!head) return;
    var text = value ? value.trim() : "";
    if (head.getAttribute("data-remaining") !== text) {
      head.setAttribute("data-remaining", text);
    }
  }

  function mutationTouchesClueLayout(records) {
    for (var r = 0; r < records.length; r++) {
      var record = records[r];
      /* Text/value churn while somebody types must never invalidate the stage
         fit. Structural panel changes and the lightweight observers already
         cover real layout changes. */
      if (record.type === 'characterData') continue;
      var nodes = [record.target];
      if (record.addedNodes) {
        for (var a = 0; a < record.addedNodes.length; a++) nodes.push(record.addedNodes[a]);
      }
      for (var n = 0; n < nodes.length; n++) {
        var node = nodes[n];
        var el = node && (node.nodeType === 1 ? node : node.parentElement);
        if (!el || !el.closest) continue;
        if (el.closest('input[name="clue-input"], textarea[name="clue-input"], [contenteditable="true"]')) continue;
        if (el.closest('.cm-side-clue') || el.closest('.cm-game-page > header .cm-seat-btn, .cm-seat-btn')) {
          return true;
        }
      }
    }
    return false;
  }

  var queued = false;
  var observer = new MutationObserver(function (records) {
    if (records && mutationTouchesClueLayout(records)) cluePanelDomRevision += 1;
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(function () {
      queued = false;
      sync();
    });
  });

  function start() {
    bindSoundUnlock();
    watchAudioSettings();
    bindAdaptiveViewportMode();
    syncAdaptiveViewportMode();
    sync();
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
