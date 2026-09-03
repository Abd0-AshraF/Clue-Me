/* ============================================================================
   useSafeArea Hook & Dynamic Insets Helper for Discord Mobile, Browsers & WebViews
   Detects top and bottom insets using getComputedStyle on documentElement
   and applies them directly to the game container style and CSS variables.
   ============================================================================ */
(function (global) {
  function detectSafeAreaInsets() {
    var root = document.documentElement;
    var style = window.getComputedStyle(root);

    var topVar = style.getPropertyValue('--discord-safe-area-inset-top') ||
                 style.getPropertyValue('--cm-safe-top') ||
                 style.getPropertyValue('padding-top');
    var bottomVar = style.getPropertyValue('--discord-safe-area-inset-bottom') ||
                    style.getPropertyValue('--cm-safe-bottom') ||
                    style.getPropertyValue('padding-bottom');
    var leftVar = style.getPropertyValue('--discord-safe-area-inset-left') ||
                  style.getPropertyValue('--cm-safe-left');
    var rightVar = style.getPropertyValue('--discord-safe-area-inset-right') ||
                   style.getPropertyValue('--cm-safe-right');

    var top = parseFloat(topVar) || 0;
    var bottom = parseFloat(bottomVar) || 0;
    var left = parseFloat(leftVar) || 0;
    var right = parseFloat(rightVar) || 0;

    var isDiscord = root.classList.contains('cm-discord-activity') ||
                    (window.location && window.location.search && (
                      window.location.search.indexOf('frame_id') !== -1 ||
                      window.location.search.indexOf('instance_id') !== -1 ||
                      window.location.search.indexOf('discord') !== -1 ||
                      window.location.search.indexOf('activity=mock') !== -1
                    )) ||
                    (window.DiscordNative !== undefined);

    var isPhone = root.classList.contains('cm-ui-phone') || (window.innerWidth <= 768 && window.innerHeight <= 950);

    var isNative = root.classList.contains('cm-native-app') ||
                   (window.Capacitor !== undefined) ||
                   location.protocol === 'capacitor:' ||
                   location.protocol === 'ionic:' ||
                   (location.hostname === 'localhost' && (!location.port || location.port === '80' || location.port === '443')) ||
                   (location.hostname === '127.0.0.1' && (!location.port || location.port === '80' || location.port === '443')) ||
                   (navigator.userAgent && (navigator.userAgent.indexOf('Capacitor') !== -1 || (navigator.userAgent.indexOf('Android') !== -1 && (navigator.userAgent.indexOf('; wv') !== -1 || navigator.userAgent.indexOf('Version/') !== -1))));

    /* Enforce safe top padding for Discord and Native Android App */
    if (isDiscord) {
      if (top < 48) top = 48;
      if (bottom < 12) bottom = 12;
    } else if (isNative) {
      root.classList.add('cm-native-app');
      if (top < 36) top = 36;
      if (bottom < 8) bottom = 8;
    } else if (isPhone) {
      if (top < 4) top = 4;
      if (bottom < 4) bottom = 4;
    }

    root.style.setProperty('--cm-safe-top', top + 'px');
    root.style.setProperty('--cm-safe-bottom', bottom + 'px');
    root.style.setProperty('--cm-safe-left', left + 'px');
    root.style.setProperty('--cm-safe-right', right + 'px');

    return { top: top, bottom: bottom, left: left, right: right, isDiscord: isDiscord, isPhone: isPhone };
  }

  function applySafeAreaToContainer(containerEl, insets) {
    if (!containerEl || !containerEl.style) return;
    var ins = insets || detectSafeAreaInsets();
    containerEl.style.paddingTop = ins.top + 'px';
    containerEl.style.paddingBottom = ins.bottom + 'px';
    containerEl.style.paddingLeft = ins.left + 'px';
    containerEl.style.paddingRight = ins.right + 'px';
  }

  function useSafeArea(containerRef) {
    var React = global.React;
    var insets = detectSafeAreaInsets();

    if (React && React.useState && React.useEffect) {
      var stateArr = React.useState(insets);
      var currentInsets = stateArr[0];
      var setInsets = stateArr[1];

      React.useEffect(function () {
        function update() {
          var updated = detectSafeAreaInsets();
          setInsets(updated);
          var targetEl = containerRef && containerRef.current ? containerRef.current : containerRef;
          if (targetEl && targetEl.style) {
            applySafeAreaToContainer(targetEl, updated);
          } else {
            var page = document.querySelector('#root > div, .cm-game-page, .cm-game-shell, #root');
            if (page) applySafeAreaToContainer(page, updated);
          }
        }
        update();
        window.addEventListener('resize', update, { passive: true });
        window.addEventListener('orientationchange', update, { passive: true });
        if (window.visualViewport) {
          window.visualViewport.addEventListener('resize', update, { passive: true });
          window.visualViewport.addEventListener('scroll', update, { passive: true });
        }
        return function () {
          window.removeEventListener('resize', update);
          window.removeEventListener('orientationchange', update);
          if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', update);
            window.visualViewport.removeEventListener('scroll', update);
          }
        };
      }, [containerRef]);

      return {
        top: currentInsets.top,
        bottom: currentInsets.bottom,
        left: currentInsets.left,
        right: currentInsets.right,
        style: {
          paddingTop: currentInsets.top + 'px',
          paddingBottom: currentInsets.bottom + 'px',
          paddingLeft: currentInsets.left + 'px',
          paddingRight: currentInsets.right + 'px'
        }
      };
    }

    var target = containerRef && containerRef.current ? containerRef.current : containerRef;
    if (target && target.style) {
      applySafeAreaToContainer(target, insets);
    } else {
      var mainPage = document.querySelector('#root > div, .cm-game-page, .cm-game-shell, #root');
      if (mainPage) applySafeAreaToContainer(mainPage, insets);
    }

    return {
      top: insets.top,
      bottom: insets.bottom,
      left: insets.left,
      right: insets.right,
      style: {
        paddingTop: insets.top + 'px',
        paddingBottom: insets.bottom + 'px',
        paddingLeft: insets.left + 'px',
        paddingRight: insets.right + 'px'
      }
    };
  }

  useSafeArea.detect = detectSafeAreaInsets;
  useSafeArea.apply = applySafeAreaToContainer;

  global.useSafeArea = useSafeArea;
  global.cmDetectSafeArea = detectSafeAreaInsets;
})(typeof window !== 'undefined' ? window : this);
