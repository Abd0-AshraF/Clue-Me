/* ============================================================================
   Clue Me — Game AI Pack Generator, Android App & Discord Integration v21.5
   ----------------------------------------------------------------------------
   1. AI Custom Pack Generator (Lobby & Room Word Generator - 50 Words)
   2. Official Android App Integration (APK Download, Deep Links clueme://room/)
   3. Discord Voice Bridge (/api/rooms/activity compatibility)
   ============================================================================ */

(function () {
  'use strict';

  var isArabic = document.documentElement.lang !== 'en';

  var SITE_LOGO_SVG =
    '<img src="/icon-192.png" alt="Clue Me" class="cm-app-icon-img" style="width:24px; height:24px; border-radius:6px; object-fit:contain; display:inline-block; vertical-align:middle;" />';

  var SITE_LOGO_LARGE_SVG =
    '<img src="/icon-192.png" alt="Clue Me" class="cm-app-icon-large" style="width:56px; height:56px; border-radius:14px; object-fit:contain; display:block; margin:0 auto 0.75rem; box-shadow:0 4px 12px rgba(0,0,0,0.08);" />';

  var SITE_LOGO_BANNER_SVG =
    '<img src="/icon-192.png" alt="Clue Me" class="cm-app-icon-banner" style="width:40px; height:40px; border-radius:10px; object-fit:contain; display:block;" />';

  var APP_ICON_HTML = SITE_LOGO_SVG;

  function getRoomCodeFromUrl() {
    var match = location.pathname.match(/\/(?:room|game)\/([A-Za-z0-9]{4})/i);
    return match ? match[1].toUpperCase() : null;
  }

  function isAnyModalOpen() {
    return Boolean(
      document.querySelector(
        '[role="dialog"], [aria-modal="true"], #cm-app-dialog-backdrop, .cm-ai-modal-backdrop, .fixed.inset-0.z-50, .fixed.inset-0'
      )
    );
  }

  /* --------------------------------------------------------------------------
     Live In-Game Toasts System (Clean & Minimal)
     -------------------------------------------------------------------------- */
  function getOrCreateToastContainer() {
    var cont = document.getElementById('cm-toast-container');
    if (!cont && document.body) {
      cont = document.createElement('div');
      cont.id = 'cm-toast-container';
      cont.className = 'cm-toast-container';
      document.body.appendChild(cont);
    }
    return cont;
  }

  function showGameToast(message, icon) {
    try {
      var cont = getOrCreateToastContainer();
      if (!cont) return;

      var toast = document.createElement('div');
      toast.className = 'cm-game-toast';
      toast.innerHTML =
        '<span style="font-size:1.1rem; flex-shrink:0;">' + (icon || '🔔') + '</span>' +
        '<span>' + message + '</span>';

      cont.appendChild(toast);

      setTimeout(function () {
        toast.classList.add('fade-out');
        setTimeout(function () { toast.remove(); }, 220);
      }, 3500);
    } catch (e) {}
  }

  /* --------------------------------------------------------------------------
     AI Custom Pack Generator (Lobby & Room Word Generator)
     -------------------------------------------------------------------------- */
  window.__CLUEME_OPEN_AI_PACK_GENERATOR__ = function (options) {
    openPackGeneratorModal(options);
  };

  function openPackGeneratorModal(options) {
    options = options || {};
    var currentLang = options.language || (document.documentElement.lang === 'en' ? 'en' : 'ar');
    var isAr = currentLang !== 'en';

    var existing = document.getElementById('cm-ai-pack-dialog');
    if (existing) existing.remove();

    var backdrop = document.createElement('div');
    backdrop.id = 'cm-ai-pack-dialog';
    backdrop.className = 'cm-ai-modal-backdrop';
    backdrop.innerHTML =
      '<div class="cm-ai-modal-card cm-ai-pack-generator-card" style="max-width:540px;">' +
        '<div class="cm-ai-modal-header">' +
          '<div class="cm-ai-modal-title">' +
            '<span style="font-size:1.3rem;">✨</span>' +
            '<span>' + (isAr ? 'صانع حزم الكلمات بالذكاء الاصطناعي' : 'AI Custom Word Pack Generator') + '</span>' +
          '</div>' +
          '<button type="button" class="cm-app-dialog-close" id="cm-pack-modal-close" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="cm-ai-modal-body">' +
          '<div class="cm-ai-field">' +
            '<label class="cm-ai-label" for="cm-pack-title-input">' + (isAr ? 'عنوان الحزمة' : 'Pack Title') + '</label>' +
            '<input type="text" id="cm-pack-title-input" class="cm-ai-input" placeholder="' + (isAr ? 'مثال: أكلات شعبية، تقنية وبرمجة، أفلام ومسلسلات...' : 'e.g. Arab Cuisine, Cinema & Movies, Ancient History...') + '" />' +
          '</div>' +
          '<div class="cm-ai-field">' +
            '<label class="cm-ai-label" for="cm-pack-prompt-input">' + (isAr ? 'وصف الحزمة أو نوعية الكلمات المطلوبة (اختياري)' : 'Description or word focus (Optional)') + '</label>' +
            '<textarea id="cm-pack-prompt-input" class="cm-ai-textarea" rows="2" placeholder="' + (isAr ? 'اكتب تفاصيل إضافية مثل: ركز على أسماء الأطباق المصرية والشامية...' : 'e.g. Focus on modern tech terms, programming languages...') + '"></textarea>' +
          '</div>' +
          '<div class="cm-ai-suggestions-row">' +
            '<span class="cm-ai-suggestions-label">' + (isAr ? 'أفكار مقترحة سريعة:' : 'Quick Ideas:') + '</span>' +
            (isAr
              ? ['أكلات عربية', 'أفلام ومسلسلات', 'رياضة وكرة قدم', 'تاريخ وحضارات', 'أنمي وكرتون', 'ألعاب فيديو'].map(function(s) {
                  return '<button type="button" class="cm-ai-suggestion-chip" data-val="' + s + '">' + s + '</button>';
                }).join('')
              : ['Middle Eastern Food', 'Cinema & Series', 'Sports & Football', 'World History', 'Gaming & Tech', 'Pop Culture'].map(function(s) {
                  return '<button type="button" class="cm-ai-suggestion-chip" data-val="' + s + '">' + s + '</button>';
                }).join('')
            ) +
          '</div>' +
          '<div id="cm-pack-error-box" class="cm-ai-error-box" style="display:none;"></div>' +
          '<div class="cm-ai-pack-footer-bar">' +
            '<span class="cm-ai-count-hint">' + (isAr ? 'عدد الكلمات:' : 'Word Count:') + ' <strong class="cm-ai-count-highlight">50 ' + (isAr ? 'كلمة' : 'words') + '</strong></span>' +
            '<button type="button" id="cm-run-generate-pack-btn" class="cm-ai-gen-action-btn">' +
              '<span>✨</span><span>' + (isAr ? 'توليد الحزمة بالذكاء الاصطناعي' : 'Generate Words Pack') + '</span>' +
            '</button>' +
          '</div>' +
          '<div id="cm-pack-preview-area" class="cm-ai-preview-area" style="display:none;">' +
            '<div class="cm-ai-preview-header">' +
              '<strong id="cm-generated-count-label" class="cm-ai-preview-title"></strong>' +
              '<button type="button" id="cm-apply-pack-btn" class="cm-ai-apply-pack-btn">' +
                '<span>✓</span><span>' + (isAr ? 'تطبيق الحزمة على الغرفة' : 'Apply Pack to Room') + '</span>' +
              '</button>' +
            '</div>' +
            '<div id="cm-pack-chips" class="cm-ai-pack-chips-grid"></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(backdrop);

    var closeBtn = backdrop.querySelector('#cm-pack-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { backdrop.remove(); });
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) backdrop.remove(); });

    var genBtn = backdrop.querySelector('#cm-run-generate-pack-btn');
    var titleInput = backdrop.querySelector('#cm-pack-title-input');
    var promptInput = backdrop.querySelector('#cm-pack-prompt-input');
    var previewArea = backdrop.querySelector('#cm-pack-preview-area');
    var chipsCont = backdrop.querySelector('#cm-pack-chips');
    var countLabel = backdrop.querySelector('#cm-generated-count-label');
    var applyPackBtn = backdrop.querySelector('#cm-apply-pack-btn');
    var errorBox = backdrop.querySelector('#cm-pack-error-box');

    backdrop.querySelectorAll('.cm-ai-suggestion-chip').forEach(function(chip) {
      chip.addEventListener('click', function() {
        var val = chip.getAttribute('data-val');
        if (val) {
          titleInput.value = val;
          titleInput.focus();
        }
      });
    });

    var generatedWords = [];
    var generatedTitle = '';
    var generatedPackId = '';

    genBtn.addEventListener('click', function () {
      var title = (titleInput.value || '').trim();
      if (!title) {
        errorBox.style.display = 'block';
        errorBox.textContent = isAr ? 'برجاء كتابة عنوان الحزمة أولاً' : 'Please enter a pack title';
        titleInput.focus();
        return;
      }

      errorBox.style.display = 'none';
      genBtn.disabled = true;
      genBtn.style.opacity = '0.7';
      genBtn.innerHTML = '<span class="cm-spinner-inline">⏳</span><span>' + (isAr ? 'جاري التوليد بالذكاء الاصطناعي…' : 'Generating with AI…') + '</span>';

      fetch('/api/ai/generate-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title,
          prompt: promptInput.value || '',
          language: isAr ? 'ar' : 'en',
          count: 50
        })
      })
        .then(function (res) { return res.json(); })
        .then(function (result) {
          genBtn.disabled = false;
          genBtn.style.opacity = '1';
          genBtn.innerHTML = '<span>✨</span><span>' + (isAr ? 'إعادة التوليد 🔄' : 'Regenerate 🔄') + '</span>';

          if (!result.ok || !result.pack || !result.pack.words || result.pack.words.length === 0) {
            throw new Error((result.error && result.error.message) || (isAr ? 'فشل توليد الحزمة' : 'Failed to generate pack'));
          }

          generatedWords = result.pack.words;
          generatedTitle = result.pack.title || title;
          generatedPackId = result.pack.id || ('custom-ai-' + Date.now());

          // Register locally in global pack registry for immediate instant React selection
          if (window.__CLUE_ME_PACKS__) {
            var existingIdx = window.__CLUE_ME_PACKS__.findIndex(function (p) { return p.id === generatedPackId; });
            var packObj = {
              id: generatedPackId,
              language: isAr ? 'ar' : 'en',
              nameKey: generatedTitle,
              customTitle: generatedTitle,
              categories: [generatedPackId]
            };
            if (existingIdx !== -1) {
              window.__CLUE_ME_PACKS__[existingIdx] = packObj;
            } else {
              window.__CLUE_ME_PACKS__.push(packObj);
            }
          }

          previewArea.style.display = 'block';
          countLabel.textContent = (isAr ? 'تم توليد ' : 'Generated ') + generatedWords.length + (isAr ? ' كلمة بنجاح:' : ' words successfully:');
          chipsCont.innerHTML = generatedWords.map(function (w) {
            return '<span class="cm-ai-word-chip">' + w + '</span>';
          }).join('');

          showGameToast(
            (isAr ? 'تم إنشاء الحزمة بنجاح: ' : 'Pack generated successfully: ') + generatedTitle,
            '✨'
          );
        })
        .catch(function (err) {
          genBtn.disabled = false;
          genBtn.style.opacity = '1';
          genBtn.innerHTML = '<span>✨</span><span>' + (isAr ? 'توليد الحزمة' : 'Generate Words Pack') + '</span>';
          errorBox.style.display = 'block';
          errorBox.textContent = err.message || (isAr ? 'حدث خطأ أثناء التوليد' : 'Failed to generate words pack');
        });
    });

    applyPackBtn.addEventListener('click', function () {
      if (!generatedPackId) return;

      applyPackBtn.disabled = true;
      applyPackBtn.innerHTML = '<span>⏳</span><span>' + (isAr ? 'جاري التطبيق…' : 'Applying…') + '</span>';

      if (typeof options.onPackApplied === 'function') {
        try {
          options.onPackApplied(generatedPackId);
        } catch (e) {
          console.error(e);
        }
      }

      showGameToast(
        (isAr ? 'تم تفعيل الحزمة بنجاح: ' : 'Pack activated: ') + generatedTitle,
        '🎉'
      );

      setTimeout(function () {
        backdrop.remove();
      }, 350);
    });
  }

  /* --------------------------------------------------------------------------
     Official Android App Integration & Modal
     -------------------------------------------------------------------------- */
  function openAppDialog() {
    var existing = document.getElementById('cm-app-dialog-backdrop');
    if (existing) existing.remove();

    var roomCode = getRoomCodeFromUrl();
    var deepLinkUrl = roomCode ? ('clueme://room/' + roomCode) : 'clueme://home';

    var backdrop = document.createElement('div');
    backdrop.id = 'cm-app-dialog-backdrop';
    backdrop.className = 'cm-app-dialog-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    backdrop.innerHTML =
      '<div class="cm-app-dialog-card">' +
        '<div class="cm-app-dialog-header">' +
          '<div class="cm-app-dialog-title">' +
            APP_ICON_HTML +
            '<span>' + (isArabic ? 'تطبيق Clue Me الرسمي لأندرويد' : 'Clue Me Android App') + '</span>' +
          '</div>' +
          '<button type="button" class="cm-app-dialog-close" id="cm-app-dialog-close-btn" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="cm-app-dialog-body">' +
          '<div style="text-align:center; padding:0.25rem 0;">' +
            SITE_LOGO_LARGE_SVG +
            '<h3 style="margin:0 0 0.25rem; font-weight:800; font-size:1.1rem; color:var(--cm-ink, #000);">' +
              (isArabic ? 'العب بسلاسة من التطبيق' : 'Play Smoothly from Android') +
            '</h3>' +
            '<p style="margin:0; font-size:0.85rem; color:var(--cm-ink-soft, #111827); line-height:1.45;">' +
              (isArabic ? 'أداء سريع، وصول فوري للغرف، وتوافق كامل مع شاشات الهواتف.' : 'Native performance, instant room access, and optimized mobile interface.') +
            '</p>' +
          '</div>' +
          '<div class="cm-app-dialog-info-card">' +
            (roomCode ?
              '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                '<span style="color:var(--cm-ink-soft, #111827); font-weight:600;">' + (isArabic ? 'كود الغرفة الحالي:' : 'Current Room Code:') + '</span>' +
                '<span style="font-weight:800; color:var(--cm-red, #b83a3a); letter-spacing:0.15em; font-family:monospace; font-size:1rem;">' + roomCode + '</span>' +
              '</div>' : '') +
            '<div style="display:flex; justify-content:space-between; align-items:center;">' +
              '<span style="color:var(--cm-ink-soft, #111827); font-weight:600;">' + (isArabic ? 'حالة التنزيل:' : 'Status:') + '</span>' +
              '<span class="cm-android-badge-chip">' + (isArabic ? 'جاهز للتحميل مجاناً' : 'Ready to install') + '</span>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex; flex-direction:column; gap:0.6rem; margin-top:0.25rem;">' +
            (roomCode ?
              '<a href="' + deepLinkUrl + '" class="cm-btn-native-deep-link" style="padding:0.7rem 1rem; font-size:0.9rem;">' +
                '<span>🚀</span><span>' + (isArabic ? 'فتح الغرفة ' + roomCode + ' في التطبيق' : 'Open Room in Android App') + '</span>' +
              '</a>' : '') +
            '<a href="/clue-me-latest.apk" download="clue-me-latest.apk" class="cm-btn-native-apk-dl" style="padding:0.7rem 1rem; font-size:0.9rem; justify-content:center;">' +
              '<span>⬇️</span><span>' + (isArabic ? 'تحميل ملف APK المباشر' : 'Download Official APK') + '</span>' +
            '</a>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(backdrop);

    var closeBtn = backdrop.querySelector('#cm-app-dialog-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', function () { backdrop.remove(); });
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) backdrop.remove(); });
  }

  function syncHomePageAndroidButtons() {
    var isHome = location.pathname === '/' || location.pathname === '';
    var existingDock = document.getElementById('cm-home-android-dock');

    if (!isHome) {
      if (existingDock) existingDock.remove();
      return;
    }

    if (!document.body) return;

    if (isAnyModalOpen()) {
      if (existingDock) {
        existingDock.style.display = 'none';
        existingDock.setAttribute('aria-hidden', 'true');
      }
      return;
    }

    if (existingDock) {
      existingDock.style.display = 'flex';
      existingDock.removeAttribute('aria-hidden');
      return;
    }

    var dock = document.createElement('div');
    dock.id = 'cm-home-android-dock';
    dock.className = 'cm-home-android-dock';
    dock.innerHTML =
      '<button type="button" id="cm-home-android-btn" class="cm-home-android-dock-btn cm-home-android-choice" title="' + (isArabic ? 'تحميل تطبيق Clue Me لأندرويد' : 'Download Clue Me Android APK') + '">' +
        APP_ICON_HTML +
        '<span>' + (isArabic ? 'تطبيق أندرويد (APK)' : 'Android App (APK)') + '</span>' +
        '<span class="cm-android-badge-chip">' + (isArabic ? 'تحميل سريع' : 'Get APK') + '</span>' +
      '</button>';

    var btn = dock.querySelector('#cm-home-android-btn');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openAppDialog();
      });
    }

    document.body.appendChild(dock);
  }

  function syncHeaderAndroidButton() {
    var existingHeaderBtn = document.getElementById('cm-android-header-btn');
    if (existingHeaderBtn) {
      existingHeaderBtn.remove();
    }
  }

  function syncRoomUrlAndroidBanner() {
    var roomCode = getRoomCodeFromUrl();
    var existingBanner = document.getElementById('cm-room-android-cta');

    if (!roomCode) {
      if (existingBanner) existingBanner.remove();
      return;
    }

    var isPlaying = location.pathname.indexOf('/game') !== -1 || document.querySelector('.cm-board, [data-board], .cm-board-row');
    var isDismissed = false;
    try {
      isDismissed = sessionStorage.getItem('cm_dismiss_room_banner_' + roomCode) === '1';
    } catch (e) {}

    if (isPlaying || isDismissed) {
      if (existingBanner) existingBanner.remove();
      return;
    }

    if (!document.body) return;

    if (!existingBanner) {
      var banner = document.createElement('div');
      banner.id = 'cm-room-android-cta';
      banner.className = 'cm-room-android-banner cm-room-link-android-banner';
      banner.innerHTML =
        '<div class="cm-room-android-banner-inner">' +
          '<div class="cm-room-android-top-row">' +
            '<div class="cm-room-android-icon-box" style="padding:0; background:transparent; border:none;">' +
              SITE_LOGO_BANNER_SVG +
            '</div>' +
            '<div class="cm-room-android-text">' +
              '<span class="cm-room-android-headline">' +
                (isArabic ? 'داخل على الغرفة ' + roomCode + ' من المتصفح؟' : 'Joining room ' + roomCode + ' via browser?') +
              '</span>' +
              '<span class="cm-room-android-subline">' +
                (isArabic ? 'يمكنك فتحها مباشرة في التطبيق أو تحميل ملف الـ APK' : 'Open in native Android app or download the APK') +
              '</span>' +
            '</div>' +
            '<button type="button" class="cm-room-android-dismiss" id="cm-room-banner-close-btn" aria-label="Dismiss">✕</button>' +
          '</div>' +
          '<div class="cm-room-android-actions">' +
            '<a href="clueme://room/' + roomCode + '" class="cm-btn-native-deep-link" id="cm-room-open-app-btn">' +
              '<span>📱</span><span>' + (isArabic ? 'افتح في التطبيق' : 'Open in App') + '</span>' +
            '</a>' +
            '<a href="/clue-me-latest.apk" download="clue-me-latest.apk" class="cm-btn-native-apk-dl">' +
              '<span>⬇️</span><span>' + (isArabic ? 'تحميل APK' : 'Download APK') + '</span>' +
            '</a>' +
          '</div>' +
        '</div>';

      var closeBtn = banner.querySelector('#cm-room-banner-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', function () {
          try {
            sessionStorage.setItem('cm_dismiss_room_banner_' + roomCode, '1');
          } catch (e) {}
          banner.remove();
        });
      }

      document.body.appendChild(banner);
    }
  }

  /* --------------------------------------------------------------------------
     Housekeeping & Safe Cleanup (Remove any spymaster/operative/stats/hud nodes)
     -------------------------------------------------------------------------- */
  function purgeUnsolicitedClutter() {
    var idsToPurge = [
      'cm-ai-spymaster-btn',
      'cm-assassin-radar-box',
      'cm-ai-guess-advisor-btn',
      'cm-ai-guess-dialog',
      'cm-ai-recap-btn',
      'cm-ai-recap-dialog',
      'cm-floating-activity-hud'
    ];

    idsToPurge.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  /* --------------------------------------------------------------------------
     Master Orchestration Loop (Safely Throttled & Guarded)
     -------------------------------------------------------------------------- */
  var isSyncing = false;
  function syncAll() {
    if (isSyncing) return;
    isSyncing = true;
    try {
      isArabic = document.documentElement.lang !== 'en';
      purgeUnsolicitedClutter();
      syncHomePageAndroidButtons();
      syncHeaderAndroidButton();
      syncRoomUrlAndroidBanner();
    } catch (e) {
      console.warn('[Clue Me Integration Sync]', e);
    } finally {
      isSyncing = false;
    }
  }

  window.addEventListener('popstate', function () {
    setTimeout(syncAll, 100);
  });
  window.addEventListener('hashchange', function () {
    setTimeout(syncAll, 100);
  });

  // Safe periodic check (low overhead, no infinite mutation loop)
  setInterval(syncAll, 1200);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(syncAll, 50);
    });
  } else {
    setTimeout(syncAll, 50);
  }

  console.log('⚡ Clue Me Clean Pack Generator & Android Integration active.');
})();
