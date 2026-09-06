/**
 * Unified Routing Architecture & Deep Linking Service for Clue Me & Multi-Game Expansion
 */
export const URLService = {
  BASE_URL: 'https://clue-me.ai.studio',
  BASE_WEB_URL: 'https://clue-me.ai.studio',
  CUSTOM_SCHEME: 'clue-me',

  getMultiGameRoomUrl: (roomId, gameId = 'clue-me') => 
    `${URLService.BASE_URL}/${gameId}/room/${roomId.toUpperCase()}`,

  getDirectRoomUrl: (roomId) => 
    `${URLService.BASE_URL}/room/${roomId.toUpperCase()}`,

  getWebRoomUrl: (roomId, gameId = 'clue-me') => 
    `${URLService.BASE_URL}/${gameId}/room/${roomId.toUpperCase()}`,

  getDeepRoomUrl: (roomId, gameId = 'clue-me') => 
    `${URLService.CUSTOM_SCHEME}://${gameId}/room/${roomId.toUpperCase()}`,

  getDownloadUrl: () => 
    `${URLService.BASE_URL}/download`,

  parseCurrentRoute: (customPath) => {
    const path = typeof customPath === 'string'
      ? customPath
      : (typeof window !== 'undefined' ? window.location.pathname : '/');

    // A. Reserved: Download
    if (path === '/download' || path === '/download/') {
      return { type: 'DOWNLOAD' };
    }

    // B. Reserved: Auth Callback
    if (path.startsWith('/auth/callback')) {
      return { type: 'AUTH_CALLBACK' };
    }

    // C. Multi-Game Match
    const multiMatch = path.match(/^\/([A-Za-z0-9_-]+)\/room\/([A-Za-z]{4})$/i);
    if (multiMatch) {
      return { type: 'ROOM', gameId: multiMatch[1].toLowerCase(), roomId: multiMatch[2].toUpperCase() };
    }

    // D. Direct Legacy Match
    const directMatch = path.match(/^\/room\/([A-Za-z]{4})$/i);
    if (directMatch) {
      return { type: 'ROOM', gameId: 'clue-me', roomId: directMatch[1].toUpperCase() };
    }

    // E. Fallback for Unknown Routes
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

      // 2. Check Custom Scheme Auth: clue-me://auth
      if (/^(clue-me|clueme):\/\/auth/i.test(rawUrl)) {
        return { type: 'AUTH_CALLBACK', url: rawUrl };
      }

      // 3. Check Custom Scheme Multi-Game Room: clue-me://:gameId/room/:roomId
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

// Expose globally
if (typeof window !== 'undefined') {
  window.URLService = URLService;
}

export default URLService;
