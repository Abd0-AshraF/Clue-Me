(function() {
  var tutorialSeenKey = 'clue-me:lobby-tour-seen-v4';
  if (localStorage.getItem(tutorialSeenKey) === 'true') return;

  function findElementByText(texts, selector = '*') {
    const elements = Array.from(document.querySelectorAll(selector));
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.children.length <= 1 || el.tagName === 'BUTTON') {
        const text = el.textContent.trim().toLowerCase();
        if (texts.some(t => text.includes(t.toLowerCase()))) {
          return el.tagName === 'BUTTON' ? el : el.parentElement;
        }
      }
    }
    return null;
  }

  function startTour() {
    if (document.getElementById('cm-tour-overlay')) return;

    var isAr = document.documentElement.dir === 'rtl';

    var steps = [
      {
        title: isAr ? 'مرحباً بك في اللوبي!' : 'Welcome to the Lobby!',
        text: isAr ? 'هنا يبدأ التحدي. دعنا نأخذ جولة سريعة للتعرف على كيفية تجهيز الغرفة قبل بدء اللعبة.' : 'This is where the challenge begins. Let\'s take a quick tour to see how to set up the room.',
        target: null // Centered
      },
      {
        title: isAr ? 'انضمام للفرق' : 'Join a Team',
        text: isAr ? 'تنقسم الغرفة إلى فريقين متنافسين. انقر على زر الانضمام لتدخل في أحدهما وتستعد للتحدي.' : 'The room is divided into two competing teams. Tap "Join" to enter one and prepare for the challenge.',
        target: () => document.querySelector('.cm-roster-col') || findElementByText(['أحمر', 'red', 'أزرق', 'blue', 'وردي', 'pink', 'بنفسجي', 'violet', 'برتقالي', 'orange'], '.cm-card')
      },
      {
        title: isAr ? 'اختر دورك' : 'Choose Your Role',
        text: isAr ? 'العب كـ "قائد" لتعطي التلميحات، أو כـ "عميل" لتخمن الكلمات.' : 'Play as a "Captain" to give clues, or an "Operative" to guess them.',
        target: () => findElementByText(['قائد', 'عميل', 'captain', 'operative'], 'button') || document.querySelector('.cm-roster-col')
      },
      {
        title: isAr ? 'دعوة الأصدقاء' : 'Invite Friends',
        text: isAr ? 'شارك رابط الغرفة مع أصدقائك للانضمام إليك.' : 'Share the room link with your friends so they can join.',
        target: () => findElementByText(['انسخ', 'نسخ', 'رابط', 'copy', 'invite'], 'button') || findElementByText(['انسخ', 'نسخ', 'رابط', 'copy', 'invite'])
      },
      {
        title: isAr ? 'ابدأ اللعبة' : 'Start the Game',
        text: isAr ? 'عندما يكتمل العدد ويكون الجميع جاهزاً، اضغط هنا لبدء التحدي.' : 'Once everyone is ready, tap here to start the game.',
        target: () => findElementByText(['ابدأ', 'start', 'جاهز', 'ready'], 'button')
      }
    ];

    var currentStepIndex = 0;

    var overlay = document.createElement('div');
    overlay.id = 'cm-tour-overlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9999; pointer-events: auto; transition: all 0.3s ease;';
    
    var svgNS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNS, 'svg');
    svg.style.cssText = 'width: 100%; height: 100%; position: absolute; top: 0; left: 0; pointer-events: none;';
    
    var defs = document.createElementNS(svgNS, 'defs');
    var mask = document.createElementNS(svgNS, 'mask');
    mask.id = 'cm-tour-mask';
    
    var maskBg = document.createElementNS(svgNS, 'rect');
    maskBg.setAttribute('width', '100%');
    maskBg.setAttribute('height', '100%');
    maskBg.setAttribute('fill', 'white');
    
    var maskHole = document.createElementNS(svgNS, 'rect');
    maskHole.setAttribute('fill', 'black');
    maskHole.setAttribute('rx', '12'); 
    maskHole.style.transition = 'all 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
    
    mask.appendChild(maskBg);
    mask.appendChild(maskHole);
    defs.appendChild(mask);
    svg.appendChild(defs);
    
    var overlayBg = document.createElementNS(svgNS, 'rect');
    overlayBg.setAttribute('width', '100%');
    overlayBg.setAttribute('height', '100%');
    overlayBg.setAttribute('fill', 'rgba(0,0,0,0.65)');
    overlayBg.setAttribute('mask', 'url(#cm-tour-mask)');
    svg.appendChild(overlayBg);
    
    overlay.appendChild(svg);

    var popover = document.createElement('div');
    popover.className = 'cm-tour-popover';
    popover.style.cssText = 'position: absolute; background: var(--cm-surface, #ffffff); border: 1px solid var(--cm-border, #e5e7eb); border-radius: 1.25rem; padding: 1.75rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.3); width: 320px; max-width: 90vw; transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1); opacity: 0; transform: translateY(15px); direction: ' + document.documentElement.dir + ';';
    
    var titleEl = document.createElement('h3');
    titleEl.style.cssText = 'margin: 0 0 0.5rem 0; font-size: 1.25rem; font-weight: 800; color: var(--cm-ink, #111827); line-height: 1.3;';
    
    var textEl = document.createElement('p');
    textEl.style.cssText = 'margin: 0 0 1.5rem 0; font-size: 0.95rem; color: var(--cm-ink-soft, #4b5563); line-height: 1.6;';
    
    var footer = document.createElement('div');
    footer.style.cssText = 'display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--cm-border, #e5e7eb); padding-top: 1rem;';
    
    var skipBtn = document.createElement('button');
    skipBtn.textContent = isAr ? 'تخطي' : 'Skip';
    skipBtn.style.cssText = 'background: transparent; border: none; color: var(--cm-ink-soft, #6b7280); font-weight: 600; cursor: pointer; padding: 0.5rem; font-size: 0.9rem;';
    
    var nextBtn = document.createElement('button');
    nextBtn.style.cssText = 'background: var(--cm-red, #B83A3A); color: #ffffff; border: none; border-radius: 99px; padding: 0.6rem 1.5rem; font-weight: 700; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); font-size: 0.9rem; transition: transform 0.1s;';
    nextBtn.onactive = function() { nextBtn.style.transform = "scale(0.95)"; }
    
    footer.appendChild(skipBtn);
    footer.appendChild(nextBtn);
    
    popover.appendChild(titleEl);
    popover.appendChild(textEl);
    popover.appendChild(footer);
    overlay.appendChild(popover);
    document.body.appendChild(overlay);

    // Initial dummy values
    maskHole.setAttribute('x', '0');
    maskHole.setAttribute('y', '0');
    maskHole.setAttribute('width', '0');
    maskHole.setAttribute('height', '0');
    popover.style.left = '50%';
    popover.style.top = '50%';
    popover.style.transform = 'translate(-50%, -50%)';

    function getTargetRect(step) {
      if (typeof step.target === 'function') {
        const el = step.target();
        if (el) {
          const rect = el.getBoundingClientRect();
          // Safety margins
          return {
            x: Math.max(0, rect.left - 8),
            y: Math.max(0, rect.top - 8),
            width: rect.width + 16,
            height: rect.height + 16
          };
        }
      }
      return null;
    }

    function renderStep() {
      var step = steps[currentStepIndex];
      titleEl.textContent = step.title;
      textEl.textContent = step.text;
      
      if (currentStepIndex === steps.length - 1) {
        nextBtn.textContent = isAr ? 'فهمت، لنبدأ!' : 'Got it, let\'s go!';
      } else {
        nextBtn.textContent = isAr ? 'التالي' : 'Next';
      }

      var rect = getTargetRect(step);
      
      if (rect && rect.width > 0 && rect.height > 0) {
        // Spotlight mode
        maskHole.setAttribute('x', rect.x);
        maskHole.setAttribute('y', rect.y);
        maskHole.setAttribute('width', rect.width);
        maskHole.setAttribute('height', rect.height);
        
        let popoverX = rect.x + (rect.width / 2) - (popover.offsetWidth / 2);
        let popoverY = rect.y + rect.height + 20;
        
        if (popoverX < 16) popoverX = 16;
        if (popoverX + popover.offsetWidth > window.innerWidth - 16) {
            popoverX = window.innerWidth - popover.offsetWidth - 16;
        }
        
        // If it goes off bottom, put it above
        if (popoverY + popover.offsetHeight > window.innerHeight - 16) {
          popoverY = rect.y - popover.offsetHeight - 20;
        }
        
        popover.style.left = popoverX + 'px';
        popover.style.top = popoverY + 'px';
        popover.style.transform = 'translate(0, 0)';
      } else {
        // Centered fallback
        maskHole.setAttribute('x', '0');
        maskHole.setAttribute('y', '0');
        maskHole.setAttribute('width', '0');
        maskHole.setAttribute('height', '0');
        
        popover.style.left = '50%';
        popover.style.top = '50%';
        popover.style.transform = 'translate(-50%, -50%)';
      }
      
      popover.style.opacity = '1';
    }

    function closeTour() {
      localStorage.setItem(tutorialSeenKey, 'true');
      overlay.style.opacity = '0';
      popover.style.transform = 'translate(-50%, -50%) scale(0.95)';
      setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 300);
    }

    nextBtn.onclick = function() {
      if (currentStepIndex < steps.length - 1) {
        currentStepIndex++;
        popover.style.opacity = '0';
        setTimeout(renderStep, 200); // give time to fade, calculate next
      } else {
        closeTour();
      }
    };

    skipBtn.onclick = closeTour;

    // Wait a moment for layout to settle, then render first step
    setTimeout(() => {
      overlay.style.opacity = '1';
      renderStep();
    }, 150);
  }

  var observer = new MutationObserver(function() {
    if (localStorage.getItem(tutorialSeenKey) === 'true') {
      observer.disconnect();
      return;
    }
    // Only trigger if we are in the lobby specifically
    if (document.querySelector('.cm-roster-col') || document.querySelector('.cm-card')) {
      observer.disconnect();
      setTimeout(startTour, 600);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

})();
