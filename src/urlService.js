/**
 * Unified Routing Architecture & Deep Linking Service for Clue Me & Multi-Game Expansion
 */
export const URLService = {
  // Base URLs
  BASE_WEB_URL: 'https://clue-me.ai.studio',
  CUSTOM_SCHEME: 'clue-me',

  // App Download Links
  getDownloadUrl: () => 'https://clue-me.ai.studio/download',

  // Room Links (Supports Current & Future Games)
  getWebRoomUrl: (roomId, gameId = 'clue-me') =>
    `https://clue-me.ai.studio/${gameId}/room/${roomId.toUpperCase()}`,

  getDeepRoomUrl: (roomId, gameId = 'clue-me') =>
    `${URLService.CUSTOM_SCHEME}://${gameId}/room/${roomId.toUpperCase()}`,

  // Safe Route Parser
  parseCurrentRoute: (customPath) => {
    const path = typeof customPath === 'string'
      ? customPath
      : (typeof window !== 'undefined' ? window.location.pathname : '/');

    // 1. Check Download Route
    if (path === '/download' || path === '/download/' || path.startsWith('/download')) {
      return { type: 'DOWNLOAD' };
    }

    // 2. Check Multi-game Room Match: /:gameId/room/:roomId OR /room/:roomId
    const multiGameMatch = path.match(/^\/([A-Za-z0-9_-]+)\/room\/([A-Za-z]{4})$/);
    if (multiGameMatch) {
      return {
        type: 'ROOM',
        gameId: multiGameMatch[1].toLowerCase(),
        roomId: multiGameMatch[2].toUpperCase()
      };
    }

    const legacyRoomMatch = path.match(/^\/room\/([A-Za-z]{4})$/);
    if (legacyRoomMatch) {
      return {
        type: 'ROOM',
        gameId: 'clue-me',
        roomId: legacyRoomMatch[1].toUpperCase()
      };
    }

    // 3. Check Auth Callback
    if (path.startsWith('/auth/callback')) {
      return { type: 'AUTH_CALLBACK' };
    }

    // 4. Default / Hub
    return { type: 'HOME' };
  },

  // Deep Link Parser (Custom Schemes & Web URLs)
  parseDeepLink: (url) => {
    if (!url) return { type: 'UNKNOWN' };
    try {
      const rawUrl = String(url).trim();

      // 1. Check Custom Scheme Download: clue-me://download or clueme://download
      if (/^(clue-me|clueme):\/\/download(\/.*)?$/i.test(rawUrl)) {
        return { type: 'DOWNLOAD' };
      }

      // 2. Check Custom Scheme Multi-Game Room: clue-me://:gameId/room/:roomId
      const schemeMultiMatch = rawUrl.match(/^(?:clue-me|clueme):\/\/([A-Za-z0-9_-]+)\/room\/([A-Za-z]{4})(?:[/?#]|$)/i);
      if (schemeMultiMatch) {
        return {
          type: 'ROOM',
          gameId: schemeMultiMatch[1].toLowerCase(),
          roomId: schemeMultiMatch[2].toUpperCase()
        };
      }

      // Legacy Custom Scheme Room: clue-me://room/:roomId
      const schemeLegacyMatch = rawUrl.match(/^(?:clue-me|clueme):\/\/room\/([A-Za-z]{4})(?:[/?#]|$)/i);
      if (schemeLegacyMatch) {
        return {
          type: 'ROOM',
          gameId: 'clue-me',
          roomId: schemeLegacyMatch[1].toUpperCase()
        };
      }

      // 3. Check Custom Scheme Auth: clue-me://auth
      if (/^(clue-me|clueme):\/\/auth/i.test(rawUrl)) {
        return { type: 'AUTH_CALLBACK', url: rawUrl };
      }

      // 4. Standard HTTP/HTTPS Deep Link
      const normUrl = rawUrl.replace(/^(clue-me|clueme):\/\//i, 'https://clue-me.ai.studio/');
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://clue-me.ai.studio';
      const parsed = new URL(normUrl, origin);

      return URLService.parseCurrentRoute(parsed.pathname);
    } catch (e) {
      return { type: 'UNKNOWN' };
    }
  }
};

// Expose globally for browser environments, Capacitor webviews, and prebuilt bundles
if (typeof window !== 'undefined') {
  window.URLService = URLService;
}

export default URLService;
