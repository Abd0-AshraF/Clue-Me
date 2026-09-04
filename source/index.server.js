// src/index.ts
import { existsSync as existsSync2 } from "node:fs";
import { createServer } from "node:http";
import { resolve as resolve2 } from "node:path";
import { registerAiRoutes } from "./ai-service.js";

// src/app.ts
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

// ../shared/src/brand.ts
var BRAND = {
  /** Official product name. Change it here — nowhere else. */
  name: "Clue Me",
  /** Brand palette (key hexes; see tokens.css for the full system). */
  palette: {
    red: "#B83A3A",
    redDark: "#8F2D2D",
    redSoft: "#D96868",
    redPale: "#F3D6D6",
    blue: "#315C88",
    blueDark: "#234568",
    blueSoft: "#6389AF",
    bluePale: "#D9E5F1",
    paper: "#F5F1E8",
    surface: "#FFFDF8",
    ink: "#252525"
  },
  /** Typography (self-hosted; see client/src/main.tsx for font loading). */
  fonts: {
    arabic: "IBM Plex Sans Arabic",
    latin: "IBM Plex Sans"
  }
};
var APP_VERSION = "0.3.7";

// ../shared/src/i18n/types.ts
function isLang(value) {
  return value === "ar" || value === "en";
}

// ../shared/src/game/normalize.ts
var ARABIC_DIGITS_START = 1632;
function normalizeArabicWord(input) {
  return input.replace(/[\u064B-\u0652\u0670\u0640]/g, "").replace(/[أإآا]/g, "\u0627").replace(/[ىئ]/g, "\u064A").replace(/ؤ/g, "\u0648").replace(/ة/g, "\u0647").replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - ARABIC_DIGITS_START)).replace(/[^\p{L}]/gu, "").toLowerCase();
}
function normalizeLatinWord(input) {
  return input.replace(/[^\p{L}]/gu, "").toLowerCase();
}
function normalizeWord(input, language) {
  return language === "ar" ? normalizeArabicWord(input) : normalizeLatinWord(input);
}

// ../shared/src/game/types.ts
var BOARD_SIZE = 25;
var STARTING_TEAM = "red";
var STARTING_AGENTS = 9;
var SECOND_AGENTS = 8;
var NEUTRAL_COUNT = 7;
var ASSASSIN_COUNT = 1;
var MIN_CLUE_NUMBER = 1;
var MAX_CLUE_NUMBER = 25;
var MAX_CLUE_WORD_LENGTH = 20;
var MAX_CLUE_WORDS = 4;
var MAX_CLUE_LENGTH = 48;
var otherTeam = (team) => team === "red" ? "blue" : "red";

// ../shared/src/game/engine.ts
function shuffle(items, rng = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function buildColorLayout(rng) {
  const colors = [
    ...Array(STARTING_AGENTS).fill(STARTING_TEAM),
    ...Array(SECOND_AGENTS).fill(otherTeam(STARTING_TEAM)),
    ...Array(NEUTRAL_COUNT).fill("neutral"),
    ...Array(ASSASSIN_COUNT).fill("assassin")
  ];
  return shuffle(colors, rng);
}
var idCounter = 0;
function nextGameId() {
  idCounter += 1;
  return `g-${Date.now().toString(36)}-${idCounter}`;
}
function createGame(options) {
  const { language, words, rng = Math.random } = options;
  if (words.length < BOARD_SIZE) {
    throw new Error(`createGame: need at least ${BOARD_SIZE} words, got ${words.length}`);
  }
  const picked = shuffle(words, rng).slice(0, BOARD_SIZE);
  const colors = buildColorLayout(rng);
  return {
    id: nextGameId(),
    language,
    board: picked.map((word, index) => ({
      word,
      color: colors[index],
      revealed: false
    })),
    phase: "clue",
    turnTeam: STARTING_TEAM,
    clue: null,
    clueSeq: 0,
    guessesUsed: 0,
    maxGuesses: 0,
    winner: null,
    winReason: null,
    moveCount: 0
  };
}
function remainingCards(state, team) {
  return state.board.filter((card) => !card.revealed && card.color === team).length;
}
function validateClue(clueWord, number, boardWords, language) {
  const word = clueWord.trim().replace(/\s+/g, " ");
  const token = /^[\p{L}\p{Nd}\u064B-\u0652\u0670\u0640]+$/u;
  if (word.length === 0 || word.length > MAX_CLUE_LENGTH) return "INVALID_CLUE_WORD";
  const tokens = word.split(" ");
  if (tokens.length > MAX_CLUE_WORDS) return "INVALID_CLUE_WORD";
  for (const part of tokens) {
    if (part.length === 0 || part.length > MAX_CLUE_WORD_LENGTH || !token.test(part)) {
      return "INVALID_CLUE_WORD";
    }
  }
  if (!Number.isInteger(number) || number < MIN_CLUE_NUMBER || number > MAX_CLUE_NUMBER) {
    return "INVALID_CLUE_NUMBER";
  }
  const normalized = normalizeWord(word, language);
  const hasDigits = new RegExp("\\p{Nd}", "u").test(word);
  if (normalized.length === 0 && !hasDigits) return "INVALID_CLUE_WORD";
  const normalizedBoard = new Set(boardWords.map((boardWord) => normalizeWord(boardWord, language)));
  if (normalizedBoard.has(normalized)) return "CLUE_IS_BOARD_WORD";
  for (const part of tokens) {
    const normalizedPart = normalizeWord(part, language);
    if (normalizedPart.length > 0 && normalizedBoard.has(normalizedPart)) return "CLUE_IS_BOARD_WORD";
  }
  return null;
}
function endTurnInternal(state) {
  state.turnTeam = otherTeam(state.turnTeam);
  state.phase = "clue";
  state.clue = null;
  state.guessesUsed = 0;
  state.maxGuesses = 0;
}
function resolveWinnerAfterReveal(state, actorTeam) {
  const redRemaining = remainingCards(state, "red");
  const blueRemaining = remainingCards(state, "blue");
  if (redRemaining === 0) {
    state.winner = "red";
    state.winReason = actorTeam === "red" ? "agents" : "opponent-agents";
    state.phase = "over";
    return true;
  }
  if (blueRemaining === 0) {
    state.winner = "blue";
    state.winReason = actorTeam === "blue" ? "agents" : "opponent-agents";
    state.phase = "over";
    return true;
  }
  return false;
}
function giveClue(state, clue) {
  if (state.winner) return { ok: false, code: "GAME_OVER" };
  if (state.phase !== "clue") return { ok: false, code: "NOT_CLUE_PHASE" };
  const error = validateClue(clue.word, clue.number, state.board.map((c) => c.word), state.language);
  if (error) return { ok: false, code: error };
  state.clue = { word: clue.word.trim().replace(/\s+/g, " "), number: clue.number };
  state.clueSeq += 1;
  state.phase = "guess";
  state.guessesUsed = 0;
  state.maxGuesses = clue.number + 1;
  state.moveCount += 1;
  return { ok: true, kind: "clue", endedTurn: false };
}
function guess(state, index) {
  if (state.winner) return { ok: false, code: "GAME_OVER" };
  if (state.phase !== "guess") return { ok: false, code: "NOT_GUESS_PHASE" };
  if (!Number.isInteger(index) || index < 0 || index >= state.board.length) {
    return { ok: false, code: "INVALID_CARD_INDEX" };
  }
  const card = state.board[index];
  if (card.revealed) return { ok: false, code: "CARD_ALREADY_REVEALED" };
  const actorTeam = state.turnTeam;
  card.revealed = true;
  state.moveCount += 1;
  if (card.color === "assassin") {
    state.winner = otherTeam(actorTeam);
    state.winReason = "assassin";
    state.phase = "over";
    return {
      ok: true,
      kind: "guess",
      cardColor: card.color,
      actorTeam,
      endedTurn: true,
      winner: state.winner,
      winReason: state.winReason,
      index
    };
  }
  if (resolveWinnerAfterReveal(state, actorTeam)) {
    return {
      ok: true,
      kind: "guess",
      cardColor: card.color,
      actorTeam,
      endedTurn: true,
      winner: state.winner,
      winReason: state.winReason,
      index
    };
  }
  if (card.color === actorTeam) {
    state.guessesUsed += 1;
    if (state.guessesUsed >= state.maxGuesses) {
      endTurnInternal(state);
      return { ok: true, kind: "guess", cardColor: card.color, actorTeam, endedTurn: true, index };
    }
    return { ok: true, kind: "guess", cardColor: card.color, actorTeam, endedTurn: false, index };
  }
  endTurnInternal(state);
  return { ok: true, kind: "guess", cardColor: card.color, actorTeam, endedTurn: true, index };
}
function endTurn(state) {
  if (state.winner) return { ok: false, code: "GAME_OVER" };
  if (state.phase !== "guess") return { ok: false, code: "NOT_GUESS_PHASE" };
  state.moveCount += 1;
  endTurnInternal(state);
  return { ok: true, kind: "end-turn", endedTurn: true };
}
function getView(state, viewer) {
  const revealAll = state.phase === "over";
  const isCaptain = viewer.kind === "captain";
  const cards = state.board.map((card) => ({
    word: card.word,
    revealed: card.revealed,
    state: revealAll || isCaptain ? card.color : card.revealed ? card.color : "hidden"
  }));
  const canClue = !revealAll && state.phase === "clue" && isCaptain && viewer.team === state.turnTeam;
  const canGuess = !revealAll && state.phase === "guess" && viewer.kind === "operative" && viewer.team === state.turnTeam;
  const clueSelections = state.phase === "guess" ? state.guessesUsed : 0;
  const clueTarget = state.clue?.number ?? 0;
  const clueRemaining = Math.max(0, clueTarget - clueSelections);
  return {
    gameId: state.id,
    revision: state.moveCount,
    stateVersion: state.moveCount,
    phase: state.phase,
    turnTeam: state.turnTeam,
    clue: state.clue,
    clueSeq: state.clueSeq,
    guessesUsed: state.guessesUsed,
    maxGuesses: state.maxGuesses,
    clueSelections,
    clueTarget,
    clueRemaining,
    winner: state.winner,
    winReason: state.winReason,
    redRemaining: remainingCards(state, "red"),
    blueRemaining: remainingCards(state, "blue"),
    cards,
    canClue,
    canGuess,
    canEndTurn: canGuess,
    revealAll
  };
}

// ../shared/src/words/data/arabic.ts
var ARABIC_SEEDS = [
  /* ------------------------------------------------------------------ Food */
  {
    words: ["\u0639\u064A\u0634", "\u062C\u0628\u0646\u0629", "\u0632\u0628\u062F\u0629", "\u0644\u0628\u0646", "\u0628\u064A\u0636", "\u0639\u0633\u0644", "\u0633\u0643\u0631", "\u0645\u0644\u062D", "\u0641\u0644\u0641\u0644", "\u0632\u064A\u062A", "\u062E\u0644", "\u062F\u0642\u064A\u0642", "\u0623\u0631\u0632", "\u0645\u0643\u0631\u0648\u0646\u0629", "\u0634\u0648\u0631\u0628\u0629", "\u0633\u0644\u0637\u0629", "\u0633\u0646\u062F\u0648\u062A\u0634", "\u0641\u0637\u064A\u0631\u0629", "\u0643\u0639\u0643\u0629", "\u0634\u0648\u0643\u0648\u0644\u0627\u062A\u0629"],
    dialect: "msa",
    difficulty: 1,
    frequency: 5,
    partOfSpeech: "noun",
    categories: ["food", "everyday", "general"]
  },
  {
    words: ["\u062A\u0641\u0627\u062D", "\u0645\u0648\u0632", "\u0628\u0631\u062A\u0642\u0627\u0644", "\u0628\u0637\u064A\u062E", "\u0639\u0646\u0628", "\u0631\u0645\u0627\u0646", "\u062E\u0648\u062E", "\u0645\u0634\u0645\u0634", "\u062A\u064A\u0646", "\u0628\u0644\u062D", "\u0645\u0627\u0646\u062C\u0648", "\u0641\u0631\u0627\u0648\u0644\u0629", "\u0623\u0646\u0627\u0646\u0627\u0633", "\u0644\u064A\u0645\u0648\u0646", "\u0643\u0645\u062B\u0631\u0649"],
    dialect: "msa",
    difficulty: 1,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["food", "nature"]
  },
  {
    words: ["\u0637\u0645\u0627\u0637\u0645", "\u062E\u064A\u0627\u0631", "\u0628\u0635\u0644", "\u062B\u0648\u0645", "\u062C\u0632\u0631", "\u0628\u0637\u0627\u0637\u0633", "\u0628\u0627\u0630\u0646\u062C\u0627\u0646", "\u0643\u0648\u0633\u0629", "\u0633\u0628\u0627\u0646\u062E", "\u062E\u0633", "\u0641\u0627\u0635\u0648\u0644\u064A\u0627", "\u0639\u062F\u0633", "\u062D\u0645\u0635", "\u0630\u0631\u0629", "\u0642\u0631\u0639"],
    dialect: "msa",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["food", "nature"]
  },
  {
    words: ["\u0634\u0627\u064A", "\u0642\u0647\u0648\u0629", "\u0639\u0635\u064A\u0631", "\u0645\u0627\u0621", "\u062D\u0644\u064A\u0628", "\u0645\u0634\u0631\u0648\u0628", "\u0645\u0637\u0639\u0645", "\u0645\u0642\u0647\u0649", "\u0645\u062E\u0628\u0632", "\u062C\u0632\u0627\u0631", "\u0637\u0628\u0627\u062E", "\u0648\u0635\u0641\u0629", "\u0648\u062C\u0628\u0629", "\u0625\u0641\u0637\u0627\u0631", "\u0639\u0634\u0627\u0621"],
    dialect: "msa",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["food", "everyday", "places"]
  },
  {
    words: ["\u0641\u0648\u0644", "\u0637\u0639\u0645\u064A\u0629", "\u0643\u0634\u0631\u064A", "\u0645\u0644\u0648\u062E\u064A\u0629", "\u0645\u062D\u0634\u064A", "\u0643\u0628\u0627\u0628", "\u0634\u0627\u0648\u0631\u0645\u0627", "\u0641\u062A\u0629", "\u0628\u0633\u0628\u0648\u0633\u0629", "\u0643\u0646\u0627\u0641\u0629"],
    dialect: "egyptian",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["food", "egyptianCulture", "arabicCulture"]
  },
  /* --------------------------------------------------------------- Animals */
  {
    words: ["\u0642\u0637", "\u0643\u0644\u0628", "\u062D\u0635\u0627\u0646", "\u062D\u0645\u0627\u0631", "\u062C\u0645\u0644", "\u0628\u0642\u0631\u0629", "\u062E\u0631\u0648\u0641", "\u0645\u0627\u0639\u0632", "\u062F\u062C\u0627\u062C\u0629", "\u062F\u064A\u0643", "\u0628\u0637\u0629", "\u0623\u0631\u0646\u0628", "\u0641\u0623\u0631", "\u062E\u0646\u0632\u064A\u0631", "\u062B\u0648\u0631"],
    dialect: "msa",
    difficulty: 1,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["animals", "nature"]
  },
  {
    words: ["\u0623\u0633\u062F", "\u0646\u0645\u0631", "\u0641\u0647\u062F", "\u0630\u0626\u0628", "\u062B\u0639\u0644\u0628", "\u062F\u0628", "\u0641\u064A\u0644", "\u0632\u0631\u0627\u0641\u0629", "\u063A\u0632\u0627\u0644", "\u0642\u0631\u062F", "\u062A\u0645\u0633\u0627\u062D", "\u062B\u0639\u0628\u0627\u0646", "\u0633\u0644\u062D\u0641\u0627\u0629", "\u0636\u0641\u062F\u0639", "\u062E\u0641\u0627\u0634"],
    dialect: "msa",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["animals", "nature"]
  },
  {
    words: ["\u0646\u0633\u0631", "\u0635\u0642\u0631", "\u0628\u0648\u0645\u0629", "\u062D\u0645\u0627\u0645\u0629", "\u0639\u0635\u0641\u0648\u0631", "\u0628\u0628\u063A\u0627\u0621", "\u0646\u0648\u0631\u0633", "\u0637\u0627\u0648\u0648\u0633", "\u063A\u0631\u0627\u0628", "\u0628\u062C\u0639\u0629"],
    dialect: "msa",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["animals", "nature"]
  },
  {
    words: ["\u0633\u0645\u0643\u0629", "\u0642\u0631\u0634", "\u062D\u0648\u062A", "\u062F\u0648\u0644\u0641\u064A\u0646", "\u0623\u062E\u0637\u0628\u0648\u0637", "\u0633\u0631\u0637\u0627\u0646", "\u0646\u062D\u0644\u0629", "\u0646\u0645\u0644\u0629", "\u0641\u0631\u0627\u0634\u0629", "\u0639\u0646\u0643\u0628\u0648\u062A", "\u0630\u0628\u0627\u0628\u0629", "\u0628\u0639\u0648\u0636\u0629", "\u062F\u0648\u062F\u0629", "\u0635\u0631\u0635\u0648\u0631", "\u062C\u0631\u0627\u062F"],
    dialect: "msa",
    difficulty: 3,
    frequency: 2,
    partOfSpeech: "noun",
    categories: ["animals", "nature"]
  },
  /* --------------------------------------------------------------- Objects */
  {
    words: ["\u0643\u062A\u0627\u0628", "\u0642\u0644\u0645", "\u0648\u0631\u0642\u0629", "\u062F\u0641\u062A\u0631", "\u0645\u0641\u062A\u0627\u062D", "\u0628\u0627\u0628", "\u0634\u0628\u0627\u0643", "\u0643\u0631\u0633\u064A", "\u062A\u0631\u0627\u0628\u064A\u0632\u0629", "\u0633\u0631\u064A\u0631", "\u0645\u0631\u0622\u0629", "\u0633\u0627\u0639\u0629", "\u0645\u0635\u0628\u0627\u062D", "\u0634\u0645\u0639\u0629", "\u0633\u0644\u0629"],
    dialect: "msa",
    difficulty: 1,
    frequency: 5,
    partOfSpeech: "noun",
    categories: ["objects", "everyday"]
  },
  {
    words: ["\u062D\u0642\u064A\u0628\u0629", "\u0645\u062D\u0641\u0638\u0629", "\u0645\u0638\u0644\u0629", "\u0646\u0638\u0627\u0631\u0629", "\u062E\u0627\u062A\u0645", "\u0639\u0642\u062F", "\u0633\u0648\u0627\u0631", "\u0645\u0634\u0637", "\u0641\u0631\u0634\u0627\u0629", "\u0635\u0627\u0628\u0648\u0646", "\u0645\u0646\u0634\u0641\u0629", "\u0648\u0633\u0627\u062F\u0629", "\u0628\u0637\u0627\u0646\u064A\u0629", "\u0633\u062A\u0627\u0631\u0629", "\u0633\u062C\u0627\u062F\u0629"],
    dialect: "msa",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["objects", "everyday"]
  },
  {
    words: ["\u0633\u0643\u064A\u0646", "\u0645\u0644\u0639\u0642\u0629", "\u0634\u0648\u0643\u0629", "\u0637\u0628\u0642", "\u0643\u0648\u0628", "\u0625\u0628\u0631\u064A\u0642", "\u0642\u062F\u0631", "\u0645\u0642\u0644\u0627\u0629", "\u0645\u0642\u0635", "\u0625\u0628\u0631\u0629", "\u062E\u064A\u0637", "\u062D\u0628\u0644", "\u0633\u0644\u0645", "\u0645\u0637\u0631\u0642\u0629", "\u0645\u0633\u0645\u0627\u0631"],
    dialect: "msa",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["objects", "everyday"]
  },
  {
    words: ["\u0635\u0646\u062F\u0648\u0642", "\u0632\u062C\u0627\u062C\u0629", "\u0639\u0644\u0628\u0629", "\u0643\u064A\u0633", "\u0635\u062D\u0646", "\u062F\u0644\u0648", "\u0645\u0643\u0646\u0633\u0629", "\u0645\u0631\u0648\u062D\u0629", "\u062B\u0644\u0627\u062C\u0629", "\u0641\u0631\u0646", "\u063A\u0633\u0627\u0644\u0629", "\u0645\u0643\u0648\u0627\u0629", "\u0645\u064A\u0632\u0627\u0646", "\u0642\u0641\u0644", "\u0645\u0633\u0637\u0631\u0629"],
    dialect: "msa",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["objects", "everyday"]
  },
  /* ---------------------------------------------------------------- Places */
  {
    words: ["\u0628\u064A\u062A", "\u0645\u062F\u0631\u0633\u0629", "\u062C\u0627\u0645\u0639\u0629", "\u0645\u0643\u062A\u0628\u0629", "\u0645\u0633\u062A\u0634\u0641\u0649", "\u0635\u064A\u062F\u0644\u064A\u0629", "\u0633\u0648\u0642", "\u0645\u062A\u062C\u0631", "\u0628\u0646\u0643", "\u0645\u0637\u0627\u0631", "\u0645\u062D\u0637\u0629", "\u0645\u064A\u0646\u0627\u0621", "\u0641\u0646\u062F\u0642", "\u0645\u062A\u062D\u0641", "\u0645\u0633\u0631\u062D"],
    dialect: "msa",
    difficulty: 1,
    frequency: 5,
    partOfSpeech: "noun",
    categories: ["places", "buildings"]
  },
  {
    words: ["\u062D\u062F\u064A\u0642\u0629", "\u0645\u0644\u0639\u0628", "\u0634\u0627\u0637\u0626", "\u0645\u0632\u0631\u0639\u0629", "\u0645\u0635\u0646\u0639", "\u0645\u0643\u062A\u0628", "\u0642\u0631\u064A\u0629", "\u0645\u062F\u064A\u0646\u0629", "\u0634\u0627\u0631\u0639", "\u0645\u064A\u062F\u0627\u0646", "\u062C\u0633\u0631", "\u0646\u0641\u0642", "\u0628\u0631\u062C", "\u0642\u0644\u0639\u0629", "\u0642\u0635\u0631"],
    dialect: "msa",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["places", "buildings", "geography"]
  },
  {
    words: ["\u0645\u0633\u062C\u062F", "\u0643\u0646\u064A\u0633\u0629", "\u0645\u0642\u0628\u0631\u0629", "\u0633\u062C\u0646", "\u062B\u0643\u0646\u0629", "\u0645\u0637\u0628\u062E", "\u062D\u0645\u0627\u0645", "\u063A\u0631\u0641\u0629", "\u0635\u0627\u0644\u0629", "\u0634\u0631\u0641\u0629", "\u0633\u0637\u062D", "\u0642\u0628\u0648", "\u0645\u062E\u0632\u0646", "\u0643\u0648\u062E", "\u062E\u064A\u0645\u0629"],
    dialect: "msa",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["places", "buildings"]
  },
  /* ---------------------------------------------------------------- Nature */
  {
    words: ["\u0634\u0645\u0633", "\u0642\u0645\u0631", "\u0646\u062C\u0645", "\u0633\u0645\u0627\u0621", "\u0633\u062D\u0627\u0628\u0629", "\u0645\u0637\u0631", "\u062B\u0644\u062C", "\u0631\u064A\u0627\u062D", "\u0628\u0631\u0642", "\u0631\u0639\u062F", "\u0642\u0648\u0633 \u0642\u0632\u062D", "\u0636\u0628\u0627\u0628", "\u062D\u0631\u0627\u0631\u0629", "\u0638\u0644", "\u0646\u0627\u0631"],
    dialect: "msa",
    difficulty: 1,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["nature", "science"]
  },
  {
    words: ["\u0628\u062D\u0631", "\u0646\u0647\u0631", "\u0628\u062D\u064A\u0631\u0629", "\u0645\u062D\u064A\u0637", "\u062C\u0628\u0644", "\u0648\u0627\u062F\u064A", "\u0635\u062D\u0631\u0627\u0621", "\u063A\u0627\u0628\u0629", "\u0634\u062C\u0631\u0629", "\u0632\u0647\u0631\u0629", "\u0648\u0631\u0642\u0629 \u0634\u062C\u0631", "\u0639\u0634\u0628", "\u062C\u0630\u0631", "\u0628\u0630\u0631\u0629", "\u062B\u0645\u0631\u0629"],
    dialect: "msa",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["nature", "geography"]
  },
  {
    words: ["\u0631\u0645\u0644", "\u062D\u062C\u0631", "\u0635\u062E\u0631\u0629", "\u062A\u0631\u0627\u0628", "\u0637\u064A\u0646", "\u0630\u0647\u0628", "\u0641\u0636\u0629", "\u062D\u062F\u064A\u062F", "\u0646\u062D\u0627\u0633", "\u062E\u0634\u0628", "\u0632\u062C\u0627\u062C", "\u0628\u0644\u0627\u0633\u062A\u064A\u0643", "\u0648\u0631\u0642", "\u0642\u0645\u0627\u0634", "\u062C\u0644\u062F"],
    dialect: "msa",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["nature", "science", "objects"]
  },
  {
    words: ["\u062C\u0632\u064A\u0631\u0629", "\u0643\u0647\u0641", "\u0634\u0644\u0627\u0644", "\u0628\u0631\u0643\u0627\u0646", "\u0632\u0644\u0632\u0627\u0644", "\u0625\u0639\u0635\u0627\u0631", "\u0645\u0648\u062C\u0629", "\u0639\u0627\u0635\u0641\u0629", "\u0648\u0627\u062D\u0629", "\u0647\u0636\u0628\u0629", "\u0633\u0647\u0644", "\u0633\u0627\u062D\u0644", "\u062E\u0644\u064A\u062C", "\u0645\u0633\u062A\u0646\u0642\u0639", "\u0646\u0628\u0639"],
    dialect: "msa",
    difficulty: 3,
    frequency: 2,
    partOfSpeech: "noun",
    categories: ["nature", "geography"]
  },
  /* -------------------------------------------------------- Transportation */
  {
    words: ["\u0633\u064A\u0627\u0631\u0629", "\u062D\u0627\u0641\u0644\u0629", "\u0642\u0637\u0627\u0631", "\u0637\u0627\u0626\u0631\u0629", "\u0633\u0641\u064A\u0646\u0629", "\u0642\u0627\u0631\u0628", "\u062F\u0631\u0627\u062C\u0629", "\u0634\u0627\u062D\u0646\u0629", "\u0633\u064A\u0627\u0631\u0629 \u0625\u0633\u0639\u0627\u0641", "\u0635\u0627\u0631\u0648\u062E", "\u0645\u062A\u0631\u0648", "\u062A\u0631\u0627\u0645", "\u0645\u0631\u0643\u0628", "\u0639\u0631\u0628\u0629", "\u0645\u0631\u0648\u062D\u064A\u0629"],
    dialect: "msa",
    difficulty: 1,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["transportation", "objects"]
  },
  {
    words: ["\u0639\u062C\u0644\u0629", "\u0645\u062D\u0631\u0643", "\u0648\u0642\u0648\u062F", "\u0637\u0631\u064A\u0642", "\u0625\u0634\u0627\u0631\u0629", "\u062E\u0631\u064A\u0637\u0629", "\u0628\u0648\u0635\u0644\u0629", "\u062A\u0630\u0643\u0631\u0629", "\u062D\u0642\u064A\u0628\u0629 \u0633\u0641\u0631", "\u062C\u0648\u0627\u0632 \u0633\u0641\u0631", "\u0631\u062D\u0644\u0629", "\u0633\u0627\u0626\u0642", "\u0631\u0627\u0643\u0628", "\u0631\u0635\u064A\u0641", "\u0645\u0631\u0622\u0628"],
    dialect: "msa",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["transportation", "everyday"]
  },
  /* ------------------------------------------------------------ Technology */
  {
    words: ["\u0647\u0627\u062A\u0641", "\u062D\u0627\u0633\u0648\u0628", "\u0634\u0627\u0634\u0629", "\u0644\u0648\u062D\u0629 \u0645\u0641\u0627\u062A\u064A\u062D", "\u0641\u0623\u0631\u0629", "\u0637\u0627\u0628\u0639\u0629", "\u0643\u0627\u0645\u064A\u0631\u0627", "\u062A\u0644\u0641\u0627\u0632", "\u0631\u0627\u062F\u064A\u0648", "\u0633\u0645\u0627\u0639\u0629", "\u0628\u0637\u0627\u0631\u064A\u0629", "\u0634\u0627\u062D\u0646", "\u0643\u0627\u0628\u0644", "\u0642\u0645\u0631 \u0635\u0646\u0627\u0639\u064A", "\u0631\u0648\u0628\u0648\u062A"],
    dialect: "msa",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["technology", "objects"]
  },
  {
    words: ["\u0625\u0646\u062A\u0631\u0646\u062A", "\u0645\u0648\u0642\u0639", "\u062A\u0637\u0628\u064A\u0642", "\u0628\u0631\u0646\u0627\u0645\u062C", "\u0634\u0628\u0643\u0629", "\u062E\u0627\u062F\u0645", "\u0645\u0644\u0641", "\u0631\u0633\u0627\u0644\u0629", "\u0628\u0631\u064A\u062F", "\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631", "\u062D\u0633\u0627\u0628", "\u0631\u0645\u0632", "\u0630\u0643\u0627\u0621 \u0627\u0635\u0637\u0646\u0627\u0639\u064A", "\u0644\u0639\u0628\u0629 \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629", "\u0634\u0631\u064A\u062D\u0629"],
    dialect: "msa",
    difficulty: 3,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["technology", "science"]
  },
  /* --------------------------------------------------------------- Science */
  {
    words: ["\u0639\u0644\u0645", "\u062A\u062C\u0631\u0628\u0629", "\u0645\u062E\u062A\u0628\u0631", "\u0645\u062C\u0647\u0631", "\u062A\u0644\u0633\u0643\u0648\u0628", "\u0643\u0648\u0643\u0628", "\u0645\u062C\u0631\u0629", "\u0641\u0636\u0627\u0621", "\u062C\u0627\u0630\u0628\u064A\u0629", "\u0637\u0627\u0642\u0629", "\u0643\u0647\u0631\u0628\u0627\u0621", "\u0645\u063A\u0646\u0627\u0637\u064A\u0633", "\u0636\u0648\u0621", "\u0635\u0648\u062A", "\u062D\u0631\u0627\u0631\u0629 \u0646\u0648\u0639\u064A\u0629"],
    dialect: "msa",
    difficulty: 3,
    frequency: 2,
    partOfSpeech: "noun",
    categories: ["science", "education"]
  },
  {
    words: ["\u0631\u064A\u0627\u0636\u064A\u0627\u062A", "\u0647\u0646\u062F\u0633\u0629", "\u0643\u064A\u0645\u064A\u0627\u0621", "\u0641\u064A\u0632\u064A\u0627\u0621", "\u0623\u062D\u064A\u0627\u0621", "\u062C\u063A\u0631\u0627\u0641\u064A\u0627", "\u062A\u0627\u0631\u064A\u062E", "\u0641\u0644\u0633\u0641\u0629", "\u0637\u0628", "\u062F\u0648\u0627\u0621", "\u0644\u0642\u0627\u062D", "\u062E\u0644\u064A\u0629", "\u062F\u0645\u0627\u063A", "\u0642\u0644\u0628", "\u0639\u0638\u0645"],
    dialect: "msa",
    difficulty: 3,
    frequency: 2,
    partOfSpeech: "noun",
    categories: ["science", "education"]
  },
  /* ----------------------------------------------------- People & work */
  {
    words: ["\u0637\u0628\u064A\u0628", "\u0645\u0639\u0644\u0645", "\u0645\u0647\u0646\u062F\u0633", "\u0645\u062D\u0627\u0645\u064A", "\u0634\u0631\u0637\u064A", "\u0625\u0637\u0641\u0627\u0626\u064A", "\u0645\u0645\u0631\u0636", "\u0635\u064A\u062F\u0644\u064A", "\u0646\u062C\u0627\u0631", "\u062D\u062F\u0627\u062F", "\u062E\u064A\u0627\u0637", "\u0641\u0644\u0627\u062D", "\u0635\u064A\u0627\u062F", "\u0628\u0627\u0626\u0639", "\u0645\u062D\u0627\u0633\u0628"],
    dialect: "msa",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["professions", "people"]
  },
  {
    words: ["\u0637\u064A\u0627\u0631", "\u0642\u0628\u0637\u0627\u0646", "\u062C\u0646\u062F\u064A", "\u0642\u0627\u0636", "\u0631\u0633\u0627\u0645", "\u0645\u0635\u0648\u0631", "\u0643\u0627\u062A\u0628", "\u0634\u0627\u0639\u0631", "\u0645\u0645\u062B\u0644", "\u0645\u063A\u0646\u064A", "\u0631\u0627\u0642\u0635", "\u0644\u0627\u0639\u0628", "\u0645\u062F\u0631\u0628", "\u062D\u0627\u0631\u0633", "\u0639\u0627\u0645\u0644"],
    dialect: "msa",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["professions", "people"]
  },
  {
    words: ["\u0623\u0628", "\u0623\u0645", "\u0627\u0628\u0646", "\u0628\u0646\u062A", "\u0623\u062E", "\u0623\u062E\u062A", "\u062C\u062F", "\u062C\u062F\u0629", "\u0639\u0645", "\u062E\u0627\u0644", "\u0635\u062F\u064A\u0642", "\u062C\u0627\u0631", "\u0636\u064A\u0641", "\u0637\u0641\u0644", "\u0634\u0627\u0628"],
    dialect: "msa",
    difficulty: 1,
    frequency: 5,
    partOfSpeech: "noun",
    categories: ["people", "everyday"]
  },
  {
    words: ["\u0645\u0644\u0643", "\u0645\u0644\u0643\u0629", "\u0623\u0645\u064A\u0631", "\u0631\u0626\u064A\u0633", "\u0648\u0632\u064A\u0631", "\u0633\u0641\u064A\u0631", "\u0639\u0627\u0644\u0645", "\u0645\u062E\u062A\u0631\u0639", "\u0645\u0633\u062A\u0643\u0634\u0641", "\u0628\u0637\u0644", "\u0633\u0627\u062D\u0631", "\u0642\u0631\u0635\u0627\u0646", "\u0641\u0627\u0631\u0633", "\u0644\u0635", "\u062C\u0627\u0633\u0648\u0633"],
    dialect: "msa",
    difficulty: 3,
    frequency: 2,
    partOfSpeech: "noun",
    categories: ["people", "history", "culture"]
  },
  /* ---------------------------------------------------------------- Sports */
  {
    words: ["\u0643\u0631\u0629", "\u0645\u0628\u0627\u0631\u0627\u0629", "\u0641\u0631\u064A\u0642", "\u0647\u062F\u0641", "\u0628\u0637\u0648\u0644\u0629", "\u0643\u0623\u0633", "\u0645\u064A\u062F\u0627\u0644\u064A\u0629", "\u0633\u0628\u0627\u0642", "\u0633\u0628\u0627\u062D\u0629", "\u062C\u0631\u064A", "\u0645\u0644\u0627\u0643\u0645\u0629", "\u0645\u0635\u0627\u0631\u0639\u0629", "\u062A\u0646\u0633", "\u0634\u0637\u0631\u0646\u062C", "\u062C\u0645\u0628\u0627\u0632"],
    dialect: "msa",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["sports", "entertainment"]
  },
  /* --------------------------------------------------------- Entertainment */
  {
    words: ["\u0641\u064A\u0644\u0645", "\u0645\u0633\u0644\u0633\u0644", "\u0645\u0633\u0631\u062D\u064A\u0629", "\u0623\u063A\u0646\u064A\u0629", "\u0645\u0648\u0633\u064A\u0642\u0649", "\u062D\u0641\u0644\u0629", "\u062C\u0627\u0626\u0632\u0629", "\u0628\u0637\u0627\u0642\u0629", "\u0644\u0639\u0628\u0629", "\u0644\u063A\u0632", "\u0646\u0643\u062A\u0629", "\u0642\u0635\u0629", "\u0631\u0648\u0627\u064A\u0629", "\u0645\u062C\u0644\u0629", "\u062C\u0631\u064A\u062F\u0629"],
    dialect: "msa",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["entertainment", "movies", "music", "culture"]
  },
  {
    words: ["\u0628\u064A\u0627\u0646\u0648", "\u062C\u064A\u062A\u0627\u0631", "\u0643\u0645\u0627\u0646", "\u0637\u0628\u0644\u0629", "\u0646\u0627\u064A", "\u0639\u0648\u062F", "\u0645\u0633\u0631\u062D \u063A\u0646\u0627\u0626\u064A", "\u0623\u0648\u0631\u0643\u0633\u062A\u0631\u0627", "\u0644\u062D\u0646", "\u0625\u064A\u0642\u0627\u0639", "\u0643\u0648\u0631\u0627\u0644", "\u0645\u063A\u0646\u064A\u0629", "\u0623\u0644\u0628\u0648\u0645", "\u0645\u0647\u0631\u062C\u0627\u0646", "\u0627\u0633\u062A\u0648\u062F\u064A\u0648"],
    dialect: "msa",
    difficulty: 3,
    frequency: 2,
    partOfSpeech: "noun",
    categories: ["music", "entertainment", "culture"]
  },
  /* ---------------------------------------------------- Clothes & the body */
  {
    words: ["\u0642\u0645\u064A\u0635", "\u0628\u0646\u0637\u0644\u0648\u0646", "\u0641\u0633\u062A\u0627\u0646", "\u062C\u0627\u0643\u064A\u062A", "\u0645\u0639\u0637\u0641", "\u062D\u0630\u0627\u0621", "\u062C\u0648\u0631\u0628", "\u0642\u0628\u0639\u0629", "\u0648\u0634\u0627\u062D", "\u062D\u0632\u0627\u0645", "\u0642\u0641\u0627\u0632", "\u0628\u062F\u0644\u0629", "\u062A\u0646\u0648\u0631\u0629", "\u0632\u0631", "\u062C\u064A\u0628"],
    dialect: "msa",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["objects", "everyday"]
  },
  {
    words: ["\u0631\u0623\u0633", "\u0639\u064A\u0646", "\u0623\u0630\u0646", "\u0623\u0646\u0641", "\u0641\u0645", "\u064A\u062F", "\u0642\u062F\u0645", "\u0625\u0635\u0628\u0639", "\u0634\u0639\u0631", "\u0633\u0646", "\u0644\u0633\u0627\u0646", "\u0643\u062A\u0641", "\u0631\u0643\u0628\u0629", "\u0638\u0647\u0631", "\u0648\u062C\u0647"],
    dialect: "msa",
    difficulty: 1,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["people", "science", "everyday"]
  },
  /* -------------------------------------------------------- Abstract nouns */
  {
    words: ["\u062D\u0628", "\u062E\u0648\u0641", "\u0641\u0631\u062D", "\u062D\u0632\u0646", "\u063A\u0636\u0628", "\u0623\u0645\u0644", "\u062D\u0644\u0645", "\u0630\u0643\u0631\u0649", "\u0633\u0631", "\u062D\u0642\u064A\u0642\u0629", "\u0643\u0630\u0628", "\u0635\u062F\u0627\u0642\u0629", "\u0634\u062C\u0627\u0639\u0629", "\u0635\u0628\u0631", "\u0633\u0644\u0627\u0645"],
    dialect: "msa",
    difficulty: 3,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["abstract", "emotions"]
  },
  {
    words: ["\u0648\u0642\u062A", "\u064A\u0648\u0645", "\u0644\u064A\u0644", "\u0635\u0628\u0627\u062D", "\u0634\u0647\u0631", "\u0633\u0646\u0629", "\u0641\u0635\u0644", "\u0639\u064A\u062F", "\u0645\u0648\u0639\u062F", "\u0628\u062F\u0627\u064A\u0629", "\u0646\u0647\u0627\u064A\u0629", "\u0641\u0631\u0635\u0629", "\u062E\u0637\u0629", "\u0641\u0643\u0631\u0629", "\u0633\u0624\u0627\u0644"],
    dialect: "msa",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["abstract", "everyday"]
  },
  {
    words: ["\u0644\u0648\u0646", "\u0634\u0643\u0644", "\u062D\u062C\u0645", "\u0631\u0642\u0645", "\u062D\u0631\u0641", "\u0643\u0644\u0645\u0629", "\u062C\u0645\u0644\u0629", "\u0644\u063A\u0629", "\u0635\u0648\u0631\u0629", "\u0635\u0648\u062A \u0639\u0627\u0644", "\u0631\u0627\u0626\u062D\u0629", "\u0637\u0639\u0645", "\u0644\u0645\u0633\u0629", "\u0645\u0633\u0627\u0641\u0629", "\u0648\u0632\u0646"],
    dialect: "msa",
    difficulty: 3,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["abstract", "education"]
  },
  /* ---------------------------------------------------- Gaming & internet */
  {
    words: ["\u0648\u062D\u0634", "\u0628\u0637\u0644 \u062E\u0627\u0631\u0642", "\u062E\u0631\u064A\u0637\u0629 \u0644\u0639\u0628\u0629", "\u0645\u0633\u062A\u0648\u0649", "\u0646\u0642\u0637\u0629", "\u062C\u0627\u0626\u0632\u0629 \u0643\u0628\u0631\u0649", "\u0643\u0646\u0632", "\u0633\u064A\u0641", "\u062F\u0631\u0639", "\u0642\u0644\u0639\u0629 \u0644\u0639\u0628\u0629", "\u0645\u063A\u0627\u0645\u0631\u0629", "\u0633\u0628\u0627\u0642 \u0633\u064A\u0627\u0631\u0627\u062A", "\u0628\u0637\u0627\u0642\u0629 \u0644\u0639\u0628", "\u0646\u0631\u062F", "\u062F\u0648\u0645\u064A\u0646\u0648"],
    dialect: "general",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["gaming", "entertainment", "general"]
  },
  /* ------------------------------------------------------- Egyptian flavour */
  {
    words: ["\u0647\u0631\u0645", "\u0623\u0628\u0648 \u0627\u0644\u0647\u0648\u0644", "\u0646\u064A\u0644", "\u0641\u0644\u0648\u0643\u0629", "\u062E\u0627\u0646 \u0627\u0644\u062E\u0644\u064A\u0644\u064A", "\u062A\u0648\u0643 \u062A\u0648\u0643", "\u0645\u064A\u0643\u0631\u0648\u0628\u0627\u0635", "\u0639\u0645\u0627\u0631\u0629", "\u0628\u0644\u0643\u0648\u0646\u0629", "\u0633\u0628\u0648\u0639", "\u0645\u0648\u0644\u062F", "\u0641\u0627\u0646\u0648\u0633", "\u0634\u0628\u0634\u0628", "\u062C\u0644\u0627\u0628\u064A\u0629", "\u0637\u0631\u062D\u0629"],
    dialect: "egyptian",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["egyptianCulture", "arabicCulture", "culture", "places"]
  }
];

// ../shared/src/words/data/english.ts
var ENGLISH_SEEDS = [
  /* ------------------------------------------------------------------ Food */
  {
    words: ["bread", "cheese", "butter", "milk", "egg", "honey", "sugar", "salt", "pepper", "oil", "flour", "rice", "pasta", "soup", "salad", "sandwich", "cake", "chocolate", "pizza", "burger"],
    dialect: "general",
    difficulty: 1,
    frequency: 5,
    partOfSpeech: "noun",
    categories: ["food", "everyday", "general"]
  },
  {
    words: ["apple", "banana", "orange", "grape", "melon", "peach", "cherry", "lemon", "mango", "strawberry", "pineapple", "coconut", "pear", "plum", "date"],
    dialect: "general",
    difficulty: 1,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["food", "nature"]
  },
  {
    words: ["tomato", "potato", "onion", "garlic", "carrot", "cucumber", "pumpkin", "spinach", "lettuce", "bean", "corn", "olive", "mushroom", "ginger", "chili"],
    dialect: "general",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["food", "nature"]
  },
  {
    words: ["tea", "coffee", "juice", "water", "restaurant", "kitchen", "recipe", "menu", "breakfast", "dinner", "dessert", "bakery", "chef", "waiter", "market"],
    dialect: "general",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["food", "everyday", "places"]
  },
  /* --------------------------------------------------------------- Animals */
  {
    words: ["cat", "dog", "horse", "donkey", "camel", "cow", "sheep", "goat", "chicken", "duck", "rabbit", "mouse", "pig", "bull", "deer"],
    dialect: "general",
    difficulty: 1,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["animals", "nature"]
  },
  {
    words: ["lion", "tiger", "leopard", "wolf", "fox", "bear", "elephant", "giraffe", "monkey", "crocodile", "snake", "turtle", "frog", "bat", "zebra"],
    dialect: "general",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["animals", "nature"]
  },
  {
    words: ["eagle", "falcon", "owl", "pigeon", "sparrow", "parrot", "seagull", "peacock", "crow", "swan", "penguin", "ostrich", "flamingo", "rooster", "hawk"],
    dialect: "general",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["animals", "nature"]
  },
  {
    words: ["fish", "shark", "whale", "dolphin", "octopus", "crab", "bee", "ant", "butterfly", "spider", "fly", "mosquito", "worm", "snail", "jellyfish"],
    dialect: "general",
    difficulty: 3,
    frequency: 2,
    partOfSpeech: "noun",
    categories: ["animals", "nature"]
  },
  /* --------------------------------------------------------------- Objects */
  {
    words: ["book", "pen", "paper", "notebook", "key", "door", "window", "chair", "table", "bed", "mirror", "clock", "lamp", "candle", "basket"],
    dialect: "general",
    difficulty: 1,
    frequency: 5,
    partOfSpeech: "noun",
    categories: ["objects", "everyday"]
  },
  {
    words: ["bag", "wallet", "umbrella", "glasses", "ring", "necklace", "bracelet", "comb", "brush", "soap", "towel", "pillow", "blanket", "curtain", "carpet"],
    dialect: "general",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["objects", "everyday"]
  },
  {
    words: ["knife", "spoon", "fork", "plate", "cup", "bottle", "pot", "pan", "scissors", "needle", "rope", "ladder", "hammer", "nail", "screw"],
    dialect: "general",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["objects", "everyday"]
  },
  {
    words: ["box", "jar", "bucket", "broom", "fan", "fridge", "oven", "washer", "kettle", "scale", "lock", "ruler", "hanger", "battery", "switch"],
    dialect: "general",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["objects", "everyday"]
  },
  /* ---------------------------------------------------------------- Places */
  {
    words: ["house", "school", "university", "library", "hospital", "pharmacy", "shop", "bank", "airport", "station", "port", "hotel", "museum", "theatre", "stadium"],
    dialect: "general",
    difficulty: 1,
    frequency: 5,
    partOfSpeech: "noun",
    categories: ["places", "buildings"]
  },
  {
    words: ["garden", "park", "beach", "farm", "factory", "office", "village", "city", "street", "square", "bridge", "tunnel", "tower", "castle", "palace"],
    dialect: "general",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["places", "buildings", "geography"]
  },
  {
    words: ["church", "mosque", "temple", "prison", "bathroom", "bedroom", "balcony", "roof", "basement", "garage", "warehouse", "cabin", "tent", "lighthouse", "zoo"],
    dialect: "general",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["places", "buildings"]
  },
  /* ---------------------------------------------------------------- Nature */
  {
    words: ["sun", "moon", "star", "sky", "cloud", "rain", "snow", "wind", "lightning", "thunder", "rainbow", "fog", "shadow", "fire", "ice"],
    dialect: "general",
    difficulty: 1,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["nature", "science"]
  },
  {
    words: ["sea", "river", "lake", "ocean", "mountain", "valley", "desert", "forest", "tree", "flower", "leaf", "grass", "root", "seed", "fruit"],
    dialect: "general",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["nature", "geography"]
  },
  {
    words: ["sand", "stone", "rock", "soil", "clay", "gold", "silver", "iron", "copper", "wood", "glass", "plastic", "cloth", "leather", "rubber"],
    dialect: "general",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["nature", "science", "objects"]
  },
  {
    words: ["island", "cave", "waterfall", "volcano", "earthquake", "storm", "wave", "oasis", "canyon", "glacier", "swamp", "spring", "cliff", "shore", "reef"],
    dialect: "general",
    difficulty: 3,
    frequency: 2,
    partOfSpeech: "noun",
    categories: ["nature", "geography"]
  },
  /* -------------------------------------------------------- Transportation */
  {
    words: ["car", "bus", "train", "plane", "ship", "boat", "bicycle", "truck", "ambulance", "rocket", "subway", "tram", "helicopter", "scooter", "wagon"],
    dialect: "general",
    difficulty: 1,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["transportation", "objects"]
  },
  {
    words: ["wheel", "engine", "fuel", "road", "signal", "map", "compass", "ticket", "suitcase", "passport", "journey", "driver", "passenger", "sidewalk", "harbor"],
    dialect: "general",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["transportation", "everyday"]
  },
  /* ------------------------------------------------------------ Technology */
  {
    words: ["phone", "computer", "screen", "keyboard", "printer", "camera", "television", "radio", "speaker", "charger", "cable", "satellite", "robot", "drone", "laptop"],
    dialect: "general",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["technology", "objects"]
  },
  {
    words: ["internet", "website", "application", "program", "network", "server", "file", "message", "email", "password", "account", "code", "chip", "sensor", "algorithm"],
    dialect: "general",
    difficulty: 3,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["technology", "science"]
  },
  /* --------------------------------------------------------------- Science */
  {
    words: ["science", "experiment", "laboratory", "microscope", "telescope", "planet", "galaxy", "space", "gravity", "energy", "electricity", "magnet", "light", "sound", "atom"],
    dialect: "general",
    difficulty: 3,
    frequency: 2,
    partOfSpeech: "noun",
    categories: ["science", "education"]
  },
  {
    words: ["mathematics", "geometry", "chemistry", "physics", "biology", "geography", "history", "philosophy", "medicine", "vaccine", "cell", "brain", "heart", "bone", "blood"],
    dialect: "general",
    difficulty: 3,
    frequency: 2,
    partOfSpeech: "noun",
    categories: ["science", "education"]
  },
  /* ---------------------------------------------------------- People & work */
  {
    words: ["doctor", "teacher", "engineer", "lawyer", "police", "firefighter", "nurse", "pharmacist", "carpenter", "blacksmith", "tailor", "farmer", "fisherman", "seller", "accountant"],
    dialect: "general",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["professions", "people"]
  },
  {
    words: ["pilot", "captain", "soldier", "judge", "painter", "photographer", "writer", "poet", "actor", "singer", "dancer", "player", "coach", "guard", "worker"],
    dialect: "general",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["professions", "people"]
  },
  {
    words: ["father", "mother", "son", "daughter", "brother", "sister", "grandfather", "grandmother", "uncle", "aunt", "friend", "neighbor", "guest", "child", "baby"],
    dialect: "general",
    difficulty: 1,
    frequency: 5,
    partOfSpeech: "noun",
    categories: ["people", "everyday"]
  },
  {
    words: ["king", "queen", "prince", "president", "minister", "ambassador", "scientist", "inventor", "explorer", "hero", "wizard", "pirate", "knight", "thief", "spy"],
    dialect: "general",
    difficulty: 3,
    frequency: 2,
    partOfSpeech: "noun",
    categories: ["people", "history", "culture"]
  },
  /* ---------------------------------------------------------------- Sports */
  {
    words: ["ball", "match", "team", "goal", "championship", "trophy", "medal", "race", "swimming", "boxing", "wrestling", "tennis", "chess", "gymnastics", "marathon"],
    dialect: "general",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["sports", "entertainment"]
  },
  /* --------------------------------------------------------- Entertainment */
  {
    words: ["film", "series", "play", "song", "music", "party", "prize", "card", "game", "puzzle", "joke", "story", "novel", "magazine", "newspaper"],
    dialect: "general",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["entertainment", "movies", "music", "culture"]
  },
  {
    words: ["piano", "guitar", "violin", "drum", "flute", "trumpet", "orchestra", "melody", "rhythm", "choir", "album", "festival", "studio", "stage", "concert"],
    dialect: "general",
    difficulty: 3,
    frequency: 2,
    partOfSpeech: "noun",
    categories: ["music", "entertainment", "culture"]
  },
  /* ---------------------------------------------------- Gaming & internet */
  {
    words: ["monster", "dragon", "level", "point", "treasure", "sword", "shield", "quest", "adventure", "dice", "domino", "joystick", "console", "avatar", "checkpoint"],
    dialect: "general",
    difficulty: 2,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["gaming", "entertainment", "general"]
  },
  /* ---------------------------------------------------- Clothes & the body */
  {
    words: ["shirt", "trousers", "dress", "jacket", "coat", "shoe", "sock", "hat", "scarf", "belt", "glove", "suit", "skirt", "button", "pocket"],
    dialect: "general",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["objects", "everyday"]
  },
  {
    words: ["head", "eye", "ear", "nose", "mouth", "hand", "foot", "finger", "hair", "tooth", "tongue", "shoulder", "knee", "back", "face"],
    dialect: "general",
    difficulty: 1,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["people", "science", "everyday"]
  },
  /* -------------------------------------------------------- Abstract nouns */
  {
    words: ["love", "fear", "joy", "sadness", "anger", "hope", "dream", "memory", "secret", "truth", "lie", "friendship", "courage", "patience", "peace"],
    dialect: "general",
    difficulty: 3,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["abstract", "emotions"]
  },
  {
    words: ["time", "day", "night", "morning", "month", "year", "season", "holiday", "appointment", "beginning", "chance", "plan", "idea", "question", "answer"],
    dialect: "general",
    difficulty: 2,
    frequency: 4,
    partOfSpeech: "noun",
    categories: ["abstract", "everyday"]
  },
  {
    words: ["color", "shape", "size", "number", "letter", "word", "sentence", "language", "picture", "noise", "smell", "taste", "touch", "distance", "weight"],
    dialect: "general",
    difficulty: 3,
    frequency: 3,
    partOfSpeech: "noun",
    categories: ["abstract", "education"]
  }
];

// ../shared/src/words/library.ts
var WORD_LIBRARY_UPDATED_AT = "2026-08-23";
var MAX_BOARD_WORD_LENGTH = 22;
var MAX_BOARD_WORD_TOKENS = 2;
var VERB_BLOCKLIST = {
  ar: [
    "\u064A\u0643\u062A\u0628",
    "\u064A\u0642\u0631\u0627",
    "\u064A\u0642\u0631\u0623",
    "\u064A\u0644\u0639\u0628",
    "\u064A\u0627\u0643\u0644",
    "\u064A\u0623\u0643\u0644",
    "\u064A\u0634\u0631\u0628",
    "\u064A\u0646\u0627\u0645",
    "\u064A\u062C\u0631\u064A",
    "\u064A\u0645\u0634\u064A",
    "\u064A\u0636\u062D\u0643",
    "\u064A\u0628\u0643\u064A",
    "\u064A\u0641\u0643\u0631",
    "\u064A\u062A\u0643\u0644\u0645",
    "\u064A\u0633\u0645\u0639",
    "\u064A\u0634\u0648\u0641",
    "\u064A\u0631\u0649",
    "\u064A\u0641\u062A\u062D",
    "\u064A\u0642\u0641\u0644",
    "\u064A\u0643\u0633\u0631",
    "\u064A\u0628\u0646\u064A",
    "\u064A\u0634\u062A\u0631\u064A",
    "\u064A\u0628\u064A\u0639",
    "\u064A\u062F\u0641\u0639",
    "\u064A\u0633\u0627\u0641\u0631",
    "\u064A\u0631\u062C\u0639",
    "\u064A\u062E\u0631\u062C",
    "\u064A\u062F\u062E\u0644",
    "\u064A\u0642\u0641",
    "\u064A\u062C\u0644\u0633",
    "\u0643\u062A\u0628",
    "\u0642\u0631\u0623",
    "\u0644\u0639\u0628",
    "\u0623\u0643\u0644",
    "\u0634\u0631\u0628",
    "\u0646\u0627\u0645",
    "\u0636\u062D\u0643",
    "\u0628\u0643\u0649",
    "\u0641\u0643\u0631",
    "\u062A\u0643\u0644\u0645",
    "\u0633\u0645\u0639",
    "\u0631\u0623\u0649",
    "\u0641\u062A\u062D",
    "\u0643\u0633\u0631",
    "\u0628\u0646\u0649",
    "\u0627\u0634\u062A\u0631\u0649",
    "\u0628\u0627\u0639",
    "\u062F\u0641\u0639",
    "\u0633\u0627\u0641\u0631",
    "\u0631\u062C\u0639"
  ],
  // Only UNAMBIGUOUS verbs: "fly", "play", "watch", "drive", "dance" and
  // friends are perfectly good nouns and must stay playable.
  en: [
    "eat",
    "sleep",
    "write",
    "jump",
    "swim",
    "laugh",
    "speak",
    "listen",
    "buy",
    "sell",
    "travel",
    "enter",
    "teach",
    "learn",
    "give",
    "take",
    "become",
    "forget",
    "remember",
    "believe",
    "choose",
    "decide",
    "happen",
    "prefer",
    "arrive",
    "explain",
    "discuss",
    "suggest",
    "improve",
    "destroy"
  ]
};
var VERB_SETS = {
  ar: new Set(VERB_BLOCKLIST.ar.map((word) => normalizeWord(word, "ar"))),
  en: new Set(VERB_BLOCKLIST.en.map((word) => normalizeWord(word, "en")))
};
function validateBoardWord(displayForm, language, known) {
  const trimmed = displayForm.trim().replace(/\s+/g, " ");
  if (!trimmed) return { ok: false, reason: "EMPTY" };
  if (trimmed.length > MAX_BOARD_WORD_LENGTH) return { ok: false, reason: "TOO_LONG" };
  const tokens = trimmed.split(" ");
  if (tokens.length > MAX_BOARD_WORD_TOKENS) return { ok: false, reason: "TOO_MANY_WORDS" };
  if (!/^[\p{L}\u064B-\u0652\u0670\u0640 ]+$/u.test(trimmed)) {
    return { ok: false, reason: "BAD_CHARACTERS" };
  }
  const normalizedForm = normalizeWord(trimmed, language);
  if (!normalizedForm) return { ok: false, reason: "EMPTY" };
  if (normalizedForm.length < 2) return { ok: false, reason: "TOO_SHORT" };
  if (VERB_SETS[language].has(normalizedForm)) return { ok: false, reason: "NOT_A_NOUN" };
  if (language === "en" && /^to\s/iu.test(trimmed)) return { ok: false, reason: "NOT_A_NOUN" };
  if (known?.has(normalizedForm)) return { ok: false, reason: "DUPLICATE" };
  return { ok: true, normalizedForm };
}
var SEEDS = {
  ar: ARABIC_SEEDS,
  en: ENGLISH_SEEDS
};
function buildLibrary() {
  const words = [];
  const seenByLanguage = /* @__PURE__ */ new Map();
  for (const lang of ["ar", "en"]) {
    const seen = /* @__PURE__ */ new Set();
    seenByLanguage.set(lang, seen);
    for (const seed of SEEDS[lang]) {
      for (const displayForm of seed.words) {
        const check = validateBoardWord(displayForm, lang, seen);
        if (!check.ok) {
          throw new Error(`Rejected library word "${displayForm}" (${lang}): ${check.reason}`);
        }
        const { normalizedForm } = check;
        seen.add(normalizedForm);
        words.push({
          id: `${lang}:${normalizedForm}`,
          displayForm,
          normalizedForm,
          language: lang,
          dialect: seed.dialect,
          categories: [...seed.categories],
          difficulty: seed.difficulty,
          frequency: seed.frequency,
          partOfSpeech: seed.partOfSpeech ?? null,
          aliases: [normalizedForm, displayForm],
          safeForKids: true,
          approved: true,
          enabled: true,
          createdAt: WORD_LIBRARY_UPDATED_AT,
          updatedAt: WORD_LIBRARY_UPDATED_AT
        });
      }
    }
  }
  return words;
}
var WORD_LIBRARY = buildLibrary();
function wordsForLanguage(language) {
  return WORD_LIBRARY.filter((word) => word.language === language && word.enabled && word.approved);
}

// ../shared/src/game/timings.ts
var PLAYER_EFFECT_COOLDOWN = 700;

// ../shared/src/chat/chat.ts
var CHAT_MAX_LENGTH = 200;
var CHAT_MAX_MESSAGES = 200;
var CHAT_WINDOW_MS = 1e4;
var CHAT_MAX_PER_WINDOW = 6;

// ../shared/src/profile/profile.ts
var EMPTY_STATS = {
  games: 0,
  wins: 0,
  winAsCaptain: 0,
  winAsOperative: 0,
  cluesGiven: 0,
  correctGuesses: 0,
  assassinTouched: 0
};
var ACHIEVEMENT_DEFS = [
  { id: "firstGame", icon: "\u{1F3AE}", metric: "games", target: 1 },
  { id: "firstWin", icon: "\u{1F3C6}", metric: "wins", target: 1 },
  { id: "winCaptain", icon: "\u{1F451}", metric: "winAsCaptain", target: 1 },
  { id: "winOperative", icon: "\u{1F575}\uFE0F", metric: "winAsOperative", target: 1 },
  { id: "clueMaster", icon: "\u{1F4A1}", metric: "cluesGiven", target: 10 },
  { id: "hawkEye", icon: "\u{1F985}", metric: "correctGuesses", target: 25 },
  { id: "touchedDarkness", icon: "\u{1F311}", metric: "assassinTouched", target: 1 },
  { id: "veteran", icon: "\u{1F396}\uFE0F", metric: "games", target: 10 }
];
function computeAchievements(stats) {
  return ACHIEVEMENT_DEFS.map((def) => {
    const progress = def.metric ? stats[def.metric] : 0;
    const target = def.target ?? null;
    return {
      id: def.id,
      icon: def.icon,
      unlocked: target !== null && progress >= target,
      progress,
      target
    };
  });
}
function mergeStats(base, delta) {
  const merged = { ...base };
  for (const key of Object.keys(delta)) {
    const value = delta[key] ?? 0;
    merged[key] = Math.max(0, merged[key] + value);
  }
  return merged;
}

// ../shared/src/words/packs.ts
function topic(lang, key, category, extraCategories = []) {
  return {
    id: `${lang}-${key}`,
    language: lang,
    nameKey: key,
    categories: [category, ...extraCategories]
  };
}
var WORD_PACKS = [
  { id: "ar-general", language: "ar", nameKey: "general" },
  { id: "ar-msa", language: "ar", nameKey: "msa", dialects: ["msa"] },
  { id: "ar-egyptian", language: "ar", nameKey: "egyptian", dialects: ["egyptian"] },
  { id: "ar-easy", language: "ar", nameKey: "easy", maxDifficulty: 1 },
  { id: "ar-medium", language: "ar", nameKey: "medium", maxDifficulty: 2 },
  { id: "ar-hard", language: "ar", nameKey: "hard", maxDifficulty: 3 },
  topic("ar", "food", "food"),
  topic("ar", "animals", "animals"),
  topic("ar", "nature", "nature", ["geography"]),
  topic("ar", "sports", "sports"),
  topic("ar", "technology", "technology"),
  topic("ar", "science", "science"),
  topic("ar", "movies", "movies", ["music"]),
  topic("ar", "music", "music"),
  topic("ar", "history", "history"),
  topic("ar", "geography", "geography"),
  topic("ar", "gaming", "gaming"),
  { id: "ar-random", language: "ar", nameKey: "random" },
  { id: "en-general", language: "en", nameKey: "general" },
  { id: "en-easy", language: "en", nameKey: "easy", maxDifficulty: 1 },
  { id: "en-medium", language: "en", nameKey: "medium", maxDifficulty: 2 },
  { id: "en-hard", language: "en", nameKey: "hard", maxDifficulty: 3 },
  topic("en", "food", "food"),
  topic("en", "animals", "animals"),
  topic("en", "nature", "nature", ["geography"]),
  topic("en", "sports", "sports"),
  topic("en", "technology", "technology"),
  topic("en", "science", "science"),
  topic("en", "movies", "movies", ["music"]),
  topic("en", "music", "music"),
  topic("en", "history", "history"),
  topic("en", "geography", "geography"),
  topic("en", "gaming", "gaming"),
  { id: "en-random", language: "en", nameKey: "random" }
];
function getPack(id) {
  const pack = WORD_PACKS.find((candidate) => candidate.id === id);
  if (!pack) throw new Error(`Unknown word pack: ${id}`);
  return pack;
}
function wordMatchesPack(word, pack) {
  if (word.language !== pack.language) return false;
  if (pack.dialects && !pack.dialects.includes(word.dialect)) return false;
  if (pack.maxDifficulty && word.difficulty > pack.maxDifficulty) return false;
  if (pack.categories && !pack.categories.some((category) => word.categories.includes(category))) {
    return false;
  }
  return true;
}

// ../shared/src/words/generator.ts
function generateWords(options) {
  const { language, packId, count = 25, rng = Math.random } = options;
  const pack = packId ? getPack(packId) : getPack(language === "ar" ? "ar-general" : "en-general");
  if (pack.language !== language) {
    throw new Error(`Pack ${pack.id} does not match language ${language}`);
  }
  const disabledSet = new Set(options.disabled ?? []);
  const pool = shuffle(
    wordsForLanguage(language).filter((word) => !disabledSet.has(word.normalizedForm)),
    rng
  );
  const strict = pool.filter((word) => wordMatchesPack(word, pack));
  const pad = pool.filter((word) => !wordMatchesPack(word, pack));
  const categoryBudget = Math.max(2, Math.ceil(count / 5));
  const picked = [];
  const usedNormalized = /* @__PURE__ */ new Set();
  const categoryCounts = /* @__PURE__ */ new Map();
  const take = (word) => {
    picked.push(word);
    usedNormalized.add(word.normalizedForm);
    for (const category of word.categories) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
  };
  for (const display of options.extraWords ?? []) {
    if (picked.length >= count) break;
    const trimmed = display.trim();
    if (!trimmed) continue;
    const normalized = normalizeWord(trimmed, language);
    if (!normalized || usedNormalized.has(normalized)) continue;
    take({
      id: `custom:${normalized}`,
      displayForm: trimmed,
      normalizedForm: normalized,
      language,
      dialect: "general",
      categories: ["general"],
      difficulty: 2,
      frequency: 3,
      partOfSpeech: null,
      aliases: [trimmed],
      safeForKids: true,
      approved: true,
      enabled: true,
      createdAt: "",
      updatedAt: ""
    });
  }
  for (const word of strict) {
    if (picked.length >= count) break;
    if (usedNormalized.has(word.normalizedForm)) continue;
    const overloaded = word.categories.some(
      (category) => category !== "general" && (categoryCounts.get(category) ?? 0) >= categoryBudget
    );
    if (overloaded) continue;
    take(word);
  }
  if (picked.length < count) {
    for (const word of strict) {
      if (picked.length >= count) break;
      if (usedNormalized.has(word.normalizedForm)) continue;
      take(word);
    }
  }
  if (picked.length < count) {
    for (const word of pad) {
      if (picked.length >= count) break;
      if (usedNormalized.has(word.normalizedForm)) continue;
      take(word);
    }
  }
  return picked.map((word) => word.displayForm);
}

// src/rooms.ts
import { z } from "zod";
var ROOM_PERMISSIONS = [
  "KICK_PLAYERS",
  "MOVE_PLAYERS",
  "CHANGE_ROLES",
  "CHANGE_TEAMS",
  "LOCK_ROLES",
  "LOCK_TEAMS",
  "START_GAME",
  "MANAGE_ROOM",
  "TRANSFER_OWNERSHIP"
];
var DEFAULT_MODERATOR_PERMISSIONS = [
  "KICK_PLAYERS",
  "MOVE_PLAYERS",
  "CHANGE_ROLES",
  "CHANGE_TEAMS"
];
var RoomError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "RoomError";
  }
};
var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
var MAX_PLAYERS = 12;
var ROOM_TTL_MS = 12 * 60 * 60 * 1e3;
var nameSchema = z.string().trim().min(1).max(24);
var codeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{4}$/);
var languageSchema = z.custom((v) => isLang(v));
var packSchema = z.custom((v) => typeof v === "string" && !!v);
var teamSchema = z.enum(["red", "blue"]).nullable();
var roleSchema = z.enum(["captain", "operative", "spectator"]);
var createRoomSchema = z.object({
  name: nameSchema.default("Game room"),
  playerName: nameSchema,
  language: languageSchema,
  packId: packSchema,
  accountToken: z.string().max(128).optional()
});
var joinRoomSchema = z.object({
  code: codeSchema,
  playerName: nameSchema,
  accountToken: z.string().max(128).optional()
});
var activityRoomSchema = z.object({
  instanceId: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9:_-]+$/),
  channelId: z.string().trim().max(40).optional().nullable(),
  guildId: z.string().trim().max(40).optional().nullable(),
  playerName: nameSchema,
  accountToken: z.string().min(1).max(128),
  language: z.enum(["ar", "en"]).default("ar"),
  packId: z.string().max(64).optional()
});
var updatePlayerSchema = z.object({
  team: teamSchema.optional(),
  role: roleSchema.optional(),
  ready: z.boolean().optional()
}).refine((v) => v.team !== void 0 || v.role !== void 0 || v.ready !== void 0, {
  message: "empty patch"
});
function randomCode() {
  let code = "";
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}
var RoomStore = class {
  rooms = /* @__PURE__ */ new Map();
  authStore = null;
  adminStore = null;
  /** Link an auth store so registered players get their profile snapshots. */
  setAuthStore(authStore2) {
    this.authStore = authStore2;
  }
  /** Link the admin store so banned accounts are rejected at the door. */
  setAdminStore(adminStore2) {
    this.adminStore = adminStore2;
  }
  /** True when a resolved account is banned (never exposes the account id). */
  accountBanned(accountId) {
    return this.adminStore?.isBanned(accountId) === true;
  }
  resolveAccount(accountToken) {
    if (!accountToken || !this.authStore) return {};
    const user = this.authStore.me(accountToken);
    if (!user) return {};
    return { accountId: user.id, avatar: user.avatar, accountName: user.name };
  }
  /** Internal: player id → account id (never exposed in the public room). */
  accountIds = /* @__PURE__ */ new Map();
  // Discord Activity instance id → Clue Me room code.
  activityRooms = /* @__PURE__ */ new Map();
  setAccountId(playerId, accountId) {
    if (accountId) this.accountIds.set(playerId, accountId);
  }
  accountIdOf(playerId) {
    return this.accountIds.get(playerId) ?? null;
  }
  sweep() {
    const cutoff = Date.now() - ROOM_TTL_MS;
    for (const [code, room] of this.rooms) {
      if (new Date(room.updatedAt).getTime() < cutoff) this.rooms.delete(code);
    }
    for (const [instanceId, code] of this.activityRooms) {
      if (!this.rooms.has(code)) this.activityRooms.delete(instanceId);
    }
  }
  create(input) {
    const { accountId, avatar, accountName } = this.resolveAccount(input.accountToken);
    if (accountId && this.accountBanned(accountId)) {
      throw new RoomError("ACCOUNT_BANNED", "This account is banned");
    }
    const language = input.language;
    const pack = getPack(input.packId);
    if (pack.language !== language) {
      throw new RoomError("INVALID_PACK", "Pack does not match language");
    }
    this.sweep();
    let code = randomCode();
    while (this.rooms.has(code)) code = randomCode();
    const playerId = crypto.randomUUID();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const room = {
      code,
      name: input.name,
      language,
      packId: pack.id,
      status: "waiting",
      ownerId: playerId,
      hostId: playerId,
      locks: { teams: { red: false, blue: false }, roles: { captain: false, operative: false } },
      maxPlayers: MAX_PLAYERS,
      players: [
        {
          id: playerId,
          name: accountName ?? input.playerName,
          team: null,
          role: "captain",
          ready: false,
          isHost: true,
          permissions: [],
          joinedAt: now,
          avatar
        }
      ],
      createdAt: now,
      updatedAt: now
    };
    this.setAccountId(playerId, accountId);
    this.rooms.set(code, room);
    return { room, playerId };
  }
  join(code, playerName, accountToken) {
    const { accountId, avatar, accountName } = this.resolveAccount(accountToken);
    if (accountId && this.accountBanned(accountId)) {
      throw new RoomError("ACCOUNT_BANNED", "This account is banned");
    }
    this.sweep();
    const room = this.rooms.get(code);
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "Room not found");
    const canonicalName = accountName ?? playerName;
    const restrictedUntil = this.restrictionFor(room, accountId, canonicalName);
    if (restrictedUntil) {
      throw new RoomError("KICK_RESTRICTED", `Kicked from this room until ${new Date(restrictedUntil).toISOString()}`);
    }
    // One authenticated Discord/site account represents one room player, even
    // when the same account opens the room from multiple browsers or devices.
    if (accountId) {
      const matches = room.players.filter((candidate) => this.accountIdOf(candidate.id) === accountId);
      if (matches.length > 0) {
        const primary = matches.find((candidate) => candidate.id === room.ownerId) ?? matches.sort(
          (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
        )[0];
        const duplicateIds = new Set(matches.filter((candidate) => candidate.id !== primary.id).map((candidate) => candidate.id));
        if (duplicateIds.size > 0) {
          room.players = room.players.filter((candidate) => !duplicateIds.has(candidate.id));
          for (const duplicateId of duplicateIds) this.accountIds.delete(duplicateId);
        }
        primary.name = canonicalName;
        if (avatar) primary.avatar = avatar;
        this.setAccountId(primary.id, accountId);
        room.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        return { room, playerId: primary.id, reused: true, playerName: primary.name };
      }
    }
    if (room.players.length >= room.maxPlayers) throw new RoomError("ROOM_FULL", "Room is full");
    const late = room.status === "playing";
    const playerId = crypto.randomUUID();
    room.players.push({
      id: playerId,
      name: canonicalName,
      team: null,
      role: late ? "spectator" : "operative",
      ready: false,
      isHost: false,
      permissions: [],
      joinedAt: (/* @__PURE__ */ new Date()).toISOString(),
      avatar
    });
    this.setAccountId(playerId, accountId);
    room.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return { room, playerId, reused: false, playerName: canonicalName };
  }
  joinActivity(input) {
    const existingCode = this.activityRooms.get(input.instanceId);
    if (existingCode && this.rooms.has(existingCode)) {
      const joined = this.join(existingCode, input.playerName, input.accountToken);
      return { ...joined, created: false };
    }
    const language = input.language;
    const defaultPack = language === "ar" ? "ar-general" : "en-general";
    const created = this.create({
      name: "Discord Activity",
      playerName: input.playerName,
      accountToken: input.accountToken,
      language,
      packId: input.packId ?? defaultPack
    });
    this.activityRooms.set(input.instanceId, created.room.code);
    return {
      ...created,
      reused: false,
      created: true,
      playerName: created.room.players[0]?.name ?? input.playerName
    };
  }
  get(code) {
    this.sweep();
    const room = this.rooms.get(code);
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "Room not found");
    return room;
  }
  player(room, playerId) {
    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player) throw new RoomError("FORBIDDEN", "Not a member of this room");
    return player;
  }
  updatePlayer(code, playerId, patch) {
    const room = this.get(code);
    this.player(room, playerId);
    if (room.status !== "waiting") throw new RoomError("ROOM_IN_PROGRESS", "Game already started");
    const player = this.player(room, playerId);
    const before = { team: player.team, role: player.role };
    this.assertSeatAllowed(room, playerId, patch.team ?? void 0, patch.role);
    if (patch.team !== void 0) player.team = patch.team;
    if (patch.role !== void 0) {
      player.role = patch.role;
    }
    if (patch.ready !== void 0) player.ready = patch.ready;
    room.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.lastSeatChange = {
      playerId: player.id,
      name: player.name,
      teamChanged: patch.team !== void 0 && patch.team !== before.team,
      roleChanged: patch.role !== void 0 && patch.role !== before.role,
      fromTeam: before.team,
      team: player.team,
      role: player.role
    };
    return room;
  }
  /** What the last `updatePlayer` actually changed (for the event log). */
  lastSeatChange = null;
  /* --------------------------- permissions (Phase 7) --------------------------- */
  /**
   * Kick restrictions, per room. Keyed by ACCOUNT id when the player is
   * signed in, otherwise by the (lower-cased) display name — a deliberate
   * best-effort: we do not fingerprint devices, so a determined guest can
   * always come back with a new name. Restrictions are a moderation tool,
   * not a security boundary; a real ban lives on the account.
   */
  restrictions = /* @__PURE__ */ new Map();
  restrictionKeys(accountId, name) {
    const keys = [];
    if (accountId) keys.push(`acct:${accountId}`);
    if (name.trim()) keys.push(`name:${name.trim().toLowerCase()}`);
    return keys;
  }
  restrictionFor(room, accountId, name) {
    const table = this.restrictions.get(room.code);
    if (!table) return null;
    const now = Date.now();
    for (const key of this.restrictionKeys(accountId, name)) {
      const until = table.get(key);
      if (until === void 0) continue;
      if (until <= now) {
        table.delete(key);
        continue;
      }
      return until;
    }
    return null;
  }
  restrict(room, playerId, name, minutes) {
    if (minutes <= 0) return;
    const table = this.restrictions.get(room.code) ?? /* @__PURE__ */ new Map();
    const until = Date.now() + minutes * 6e4;
    for (const key of this.restrictionKeys(this.accountIdOf(playerId), name)) table.set(key, until);
    this.restrictions.set(room.code, table);
  }
  /** Everything a player is allowed to do — the owner always holds them all. */
  permissionsOf(room, playerId) {
    if (room.ownerId === playerId) return [...ROOM_PERMISSIONS];
    const player = room.players.find((candidate) => candidate.id === playerId);
    return player?.permissions ?? [];
  }
  can(room, playerId, permission) {
    return this.permissionsOf(room, playerId).includes(permission);
  }
  require(room, playerId, permission) {
    const player = this.player(room, playerId);
    if (!this.can(room, playerId, permission)) {
      throw new RoomError("FORBIDDEN", `Missing permission ${permission}`);
    }
    return player;
  }
  /** The owner is untouchable by anyone except themselves. */
  guardTarget(room, by, target) {
    if (target.id === room.ownerId && by.id !== room.ownerId) {
      throw new RoomError("FORBIDDEN", "The room owner cannot be managed");
    }
  }
  /** Owner/moderator kick — optionally with a temporary re-join restriction. */
  kick(code, byPlayerId, targetPlayerId, restrictMinutes = 0) {
    const room = this.get(code);
    const by = this.require(room, byPlayerId, "KICK_PLAYERS");
    const target = this.player(room, targetPlayerId);
    this.guardTarget(room, by, target);
    if (target.id === by.id) throw new RoomError("FORBIDDEN", "Use leave, not kick, on yourself");
    if (restrictMinutes > 0) this.restrict(room, target.id, target.name, restrictMinutes);
    const until = restrictMinutes > 0 ? Date.now() + restrictMinutes * 6e4 : null;
    room.players = room.players.filter((candidate) => candidate.id !== target.id);
    delete this.kicked[target.id];
    this.kicked[target.id] = { code, reason: "kicked", until };
    room.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return { room, target, until };
  }
  /**
   * Who was kicked, so the live layer can tell that exact socket why it is
   * being disconnected. Kept out of the public room payload.
   */
  kicked = {};
  /** Owner/moderator seat move — bypasses locks on purpose (that IS the tool). */
  adminSetSeat(code, byPlayerId, targetPlayerId, patch) {
    const room = this.get(code);
    const by = this.player(room, byPlayerId);
    const target = this.player(room, targetPlayerId);
    this.guardTarget(room, by, target);
    const mayMove = this.can(room, byPlayerId, "MOVE_PLAYERS");
    if (patch.team !== void 0 && !mayMove && !this.can(room, byPlayerId, "CHANGE_TEAMS")) {
      throw new RoomError("FORBIDDEN", "Missing permission CHANGE_TEAMS");
    }
    if (patch.role !== void 0 && !this.can(room, byPlayerId, "CHANGE_ROLES")) {
      throw new RoomError("FORBIDDEN", "Missing permission CHANGE_ROLES");
    }
    const teamChanged = patch.team !== void 0 && patch.team !== target.team;
    const roleChanged = patch.role !== void 0 && patch.role !== target.role;
    if (patch.team !== void 0) target.team = patch.team;
    if (patch.role !== void 0) target.role = patch.role;
    if (target.team === null && target.role !== "spectator") target.role = "spectator";
    if (target.team !== null && target.role === "spectator") target.role = "operative";
    room.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return { room, target, teamChanged, roleChanged };
  }
  /** Lock or unlock a team / a role for everyone but the admins. */
  setLocks(code, byPlayerId, patch) {
    const room = this.get(code);
    if (patch.teams && !this.can(room, byPlayerId, "LOCK_TEAMS")) {
      throw new RoomError("FORBIDDEN", "Missing permission LOCK_TEAMS");
    }
    if (patch.roles && !this.can(room, byPlayerId, "LOCK_ROLES")) {
      throw new RoomError("FORBIDDEN", "Missing permission LOCK_ROLES");
    }
    this.player(room, byPlayerId);
    if (patch.teams) room.locks.teams = { ...room.locks.teams, ...patch.teams };
    if (patch.roles) room.locks.roles = { ...room.locks.roles, ...patch.roles };
    // Both teams may be locked at once by room management. Existing players
    // keep their seats; the locks only prevent team changes until reopened.
    if (room.locks.roles.captain && room.locks.roles.operative) {
      throw new RoomError("INVALID_LOCKS", "At least one role must stay open");
    }
    room.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return room;
  }
  /** Owner-controlled player cap — never below the people already inside. */
  setMaxPlayers(code, byPlayerId, maxPlayers) {
    const room = this.get(code);
    this.require(room, byPlayerId, "MANAGE_ROOM");
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > MAX_PLAYERS) {
      throw new RoomError("INVALID_LIMIT", `maxPlayers must be an integer 2\u2026${MAX_PLAYERS}`);
    }
    if (maxPlayers < room.players.length) {
      throw new RoomError("INVALID_LIMIT", "The room already holds more players than that");
    }
    room.maxPlayers = maxPlayers;
    room.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return room;
  }
  /** Grant (or revoke, with `null`) an explicit permission set. */
  setModerator(code, byPlayerId, targetPlayerId, permissions) {
    const room = this.get(code);
    const by = this.require(room, byPlayerId, "MANAGE_ROOM");
    const target = this.player(room, targetPlayerId);
    this.guardTarget(room, by, target);
    if (target.id === by.id) throw new RoomError("FORBIDDEN", "You cannot change your own permissions");
    if (permissions === null) {
      target.permissions = [];
    } else {
      const unique = [...new Set(permissions)];
      const mine = this.permissionsOf(room, byPlayerId);
      for (const permission of unique) {
        if (!mine.includes(permission)) {
          throw new RoomError("FORBIDDEN", `You cannot grant ${permission}`);
        }
        if (permission === "TRANSFER_OWNERSHIP" && by.id !== room.ownerId) {
          throw new RoomError("FORBIDDEN", "Only the owner can grant TRANSFER_OWNERSHIP");
        }
      }
      target.permissions = unique;
    }
    room.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return { room, target };
  }
  /**
   * Hand the room over. Deliberately explicit: the caller must confirm, and
   * the previous owner keeps (by default) a moderator set so the room is
   * never left without anyone able to run it.
   */
  transferOwnership(code, byPlayerId, targetPlayerId, options = { confirm: false }) {
    const room = this.get(code);
    const by = this.require(room, byPlayerId, "TRANSFER_OWNERSHIP");
    const target = this.player(room, targetPlayerId);
    if (!options.confirm) throw new RoomError("CONFIRM_REQUIRED", "Ownership transfer must be confirmed");
    if (target.id === room.ownerId) throw new RoomError("INVALID_TARGET", "That player already owns the room");
    const previousOwner = room.players.find((candidate) => candidate.id === room.ownerId) ?? by;
    previousOwner.isHost = false;
    previousOwner.permissions = options.keepAsModerator === false ? [] : [...DEFAULT_MODERATOR_PERMISSIONS];
    target.isHost = true;
    target.permissions = [];
    room.ownerId = target.id;
    room.hostId = target.id;
    room.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return { room, target, previous: previousOwner };
  }
  /** Seats the owner has closed — used by the self-seat paths. */
  assertSeatAllowed(room, playerId, team, role) {
    if (this.can(room, playerId, "MOVE_PLAYERS")) return;
    if (team && room.locks.teams[team]) throw new RoomError("TEAM_LOCKED", `Team ${team} is locked`);
    if (role && role !== "spectator" && room.locks.roles[role]) {
      throw new RoomError("ROLE_LOCKED", `Role ${role} is locked`);
    }
  }
  removePlayer(code, byPlayerId, targetPlayerId) {
    const room = this.get(code);
    const by = this.player(room, byPlayerId);
    const target = this.player(room, targetPlayerId);
    if (by.id !== target.id && !this.can(room, by.id, "KICK_PLAYERS")) {
      throw new RoomError("FORBIDDEN", "Missing permission KICK_PLAYERS");
    }
    this.guardTarget(room, by, target);
    if (room.status === "playing" && by.id === target.id && room.players.length <= 1) {
      this.rooms.delete(code);
      throw new RoomError("ROOM_CLOSED", "Room closed");
    }
    room.players = room.players.filter((candidate) => candidate.id !== target.id);
    if (room.players.length === 0) {
      this.rooms.delete(code);
      throw new RoomError("ROOM_CLOSED", "Room closed");
    }
    if (target.id === room.ownerId) this.migrateOwner(room);
    room.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return room;
  }
  /**
   * HOST MIGRATION — the room must never be left ownerless. When the owner
   * walks out, the longest-standing MODERATOR takes over (they were already
   * trusted with the room); otherwise the longest-standing player does.
   */
  migrateOwner(room) {
    const byAge = [...room.players].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
    const next = byAge.find((candidate) => candidate.permissions.length > 0) ?? byAge[0];
    if (!next) return null;
    for (const member of room.players) member.isHost = member.id === next.id;
    next.permissions = [];
    room.ownerId = next.id;
    room.hostId = next.id;
    room.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return next;
  }
  start(code, playerId) {
    const room = this.get(code);
    const player = this.player(room, playerId);
    if (!this.can(room, player.id, "START_GAME")) throw new RoomError("NOT_HOST", "Missing permission START_GAME");
    if (room.status !== "waiting") throw new RoomError("ROOM_IN_PROGRESS", "Game already started");
    room.status = "playing";
    room.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return room;
  }
  reset(code, playerId) {
    const room = this.get(code);
    const player = this.player(room, playerId);
    if (!this.can(room, player.id, "MANAGE_ROOM")) throw new RoomError("NOT_HOST", "Missing permission MANAGE_ROOM");
    room.status = "waiting";
    for (const member of room.players) member.ready = false;
    room.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return room;
  }
  /** Self seat switch — allowed ANY time (lobby and mid-game), team included. */
  changeRole(code, playerId, role, team) {
    const room = this.get(code);
    const player = this.player(room, playerId);
    this.assertSeatAllowed(room, playerId, team ?? player.team, role);
    player.role = role;
    if (team) player.team = team;
    room.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return room;
  }
  /**
   * Host-only: seat everyone randomly — balanced red/blue split (difference
   * ≤ 1) and exactly one captain per team. Spectators stay spectators.
   */
  shuffleSeats(room) {
    const seated = room.players.filter((member) => member.team !== null);
    const shuffledPlayers = shuffle(seated);
    shuffledPlayers.forEach((member, index) => {
      member.team = index % 2 === 0 ? "red" : "blue";
    });
    for (const team of ["red", "blue"]) {
      const members = shuffledPlayers.filter((member) => member.team === team);
      members.forEach((member, index) => {
        member.role = index === 0 ? "captain" : "operative";
      });
    }
    room.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return room;
  }
  shuffleTeams(code, playerId) {
    const room = this.get(code);
    const player = this.player(room, playerId);
    if (!this.can(room, player.id, "MOVE_PLAYERS")) throw new RoomError("NOT_HOST", "Missing permission MOVE_PLAYERS");
    if (room.status !== "waiting") throw new RoomError("ROOM_IN_PROGRESS", "Game already started");
    return this.shuffleSeats(room);
  }
  shuffleTeamsForRematch(code, playerId) {
    const room = this.get(code);
    const player = this.player(room, playerId);
    if (!this.can(room, player.id, "MOVE_PLAYERS")) throw new RoomError("NOT_HOST", "Missing permission MOVE_PLAYERS");
    return this.shuffleSeats(room);
  }
  updateSettings(code, playerId, patch) {
    const room = this.get(code);
    const player = this.player(room, playerId);
    if (!this.can(room, player.id, "MANAGE_ROOM")) throw new RoomError("NOT_HOST", "Missing permission MANAGE_ROOM");
    if (room.status !== "waiting") throw new RoomError("ROOM_IN_PROGRESS", "Game already started");
    if (patch.name !== void 0) room.name = patch.name;
    if (patch.language !== void 0 || patch.packId !== void 0) {
      const language = patch.language ?? room.language;
      const pack = patch.packId ? getPack(patch.packId) : getPack(room.packId);
      if (pack.language !== language) throw new RoomError("INVALID_PACK", "Pack does not match language");
      room.language = language;
      room.packId = pack.id;
    }
    room.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return room;
  }
};
function codeParam(value) {
  return typeof value === "string" ? value.toUpperCase() : "";
}
function idParam(value) {
  return typeof value === "string" ? value : "";
}
function roomErrorStatus(code) {
  switch (code) {
    case "ROOM_NOT_FOUND":
      return 404;
    case "ROOM_FULL":
    case "ROOM_IN_PROGRESS":
    case "ROOM_CLOSED":
      return 409;
    case "FORBIDDEN":
    case "NOT_HOST":
    case "ACCOUNT_BANNED":
    case "TEAM_LOCKED":
    case "ROLE_LOCKED":
    case "KICK_RESTRICTED":
      return 403;
    case "CONFIRM_REQUIRED":
      return 428;
    default:
      return 400;
  }
}
function mountRoomRoutes(app2, store = new RoomStore(), options = {}) {
  const { notify: notify2, gameStore: gameStore2, authStore: authStore2, adminStore: adminStore2, broadcastEvents: broadcastEvents2, broadcastKick: broadcastKick2 } = options;
  const push = (room) => notify2?.(room);
  const pushEvents = (room) => broadcastEvents2?.(room);
  if (authStore2) store.setAuthStore(authStore2);
  if (adminStore2) store.setAdminStore(adminStore2);
  const handleError = (res, err) => {
    if (err instanceof RoomError) {
      res.status(roomErrorStatus(err.code)).json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "INVALID_PAYLOAD", message: "Invalid payload" } });
      return;
    }
    console.error("[rooms] unexpected error:", err);
    res.status(500).json({ error: { code: "INTERNAL", message: "Internal server error" } });
  };
  app2.post("/api/rooms", (req, res) => {
    try {
      const input = createRoomSchema.parse(req.body);
      const { room, playerId } = store.create(input);
      res.status(201).json({ room, playerId });
    } catch (err) {
      handleError(res, err);
    }
  });
  app2.post("/api/rooms/join", (req, res) => {
    try {
      const input = joinRoomSchema.parse(req.body);
      const { room, playerId, reused, playerName } = store.join(
        input.code,
        input.playerName,
        input.accountToken
      );
      if (!reused) gameStore2?.addEvent(room.code, "join", playerName);
      push(room);
      if (!reused) pushEvents(room);
      res.json({ room, playerId, reused });
    } catch (err) {
      handleError(res, err);
    }
  });
  app2.post("/api/rooms/activity", (req, res) => {
    try {
      const input = activityRoomSchema.parse(req.body);
      const result = store.joinActivity(input);
      if (!result.created && !result.reused) {
        gameStore2?.addEvent(result.room.code, "join", result.playerName);
      }
      push(result.room);
      if (!result.reused) pushEvents(result.room);
      res.json({
        room: result.room,
        playerId: result.playerId,
        reused: result.reused,
        created: result.created
      });
    } catch (err) {
      handleError(res, err);
    }
  });
  app2.get("/api/rooms/:code", (req, res) => {
    try {
      res.json({ room: store.get(codeParam(req.params.code)) });
    } catch (err) {
      handleError(res, err);
    }
  });
  app2.patch("/api/rooms/:code/players/:playerId", (req, res) => {
    try {
      const patch = updatePlayerSchema.parse(req.body);
      const room = store.updatePlayer(codeParam(req.params.code), idParam(req.params.playerId), patch);
      const change = store.lastSeatChange;
      if (change && (change.teamChanged || change.roleChanged)) {
        if (change.teamChanged) {
          gameStore2?.addEvent(room.code, "team-change", change.name, {
            team: change.team ?? void 0,
            fromTeam: change.fromTeam,
            role: change.role
          });
        }
        if (change.roleChanged) {
          gameStore2?.addEvent(room.code, "role-change", change.name, {
            team: change.team ?? void 0,
            role: change.role
          });
        }
        pushEvents(room);
      }
      push(room);
      res.json({ room });
    } catch (err) {
      handleError(res, err);
    }
  });
  app2.post("/api/rooms/:code/players/:targetId/remove", (req, res) => {
    try {
      const byPlayerId = z.string().min(1).parse(req.body?.byPlayerId);
      const code = codeParam(req.params.code);
      const before = store.get(code);
      const target = before.players.find((candidate) => candidate.id === idParam(req.params.targetId));
      const room = store.removePlayer(code, byPlayerId, idParam(req.params.targetId));
      if (target && byPlayerId !== target.id) {
        gameStore2?.addEvent(room.code, "leave", target.name);
      }
      push(room);
      pushEvents(room);
      res.json({ room });
    } catch (err) {
      handleError(res, err);
    }
  });
  app2.post("/api/rooms/:code/start", (req, res) => {
    try {
      const playerId = z.string().min(1).parse(req.body?.playerId);
      const room = store.start(codeParam(req.params.code), playerId);
      gameStore2?.start(room);
      gameStore2?.addEvent(room.code, "start", null);
      push(room);
      pushEvents(room);
      res.json({ room });
    } catch (err) {
      handleError(res, err);
    }
  });
  app2.post("/api/rooms/:code/reset", (req, res) => {
    try {
      const playerId = z.string().min(1).parse(req.body?.playerId);
      const room = store.reset(codeParam(req.params.code), playerId);
      gameStore2?.addEvent(room.code, "reset", null);
      gameStore2?.clear(room.code);
      push(room);
      pushEvents(room);
      res.json({ room });
    } catch (err) {
      handleError(res, err);
    }
  });
  app2.post("/api/rooms/:code/randomize", (req, res) => {
    try {
      const playerId = z.string().min(1).parse(req.body?.playerId);
      const room = store.shuffleTeams(codeParam(req.params.code), playerId);
      push(room);
      res.json({ room });
    } catch (err) {
      handleError(res, err);
    }
  });
  const byPlayer = z.string().min(1);
  app2.post("/api/rooms/:code/admin/kick", (req, res) => {
    try {
      const input = z.object({
        byPlayerId: byPlayer,
        targetId: byPlayer,
        restrictMinutes: z.number().int().min(0).max(24 * 60).default(0)
      }).parse(req.body);
      const code = codeParam(req.params.code);
      const actor = store.get(code).players.find((candidate) => candidate.id === input.byPlayerId);
      const { room, target, until } = store.kick(code, input.byPlayerId, input.targetId, input.restrictMinutes);
      gameStore2?.addEvent(room.code, "kick", actor?.name ?? null, {
        targetName: target.name,
        value: input.restrictMinutes || void 0
      });
      push(room);
      pushEvents(room);
      broadcastKick2?.(room.code, { playerId: target.id, until, by: actor?.name ?? null });
      res.json({ room, until });
    } catch (err) {
      handleError(res, err);
    }
  });
  app2.post("/api/rooms/:code/admin/seat", (req, res) => {
    try {
      const input = z.object({
        byPlayerId: byPlayer,
        targetId: byPlayer,
        team: teamSchema.optional(),
        role: roleSchema.optional()
      }).refine((v) => v.team !== void 0 || v.role !== void 0, { message: "empty patch" }).parse(req.body);
      const code = codeParam(req.params.code);
      const before = store.get(code);
      const actor = before.players.find((candidate) => candidate.id === input.byPlayerId);
      const game = gameStore2?.get(code);
      const targetBefore = before.players.find((candidate) => candidate.id === input.targetId);
      if (before.status === "playing" && game && targetBefore && input.role !== void 0 && targetBefore.team !== null && game.turnTeam === targetBefore.team && game.clue !== null) {
        throw new RoomError("ROLE_LOCKED_IN_GAME", "That team is mid-clue \u2014 wait for the turn to end");
      }
      const { room, target, teamChanged, roleChanged } = store.adminSetSeat(code, input.byPlayerId, input.targetId, {
        team: input.team,
        role: input.role
      });
      if (teamChanged || roleChanged) {
        gameStore2?.addEvent(room.code, "admin-move", actor?.name ?? null, {
          targetName: target.name,
          team: target.team ?? void 0,
          role: target.role
        });
      }
      push(room);
      pushEvents(room);
      res.json({ room });
    } catch (err) {
      handleError(res, err);
    }
  });
  app2.post("/api/rooms/:code/admin/locks", (req, res) => {
    try {
      const input = z.object({
        byPlayerId: byPlayer,
        teams: z.object({ red: z.boolean().optional(), blue: z.boolean().optional() }).optional(),
        roles: z.object({ captain: z.boolean().optional(), operative: z.boolean().optional() }).optional()
      }).parse(req.body);
      const code = codeParam(req.params.code);
      const actor = store.get(code).players.find((candidate) => candidate.id === input.byPlayerId);
      const room = store.setLocks(code, input.byPlayerId, { teams: input.teams, roles: input.roles });
      const entries = [];
      for (const [key, value] of Object.entries(input.teams ?? {})) {
        if (typeof value === "boolean") entries.push([key, value]);
      }
      for (const [key, value] of Object.entries(input.roles ?? {})) {
        if (typeof value === "boolean") entries.push([key, value]);
      }
      for (const [lockTarget, locked] of entries) {
        gameStore2?.addEvent(room.code, "lock", actor?.name ?? null, { lockTarget, locked });
      }
      push(room);
      pushEvents(room);
      res.json({ room });
    } catch (err) {
      handleError(res, err);
    }
  });
  app2.post("/api/rooms/:code/admin/limits", (req, res) => {
    try {
      const input = z.object({ byPlayerId: byPlayer, maxPlayers: z.number() }).parse(req.body);
      const code = codeParam(req.params.code);
      const actor = store.get(code).players.find((candidate) => candidate.id === input.byPlayerId);
      const room = store.setMaxPlayers(code, input.byPlayerId, input.maxPlayers);
      gameStore2?.addEvent(room.code, "limit", actor?.name ?? null, { value: room.maxPlayers });
      push(room);
      pushEvents(room);
      res.json({ room });
    } catch (err) {
      handleError(res, err);
    }
  });
  app2.post("/api/rooms/:code/admin/moderator", (req, res) => {
    try {
      const input = z.object({
        byPlayerId: byPlayer,
        targetId: byPlayer,
        permissions: z.array(z.enum(ROOM_PERMISSIONS)).nullable()
      }).parse(req.body);
      const code = codeParam(req.params.code);
      const actor = store.get(code).players.find((candidate) => candidate.id === input.byPlayerId);
      const { room, target } = store.setModerator(code, input.byPlayerId, input.targetId, input.permissions);
      gameStore2?.addEvent(room.code, "moderator", actor?.name ?? null, {
        targetName: target.name,
        permissions: target.permissions.length
      });
      push(room);
      pushEvents(room);
      res.json({ room });
    } catch (err) {
      handleError(res, err);
    }
  });
  app2.post("/api/rooms/:code/admin/transfer", (req, res) => {
    try {
      const input = z.object({
        byPlayerId: byPlayer,
        targetId: byPlayer,
        confirm: z.boolean().default(false),
        keepAsModerator: z.boolean().default(true)
      }).parse(req.body);
      const code = codeParam(req.params.code);
      const actor = store.get(code).players.find((candidate) => candidate.id === input.byPlayerId);
      const { room, target } = store.transferOwnership(code, input.byPlayerId, input.targetId, {
        confirm: input.confirm,
        keepAsModerator: input.keepAsModerator
      });
      gameStore2?.addEvent(room.code, "ownership", actor?.name ?? null, { targetName: target.name });
      push(room);
      pushEvents(room);
      res.json({ room });
    } catch (err) {
      handleError(res, err);
    }
  });
  app2.patch("/api/rooms/:code", (req, res) => {
    try {
      const settings = z.object({
        playerId: z.string().min(1),
        name: nameSchema.optional(),
        language: languageSchema.optional(),
        packId: packSchema.optional()
      }).parse(req.body);
      const { playerId, ...patch } = settings;
      const room = store.updateSettings(codeParam(req.params.code), playerId, patch);
      push(room);
      res.json({ room });
    } catch (err) {
      handleError(res, err);
    }
  });
}

// src/gameRoom.ts
var MAX_EVENTS = 200;
var GameRoomStore = class _GameRoomStore {
  games = /* @__PURE__ */ new Map();
  wordSource = null;
  /** Admin word overrides feed every board generated from now on. */
  setWordSource(source) {
    this.wordSource = source;
  }
  pointers = /* @__PURE__ */ new Map();
  // roomCode → playerId → indices
  events = /* @__PURE__ */ new Map();
  // roomCode → history log
  eventSeq = /* @__PURE__ */ new Map();
  // roomCode → last issued seq
  chats = /* @__PURE__ */ new Map();
  // roomCode → chat log
  chatIds = /* @__PURE__ */ new Map();
  // roomCode → next id
  /** Creates the authoritative game when the host starts the room. */
  start(room) {
    const overrides = this.wordSource?.() ?? { extra: [], disabled: [] };
    const words = generateWords({
      language: room.language,
      packId: room.packId,
      extraWords: overrides.extra,
      disabled: overrides.disabled
    });
    const game = createGame({ language: room.language, words });
    this.games.set(room.code, game);
    return game;
  }
  get(code) {
    return this.games.get(code);
  }
  /** Rematch — regenerate the board for the same room settings. */
  newRound(room) {
    const overrides = this.wordSource?.() ?? { extra: [], disabled: [] };
    const words = generateWords({
      language: room.language,
      packId: room.packId,
      extraWords: overrides.extra,
      disabled: overrides.disabled
    });
    const game = createGame({ language: room.language, words });
    this.games.set(room.code, game);
    this.pointers.delete(room.code);
    return game;
  }
  /* ------------------------------ chat ------------------------------ */
  /** Append a chat message (capped) and return it with its id. */
  addChatMessage(code, message) {
    const list = this.chats.get(code) ?? [];
    const id = this.chatIds.get(code) ?? 0;
    const entry = {
      ...message,
      id,
      at: (/* @__PURE__ */ new Date()).toISOString()
    };
    list.push(entry);
    if (list.length > CHAT_MAX_MESSAGES) list.splice(0, list.length - CHAT_MAX_MESSAGES);
    this.chats.set(code, list);
    this.chatIds.set(code, id + 1);
    return entry;
  }
  chatFor(code) {
    return this.chats.get(code) ?? [];
  }
  /** Back to lobby — drop the game state, pointers, history and chat. */
  clear(code) {
    this.games.delete(code);
    this.pointers.delete(code);
    this.events.delete(code);
    this.eventSeq.delete(code);
    this.chats.delete(code);
    this.chatIds.delete(code);
  }
  /** Drop everything (server shutdown / room expiry). */
  clearAll() {
    this.games.clear();
    this.pointers.clear();
    this.events.clear();
    this.eventSeq.clear();
    this.chats.clear();
    this.chatIds.clear();
  }
  /* ------------------------------ pointers ------------------------------ */
  /** A player points at a card (local highlight only, no hard limit). */
  point(code, playerId, index) {
    let roomPointers = this.pointers.get(code);
    if (!roomPointers) {
      roomPointers = /* @__PURE__ */ new Map();
      this.pointers.set(code, roomPointers);
    }
    const current = roomPointers.get(playerId) ?? [];
    if (current.includes(index)) return;
    current.push(index);
    roomPointers.set(playerId, current);
  }
  /** Remove one pointer (or all of the player's pointers when index is null). */
  unpoint(code, playerId, index) {
    const roomPointers = this.pointers.get(code);
    if (!roomPointers) return;
    if (index === void 0) {
      roomPointers.delete(playerId);
      return;
    }
    const current = roomPointers.get(playerId);
    if (!current) return;
    const next = current.filter((pointed) => pointed !== index);
    if (next.length === 0) roomPointers.delete(playerId);
    else roomPointers.set(playerId, next);
  }
  /** All current pointers for a room (playerId + index — names come from the room). */
  pointersFor(code) {
    const game = this.games.get(code);
    const roomPointers = this.pointers.get(code);
    if (!game || !roomPointers) return [];
    const entries = [];
    for (const [playerId, indices] of roomPointers.entries()) {
      for (const index of indices) {
        if (index >= 0 && index < game.board.length && !game.board[index].revealed) {
          entries.push({ playerId, index });
        }
      }
    }
    return entries;
  }
  /** A card got revealed — clear every pointer on it. */
  clearPointersAt(code, index) {
    const roomPointers = this.pointers.get(code);
    if (!roomPointers) return;
    for (const [playerId, indices] of [...roomPointers.entries()]) {
      const next = indices.filter((pointed) => pointed !== index);
      if (next.length === 0) roomPointers.delete(playerId);
      else roomPointers.set(playerId, next);
    }
  }
  clearPointers(code) {
    this.pointers.delete(code);
  }
  /* ------------------------------ history ------------------------------ */
  /** Append an event to the room's history log (capped). */
  addEvent(code, type, name, data = {}) {
    const list = this.events.get(code) ?? [];
    const nextSeq = (this.eventSeq.get(code) ?? 0) + 1;
    this.eventSeq.set(code, nextSeq);
    const event = {
      seq: nextSeq,
      type,
      name,
      data,
      at: (/* @__PURE__ */ new Date()).toISOString()
    };
    list.push(event);
    if (list.length > MAX_EVENTS) list.splice(0, list.length - MAX_EVENTS);
    this.events.set(code, list);
    return event;
  }
  /** The full history for a room (newest last). */
  eventsFor(code) {
    return this.events.get(code) ?? [];
  }
};

// src/auth.ts
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z as z2 } from "zod";
var AuthError = class extends Error {
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "AuthError";
  }
};
var nameSchema2 = z2.string().trim().min(1).max(24);
var emailSchema = z2.string().trim().toLowerCase().email().max(120);
var passwordSchema = z2.string().min(8).max(72);
var registerSchema = z2.object({
  name: nameSchema2,
  email: emailSchema,
  password: passwordSchema
});
var loginSchema = z2.object({
  email: emailSchema,
  password: z2.string().min(1).max(72)
});
var profileSchema = z2.object({
  name: nameSchema2.optional(),
  bio: z2.string().trim().max(200).optional(),
  avatar: z2.string().max(15e4).refine(
    (value) => /^emoji:.{1,16}$/u.test(value) || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value),
    { message: "avatar must be an emoji token or an image data URL" }
  ).nullable().optional()
});
var statsDeltaSchema = z2.object({
  delta: z2.object({
    games: z2.number().int().min(0).max(20).optional(),
    wins: z2.number().int().min(0).max(20).optional(),
    winAsCaptain: z2.number().int().min(0).max(20).optional(),
    winAsOperative: z2.number().int().min(0).max(20).optional(),
    cluesGiven: z2.number().int().min(0).max(100).optional(),
    correctGuesses: z2.number().int().min(0).max(100).optional(),
    assassinTouched: z2.number().int().min(0).max(20).optional()
  }).refine((delta) => Object.keys(delta).length > 0, { message: "empty delta" })
});
var SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
var MAX_LOGIN_ATTEMPTS = 20;
var ATTEMPT_WINDOW_MS = 10 * 60 * 1e3;
var DUMMY_SALT = "0".repeat(32);
var DUMMY_HASH = scryptSync("dummy-password", DUMMY_SALT, 64).toString("hex");
var AuthStore = class {
  users = /* @__PURE__ */ new Map();
  // email → user
  adminEmails;
  adminSeeded;
  /**
   * Admin seeding: emails listed in ADMIN_EMAILS are admins from the moment
   * they register. When ADMIN_EMAILS is empty (default local hosting), the
   * FIRST registered account becomes the admin.
   */
  constructor(adminEmails = []) {
    this.adminEmails = new Set(adminEmails.map((email) => email.toLowerCase()));
    this.adminSeeded = false;
  }
  sessions = /* @__PURE__ */ new Map();
  // token → session
  attempts = /* @__PURE__ */ new Map();
  // ip → counter
  hashPassword(password, salt) {
    return scryptSync(password, salt, 64).toString("hex");
  }
  createSession(userId) {
    this.sweepSessions();
    const token = randomBytes(32).toString("hex");
    this.sessions.set(token, { userId, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
    return token;
  }
  sweepSessions() {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [token, session] of this.sessions) {
      if (new Date(session.createdAt).getTime() < cutoff) this.sessions.delete(token);
    }
  }
  checkRateLimit(ip) {
    const now = Date.now();
    const entry = this.attempts.get(ip);
    if (!entry || now - entry.windowStart > ATTEMPT_WINDOW_MS) {
      this.attempts.set(ip, { count: 1, windowStart: now });
      return;
    }
    entry.count += 1;
    if (entry.count > MAX_LOGIN_ATTEMPTS) {
      throw new AuthError("RATE_LIMITED", 429, "Too many attempts");
    }
  }
  register(name, email, password) {
    if (this.users.has(email)) {
      throw new AuthError("USER_EXISTS", 409, "Email already registered");
    }
    const salt = randomBytes(16).toString("hex");
    const hash = this.hashPassword(password, salt);
    const user = this.createUser({
      name,
      email,
      salt,
      hash,
      avatar: null,
      discordId: null
    });
    this.users.set(email, user);
    const token = this.createSession(user.id);
    return { token, user: this.publicUser(user) };
  }
  /**
   * Create a stored user with shared defaults. Admin seeding applies here so
   * every account source (email or Discord) follows the same rule.
   */
  createUser(input) {
    const isAdmin = this.adminEmails.has(input.email) ? true : this.adminEmails.size === 0 && !this.adminSeeded && this.users.size === 0;
    if (isAdmin && !this.adminEmails.has(input.email)) this.adminSeeded = true;
    return {
      id: crypto.randomUUID(),
      name: input.name,
      email: input.email,
      bio: "",
      avatar: input.avatar,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      stats: { ...EMPTY_STATS },
      admin: isAdmin,
      discordId: input.discordId,
      salt: input.salt,
      hash: input.hash
    };
  }
  findUserByDiscordId(discordId) {
    return [...this.users.values()].find((candidate) => candidate.discordId === discordId);
  }
  /** Pick a display name that is unique within the 24-character limit. */
  uniqueName(base) {
    const trimmed = base.trim().slice(0, 24) || "player";
    if (!this.usersHasName(trimmed)) return trimmed;
    for (let n = 2; n < 100; n++) {
      const candidate = `${trimmed.slice(0, 24 - String(n).length - 1)}-${n}`;
      if (!this.usersHasName(candidate)) return candidate;
    }
    return `${trimmed.slice(0, 16)}-${crypto.randomUUID().slice(0, 4)}`;
  }
  usersHasName(name) {
    return [...this.users.values()].some((candidate) => candidate.name === name);
  }
  /**
   * Discord OAuth sign-in (Phase 12): log in by Discord id, link an existing
   * account by email, or create a brand-new account from the identity.
   * Returns `linked` when the identity was attached to a pre-existing account
   * and `fresh` when a new account was created.
   */
  discordUpsert(identity) {
    const existing = this.findUserByDiscordId(identity.discordId);
    if (existing) {
      if (identity.avatar) existing.avatar = identity.avatar;
      if (identity.email) existing.email = identity.email.toLowerCase();
      const token2 = this.createSession(existing.id);
      return { token: token2, user: this.publicUser(existing), linked: false, fresh: false };
    }
    const email = identity.email ? identity.email.toLowerCase() : null;
    const byEmail = email ? this.users.get(email) : void 0;
    if (byEmail) {
      byEmail.discordId = identity.discordId;
      if (!byEmail.avatar && identity.avatar) byEmail.avatar = identity.avatar;
      if (!byEmail.name.trim()) byEmail.name = this.uniqueName(identity.name);
      const token2 = this.createSession(byEmail.id);
      return { token: token2, user: this.publicUser(byEmail), linked: true, fresh: false };
    }
    const placeholder = `discord-${identity.discordId}@users.noreply.discord.com`;
    const preferredName = identity.guestName?.trim() || identity.name;
    const user = this.createUser({
      name: this.uniqueName(preferredName),
      email: email ?? placeholder,
      salt: randomBytes(16).toString("hex"),
      // A login-less account: the hash is random and never matches any
      // password — sign-in is only possible through Discord.
      hash: randomBytes(64).toString("hex"),
      avatar: identity.avatar,
      discordId: identity.discordId
    });
    this.users.set(user.email, user);
    const token = this.createSession(user.id);
    return { token, user: this.publicUser(user), linked: false, fresh: true };
  }
  /**
   * Attach a Discord identity to an already-signed-in account.
   * Returns 'linked', or a conflict code when the Discord id is taken.
   */
  linkDiscord(userId, discordId) {
    const user = this.findUser(userId);
    if (!user) return "missing";
    const holder = this.findUserByDiscordId(discordId);
    if (holder && holder.id !== userId) return "conflict";
    user.discordId = discordId;
    return "linked";
  }
  /** Open a fresh session for an account (used by the Discord link flow). */
  signInAs(userId) {
    const user = this.findUser(userId);
    if (!user) return null;
    return { token: this.createSession(user.id), user: this.publicUser(user) };
  }
  login(email, password, ip) {
    this.checkRateLimit(ip);
    const user = this.users.get(email);
    const salt = user?.salt ?? DUMMY_SALT;
    const expected = user?.hash ?? DUMMY_HASH;
    const actual = this.hashPassword(password, salt);
    const match = timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
    if (!user || !match) {
      throw new AuthError("INVALID_CREDENTIALS", 401, "Invalid credentials");
    }
    const token = this.createSession(user.id);
    return { token, user: this.publicUser(user) };
  }
  logout(token) {
    this.sessions.delete(token);
  }
  me(token) {
    const session = this.sessions.get(token);
    if (!session) return null;
    const user = this.findUser(session.userId);
    return user ? this.publicUser(user) : null;
  }
  findUser(userId) {
    return [...this.users.values()].find((candidate) => candidate.id === userId);
  }
  findUserByToken(token) { /* lastSeen stamped on every authenticated call */
    const session = this.sessions.get(token);
    if (!session) return void 0;
    return this.findUser(session.userId);
  }
  profile(token) {
    const user = this.findUserByToken(token);
    if (!user) return null;
    return { user: this.publicUser(user), achievements: computeAchievements(user.stats) };
  }
  updateProfile(token, patch) {
    const user = this.findUserByToken(token);
    if (!user) return null;
    if (patch.name !== void 0) user.name = patch.name;
    if (patch.bio !== void 0) user.bio = patch.bio;
    if (patch.avatar !== void 0) user.avatar = patch.avatar;
    return { user: this.publicUser(user), achievements: computeAchievements(user.stats) };
  }
  /** Server-side stats credit (room games) — keyed by account id. */
  updateStats(accountId, delta) {
    const user = this.findUser(accountId);
    if (!user) return;
    user.stats = mergeStats(user.stats, delta);
  }
  stats(token, delta) {
    const user = this.findUserByToken(token);
    if (!user) return null;
    user.stats = mergeStats(user.stats, delta);
    return { user: this.publicUser(user), achievements: computeAchievements(user.stats) };
  }
  publicUser(user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      bio: user.bio,
      avatar: user.avatar,
      createdAt: user.createdAt,
      stats: { ...user.stats },
      admin: user.admin,
      discordId: user.discordId,
      root: this.rootEmails?.has(user.email) === true,
      lastSeen: user.lastSeen || null
    };
  }
  /** The authenticated admin (or null when not signed in / not an admin). */
  adminByToken(token) {
    const user = this.findUserByToken(token);
    return user?.admin ? this.publicUser(user) : null;
  }
  /** All users, public shape (admins only — never exposes salt/hash). */
  listUsers() {
    return [...this.users.values()].map((user) => this.publicUser(user)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  /** Promote an account to admin (returns the updated public user). */
  promote(accountId) {
    const user = this.findUser(accountId);
    if (!user) return null;
    user.admin = true;
    this.adminEmails.add(user.email);
    return this.publicUser(user);
  }
  /** Root = seeded from ADMIN_EMAILS (or the boot account on fresh local hosting). */
  demote(accountId) {
    const user = this.findUser(accountId);
    if (!user || !user.admin) return null;
    user.admin = false;
    return this.publicUser(user);
  }
  isRootAccount(accountId) {
    const user = this.findUser(accountId);
    return !!user && this.rootEmails.has(user.email) === true;
  }
  /** Internal: true when this account is an admin (used by moderation). */
  isAdminAccount(accountId) {
    return this.findUser(accountId)?.admin === true;
  }
};
function bearerToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}
function clientIp(req) {
  return (req.ip ?? req.socket.remoteAddress ?? "unknown").toString();
}
function mountAuthRoutes(app2, store = new AuthStore()) {
  const handleError = (res, err) => {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err instanceof z2.ZodError) {
      res.status(400).json({ error: { code: "INVALID_PAYLOAD", message: "Invalid payload" } });
      return;
    }
    console.error("[auth] unexpected error:", err);
    res.status(500).json({ error: { code: "INTERNAL", message: "Internal server error" } });
  };
  app2.post("/api/auth/register", (req, res) => {
    try {
      const input = registerSchema.parse(req.body);
      const { token, user } = store.register(input.name, input.email, input.password);
      res.status(201).json({ token, user });
    } catch (err) {
      handleError(res, err);
    }
  });
  app2.post("/api/auth/login", (req, res) => {
    try {
      const input = loginSchema.parse(req.body);
      const { token, user } = store.login(input.email, input.password, clientIp(req));
      res.json({ token, user });
    } catch (err) {
      handleError(res, err);
    }
  });
  app2.post("/api/auth/logout", (req, res) => {
    const token = bearerToken(req);
    if (token) store.logout(token);
    res.json({ ok: true });
  });
  app2.get("/api/auth/me", (req, res) => {
    const token = bearerToken(req);
    const user = token ? store.me(token) : null;
    if (!user) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } });
      return;
    }
    res.json({ user });
  });
  app2.get("/api/auth/profile", (req, res) => {
    const token = bearerToken(req);
    const payload = token ? store.profile(token) : null;
    if (!payload) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } });
      return;
    }
    res.json(payload);
  });
  app2.patch("/api/auth/profile", (req, res) => {
    try {
      const token = bearerToken(req);
      const patch = profileSchema.parse(req.body);
      const payload = token ? store.updateProfile(token, patch) : null;
      if (!payload) {
        res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } });
        return;
      }
      res.json(payload);
    } catch (err) {
      handleError(res, err);
    }
  });
  app2.post("/api/auth/stats", (req, res) => {
    try {
      const token = bearerToken(req);
      const { delta } = statsDeltaSchema.parse(req.body);
      const payload = token ? store.stats(token, delta) : null;
      if (!payload) {
        res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } });
        return;
      }
      res.json(payload);
    } catch (err) {
      handleError(res, err);
    }
  });
}

// src/admin.ts
import { z as z3 } from "zod";
var AdminStore = class {
  reports = [];
  audit = [];
  reportId = 0;
  auditId = 0;
  /** Custom words added by admins (feed the board generator). */
  addedWords = [];
  /** Library words disabled by admins (normalized forms). */
  disabledLibrary = /* @__PURE__ */ new Set();
  /** Custom words disabled by admins (normalized forms). */
  disabledCustom = /* @__PURE__ */ new Set();
  mutedAccounts = /* @__PURE__ */ new Set();
  bannedAccounts = /* @__PURE__ */ new Set();
  /* ------------------------------ reports ------------------------------ */
  addReport(input) {
    const entry = {
      ...input,
      id: this.reportId++,
      status: "open",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.reports.push(entry);
    this.auditAction(input.reporterName, "report", `${input.kind} \u2192 ${input.targetName} (${input.reason})`);
    return entry;
  }
  reportsList() {
    return [...this.reports].sort((a, b) => Number(a.status !== "open") - Number(b.status !== "open"));
  }
  resolveReport(id, actor, resolution, action) {
    const entry = this.reports.find((candidate) => candidate.id === id);
    if (!entry) return null;
    entry.status = "resolved";
    entry.resolvedAt = (/* @__PURE__ */ new Date()).toISOString();
    entry.resolution = resolution;
    this.auditAction(actor, "resolve-report", `#${id} \u2192 ${resolution}${action ? ` + ${action}` : ""}`);
    return entry;
  }
  /* ------------------------------ moderation ------------------------------ */
  isMuted(accountId) {
    return this.mutedAccounts.has(accountId);
  }
  isBanned(accountId) {
    return this.bannedAccounts.has(accountId);
  }
  applyModeration(actor, accountId, action) {
    switch (action) {
      case "mute":
        this.mutedAccounts.add(accountId);
        break;
      case "unmute":
        this.mutedAccounts.delete(accountId);
        break;
      case "block":
        this.bannedAccounts.add(accountId);
        break;
      case "unblock":
        this.bannedAccounts.delete(accountId);
        break;
      default:
        return;
    }
    this.auditAction(actor, action, `account ${accountId}`);
  }
  /* ------------------------------ words ------------------------------ */
  wordOverrides() {
    return {
      extra: this.addedWords.filter((word) => word.enabled).map((word) => word.displayForm),
      disabled: [
        ...this.disabledLibrary,
        ...this.addedWords.filter((word) => !word.enabled).map((word) => word.normalizedForm)
      ]
    };
  }
  /** Searchable word list: admin overrides + matching library entries. */
  wordList(query, language) {
    const q = (query ?? "").trim();
    const list = [];
    for (const word of this.addedWords) {
      if (language && word.language !== language) continue;
      if (q && !word.displayForm.includes(q) && !word.normalizedForm.includes(q)) continue;
      list.push({ id: `custom:${word.normalizedForm}`, displayForm: word.displayForm, language: word.language, source: "custom", enabled: word.enabled });
    }
    for (const word of WORD_LIBRARY) {
      if (language && word.language !== language) continue;
      if (q && !word.displayForm.includes(q) && !word.normalizedForm.includes(q)) continue;
      list.push({ id: `lib:${word.normalizedForm}`, displayForm: word.displayForm, language: word.language, source: "library", enabled: !this.disabledLibrary.has(word.normalizedForm) });
    }
    return list;
  }
  addWord(actor, displayForm, language) {
    const known = /* @__PURE__ */ new Set([
      ...this.addedWords.filter((word) => word.language === language).map((word) => word.normalizedForm),
      ...WORD_LIBRARY.filter((word) => word.language === language).map((word) => word.normalizedForm)
    ]);
    const check = validateBoardWord(displayForm, language, known);
    if (!check.ok) return null;
    const normalized = check.normalizedForm;
    const entry = {
      displayForm: displayForm.trim(),
      normalizedForm: normalized,
      language,
      addedAt: (/* @__PURE__ */ new Date()).toISOString(),
      enabled: true
    };
    this.addedWords.push(entry);
    this.auditAction(actor, "word-add", `"${entry.displayForm}" (${language})`);
    return entry;
  }
  /** id = lib:<normalized> | custom:<normalized>; enabled flips the word. */
  setWordEnabled(actor, id, enabled) {
    if (id.startsWith("lib:")) {
      const normalized = id.slice("lib:".length);
      const exists = WORD_LIBRARY.some((word) => word.normalizedForm === normalized);
      if (!exists) return false;
      if (enabled) this.disabledLibrary.delete(normalized);
      else this.disabledLibrary.add(normalized);
      this.auditAction(actor, enabled ? "word-enable" : "word-disable", `lib:${normalized}`);
      return true;
    }
    if (id.startsWith("custom:")) {
      const normalized = id.slice("custom:".length);
      const entry = this.addedWords.find((word) => word.normalizedForm === normalized);
      if (!entry) return false;
      entry.enabled = enabled;
      this.auditAction(actor, enabled ? "word-enable" : "word-disable", `custom:${normalized}`);
      return true;
    }
    return false;
  }
  /* ------------------------------ audit ------------------------------ */
  auditAction(actor, action, detail) {
    this.audit.push({ id: this.auditId++, actor, action, detail, at: (/* @__PURE__ */ new Date()).toISOString() });
    if (this.audit.length > 300) this.audit.splice(0, this.audit.length - 300);
  }
  auditList() {
    return [...this.audit].reverse();
  }
};
var reportSchema = z3.object({
  kind: z3.enum(["chat", "player"]),
  roomCode: z3.string().min(1),
  targetId: z3.string().min(1),
  reason: z3.string().trim().min(2).max(200)
});
var resolveSchema = z3.object({
  resolution: z3.enum(["resolved", "ignored"]),
  action: z3.enum(["mute", "unmute", "block", "unblock"]).optional(),
  targetAccountId: z3.string().min(1).optional()
});
var moderationSchema = z3.object({
  targetId: z3.string().min(1),
  action: z3.enum(["mute", "unmute", "block", "unblock", "promote", "demote"])
});
var wordAddSchema = z3.object({
  displayForm: z3.string().trim().min(1).max(24),
  language: z3.enum(["ar", "en"])
});
var wordPatchSchema = z3.object({ enabled: z3.boolean() });
function bearer(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}
function authUser(req, authStore2) {
  const token = bearer(req);
  return token ? authStore2.me(token) : null;
}
function mountAdminRoutes(app2, options) {
  const { authStore: authStore2, roomStore: roomStore2, gameStore: gameStore2, adminStore: adminStore2 = new AdminStore() } = options;
  const jsonError = (res, status, code) => {
    res.status(status).json({ error: { code, message: code } });
  };
  app2.post("/api/reports", (req, res) => {
    try {
      const user = authUser(req, authStore2);
      if (!user) return jsonError(res, 401, "UNAUTHORIZED");
      const input = reportSchema.parse(req.body);
      const room = roomStore2.get(input.roomCode.toUpperCase());
      const member = room.players.some(
        (player) => roomStore2.accountIdOf(player.id) === user.id
      );
      if (!member) return jsonError(res, 403, "FORBIDDEN");
      const targetName = input.kind === "chat" ? gameStore2.chatFor(room.code).find((message) => String(message.id) === input.targetId)?.name ?? input.targetId : room.players.find((player) => player.id === input.targetId)?.name ?? input.targetId;
      const report = adminStore2.addReport({
        kind: input.kind,
        roomCode: room.code,
        targetId: input.targetId,
        targetName,
        reporterId: user.id,
        reporterName: user.name,
        reason: input.reason
      });
      res.status(201).json({ report: { id: report.id, status: report.status } });
    } catch (err) {
      if (err instanceof z3.ZodError) return jsonError(res, 400, "INVALID_PAYLOAD");
      jsonError(res, 500, "INTERNAL");
    }
  });
  app2.use("/api/admin", (req, res, next) => {
    const admin = bearer(req) ? authStore2.adminByToken(bearer(req)) : null;
    if (!admin) return jsonError(res, 403, "FORBIDDEN");
    req.adminName = admin.name;
    req.adminUser = admin;
    next();
  });
  app2.get("/api/admin/reports", (_req, res) => {
    res.json({ reports: adminStore2.reportsList() });
  });
  app2.post("/api/admin/reports/:id/resolve", (req, res) => {
    try {
      const actor = req.adminName ?? "admin";
      const actorUser = req.adminUser ?? null;
      const input = resolveSchema.parse(req.body);
      const updated = adminStore2.resolveReport(Number(req.params.id), actor, input.resolution, input.action);
      if (!updated) return jsonError(res, 404, "NOT_FOUND");
      if (input.action && input.targetAccountId) {
        if (input.action === 'block' && actorUser && actorUser.id === input.targetAccountId) {
          return jsonError(res, 403, 'CANT_BLOCK_SELF');
        }
        if (authStore2.isAdminAccount(input.targetAccountId)) {
          return jsonError(res, 403, 'ADMIN_IMMUNE');
        }
        adminStore2.applyModeration(actor, input.targetAccountId, input.action);
      }
      res.json({ report: updated });
    } catch (err) {
      if (err instanceof z3.ZodError) return jsonError(res, 400, "INVALID_PAYLOAD");
      jsonError(res, 500, "INTERNAL");
    }
  });
  app2.get("/api/admin/users", (_req, res) => {
    const users = authStore2.listUsers().map((user) => ({
      ...user,
      muted: adminStore2.isMuted(user.id),
      banned: adminStore2.isBanned(user.id)
    }));
    res.json({ users });
  });
  app2.post("/api/admin/moderation", (req, res) => {
    try {
      const actor = req.adminName ?? "admin";
      const actorUser = req.adminUser ?? null;
      const input = moderationSchema.parse(req.body);
      const targetUser = authStore2.findUser(input.targetId);
      if (!targetUser) return jsonError(res, 404, "NOT_FOUND");
      if (input.action === "promote" || input.action === "demote") {
        if (!actorUser || actorUser.root !== true) return jsonError(res, 403, "NOT_ROOT");
        if (input.action === "demote" && actorUser.id === input.targetId) {
          return jsonError(res, 403, "CANT_DEMOTE_SELF");
        }
        if (input.action === "demote" && authStore2.isRootAccount(input.targetId)) {
          return jsonError(res, 403, "ADMIN_IMMUNE");
        }
        if (input.action === "promote") {
          const promoted = authStore2.promote(input.targetId);
          if (!promoted) return jsonError(res, 404, "NOT_FOUND");
          adminStore2.auditAction(actor, "promote", promoted.email);
          return res.json({ user: promoted });
        }
        const demoted = authStore2.demote(input.targetId);
        if (!demoted) return jsonError(res, 404, "NOT_FOUND");
        adminStore2.auditAction(actor, "demote", demoted.email);
        return res.json({ user: demoted });
      }
      if (input.action === "block" || input.action === "mute" || input.action === "unmute" || input.action === "unblock") {
        if (input.action === "block" && actorUser && actorUser.id === input.targetId) {
          return jsonError(res, 403, "CANT_BLOCK_SELF");
        }
        if (authStore2.isAdminAccount(input.targetId)) return jsonError(res, 403, "ADMIN_IMMUNE");
      }
      adminStore2.applyModeration(actor, input.targetId, input.action);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z3.ZodError) return jsonError(res, 400, "INVALID_PAYLOAD");
      jsonError(res, 500, "INTERNAL");
    }
  });
  app2.get("/api/admin/words", (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const language = req.query.language === "en" ? "en" : req.query.language === "ar" ? "ar" : void 0;
    res.json({ words: adminStore2.wordList(q, language).slice(0, 100) });
  });
  app2.post("/api/admin/words", (req, res) => {
    try {
      const actor = req.adminName ?? "admin";
      const input = wordAddSchema.parse(req.body);
      const added = adminStore2.addWord(actor, input.displayForm, input.language);
      if (!added) return jsonError(res, 409, "WORD_EXISTS");
      res.status(201).json({ word: added });
    } catch (err) {
      if (err instanceof z3.ZodError) return jsonError(res, 400, "INVALID_PAYLOAD");
      jsonError(res, 500, "INTERNAL");
    }
  });
  app2.patch("/api/admin/words/:id", (req, res) => {
    try {
      const actor = req.adminName ?? "admin";
      const input = wordPatchSchema.parse(req.body);
      const idParam2 = typeof req.params.id === "string" ? req.params.id : "";
      const ok = adminStore2.setWordEnabled(actor, idParam2, input.enabled);
      if (!ok) return jsonError(res, 404, "NOT_FOUND");
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z3.ZodError) return jsonError(res, 400, "INVALID_PAYLOAD");
      jsonError(res, 500, "INTERNAL");
    }
  });
  app2.get("/api/admin/audit", (_req, res) => {
    const entries = adminStore2.auditList().map((entry) => ({
      ...entry,
      detail: String(entry.detail || "").replace(/account ([0-9a-f-]{20,})/gi, (_m, id) => {
        const user = authStore2.findUser(id);
        return user ? `${user.name} (${id.slice(0, 8)}…)` : `account ${id}`;
      })
    }));
    res.json({ entries });
  });
}

// src/discord.ts
import { randomBytes as randomBytes2 } from "node:crypto";
function mockMode() {
  return process.env.DISCORD_MOCK_MODE === "1";
}
function mockIdentity(seed) {
  const hex = Buffer.from(seed).toString("hex").slice(0, 12).padEnd(8, "0");
  return {
    id: `mock-${hex}`,
    username: "mustafa_dc",
    globalName: "\u0645\u0635\u0637\u0641\u0649",
    avatarHash: null,
    email: "mostafa@example.com"
  };
}
var MOCK_AVATAR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
var DISCORD_API = "https://discord.com/api/v10";
var AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
var PENDING_TTL_MS = 10 * 60 * 1e3;
var EXCHANGE_TTL_MS = 2 * 60 * 1e3;
var COOKIE_NAME = "clue_me_discord";
var COOKIE_PATH = "/api/auth/discord/exchange";
var AVATAR_SIZE = 128;
var MAX_AVATAR_BYTES = 2e5;
function bearerToken2(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}
function publicOrigin(req) {
  const configured = process.env.PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (configured && /^https?:\/\/[^/]+$/i.test(configured)) return configured;
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/[^/]+$/i.test(origin)) return origin;
  const referer = req.headers.referer;
  if (referer) {
    try {
      const parsed = new URL(referer);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
    }
  }
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol;
  return `${String(proto).split(",")[0]}://${req.get("host") ?? "localhost"}`;
}
function safeReturnTo(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.includes("\\") || value.includes("\n") || value.includes("\r")) return "/";
  return value;
}
function parseCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("=")) || null;
  }
  return null;
}
async function exchangeCode(config, code, redirectUri) {
  if (mockMode()) return mockIdentity(`code:${code}`);
  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    }),
    signal: AbortSignal.timeout(8e3)
  });
  if (!tokenRes.ok) throw new Error(`discord token exchange failed: ${tokenRes.status}`);
  const tokenBody = await tokenRes.json();
  if (!tokenBody.access_token) throw new Error("discord token exchange returned no token");
  return fetchIdentity(tokenBody.access_token);
}
async function exchangeActivityCode(config, code) {
  if (mockMode()) return `mock-activity-token:${code}`;
  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code
    }),
    signal: AbortSignal.timeout(8e3)
  });
  if (!tokenRes.ok) throw new Error(`discord activity token exchange failed: ${tokenRes.status}`);
  const tokenBody = await tokenRes.json();
  if (!tokenBody.access_token) throw new Error("discord activity exchange returned no token");
  return tokenBody.access_token;
}
async function fetchIdentity(accessToken) {
  const meRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8e3)
  });
  if (!meRes.ok) throw new Error(`discord user fetch failed: ${meRes.status}`);
  const me = await meRes.json();
  if (!me.id || !me.username) throw new Error("discord user payload incomplete");
  return {
    id: me.id,
    username: me.username,
    globalName: me.global_name ?? null,
    avatarHash: me.avatar ?? null,
    email: me.email ?? null
  };
}
async function fetchAvatarDataUrl(identity) {
  if (mockMode()) return MOCK_AVATAR;
  try {
    const avatarUrl = identity.avatarHash ? `https://cdn.discordapp.com/avatars/${identity.id}/${identity.avatarHash}.png?size=${AVATAR_SIZE}` : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(identity.id) >> 22n) % 6n)}.png`;
    const res = await fetch(avatarUrl, { signal: AbortSignal.timeout(5e3) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_AVATAR_BYTES) return null;
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}
function redirectWithError(res, origin, returnTo, code) {
  const params = new URLSearchParams({ auth: "discord", error: code });
  res.redirect(302, `${origin}${returnTo}?${params.toString()}`);
}
function mountDiscordRoutes(app2, authStore2, config) {
  const pending = /* @__PURE__ */ new Map();
  const exchanges = /* @__PURE__ */ new Map();
  const sweep = () => {
    const now = Date.now();
    for (const [key, entry] of pending) {
      if (now - entry.createdAt > PENDING_TTL_MS) pending.delete(key);
    }
    for (const [key, entry] of exchanges) {
      if (now - entry.createdAt > EXCHANGE_TTL_MS) exchanges.delete(key);
    }
  };
  const enabled = Boolean(config?.clientId && config?.clientSecret);
  app2.get("/api/auth/discord/config", (_req, res) => {
    const serverInviteUrl = process.env.DISCORD_SERVER_INVITE_URL?.trim() || null;
    res.json({ enabled, clientId: enabled ? config.clientId : null, serverInviteUrl });
  });
  app2.get("/api/auth/discord", (req, res) => {
    if (!config) {
      res.status(503).json({ error: { code: "DISCORD_DISABLED", message: "Discord is not configured" } });
      return;
    }
    sweep();
    const state = randomBytes2(16).toString("hex");
    const token = bearerToken2(req);
    const linkUserId = token ? authStore2.me(token)?.id ?? null : null;
    const appRedirect = typeof req.query.app_redirect === "string" ? req.query.app_redirect : (typeof req.query.redirect_uri === "string" ? req.query.redirect_uri : (typeof req.query.redirectUri === "string" ? req.query.redirectUri : null));
    const redirectUri = config.redirectUri ?? "https://clue-me.ai.studio/api/auth/discord/callback";
    pending.set(state, {
      origin: publicOrigin(req),
      returnTo: safeReturnTo(req.query.returnTo),
      redirectUri,
      appRedirect,
      linkUserId,
      createdAt: Date.now()
    });
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      scope: "identify email",
      state,
      redirect_uri: redirectUri,
      prompt: "consent"
    });
    res.redirect(302, `${AUTHORIZE_URL}?${params.toString()}`);
  });
  app2.post("/api/auth/discord/link", (req, res) => {
    if (!config) {
      res.status(503).json({ error: { code: "DISCORD_DISABLED", message: "Discord is not configured" } });
      return;
    }
    const token = bearerToken2(req);
    const user = token ? authStore2.me(token) : null;
    if (!user) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } });
      return;
    }
    sweep();
    const state = randomBytes2(16).toString("hex");
    pending.set(state, {
      origin: publicOrigin(req),
      returnTo: safeReturnTo(req.body?.returnTo ?? "/"),
      linkUserId: user.id,
      createdAt: Date.now()
    });
    const redirectUri = config.redirectUri ?? `${publicOrigin(req)}/api/auth/discord/callback`;
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      scope: "identify email",
      state,
      redirect_uri: redirectUri,
      prompt: "consent"
    });
    res.json({ url: `${AUTHORIZE_URL}?${params.toString()}` });
  });
  app2.get("/api/auth/discord/callback", async (req, res) => {
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const entry = state ? pending.get(state) : void 0;
    if (entry) pending.delete(state);
    const fallback = entry ?? { origin: publicOrigin(req), returnTo: "/", linkUserId: null, createdAt: 0 };
    const denied = typeof req.query.error === "string" ? req.query.error : null;
    if (denied) {
      redirectWithError(res, fallback.origin, fallback.returnTo, "denied");
      return;
    }
    if (!config) {
      redirectWithError(res, fallback.origin, fallback.returnTo, "disabled");
      return;
    }
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!code || !entry) {
      redirectWithError(res, fallback.origin, fallback.returnTo, "state");
      return;
    }
    try {
      const redirectUri = entry.redirectUri ?? config.redirectUri ?? `${entry.origin}/api/auth/discord/callback`;
      const identity = await exchangeCode(config, code, redirectUri);
      const avatar = await fetchAvatarDataUrl(identity);
      const displayName = identity.globalName ?? identity.username;
      let result;
      if (entry.linkUserId) {
        const linkResult = authStore2.linkDiscord(entry.linkUserId, identity.id);
        if (linkResult !== "linked") {
          redirectWithError(res, entry.origin, entry.returnTo, "conflict");
          return;
        }
        const signIn = authStore2.signInAs(entry.linkUserId);
        if (!signIn) {
          redirectWithError(res, entry.origin, entry.returnTo, "failed");
          return;
        }
        result = { user: signIn.user, linked: true, fresh: false };
      } else {
        result = authStore2.discordUpsert({
          discordId: identity.id,
          name: displayName,
          email: identity.email,
          avatar
        });
      }
      sweep();
      const exchangeToken = randomBytes2(24).toString("hex");
      exchanges.set(exchangeToken, {
        userId: result.user.id,
        linked: result.linked,
        fresh: result.fresh,
        createdAt: Date.now()
      });
      const secure = req.headers["x-forwarded-proto"] === "https" || req.secure;
      res.cookie(COOKIE_NAME, exchangeToken, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        maxAge: EXCHANGE_TTL_MS,
        path: COOKIE_PATH
      });
      const finalRedirect = entry.appRedirect || entry.redirectUri;
      if (finalRedirect && (finalRedirect.startsWith("clue-me://") || finalRedirect.startsWith("clueme://"))) {
        res.redirect(302, `${finalRedirect}?code=${encodeURIComponent(code)}&discord_session=${exchangeToken}`);
        return;
      }
      res.redirect(302, `${entry.origin}${entry.returnTo}?auth=discord&discord_session=${exchangeToken}`);
    } catch (err) {
      console.error("[discord] callback failed:", err);
      redirectWithError(res, entry.origin, entry.returnTo, "failed");
    }
  });
  app2.post("/api/auth/discord/exchange", (req, res) => {
    const exchangeToken = parseCookie(req.headers.cookie, COOKIE_NAME);
    const entry = exchangeToken ? exchanges.get(exchangeToken) : void 0;
    if (entry && exchangeToken) exchanges.delete(exchangeToken);
    res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
    if (!entry) {
      res.status(410).json({
        error: { code: "DISCORD_EXCHANGE_EXPIRED", message: "Discord exchange expired" }
      });
      return;
    }
    const signIn = authStore2.signInAs(entry.userId);
    if (!signIn) {
      res.status(410).json({
        error: { code: "DISCORD_EXCHANGE_EXPIRED", message: "Account no longer exists" }
      });
      return;
    }
    res.json({
      token: signIn.token,
      user: signIn.user,
      linked: entry.linked,
      fresh: entry.fresh
    });
  });
  app2.post("/api/auth/firebase/discord", (req, res) => {
    try {
      const { discordId, name, email, avatar } = req.body;
      if (!discordId) {
        res.status(400).json({ error: { code: "INVALID_ARGUMENT", message: "discordId is required" } });
        return;
      }
      const result = authStore2.discordUpsert({
        discordId,
        name: name || "Discord Player",
        email: email || null,
        avatar: avatar || null
      });
      res.json({
        token: result.token,
        user: result.user,
        linked: result.linked,
        fresh: result.fresh
      });
    } catch (err) {
      console.error("[firebase/discord] auth failed:", err);
      res.status(500).json({ error: { code: "INTERNAL", message: "Internal auth failed" } });
    }
  });
  app2.post("/api/auth/discord/activity/token", async (req, res) => {
    if (!config) {
      res.status(503).json({ error: { code: "DISCORD_DISABLED", message: "Discord is not configured" } });
      return;
    }
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!code || code.length > 300) {
      res.status(400).json({ error: { code: "INVALID_PAYLOAD", message: "Invalid code" } });
      return;
    }
    try {
      const accessToken = await exchangeActivityCode(config, code);
      const identity = mockMode() ? mockIdentity(`activity:${accessToken}`) : await fetchIdentity(accessToken);
      const avatar = await fetchAvatarDataUrl(identity);
      const result = authStore2.discordUpsert({
        discordId: identity.id,
        name: identity.globalName ?? identity.username,
        email: identity.email,
        avatar,
        guestName: typeof req.body?.guestName === "string" ? req.body.guestName : null
      });
      res.json({
        accessToken,
        token: result.token,
        user: result.user,
        linked: result.linked,
        fresh: result.fresh
      });
    } catch (err) {
      console.error("[discord] activity code exchange failed:", err);
      res.status(502).json({ error: { code: "DISCORD_FAILED", message: "Discord exchange failed" } });
    }
  });
  app2.post("/api/auth/discord/activity", async (req, res) => {
    if (!config) {
      res.status(503).json({ error: { code: "DISCORD_DISABLED", message: "Discord is not configured" } });
      return;
    }
    const accessToken = typeof req.body?.accessToken === "string" ? req.body.accessToken : "";
    if (!accessToken || accessToken.length > 300) {
      res.status(400).json({ error: { code: "INVALID_PAYLOAD", message: "Invalid access token" } });
      return;
    }
    try {
      const identity = mockMode() ? mockIdentity(`activity:${accessToken}`) : await fetchIdentity(accessToken);
      const avatar = await fetchAvatarDataUrl(identity);
      const result = authStore2.discordUpsert({
        discordId: identity.id,
        name: identity.globalName ?? identity.username,
        email: identity.email,
        avatar,
        guestName: typeof req.body?.guestName === "string" ? req.body.guestName : null
      });
      res.json({
        token: result.token,
        user: result.user,
        linked: result.linked,
        fresh: result.fresh
      });
    } catch (err) {
      console.error("[discord] activity auth failed:", err);
      res.status(502).json({
        error: { code: "DISCORD_FAILED", message: "Discord validation failed" }
      });
    }
  });
}

// src/app.ts
function findClientDist() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.CLIENT_DIST,
    join(here, "public"),
    join(here, "..", "public"),
    join(here, "..", "..", "client", "dist"),
    join(process.cwd(), "public"),
    join(process.cwd(), "client", "dist")
  ].filter((value) => Boolean(value));
  for (const candidate of candidates) {
    const path = resolve(candidate);
    if (existsSync(join(path, "index.html"))) return path;
  }
  return null;
}
function escapeSocialMeta(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function renderSocialIndex(template, req, roomStore) {
  const configuredOrigin = process.env.PUBLIC_URL?.trim().replace(/\/$/, "");
  const origin = configuredOrigin || "https://clueme.wisp.uno";
  const roomMatch = req.path.match(/^\/(?:room|game)\/([A-Z]{4})\/?$/i);
  const roomCode = roomMatch?.[1]?.toUpperCase() ?? null;
  let room = null;
  if (roomCode) {
    try {
      room = roomStore.get(roomCode);
    } catch {
    }
  }
  const canonicalPath = roomCode ? `/room/${roomCode}` : req.path === "/" ? "/" : req.path;
  const canonicalUrl = `${origin}${canonicalPath}`;
  const imageUrl = `${origin}/discord-embed-v1.png`;
  const roomState = room?.status === "playing" ? "اللعبة جارية الآن" : "في انتظار اللاعبين";
  const title = roomCode
    ? `Clue Me — انضم إلى غرفة ${roomCode}`
    : "Clue Me — كلمة واحدة… تصنع الفوز";
  const description = roomCode
    ? `${room?.name ? `غرفة ${room.name} • ` : ""}${roomState} • ${room?.players.length ?? 0}/${room?.maxPlayers ?? 12} لاعبًا • افتح الرابط وانضم مباشرة.`
    : "لعبة تخمين كلمات عربية جماعية للأصدقاء — أنشئ غرفة وابدأ اللعب مباشرة.";
  const imageAlt = roomCode
    ? `Clue Me room ${roomCode} — Arabic-first multiplayer word game`
    : "Clue Me — Arabic-first multiplayer word game";
  const meta = `<!-- SOCIAL_META_START -->
    <meta name="theme-color" content="#B83A3A" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <link rel="canonical" href="${escapeSocialMeta(canonicalUrl)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Clue Me" />
    <meta property="og:locale" content="ar_EG" />
    <meta property="og:locale:alternate" content="en_US" />
    <meta property="og:title" content="${escapeSocialMeta(title)}" />
    <meta property="og:description" content="${escapeSocialMeta(description)}" />
    <meta property="og:url" content="${escapeSocialMeta(canonicalUrl)}" />
    <meta property="og:image" content="${escapeSocialMeta(imageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeSocialMeta(imageUrl)}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeSocialMeta(imageAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeSocialMeta(title)}" />
    <meta name="twitter:description" content="${escapeSocialMeta(description)}" />
    <meta name="twitter:image" content="${escapeSocialMeta(imageUrl)}" />
    <!-- SOCIAL_META_END -->`;
  return template
    .replace(/<!-- SOCIAL_META_START -->[\s\S]*?<!-- SOCIAL_META_END -->/, meta)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeSocialMeta(title)}</title>`);
}
function createApp(options = {}) {
  const app2 = express();
  app2.disable("x-powered-by");
  app2.use(express.json({ limit: "64kb" }));
  const roomStore2 = options.roomStore ?? new RoomStore();
  const gameStore2 = options.gameStore ?? new GameRoomStore();
  const authStore2 = options.authStore ?? new AuthStore();
  const adminStore2 = options.adminStore ?? new AdminStore();
  app2.get("/api/health", (_req, res) => {
    const payload = {
      status: "ok",
      service: BRAND.name,
      version: APP_VERSION,
      time: (/* @__PURE__ */ new Date()).toISOString()
    };
    res.json(payload);
  });
  app2.get("/.well-known/discord", (_req, res) => {
    const verification = process.env.DISCORD_DOMAIN_VERIFICATION?.trim() || "dh=55cf526805f47c766ac5dd57b422bfe681af9400";
    res.setHeader("Cache-Control", "no-store");
    res.type("text/plain").send(verification);
  });
  mountRoomRoutes(app2, roomStore2, {
    notify: options.notify,
    broadcastKick: options.broadcastKick,
    gameStore: gameStore2,
    authStore: authStore2,
    adminStore: adminStore2,
    broadcastEvents: options.broadcastEvents
  });
  mountAuthRoutes(app2, authStore2);
  mountDiscordRoutes(app2, authStore2, options.discord ?? null);
  mountAdminRoutes(app2, { authStore: authStore2, roomStore: roomStore2, gameStore: gameStore2, adminStore: adminStore2 });
  registerAiRoutes(app2, { authStore: authStore2, roomStore: roomStore2, gameStore: gameStore2 });
  const clientDist = findClientDist();
  if (clientDist) {
    const clientIndexPath = join(clientDist, "index.html");
    const clientIndexTemplate = readFileSync(clientIndexPath, "utf8");
    app2.use(
      express.static(clientDist, {
        index: false,
        maxAge: "1y",
        setHeaders: (res, filePath) => {
          if (filePath.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache");
        }
      })
    );
    app2.get(/.*/, (req, res, next) => {
      if (req.path.startsWith("/api/") || req.path.startsWith("/socket.io")) {
        next();
        return;
      }
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.type("html").send(renderSocialIndex(clientIndexTemplate, req, roomStore2));
    });
  }
  app2.use((_req, res) => {
    const payload = { error: { code: "NOT_FOUND", message: "Not found" } };
    res.status(404).json(payload);
  });
  app2.use((err, _req, res, _next) => {
    console.error("[server] unhandled error:", err);
    const payload = {
      error: { code: "INTERNAL", message: "Internal server error" }
    };
    res.status(500).json(payload);
  });
  return app2;
}

// src/live.ts
import { Server } from "socket.io";
import { z as z4 } from "zod";
var joinSchema = z4.object({ code: z4.string().min(1), playerId: z4.string().min(1) });
var chatSendSchema = z4.object({
  code: z4.string().min(1),
  playerId: z4.string().min(1),
  text: z4.string().trim().min(1).max(CHAT_MAX_LENGTH)
});
var actionSchema = z4.object({
  code: z4.string().min(1),
  playerId: z4.string().min(1),
  expectedGameId: z4.string().min(1).max(96).optional(),
  expectedRevision: z4.number().int().min(0).optional(),
  actionId: z4.string().min(1).max(96).optional(),
  action: z4.discriminatedUnion("type", [
    z4.object({ type: z4.literal("clue"), word: z4.string(), number: z4.number() }),
    z4.object({ type: z4.literal("guess"), index: z4.number() }),
    z4.object({ type: z4.literal("endTurn") }),
    z4.object({ type: z4.literal("newRound") }),
    z4.object({ type: z4.literal("newRoundRandomized") }),
    z4.object({ type: z4.literal("changeRole"), role: z4.enum(["captain", "operative", "spectator"]), team: z4.enum(["red", "blue"]).optional() }),
    z4.object({ type: z4.literal("point"), index: z4.number() }),
    z4.object({ type: z4.literal("unpoint"), index: z4.number().optional() }),
    /** Phase 2 — "poke" a player: a purely cosmetic, broadcast effect. */
    z4.object({ type: z4.literal("cheer"), targetId: z4.string().min(1).max(64) })
  ])
});
var channel = (code) => `room:${code}`;
var lastCheerAt = /* @__PURE__ */ new Map();
function cheerAllowed(code, playerId) {
  const key = `${code}:${playerId}`;
  const now = Date.now();
  const previous = lastCheerAt.get(key) ?? 0;
  if (now - previous < PLAYER_EFFECT_COOLDOWN) return false;
  lastCheerAt.set(key, now);
  if (lastCheerAt.size > 5e3) {
    for (const [entry, at] of lastCheerAt) {
      if (now - at > PLAYER_EFFECT_COOLDOWN * 20) lastCheerAt.delete(entry);
    }
  }
  return true;
}
function viewerFor(player) {
  if (player.team === null || player.role === "spectator") return { kind: "spectator" };
  return { kind: player.role, team: player.team };
}
function initLive(httpServer, roomStore2, gameStore2, authStore2, adminStore2) {
  const io = new Server(httpServer, { cors: { origin: true } });
  const chatRate = /* @__PURE__ */ new Map();
  const viewBroadcastQueues = /* @__PURE__ */ new Map();
  const seatSockets = /* @__PURE__ */ new Map();
  const offlineTimers = /* @__PURE__ */ new Map();
  const processedAuthoritativeActions = /* @__PURE__ */ new Map();
  const PRESENCE_GRACE_MS = 4500;
  const ACTION_DEDUP_TTL_MS = 90 * 1000;
  const ACTION_DEDUP_MAX = 256;
  const seatKey = (code, playerId) => `${code}:${playerId}`;
  const roomWithPresence = (room) => ({
    ...room,
    players: room.players.map((player) => ({
      ...player,
      connected: (seatSockets.get(seatKey(room.code, player.id))?.size ?? 0) > 0
    }))
  });
  const emitPresenceRoom = (code) => {
    try {
      const room = roomStore2.get(code);
      io.to(channel(code)).emit("lobby:update", { room: roomWithPresence(room) });
    } catch {
    }
  };
  const scheduleOffline = (key, code) => {
    const previousTimer = offlineTimers.get(key);
    if (previousTimer) clearTimeout(previousTimer);
    const timer = setTimeout(() => {
      offlineTimers.delete(key);
      if ((seatSockets.get(key)?.size ?? 0) === 0) emitPresenceRoom(code);
    }, PRESENCE_GRACE_MS);
    timer.unref?.();
    offlineTimers.set(key, timer);
  };
  const registerPresence = (socket, code, playerId) => {
    const previousKey = socket.data.presenceKey;
    const previousCode = socket.data.roomCode;
    if (previousKey && previousKey !== seatKey(code, playerId)) {
      const previous = seatSockets.get(previousKey);
      previous?.delete(socket.id);
      if (!previous || previous.size === 0) {
        seatSockets.delete(previousKey);
        if (previousCode) scheduleOffline(previousKey, previousCode);
      }
    }
    const key = seatKey(code, playerId);
    let sockets = seatSockets.get(key);
    if (!sockets) {
      sockets = /* @__PURE__ */ new Set();
      seatSockets.set(key, sockets);
    }
    const alreadyRegistered = sockets.has(socket.id);
    sockets.add(socket.id);
    const timer = offlineTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      offlineTimers.delete(key);
    }
    socket.data.playerId = playerId;
    socket.data.roomCode = code;
    socket.data.presenceKey = key;
    if (!alreadyRegistered) emitPresenceRoom(code);
  };
  const unregisterPresence = (socket) => {
    const key = socket.data.presenceKey;
    const code = socket.data.roomCode;
    if (!key || !code) return;
    const sockets = seatSockets.get(key);
    sockets?.delete(socket.id);
    socket.data.presenceKey = null;
    socket.data.roomCode = null;
    if (sockets && sockets.size > 0) return;
    seatSockets.delete(key);
    scheduleOffline(key, code);
  };
  const emitGameView = (socket, code, knownPlayer, sync = false) => {
    const room = roomStore2.get(code);
    const player = knownPlayer ?? room.players.find((candidate) => candidate.id === socket.data.playerId);
    const game = gameStore2.get(code);
    if (!player || !game) return false;
    socket.emit("game:view", { view: getView(game, viewerFor(player)), sync });
    return true;
  };
  const sendAuthoritativeSnapshot = (socket, code, knownPlayer) => {
    const room = roomStore2.get(code);
    const player = knownPlayer ?? room.players.find((candidate) => candidate.id === socket.data.playerId);
    if (!player || !emitGameView(socket, code, player, true)) return false;
    const pointers = gameStore2.pointersFor(code).map(({ playerId: pid, index }) => ({
      index,
      name: room.players.find((candidate) => candidate.id === pid)?.name ?? ""
    }));
    socket.emit("game:pointers", { pointers });
    socket.emit("game:events", { events: gameStore2.eventsFor(code) });
    return true;
  };
  const broadcastViews = (code) => {
    const previous = viewBroadcastQueues.get(code) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        const sockets = await io.in(channel(code)).fetchSockets();
        for (const socket of sockets) {
          try {
            emitGameView(socket, code);
          } catch {
          }
        }
      })
      .catch(() => {});
    viewBroadcastQueues.set(code, next);
    void next.finally(() => {
      if (viewBroadcastQueues.get(code) === next) viewBroadcastQueues.delete(code);
    });
  };
  const broadcastEvents2 = (code) => {
    io.to(channel(code)).emit("game:events", { events: gameStore2.eventsFor(code) });
  };
  const broadcastPointers = (code) => {
    const room = (() => {
      try {
        return roomStore2.get(code);
      } catch {
        return null;
      }
    })();
    const pointers = gameStore2.pointersFor(code).map(({ playerId, index }) => ({
      index,
      name: room?.players.find((candidate) => candidate.id === playerId)?.name ?? ""
    }));
    io.to(channel(code)).emit("game:pointers", { pointers });
  };
  const actionKey = (playerId, actionId) => `${playerId}:${actionId}`;
  const purgeProcessedActions = (code) => {
    const table = processedAuthoritativeActions.get(code);
    if (!table) return;
    const now = Date.now();
    for (const [key, entry] of table) {
      if (now - entry.at > ACTION_DEDUP_TTL_MS) table.delete(key);
    }
    if (table.size === 0) {
      processedAuthoritativeActions.delete(code);
      return;
    }
    if (table.size > ACTION_DEDUP_MAX) {
      const keep = [...table.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, ACTION_DEDUP_MAX);
      processedAuthoritativeActions.set(code, new Map(keep));
    }
  };
  const readProcessedAction = (code, playerId, actionId) => {
    if (!actionId) return null;
    purgeProcessedActions(code);
    return processedAuthoritativeActions.get(code)?.get(actionKey(playerId, actionId)) ?? null;
  };
  const rememberProcessedAction = (code, playerId, actionId, result) => {
    if (!actionId) return;
    purgeProcessedActions(code);
    const table = processedAuthoritativeActions.get(code) ?? /* @__PURE__ */ new Map();
    table.set(actionKey(playerId, actionId), { result, at: Date.now() });
    processedAuthoritativeActions.set(code, table);
  };
  io.on("connection", (socket) => {
    socket.on("lobby:join", async (payload) => {
      const parsed = joinSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit("lobby:error", {
          code: "INVALID_PAYLOAD",
          roomCode: typeof payload?.code === "string" ? payload.code.toUpperCase() : null
        });
        return;
      }
      const code = parsed.data.code.toUpperCase();
      try {
        const room = roomStore2.get(code);
        const player = room.players.find((candidate) => candidate.id === parsed.data.playerId);
        if (!player) {
          socket.emit("lobby:error", { code: "FORBIDDEN", roomCode: code });
          return;
        }
        const previousRoomCode = socket.data.roomCode;
        if (previousRoomCode && previousRoomCode !== code) {
          unregisterPresence(socket);
          await socket.leave(channel(previousRoomCode));
        }
        await socket.join(channel(code));
        registerPresence(socket, code, player.id);
        socket.emit("lobby:update", { room: roomWithPresence(room) });
        if (room.status === "playing") sendAuthoritativeSnapshot(socket, code, player);
        socket.emit("chat:history", { roomCode: code, messages: gameStore2.chatFor(code) });
      } catch (err) {
        const code2 = err instanceof Error && "code" in err ? err.code : "ROOM_NOT_FOUND";
        socket.emit("lobby:error", { code: code2, roomCode: code });
      }
    });
    socket.on("game:sync", (payload) => {
      const parsed = joinSchema.safeParse(payload);
      if (!parsed.success) return;
      const code = parsed.data.code.toUpperCase();
      try {
        const room = roomStore2.get(code);
        const player = room.players.find((candidate) => candidate.id === parsed.data.playerId);
        if (!player || room.status !== "playing") return;
        registerPresence(socket, code, player.id);
        sendAuthoritativeSnapshot(socket, code, player);
      } catch {
      }
    });
    socket.on("game:action", (payload) => {
      const parsed = actionSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit("game:error", { code: "INVALID_PAYLOAD" });
        return;
      }
      const { code: rawCode, playerId, action, expectedGameId, expectedRevision, actionId } = parsed.data;
      const code = rawCode.toUpperCase();
      try {
        const room = roomStore2.get(code);
        const player = room.players.find((candidate) => candidate.id === playerId);
        if (!player) {
          socket.emit("game:error", { code: "FORBIDDEN" });
          return;
        }
        if (room.status !== "playing") {
          socket.emit("game:error", { code: "INVALID_GAME_STATE" });
          return;
        }
        const game = gameStore2.get(code);
        if (!game) {
          socket.emit("game:error", { code: "INVALID_GAME_STATE" });
          return;
        }
        const requiresAuthoritativeRevision =
          action.type === "clue" ||
          action.type === "guess" ||
          action.type === "endTurn" ||
          action.type === "newRound" ||
          action.type === "newRoundRandomized";
        if (requiresAuthoritativeRevision) {
          const duplicate = readProcessedAction(code, player.id, actionId);
          if (duplicate) {
            socket.emit("game:result", { result: duplicate.result, duplicate: true });
            sendAuthoritativeSnapshot(socket, code, player);
            return;
          }
        }
        if (
          requiresAuthoritativeRevision &&
          (expectedGameId === void 0 ||
            expectedRevision === void 0 ||
            expectedGameId !== game.id ||
            expectedRevision !== game.moveCount)
        ) {
          socket.emit("game:error", { code: "STALE_GAME_STATE", silent: true });
          sendAuthoritativeSnapshot(socket, code, player);
          return;
        }
        if (action.type === "changeRole") {
          roomStore2.changeRole(code, player.id, action.role, action.team);
          notify2(roomStore2.get(code));
          broadcastViews(code);
          return;
        }
        if (action.type === "cheer") {
          const target = room.players.find((candidate) => candidate.id === action.targetId);
          if (!target) {
            socket.emit("game:error", { code: "FORBIDDEN" });
            return;
          }
          if (!cheerAllowed(code, player.id)) return;
          io.to(channel(code)).emit("game:cheer", {
            fromId: player.id,
            fromName: player.name,
            targetId: target.id,
            targetName: target.name,
            team: target.team ?? player.team ?? null,
            at: Date.now()
          });
          return;
        }
        if (action.type === "point" || action.type === "unpoint") {
          const pointerViewer = viewerFor(player);
          if (pointerViewer.kind !== "operative" || pointerViewer.team !== game.turnTeam) {
            socket.emit("game:error", { code: "FORBIDDEN" });
            sendAuthoritativeSnapshot(socket, code, player);
            return;
          }
          if (game.phase !== "guess") {
            socket.emit("game:error", { code: "INVALID_GAME_STATE" });
            sendAuthoritativeSnapshot(socket, code, player);
            return;
          }
          if (action.type === "point") {
            const card = game.board[action.index];
            if (!card || card.revealed) {
              socket.emit("game:error", { code: "INVALID_CARD_INDEX" });
              return;
            }
            gameStore2.point(code, player.id, action.index);
          } else {
            gameStore2.unpoint(code, player.id, action.index);
          }
          broadcastPointers(code);
          return;
        }
        const viewer = viewerFor(player);
        if (action.type === "newRound" || action.type === "newRoundRandomized") {
          if (!roomStore2.can(room, player.id, "START_GAME")) {
            socket.emit("game:error", { code: "NOT_HOST" });
            return;
          }
          if (action.type === "newRoundRandomized") {
            if (!roomStore2.can(room, player.id, "MOVE_PLAYERS")) {
              socket.emit("game:error", { code: "FORBIDDEN" });
              return;
            }
            roomStore2.shuffleTeamsForRematch(code, player.id);
            emitPresenceRoom(code);
          }
          gameStore2.newRound(room);
          gameStore2.addEvent(code, "new-round", null, action.type === "newRoundRandomized" ? { randomized: true } : {});
          const roundResult = { ok: true, kind: action.type === "newRoundRandomized" ? "new-round-randomized" : "new-round" };
          rememberProcessedAction(code, player.id, actionId, roundResult);
          io.to(channel(code)).emit("game:result", { result: roundResult });
          broadcastPointers(code);
          broadcastEvents2(code);
          broadcastViews(code);
          return;
        }
        if (viewer.kind === "spectator") {
          socket.emit("game:error", { code: "FORBIDDEN" });
          return;
        }
        const isTurn = viewer.team === game.turnTeam && (action.type === "clue" ? viewer.kind === "captain" : viewer.kind === "operative");
        if (!isTurn) {
          socket.emit("game:error", { code: "FORBIDDEN" });
          sendAuthoritativeSnapshot(socket, code, player);
          return;
        }
        let result;
        if (action.type === "clue") {
          result = giveClue(game, { word: action.word, number: action.number });
        } else if (action.type === "guess") {
          result = guess(game, action.index);
        } else {
          result = endTurn(game);
        }
        if (!result.ok) {
          socket.emit("game:error", { code: result.code });
          sendAuthoritativeSnapshot(socket, code, player);
          return;
        }
        rememberProcessedAction(code, player.id, actionId, result);
        io.to(channel(code)).emit("game:result", { result });
        if (result.kind === "clue") {
          io.to(channel(code)).emit("game:clue", {
            clue: { word: game.clue?.word ?? "", number: game.clue?.number ?? 0 },
            team: player.team ?? game.turnTeam,
            by: player.name,
            seq: game.clueSeq
          });
          gameStore2.addEvent(code, "clue", player.name, {
            word: game.clue?.word,
            number: game.clue?.number,
            team: player.team ?? void 0
          });
          const accountId = roomStore2.accountIdOf(player.id);
          if (accountId && authStore2) authStore2.updateStats(accountId, { cluesGiven: 1 });
        }
        if (result.kind === "guess" && typeof result.index === "number") {
          const card = game.board[result.index];
          gameStore2.addEvent(code, "guess", player.name, {
            word: card?.word,
            color: result.cardColor,
            team: player.team ?? void 0
          });
          const accountId = roomStore2.accountIdOf(player.id);
          if (accountId && authStore2) {
            if (result.cardColor === result.actorTeam) {
              authStore2.updateStats(accountId, { correctGuesses: 1 });
            }
            if (result.cardColor === "assassin") {
              authStore2.updateStats(accountId, { assassinTouched: 1 });
            }
          }
          if (result.winner) {
            gameStore2.addEvent(code, "game-over", null, {
              winner: result.winner,
              reason: result.winReason ?? "agents"
            });
            for (const member of room.players) {
              const memberAccount = roomStore2.accountIdOf(member.id);
              if (!memberAccount || !authStore2) continue;
              const delta = { games: 1 };
              if (member.team === result.winner) {
                delta.wins = 1;
                delta[member.role === "captain" ? "winAsCaptain" : "winAsOperative"] = 1;
              }
              authStore2.updateStats(memberAccount, delta);
            }
          }
        }
        if (result.kind === "end-turn") {
          gameStore2.addEvent(code, "end-turn", player.name, { team: result.actorTeam ?? player.team ?? void 0 });
        }
        if (result.kind === "guess" && typeof result.index === "number") {
          gameStore2.clearPointersAt(code, result.index);
          if (result.endedTurn) gameStore2.clearPointers(code);
        }
        if (result.kind === "end-turn") {
          gameStore2.clearPointers(code);
        }
        broadcastPointers(code);
        broadcastEvents2(code);
        broadcastViews(code);
      } catch (err) {
        const code2 = err instanceof Error && "code" in err ? err.code : "INTERNAL";
        socket.emit("game:error", { code: code2 });
      }
    });
    socket.on("chat:send", (payload) => {
      const parsed = chatSendSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit("chat:error", {
          code: "CHAT_TOO_LONG",
          roomCode: typeof payload?.code === "string" ? payload.code.toUpperCase() : null
        });
        return;
      }
      const { code: rawCode, playerId, text } = parsed.data;
      const code = rawCode.toUpperCase();
      try {
        const room = roomStore2.get(code);
        const player = room.players.find((candidate) => candidate.id === playerId);
        if (!player) {
          socket.emit("chat:error", { code: "CHAT_NOT_MEMBER", roomCode: code });
          return;
        }
        const accountId = roomStore2.accountIdOf(player.id);
        if (accountId && adminStore2?.isMuted(accountId)) {
          socket.emit("chat:error", { code: "CHAT_MUTED", roomCode: code });
          return;
        }
        const now = Date.now();
        const window_ = chatRate.get(player.id) ?? [];
        const recent = window_.filter((at) => now - at < CHAT_WINDOW_MS);
        if (recent.length >= CHAT_MAX_PER_WINDOW) {
          chatRate.set(player.id, recent);
          socket.emit("chat:error", { code: "CHAT_RATE_LIMITED", roomCode: code });
          return;
        }
        recent.push(now);
        chatRate.set(player.id, recent);
        const message = gameStore2.addChatMessage(code, {
          playerId: player.id,
          name: player.name,
          team: player.team,
          text
        });
        io.to(channel(code)).emit("chat:message", { roomCode: code, message });
      } catch (err) {
        const errCode = err instanceof Error && "code" in err ? err.code : "INTERNAL";
        socket.emit("chat:error", { code: errCode, roomCode: code });
      }
    });
    socket.on("lobby:leave", (payload) => {
      const parsed = joinSchema.safeParse(payload);
      if (!parsed.success) return;
      const code = parsed.data.code.toUpperCase();
      if (socket.data.roomCode === code) unregisterPresence(socket);
      void socket.leave(channel(code));
    });
    socket.on("disconnect", () => {
      unregisterPresence(socket);
    });
  });
  const notify2 = (room) => {
    io.to(channel(room.code)).emit("lobby:update", { room: roomWithPresence(room) });
    if (room.status === "playing") broadcastViews(room.code);
  };
  return {
    io,
    notify: notify2,
    broadcastEvents: (room) => broadcastEvents2(room.code),
    broadcastKick: (code, payload) => io.to(channel(code)).emit("lobby:kicked", payload)
  };
}

// src/persistence.ts
function entriesOf(value) {
  return value instanceof Map ? [...value.entries()] : [];
}
function safeEntries(value) {
  return Array.isArray(value) ? value : [];
}
function capturePersistentState(roomStore2, gameStore2, authStore2, adminStore2) {
  return {
    version: 1,
    auth: {
      users: entriesOf(authStore2.users),
      sessions: entriesOf(authStore2.sessions),
      adminSeeded: Boolean(authStore2.adminSeeded)
    },
    admin: {
      reports: adminStore2.reports,
      audit: adminStore2.audit,
      reportId: adminStore2.reportId,
      auditId: adminStore2.auditId,
      addedWords: adminStore2.addedWords,
      disabledLibrary: [...adminStore2.disabledLibrary],
      disabledCustom: [...adminStore2.disabledCustom],
      mutedAccounts: [...adminStore2.mutedAccounts],
      bannedAccounts: [...adminStore2.bannedAccounts]
    },
    rooms: {
      rooms: entriesOf(roomStore2.rooms),
      accountIds: entriesOf(roomStore2.accountIds),
      activityRooms: entriesOf(roomStore2.activityRooms),
      restrictions: entriesOf(roomStore2.restrictions)
    },
    games: {
      games: entriesOf(gameStore2.games),
      pointers: entriesOf(gameStore2.pointers).map(([code, playerPointers]) => [code, entriesOf(playerPointers)]),
      events: entriesOf(gameStore2.events),
      eventSeq: entriesOf(gameStore2.eventSeq),
      chats: entriesOf(gameStore2.chats),
      chatIds: entriesOf(gameStore2.chatIds)
    }
  };
}
function restorePersistentState(state, roomStore2, gameStore2, authStore2, adminStore2) {
  if (!state || state.version !== 1) return false;
  const auth = state.auth ?? {};
  authStore2.users = new Map(safeEntries(auth.users));
  authStore2.sessions = new Map(safeEntries(auth.sessions));
  authStore2.adminSeeded = Boolean(auth.adminSeeded);
  authStore2.sweepSessions();
  const admin = state.admin ?? {};
  adminStore2.reports = Array.isArray(admin.reports) ? admin.reports : [];
  adminStore2.audit = Array.isArray(admin.audit) ? admin.audit : [];
  adminStore2.reportId = Number.isInteger(admin.reportId) ? admin.reportId : adminStore2.reports.length;
  adminStore2.auditId = Number.isInteger(admin.auditId) ? admin.auditId : adminStore2.audit.length;
  adminStore2.addedWords = Array.isArray(admin.addedWords) ? admin.addedWords : [];
  adminStore2.disabledLibrary = new Set(Array.isArray(admin.disabledLibrary) ? admin.disabledLibrary : []);
  adminStore2.disabledCustom = new Set(Array.isArray(admin.disabledCustom) ? admin.disabledCustom : []);
  adminStore2.mutedAccounts = new Set(Array.isArray(admin.mutedAccounts) ? admin.mutedAccounts : []);
  adminStore2.bannedAccounts = new Set(Array.isArray(admin.bannedAccounts) ? admin.bannedAccounts : []);
  const rooms = state.rooms ?? {};
  roomStore2.rooms = new Map(safeEntries(rooms.rooms));
  roomStore2.accountIds = new Map(safeEntries(rooms.accountIds));
  roomStore2.activityRooms = new Map(safeEntries(rooms.activityRooms));
  roomStore2.restrictions = new Map(safeEntries(rooms.restrictions));
  roomStore2.sweep();
  const games = state.games ?? {};
  gameStore2.games = new Map(safeEntries(games.games));
  gameStore2.pointers = new Map(
    safeEntries(games.pointers).map(([code, playerPointers]) => [code, new Map(safeEntries(playerPointers))])
  );
  gameStore2.events = new Map(safeEntries(games.events));
  gameStore2.eventSeq = new Map(safeEntries(games.eventSeq));
  gameStore2.chats = new Map(safeEntries(games.chats));
  gameStore2.chatIds = new Map(safeEntries(games.chatIds));
  return true;
}
async function createPostgresPersistence(databaseUrl) {
  const { Pool } = await import("pg");
  const sslEnabled = process.env.DATABASE_SSL !== "false";
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    max: 3,
    connectionTimeoutMillis: 8e3,
    idleTimeoutMillis: 3e4
  });
  pool.on("error", (err) => console.error("[database] idle client error:", err));
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clue_me_state (
      state_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  let lastJson = null;
  let writeQueue = Promise.resolve();
  return {
    async load() {
      const result = await pool.query("SELECT payload FROM clue_me_state WHERE state_key = $1", ["main"]);
      const state = result.rows[0]?.payload ?? null;
      if (state) lastJson = JSON.stringify(state);
      return state;
    },
    save(state, force = false) {
      const json = JSON.stringify(state);
      if (!force && json === lastJson) return writeQueue;
      lastJson = json;
      writeQueue = writeQueue.then(async () => {
        try {
          await pool.query(
            `INSERT INTO clue_me_state (state_key, payload, updated_at)
             VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT (state_key)
             DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
            ["main", json]
          );
        } catch (err) {
          lastJson = null;
          console.error("[database] save failed:", err);
        }
      });
      return writeQueue;
    },
    async close() {
      await writeQueue;
      await pool.end();
    }
  };
}

// src/index.ts
function loadDotEnv() {
  const loader = process.loadEnvFile;
  if (typeof loader !== "function") return;
  for (const candidate of [resolve2(process.cwd(), ".env"), resolve2(process.cwd(), "../.env")]) {
    if (!existsSync2(candidate)) continue;
    const before = { ...process.env };
    try {
      loader(candidate);
      for (const [key, value] of Object.entries(before)) {
        if (value !== void 0) process.env[key] = value;
      }
      console.log(`[server] loaded environment from ${candidate}`);
    } catch (err) {
      console.warn("[server] could not read .env:", err);
    }
    return;
  }
}
loadDotEnv();
var port = Number(process.env.PORT ?? process.env.SERVER_PORT ?? 3000);
var discordClientId = process.env.DISCORD_CLIENT_ID?.trim() ?? "";
var discordClientSecret = process.env.DISCORD_CLIENT_SECRET?.trim() ?? "";
var discordConfig = discordClientId && discordClientSecret ? {
  clientId: discordClientId,
  clientSecret: discordClientSecret,
  redirectUri: process.env.DISCORD_REDIRECT_URI?.trim() || void 0
} : null;
var roomStore = new RoomStore();
var gameStore = new GameRoomStore();
var authStore = new AuthStore(
  (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim()).filter(Boolean)
);
var adminStore = new AdminStore();
var databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
var persistence = null;
if (databaseUrl) {
  try {
    persistence = await createPostgresPersistence(databaseUrl);
    const restoredState = await persistence.load();
    if (restoredState) {
      restorePersistentState(restoredState, roomStore, gameStore, authStore, adminStore);
      console.log(`[database] restored ${authStore.users.size} users and ${roomStore.rooms.size} active rooms`);
    } else {
      console.log("[database] connected; a new persistent state will be created");
    }
  } catch (err) {
    console.error("[database] startup failed:", err);
    process.exit(1);
  }
} else {
  console.warn("[database] DATABASE_URL is not set; data will be kept in memory only");
}
gameStore.setWordSource(() => adminStore.wordOverrides());
var notify = () => {
};
var broadcastEvents = () => {
};
var broadcastKick = () => {
};
var app = createApp({
  roomStore,
  gameStore,
  authStore,
  adminStore,
  discord: discordConfig,
  notify: (room) => notify(room),
  broadcastEvents: (room) => broadcastEvents(room),
  broadcastKick: (code, payload) => broadcastKick(code, payload)
});
var server = createServer(app);
var live = initLive(server, roomStore, gameStore, authStore, adminStore);
notify = live.notify;
broadcastEvents = live.broadcastEvents;
broadcastKick = live.broadcastKick;
server.listen(port, () => {
  console.log(`[server] ${BRAND.name} API v${APP_VERSION} (REST + Socket.IO) on http://0.0.0.0:${port}`);
});
var persistenceTimer = null;
var persistNow = (force = false) => {
  if (!persistence) return Promise.resolve();
  return persistence.save(capturePersistentState(roomStore, gameStore, authStore, adminStore), force);
};
if (persistence) {
  persistNow(true);
  persistenceTimer = setInterval(() => {
    persistNow(false);
  }, Number(process.env.DATABASE_SAVE_INTERVAL_MS ?? 3e3));
  persistenceTimer.unref();
}
var shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal}; saving state and shutting down`);
  if (persistenceTimer) clearInterval(persistenceTimer);
  server.close();
  const hardStop = setTimeout(() => process.exit(1), 1e4);
  hardStop.unref();
  try {
    await persistNow(true);
    await persistence?.close();
    process.exit(0);
  } catch (err) {
    console.error("[server] shutdown save failed:", err);
    process.exit(1);
  }
}
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

export {
  createGame,
  giveClue,
  guess,
  endTurn,
  getView,
  RoomStore,
  GameRoomStore,
  AuthStore,
  AdminStore
};
//# sourceMappingURL=index.js.map
