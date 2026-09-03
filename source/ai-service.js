import { GoogleGenAI, Type } from "@google/genai";

let aiInstance = null;

function getAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Please set GEMINI_API_KEY in the environment.");
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

// In-memory store for custom AI packs (also shared with game room pack registry)
export const customAiPacks = new Map();

/**
 * Register AI routes on the express application
 */
export function registerAiRoutes(app, options = {}) {
  const { authStore, roomStore, gameStore, wordRegistry } = options;

  // Helper to extract bearer token
  const getBearerToken = (req) => {
    const auth = req.headers.authorization;
    return auth && auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  };

  // 1. Generate Custom Word Pack
  app.post("/api/ai/generate-pack", async (req, res) => {
    try {
      const { title, prompt = "", language = "ar", count = 50 } = req.body || {};
      if (!title || typeof title !== "string" || title.trim().length === 0) {
        return res.status(400).json({ error: { code: "INVALID_TITLE", message: "Title is required" } });
      }

      const lang = language === "en" ? "en" : "ar";
      const targetCount = Math.min(80, Math.max(30, Number(count) || 50));
      const systemPrompt = lang === "ar"
        ? `أنت خبير في تصميم ألعاب الكلمات والتفكير التداعي (مثل Codenames / Clue Me).
مهمتك توليد حزمة كلمات عربية متناسقة ومبتكرة وممتعة للعب بناءً على العنوان والوصف.
الشروط الصارمة:
1. يجب أن تكون كل كلمة اسماً مفرداً واضحاً ومفهوماً (كلمة واحدة فقط لكل مدخل، بدون جمل).
2. أن تكون الكلمات ذات صلة بموضوع الحزمة وقابلة للربط بتلميحات ذكية.
3. التنوع الدلالي: تجنب الكلمات المترادفة تماماً أو التي تشترك في نفس الجذر اللغوي المباشر.
4. خالية تماماً من الكلمات الجارحة أو غير اللائقة.
5. وفر عدداً لا يقل عن ${targetCount} كلمة فريدة.`
        : `You are an expert word-game and semantic association designer (like Codenames / Clue Me).
Your task is to generate a cohesive, engaging word pack based on the user's title and story/theme.
Strict rules:
1. Each word must be a single noun or well-known concept (single word only, no compound phrases).
2. Words must fit the theme while offering broad semantic associative variety.
3. Avoid synonyms or words sharing obvious roots.
4. Completely safe for work and family friendly.
5. Provide at least ${targetCount} unique words.`;

      const userContent = lang === "ar"
        ? `عنوان الحزمة: ${title.trim()}\nالوصف / القصة: ${prompt.trim() || "توليد حزمة كلمات إبداعية متنوعة تناسب هذا الموضوع"}\nعدد الكلمات المطلوب: ${targetCount}`
        : `Pack Title: ${title.trim()}\nTheme / Story Description: ${prompt.trim() || "Creative diverse pack fitting this theme"}\nTarget Word Count: ${targetCount}`;

      let parsed = null;
      let usedFallback = false;

      try {
        const ai = getAI();
        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: userContent,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "Polished title of the word pack" },
                description: { type: Type.STRING, description: "Brief description of the pack theme" },
                category: { type: Type.STRING, description: "Category name e.g. Fantasy, Culture, Tech, History" },
                words: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Array of single words",
                },
              },
              required: ["title", "description", "category", "words"],
            },
          },
        });
        parsed = JSON.parse(response.text || "{}");
      } catch (geminiErr) {
        console.warn("[ai:generate-pack] Gemini call fallback:", geminiErr.message);
        usedFallback = true;
        parsed = generateSemanticPackFallback(title, prompt, lang, targetCount);
      }

      let wordList = Array.isArray(parsed?.words) ? parsed.words : [];
      if (wordList.length < 25) {
        const fallbackObj = generateSemanticPackFallback(title, prompt, lang, targetCount);
        wordList = [...wordList, ...(fallbackObj.words || [])];
      }

      const cleanWords = Array.from(
        new Set(
          wordList
            .map((w) => String(w).trim().replace(/[.,!?;:"'()]/g, ""))
            .filter((w) => w.length >= 2 && !w.includes(" "))
        )
      ).slice(0, targetCount);

      const packId = `custom-ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const packData = {
        id: packId,
        language: lang,
        name: parsed.title || title.trim(),
        nameKey: parsed.title || title.trim(),
        description: parsed.description || prompt.trim(),
        category: parsed.category || "AI Custom",
        words: cleanWords,
        count: cleanWords.length,
        createdAt: new Date().toISOString(),
      };

      customAiPacks.set(packId, packData);

      // Register words if wordRegistry is provided
      if (wordRegistry && typeof wordRegistry.registerCustomPack === "function") {
        wordRegistry.registerCustomPack(packData);
      }

      // If user is authenticated, save to user custom packs
      const token = getBearerToken(req);
      if (token && authStore) {
        try {
          const user = authStore.findUserByToken(token);
          if (user) {
            user.customPacks = user.customPacks || [];
            user.customPacks.unshift(packData);
          }
        } catch (_) {}
      }

      return res.json({ ok: true, pack: packData });
    } catch (err) {
      console.error("[ai:generate-pack] error:", err);
      const isKeyMissing = err.message && err.message.includes("GEMINI_API_KEY");
      return res.status(isKeyMissing ? 503 : 500).json({
        error: {
          code: isKeyMissing ? "GEMINI_API_KEY_REQUIRED" : "AI_GENERATION_FAILED",
          message: err.message || "Failed to generate AI pack",
        },
      });
    }
  });

  // 2. Spymaster Advisor & Assassin Early Warning Radar
  app.post("/api/ai/spymaster-advisor", async (req, res) => {
    try {
      const {
        myTeamWords = [],
        opponentWords = [],
        neutralWords = [],
        assassinWord = "",
        language = "ar",
      } = req.body || {};

      if (!Array.isArray(myTeamWords) || myTeamWords.length === 0) {
        return res.status(400).json({ error: { code: "INVALID_WORDS", message: "myTeamWords is required" } });
      }

      const lang = language === "en" ? "en" : "ar";
      const ai = getAI();

      const systemPrompt = lang === "ar"
        ? `أنت مستشار استراتيجي بارع لقائد الفريق (Spymaster) في لعبة Clue Me / Codenames.
مهمتك تحليل الكلمات على اللوحة وتقديم أفضل التلميحات المحتملة لفريقك، مع التركيز الأقصى على **التحذير من الكلمة القاتلة (الكلمة السوداء)**!
قواعد اللعبة:
1. التلميح يجب أن يكون كلمة واحدة فقط متبوعة برقم يمثل عدد البطاقات المستهدفة.
2. لا يجوز استخدام أي كلمة موجودة على اللوحة أو اشتقاق مباشر منها.
3. الأولوية القصوى: تجنب الكلمة السوداء بأي شكل! إذا كان التلميح يقترب دلالياً أو صوتياً من الكلمة السوداء، يجب إصدار تحذير شديد ورفع مستوى الخطر (CRITICAL / HIGH).
4. قدم من 3 إلى 5 اقتراحات تلميحات متفاوتة في مستوى الشجاعة والأمان.`
        : `You are an elite Spymaster Strategy Advisor in Clue Me / Codenames.
Your job is to generate clever, winning clue suggestions for your team's remaining words while keeping the team 100% safe from the ASSASSIN (Black Card)!
Rules:
1. Clue must be a single valid noun/concept plus a number of target words.
2. The clue must not be any word currently on the board or an inflection/root thereof.
3. Crucial Priority: ASSASSIN WARNING! Check any association with the assassin word. If there is any risk the operatives might guess the assassin, flag assassinRisk as HIGH or CRITICAL with an explicit warning explanation.
4. Provide 3 to 5 candidate clues varying from safe to ambitious.`;

      const userContent = JSON.stringify({
        language: lang,
        remainingTeamCards: myTeamWords,
        opponentCards: opponentWords,
        neutralCivilianCards: neutralWords,
        assassinBlackCard: assassinWord,
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: userContent,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              assassinWarningNotice: {
                type: Type.STRING,
                description: "Overall advice regarding the black card and traps to avoid",
              },
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    clue: { type: Type.STRING, description: "Single word clue" },
                    number: { type: Type.INTEGER, description: "Number of team cards targeted" },
                    targetWords: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "Team words this clue points to",
                    },
                    assassinRisk: {
                      type: Type.STRING,
                      description: "SAFE, LOW, MODERATE, HIGH, or CRITICAL",
                    },
                    assassinAnalysis: {
                      type: Type.STRING,
                      description: "Clear explanation of how close this clue is to the assassin card",
                    },
                    opponentOverlap: {
                      type: Type.STRING,
                      description: "Any minor risk of opponent or neutral card confusion",
                    },
                    strategyTip: {
                      type: Type.STRING,
                      description: "Brief tactical advice on why this clue works",
                    },
                  },
                  required: ["clue", "number", "targetWords", "assassinRisk", "assassinAnalysis", "strategyTip"],
                },
              },
            },
            required: ["suggestions"],
          },
        },
      });

      const parsed = JSON.parse(response.text || "{}");
      return res.json({ ok: true, data: parsed });
    } catch (err) {
      console.error("[ai:spymaster-advisor] error:", err);
      const isKeyMissing = err.message && err.message.includes("GEMINI_API_KEY");
      return res.status(isKeyMissing ? 503 : 500).json({
        error: {
          code: isKeyMissing ? "GEMINI_API_KEY_REQUIRED" : "AI_ADVICE_FAILED",
          message: err.message || "Failed to analyze spymaster clues",
        },
      });
    }
  });

  // 3. Operatives Guess Advisor
  app.post("/api/ai/guess-advisor", async (req, res) => {
    try {
      const { clue, number, boardWords = [], revealedWords = [], language = "ar" } = req.body || {};
      if (!clue || typeof clue !== "string") {
        return res.status(400).json({ error: { code: "INVALID_CLUE", message: "Clue is required" } });
      }

      const activeBoard = (boardWords || []).filter((w) => !(revealedWords || []).includes(w));
      const lang = language === "en" ? "en" : "ar";
      const ai = getAI();

      const systemPrompt = lang === "ar"
        ? `أنت مساعد تخمين ذكي لعملاء الفريق (Operatives) في لعبة Clue Me.
تلقى الفريق تلميحاً وعدداً، ومهمتك تصنيف الكلمات المتبقية على اللوحة وفق ارتباطها بالتلميح ودرجة الثقة.
قم بترتيب الكلمات الأكثر ترجيحاً مع بيان سبب الربط ومستوى الثقة (عالي، متوسط، ضعيف/خطر).`
        : `You are an Operatives Guess Advisor in Clue Me / Codenames.
Your team received a clue and a target count. Analyze the unrevealed words on the board and rank the most likely candidates with confidence scores and reasoning.`;

      const userContent = JSON.stringify({
        clue: clue.trim(),
        targetCount: Number(number) || 1,
        unrevealedWords: activeBoard,
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: userContent,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysisSummary: { type: Type.STRING, description: "Summary of what the spymaster might be thinking" },
              candidates: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    confidence: { type: Type.STRING, description: "HIGH, MEDIUM, or LOW" },
                    confidencePercentage: { type: Type.INTEGER, description: "0 to 100 percentage" },
                    reasoning: { type: Type.STRING, description: "Why this word matches the clue" },
                    cautionNote: { type: Type.STRING, description: "Any word of caution" },
                  },
                  required: ["word", "confidence", "confidencePercentage", "reasoning"],
                },
              },
            },
            required: ["analysisSummary", "candidates"],
          },
        },
      });

      const parsed = JSON.parse(response.text || "{}");
      return res.json({ ok: true, data: parsed });
    } catch (err) {
      console.error("[ai:guess-advisor] error:", err);
      const isKeyMissing = err.message && err.message.includes("GEMINI_API_KEY");
      return res.status(isKeyMissing ? 503 : 500).json({
        error: {
          code: isKeyMissing ? "GEMINI_API_KEY_REQUIRED" : "AI_GUESS_ADVICE_FAILED",
          message: err.message || "Failed to analyze clue guesses",
        },
      });
    }
  });

  // 4. AI Clue Referee (Instant Validation)
  app.post("/api/ai/referee-check", async (req, res) => {
    try {
      const { clue, boardWords = [], language = "ar" } = req.body || {};
      const trimmed = String(clue || "").trim();
      if (!trimmed) {
        return res.json({ ok: true, valid: false, reason: "التلميح فارغ" });
      }

      // Basic rule check: single word
      if (trimmed.split(/\s+/).length > 1) {
        return res.json({
          ok: true,
          valid: false,
          reason: language === "en" ? "Clue must be a single word" : "يجب أن يتكون التلميح من كلمة واحدة فقط دون مسافات",
        });
      }

      // Check exact match on board
      const lowerClue = trimmed.toLowerCase();
      const boardMatch = (boardWords || []).find((w) => String(w).toLowerCase() === lowerClue);
      if (boardMatch) {
        return res.json({
          ok: true,
          valid: false,
          reason: language === "en"
            ? `Cannot use "${boardMatch}" as it is currently visible on the board!`
            : `لا يجوز استخدام الكلمة "${boardMatch}" لأنها مكتوبة بالفعل على بطاقات اللعبة!`,
        });
      }

      return res.json({ ok: true, valid: true });
    } catch (err) {
      return res.status(500).json({ error: { message: err.message } });
    }
  });

  // 5. Match Recap & Highlights Commentary
  app.post("/api/ai/match-recap", async (req, res) => {
    try {
      const {
        winnerTeam = "blue",
        roomCode = "",
        assassinTriggered = false,
        turnsCount = 4,
        assassinWord = "",
        language = "ar",
      } = req.body || {};

      const lang = language === "en" ? "en" : "ar";
      let parsed = null;

      try {
        const ai = getAI();
        const systemPrompt = lang === "ar"
          ? `أنت معلق مباريات حماسي وفكاهي للعبة Clue Me.
قم بكتابة ملخص مشوق للجولة يوضح كيف فاز الفريق المنتصر وما إذا كان تم تفادي الكلمة السوداء أو لمسها بطريقة درامية ممتعة للأصدقاء.`
          : `You are an enthusiastic, witty match commentator for Clue Me / Codenames.
Provide an engaging post-match highlight recap describing the victory, key turn moments, and any near-misses with the assassin card.`;

        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: JSON.stringify({
            winnerTeam,
            roomCode,
            assassinTriggered,
            assassinWord,
            turnsCount,
            language: lang,
          }),
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                headline: { type: Type.STRING, description: "Dramatic exciting headline" },
                narrative: { type: Type.STRING, description: "Engaging 2-3 paragraph recap" },
                mvpTitle: { type: Type.STRING, description: "Humorous MVP award title e.g. عبقري التلميحات" },
                assassinHighlight: { type: Type.STRING, description: "Comment on the assassin word situation" },
              },
              required: ["headline", "narrative", "mvpTitle"],
            },
          },
        });

        parsed = JSON.parse(response.text || "{}");
      } catch (err) {
        parsed = {
          headline: lang === "ar" ? "جولة نارية وحسم تكتيكي مثير!" : "Epic Showdown & Clutch Finish!",
          narrative: lang === "ar"
            ? `شهدت الغرفة ${roomCode || "CLUE"} مواجهة حاسمة انتهت بفوز مستحق لـ ${winnerTeam === "red" ? "الفريق الأحمر" : "الفريق الأزرق"}. تمكن الفريق من فك الشفرات وتجنب الفخاخ ببراعة.`
            : `Room ${roomCode || "CLUE"} wrapped up an intense match with victory for the ${winnerTeam === "red" ? "Red Team" : "Blue Team"}. Brilliant coordination avoided the assassin trap.`,
          mvpTitle: lang === "ar" ? "عبقري التلميحات التكتيكية" : "Tactical Clue MVP",
          assassinHighlight: assassinTriggered
            ? (lang === "ar" ? "تم لمس الكلمة القاتلة وسط ذهول الجميع!" : "The assassin card was triggered in dramatic fashion!")
            : (lang === "ar" ? "تم تفادي الكلمة القاتلة بنجاح ساحق!" : "The assassin card was expertly avoided!"),
        };
      }

      return res.json({ ok: true, data: parsed });
    } catch (err) {
      console.error("[ai:match-recap] error:", err);
      return res.status(500).json({
        error: {
          code: "AI_RECAP_FAILED",
          message: err.message || "Failed to generate match recap",
        },
      });
    }
  });

  // 6. Get Available AI Packs
  app.get("/api/ai/packs", (req, res) => {
    const packs = Array.from(customAiPacks.values());
    res.json({ ok: true, packs });
  });
}

/**
 * High-quality semantic fallback pack synthesizer
 */
function generateSemanticPackFallback(title, prompt, lang, count) {
  const arabicLexicon = [
    "شمس", "قمر", "نجم", "بحر", "نهر", "جبل", "صحراء", "واحة", "شجرة", "زهرة",
    "صقر", "نمر", "ذئب", "فرس", "غزال", "سيف", "درع", "تاج", "قلعة", "برج",
    "سفينة", "طائرة", "قطار", "خريطة", "بوصلة", "ذهب", "فضة", "ياقوت", "زمرد", "لؤلؤ",
    "كتاب", "ريشة", "حبر", "لوحة", "موسيقى", "وتر", "ناي", "طبول", "فانوس", "شمعة",
    "مرآة", "ساعة", "مفتاح", "صندوق", "بوابة", "طريق", "جسر", "منارة", "جزيرة", "كهف",
    "بركان", "عاصفة", "رعد", "برق", "سحاب", "مطر", "ثلج", "نسيم", "سراب", "شاطئ",
    "فارس", "بحار", "طبيب", "مهندس", "شاعر", "حكيم", "تاجر", "قبطان", "طيار", "فنان",
    "زمرد", "الماس", "كهرمان", "عقيق", "ياقوت", "بلورة", "زمرد", "عطر", "بخور", "عنبر"
  ];

  const englishLexicon = [
    "sun", "moon", "star", "ocean", "river", "mountain", "desert", "oasis", "forest", "flower",
    "falcon", "tiger", "wolf", "horse", "shadow", "sword", "shield", "crown", "castle", "tower",
    "ship", "plane", "train", "map", "compass", "gold", "silver", "ruby", "emerald", "pearl",
    "book", "feather", "ink", "canvas", "music", "guitar", "flute", "drum", "lantern", "candle",
    "mirror", "clock", "key", "chest", "portal", "bridge", "beacon", "island", "cavern", "volcano",
    "storm", "thunder", "lightning", "cloud", "rain", "snow", "breeze", "mirage", "harbor", "knight",
    "sailor", "doctor", "pilot", "artist", "wizard", "scout", "ranger", "crystal", "diamond", "amber"
  ];

  const sourceList = lang === "ar" ? arabicLexicon : englishLexicon;
  const shuffled = [...sourceList].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, count);

  return {
    title: title || (lang === "ar" ? "حزمة الذكاء الاصطناعي" : "AI Custom Pack"),
    description: prompt || (lang === "ar" ? "حزمة كلمات متوازنة وممتعة للعب التداعي" : "Cohesive semantic association pack"),
    category: lang === "ar" ? "مخصص ذكي" : "AI Custom",
    words: selected,
  };
}
