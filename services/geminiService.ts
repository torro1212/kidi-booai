
import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { Book, BookRequest, PreviousBookContext } from "../types";
import { apiKeyManager } from "./apiKeyManager";

// Helper to get API key
const getApiKey = (): string => {
  const key = apiKeyManager.getKey();
  if (!key) {
    throw new Error('API key not configured');
  }
  return key;
};

// Helper to check for fatal auth/quota errors
const handleFatalError = (err: any) => {
  // Inspect if the error is wrapped in an 'error' property (common in Google JSON responses)
  const errorObj = err?.error || err;

  const msg = (errorObj?.message || JSON.stringify(err)).toLowerCase();
  const status = errorObj?.status || errorObj?.code;

  // Check for Quota issues
  const isQuota =
    status === 429 ||
    status === 'RESOURCE_EXHAUSTED' ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    // Specific check for "limit: 0" which often means model not available in plan or exhausted
    msg.includes("limit: 0");

  // Check for Auth issues (Invalid Key, Expired Key, Project not found)
  const isAuth =
    status === 403 ||
    // Status 400 is normally Invalid Argument, but if message says "API key expired", it's auth.
    (status === 400 && (msg.includes("api key") || msg.includes("expired"))) ||
    msg.includes("api key") ||
    msg.includes("unauthenticated") ||
    msg.includes("permission denied") ||
    msg.includes("requested entity was not found") ||
    msg.includes("expired");

  if (isQuota || isAuth) {
    console.warn(`Fatal API Error (${isQuota ? 'Quota' : 'Auth'}). Triggering Re-auth.`, err);
    window.dispatchEvent(new CustomEvent('reselect-api-key'));
    return true;
  }
  return false;
};

// Helper for retry logic with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Check for fatal errors first. If fatal, do not retry.
    if (handleFatalError(error)) {
      throw error;
    }

    const status = error.status || error.code;
    const message = (error.message || '').toLowerCase();

    // Check if error is retryable (Transient 5xx server errors)
    // Note: We handled 429/Quota above as fatal because usually in this context implies Daily Limit, not just QPM.
    const isRetryable =
      (status && [500, 503].includes(status)) ||
      (message.includes('internal') ||
        message.includes('overloaded') ||
        message.includes('timeout'));

    if (retries > 0 && isRetryable) {
      console.warn(`Retrying operation due to error: ${message}. Attempts left: ${retries}. Waiting ${baseDelay}ms.`);
      await new Promise(resolve => setTimeout(resolve, baseDelay));
      return retryWithBackoff(fn, retries - 1, baseDelay * 2);
    }
    throw error;
  }
}

// Define the response schema for the book using the Type enum
const bookSchema = {
  type: Type.OBJECT,
  properties: {
    metadata: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: "The title of the book in Hebrew ONLY. Do NOT include English translation."
        },
        targetAge: { type: Type.STRING },
        mainTheme: { type: Type.STRING },
        educationalMessage: { type: Type.STRING },
        artStyle: {
          type: Type.STRING,
          description: "Detailed description of the art style."
        },
        mainCharacterDescription: {
          type: Type.STRING,
          description: "Comprehensive physical description of the MAIN character (clothing, hair, accessories). Be very specific about colors."
        },
        mainCharacterDistinctiveMark: {
          type: Type.STRING,
          description: "A specific, unique visual feature for the main character that acts as a visual anchor (e.g., 'big red glasses', 'a star patch on the overalls', 'a glowing blue pendant', 'a purple feather in hat'). This MUST be included in every single image description."
        },
        secondaryCharacterDescription: {
          type: Type.STRING,
          description: "If there is a constant companion (animal, friend, sibling) that appears in multiple pages, describe them here with EXTREME DETAIL. Include: Species, Color (specific shade), Size, Accessories, and Distinctive Marks. e.g. 'A rotund bright-yellow chick with large anime-style blue eyes, a tiny orange beak, and wearing a miniature red wool scarf'. This description MUST be unique and unchanging."
        },
        secondaryCharacterDistinctiveMark: {
          type: Type.STRING,
          description: "A specific, unique visual feature for the secondary character (if present) that acts as a visual anchor."
        },
        keyObjectDescription: {
          type: Type.STRING,
          description: "Description of any recurring magical or key object."
        },
        characterColorPalette: {
          type: Type.OBJECT,
          description: "EXACT HEX color codes for the main character. These MUST be consistent across ALL images.",
          properties: {
            skinTone: {
              type: Type.STRING,
              description: "HEX code for skin color, e.g. '#F5D0C5' for light peach, '#8D5524' for brown, '#D4A373' for tan"
            },
            hairColor: {
              type: Type.STRING,
              description: "HEX code for hair color, e.g. '#2C1810' for dark brown, '#FFD700' for blonde, '#8B0000' for red"
            },
            primaryClothingColor: {
              type: Type.STRING,
              description: "HEX code for main clothing item color, e.g. '#FF4444' for red, '#1E90FF' for blue"
            },
            secondaryClothingColor: {
              type: Type.STRING,
              description: "HEX code for secondary clothing/accessory color"
            },
            distinctiveMarkColor: {
              type: Type.STRING,
              description: "HEX code for the distinctive mark/accessory color"
            }
          },
          required: ["skinTone", "hairColor", "primaryClothingColor", "secondaryClothingColor", "distinctiveMarkColor"]
        },
        titlePrimaryColor: { type: Type.STRING },
        titleSecondaryColor: { type: Type.STRING },
        titleEffectTheme: {
          type: Type.STRING,
          enum: ['magical', 'natural', 'tech', 'classic', 'playful', 'elegant']
        },
        visualConsistencyGuide: {
          type: Type.OBJECT,
          properties: {
            characterTraits: { type: Type.ARRAY, items: { type: Type.STRING } },
            objectTraits: { type: Type.ARRAY, items: { type: Type.STRING } },
            backgroundStyle: { type: Type.STRING }
          },
          required: ["characterTraits", "objectTraits", "backgroundStyle"]
        }
      },
      required: ["title", "targetAge", "mainTheme", "educationalMessage", "mainCharacterDescription", "mainCharacterDistinctiveMark", "artStyle", "keyObjectDescription", "characterColorPalette", "titlePrimaryColor", "titleSecondaryColor", "titleEffectTheme", "visualConsistencyGuide"],
    },
    pages: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          pageNumber: { type: Type.INTEGER },
          hebrewText: {
            type: Type.STRING,
            description: "For non-comic books: the full Hebrew text. For comic books: a summary of approx 20 words (panels have individual captions)."
          },
          imagePrompt: {
            type: Type.STRING,
            description: `Detailed ENGLISH visual scene description. CRITICAL REQUIREMENTS FOR VARIETY:
            
            1. CAMERA ANGLE (must vary each page): Close-up, Medium shot, Wide shot, Bird's eye view, Low angle, Over-the-shoulder, Dutch angle
            2. BACKGROUND DEPTH: Describe FOREGROUND, MIDDLE GROUND, and BACKGROUND separately
            3. LIGHTING/TIME: Specify time of day and lighting (morning sunlight, sunset glow, moonlight, stormy clouds, golden hour, etc.)
            4. ENVIRONMENTAL DETAILS: Weather, atmosphere, specific location features
            5. COLOR PALETTE: Mention dominant colors for this specific scene
            
            EXAMPLES OF GOOD VARIETY:
            ❌ BAD: "The character in the forest"
            ✅ GOOD: "Close-up of character's surprised face, sunlight dappling through dense foliage behind them, morning mist rising from mossy ground, warm golden tones"
            
            ❌ BAD: "Character walking in the field"  
            ✅ GOOD: "Wide aerial shot looking down at character walking through lavender field, distant mountains silhouetted against orange sunset sky, purple and orange color scheme, long shadows stretching across rolling hills"
            
            Make EVERY page visually DISTINCT!`
          },
          // PANEL-FIRST: For comic books, each inner page has 4 panels
          panels: {
            type: Type.OBJECT,
            description: `FOR COMIC ART STYLE ONLY: Generate exactly 4 panels for each inner page.
            Hebrew RTL reading order: A=top-right, B=top-left, C=bottom-right, D=bottom-left.
            Each panel is ONE visual moment with ONE standalone HEBREW caption.
            CRITICAL: Each caption must be in HEBREW (עברית) ONLY. NO ENGLISH TEXT IN CAPTIONS!
            CRITICAL: Each caption must describe ONLY that panel. NO continuation between panels.`,
            properties: {
              A: {
                type: Type.OBJECT,
                properties: {
                  scene: { type: Type.STRING, description: "English scene description for panel A (top-right, first panel)" },
                  caption: { type: Type.STRING, description: "כיתוב בעברית בלבד! HEBREW ONLY caption for panel A. Write in Hebrew (עברית). 5-9 words. NO connectors. Example: 'דני פתח את הדלת הענקית בסקרנות'" }
                },
                required: ["scene", "caption"]
              },
              B: {
                type: Type.OBJECT,
                properties: {
                  scene: { type: Type.STRING, description: "English scene description for panel B (top-left, second panel)" },
                  caption: { type: Type.STRING, description: "כיתוב בעברית בלבד! HEBREW ONLY caption for panel B. Write in Hebrew (עברית). 5-9 words. NO connectors. Example: 'כלב קטן וחמוד קפץ פתאום פנימה'" }
                },
                required: ["scene", "caption"]
              },
              C: {
                type: Type.OBJECT,
                properties: {
                  scene: { type: Type.STRING, description: "English scene description for panel C (bottom-right, third panel)" },
                  caption: { type: Type.STRING, description: "כיתוב בעברית בלבד! HEBREW ONLY caption for panel C. Write in Hebrew (עברית). 5-9 words. NO connectors. Example: 'הילד ירד לברכיים וחיבק את הכלב'" }
                },
                required: ["scene", "caption"]
              },
              D: {
                type: Type.OBJECT,
                properties: {
                  scene: { type: Type.STRING, description: "English scene description for panel D (bottom-left, fourth panel)" },
                  caption: { type: Type.STRING, description: "כיתוב בעברית בלבד! HEBREW ONLY caption for panel D. Write in Hebrew (עברית). 5-9 words. NO connectors. Example: 'שניהם ישבו יחד על הספה האדומה'" }
                },
                required: ["scene", "caption"]
              }
            },
            required: ["A", "B", "C", "D"]
          }
        },
        required: ["pageNumber", "hebrewText", "imagePrompt"],
      },
    },
  },
  required: ["metadata", "pages"],
};

export const generateStoryIdea = async (ageRange: string, currentTopic: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const prompt = `You are a creative children's book editor. 
  The user wants an idea for a book.
  Target Age: ${ageRange}
  User's rough idea (optional): "${currentTopic}"

  Please generate a short, structured concept in HEBREW (עברית).
  Structure:
  1. שם הספר (Title)
  2. דמות ראשית (Main Character - Name + A unique visual trait/mark)
  3. תקציר העלילה (Short Plot Summary)
  
  Make it engaging, magical, and suitable for the age group. 
  Do not include markdown formatting like ** or ##. Just clean text.`;

  try {
    // Using flash for speed
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
        maxOutputTokens: 300,
      }
    }));
    return response.text || "";
  } catch (error: any) {
    console.error("Error generating idea:", error);
    // If handleFatalError returns true, it's a critical auth/quota error and we let the UI redirect.
    // If it returns false, we throw so the component can show a specific alert.
    if (!handleFatalError(error)) {
      throw error;
    }
    return "";
  }
};

export const generateBookContent = async (request: BookRequest): Promise<Book> => {
  // Copyright check before generation
  const { validateBookRequest, logGeneratedBook } = await import('./promptGuard');
  const copyrightCheck = await validateBookRequest(request.topic);
  if (!copyrightCheck.allowed) {
    throw new Error(copyrightCheck.reason || 'Content blocked');
  }

  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const systemInstruction = `You are a world-class children's book author and art director.
  
  TASK: Create a magical children's book in Hebrew with detailed English art direction.
  
  STRICT PAGE COUNT: EXACTLY ${request.pageCount} pages.
  
  GUIDELINES:
  
  1. STORY TEXT (Hebrew) - CRITICAL QUALITY RULES:
     - Write CLEAR, NATURAL language that children can understand easily
     - Focus on MEANINGFUL content - every word should serve the story
     - DO NOT force rhymes! Natural prose is better than awkward rhyming
     - If you do use rhymes, they must be NATURAL and not compromise meaning
     - AVOID filler words just to make sentences longer or to create rhymes
     - Keep sentences SHORT and SIMPLE for the target age group
     - Each page should advance the story or teach something valuable
     - Grammar must be PERFECT (Hebrew)
     - CRITICAL: The 'title' in metadata MUST be in Hebrew ONLY
     
  2. EDUCATIONAL VALUE:
     - Embed the educational message naturally into the story
     - Don't preach - show through character actions and consequences
     - Make learning feel like part of the adventure
     
  3. ART DIRECTION (English):
     - 'mainCharacterDescription': A precise, unchanging visual definition
     - 'mainCharacterDistinctiveMark': CREATE A UNIQUE IDENTIFIER (e.g., "Rainbow Scarf", "Golden Goggles")
     - 'visualConsistencyGuide': List specific items/colors that MUST appear in every image
     - 'imagePrompt' (for each page): A FULL SCENE DESCRIPTION
     
     **CRITICAL - CHARACTER INCLUSION RULES:**
     - ONLY include the MAIN character in imagePrompt if they appear in that page's text
     - ONLY include the SECONDARY character in imagePrompt if EXPLICITLY mentioned/relevant in that page's text
     - DO NOT automatically add secondary character to every page
     - If the text says "הילד הלך לבד" (the child went alone) → NO secondary character in image
     - If the text mentions both characters → Include both in image
     - Read the Hebrew text CAREFULLY before writing the imagePrompt
     
  4. VISUAL VARIETY (ABSOLUTELY CRITICAL - READ CAREFULLY):
     
     **BACKGROUND MUST CHANGE DRAMATICALLY BETWEEN PAGES:**
     - Each page should feel like a COMPLETELY DIFFERENT SCENE
     - Don't just move the character - CHANGE THE ENTIRE ENVIRONMENT
     - Vary: Location, Time of Day, Weather, Lighting, Season, Indoor/Outdoor
     
     **SPECIFIC TECHNIQUES TO USE:**
     
     A) LOCATION VARIETY (within same general setting):
        - If in forest: Dense canopy → Open clearing → Riverside → Cave entrance → Tree hollow → Mushroom grove
        - If in city: Busy street → Quiet alley → Rooftop → Park → Shop interior → Underground tunnel
        - If in home: Kitchen → Bedroom → Attic → Garden → Basement → Window view
     
     B) TIME & LIGHTING (rotate through):
        - Dawn (soft pink/orange light, long shadows)
        - Midday (bright, high contrast, blue sky)
        - Sunset (golden hour, warm oranges/purples)
        - Night (moonlight, stars, cool blues)
        - Stormy (dark clouds, dramatic lighting)
     
     C) WEATHER & ATMOSPHERE:
        - Clear sky → Cloudy → Rainy → Foggy → Snowy → Windy
        - Each creates COMPLETELY different mood and colors
     
     D) CAMERA ANGLES (use different one each page):
        - Page 1: Wide establishing shot
        - Page 2: Close-up on character's face
        - Page 3: Bird's eye view from above
        - Page 4: Low angle looking up
        - Page 5: Over-the-shoulder perspective
        - (Continue varying throughout)
     
     E) DEPTH & COMPOSITION:
        - Always describe: Foreground elements → Middle ground action → Background scenery
        - Example: "Flowers in foreground, character in middle, mountains in background"
     
     **COLOR PALETTE MUST VARY:**
     - Page 1: Warm (reds, oranges, yellows)
     - Page 2: Cool (blues, purples, greens)  
     - Page 3: Neutral (browns, grays, whites)
     - (Rotate to create visual rhythm)
     
  5. COMPOSITION AWARENESS:
     - Images must be FULL BLEED, filling entire square 1:1 canvas
     - Center the action
     - Do NOT leave empty space for text
  `;

  let prompt = `Create a children's book.
  Target Age: ${request.ageRange}
  Topic: ${request.topic}
  REQUIRED LENGTH: EXACTLY ${request.pageCount} pages. Start with page 1 as the cover and end with page ${request.pageCount}.
  Art Style Selection: ${request.artStyle}
  
  WRITING EXAMPLES:
  
  ❌ BAD (Forced rhyme, filler words):
  "הצב הקטן הלך בדרך ארוכה עם כובע על ראשו באופן מיוחד ונפלא"
  (Too many unnecessary descriptive words just to make it longer)
  
  ✅ GOOD (Clear, meaningful):
  "הצב הקטן הלך לחפש את חבריו"
  (Simple, clear, advances the story)
  
  ❌ BAD (Awkward rhyme):
  "היא קפצה לשמיים ועפה עם הציפורים והכל היה מלא בצבעי קשת בהירים"
  (Forced ending just to rhyme, doesn't make sense)
  
  ✅ GOOD (Natural, meaningful):
  "היא קפצה גבוה וראתה את העולם מלמעלה. כמה יפה!"
  (Natural exclamation, conveys emotion without forcing rhyme)
  
  CHARACTER INCLUSION EXAMPLES:
  
  Page Text: "הילד הלך לבד ביער האפל"
  ✅ CORRECT imagePrompt: "Young boy walking alone through dark forest, moonlight filtering through bare trees"
  ❌ WRONG imagePrompt: "Young boy and his bird companion walking through dark forest" (bird not mentioned!)
  
  Page Text: "הילד והציפור שלו חיפשו את האוצר"
  ✅ CORRECT imagePrompt: "Young boy with colorful bird perched on shoulder, both looking at treasure map"
  ❌ WRONG imagePrompt: "Young boy looking at treasure map" (bird IS mentioned, must include!)
  
  Page Text: "בבית, אמא הכינה ארוחה"
  ✅ CORRECT imagePrompt: "Cozy kitchen, mother preparing meal at wooden table"
  ❌ WRONG imagePrompt: "Mother and main character in kitchen" (main character not in this scene!)
  
  Remember: Quality over rhyming. Every word should have PURPOSE. Match images to TEXT!
  
  ===== COMIC BOOK PANEL-FIRST GENERATION (FOR 4-PANEL COMIC ART STYLE) =====
  
  If the artStyle is "4-panel comic" or similar comic format:
  
  MANDATORY: For EVERY inner page (not cover), you MUST generate the 'panels' object with A/B/C/D.
  
  HEBREW RTL PANEL ORDER:
  - A = top-right (first panel)
  - B = top-left (second panel)
  - C = bottom-right (third panel)
  - D = bottom-left (fourth panel)
  
  PANEL GENERATION RULES (CRITICAL):
  ⚠️ LANGUAGE: ALL CAPTIONS MUST BE IN HEBREW (עברית) ONLY! NO ENGLISH TEXT!
  1. Each panel is ONE VISUAL MOMENT - a single action or scene
  2. Each caption describes EXACTLY what happens in THAT SPECIFIC PANEL - IN HEBREW
  3. Captions must be COMPLETELY STANDALONE - readable without other panels
  4. NO CONTINUATION between panels - no "and then", "but", "so"
  5. NO CONNECTORS at start: ו, ואז, אבל, כי, ש, לכן, אז, גם, רק
  6. NO CONNECTORS at end
  7. Each caption: EXACTLY 5-9 Hebrew words, max 65 characters (approx 20+ words per page total)
  8. Each caption must be a COMPLETE THOUGHT in Hebrew matching the visual
  
  GOOD EXAMPLES:
  Panel A: { scene: "Boy opens front door, surprised expression", caption: "דני פתח את הדלת בסקרנות" }
  Panel B: { scene: "Small brown dog jumps into the room", caption: "כלב קטן קפץ לתוך הבית" }
  Panel C: { scene: "Boy kneels down hugging the dog", caption: "דני חיבק את הכלב בשמחה" }
  Panel D: { scene: "Boy and dog sitting together on couch", caption: "הם ישבו יחד על הספה" }
  
  BAD EXAMPLES (DO NOT DO THIS):
  ❌ caption: "ואז הכלב נכנס" (starts with connector)
  ❌ caption: "דני שמח כי" (ends with connector)
  ❌ caption: "הוא המשיך ללכת ו" (incomplete, ends with connector)
  ❌ caption: "דני ראה את מה שקרה אחר כך" (references other panels)
  
  TEST: If you swap panel B and D, the captions should NO LONGER make sense together.
  This proves each caption is truly standalone.`;

  if (request.previousContext) {
    prompt += `
    
    ===== SEQUEL MODE - CRITICAL CHARACTER CONSISTENCY =====
    
    This is a CONTINUATION of the story: "${request.previousContext.title}".
    
    YOU MUST MAINTAIN EXACT VISUAL CONSISTENCY WITH THE PREVIOUS BOOK.
    
    PREVIOUS MAIN CHARACTER (COPY EXACTLY):
    ${request.previousContext.characterDescription}
    
    ${request.previousContext.secondaryCharacterDescription ? `PREVIOUS SECONDARY CHARACTER (COPY EXACTLY):
    ${request.previousContext.secondaryCharacterDescription}` : ''}
    
    CRITICAL RULES FOR SEQUEL:
    1. The main character's appearance MUST be IDENTICAL to the previous book
    2. SAME skin tone - do not change the character's skin color
    3. SAME hair color and style
    4. SAME clothing style and colors (unless story requires change)
    5. SAME distinctive features and accessories
    6. The art style MUST match: ${request.previousContext.artStyle}
    
    Failure to maintain visual consistency will confuse children reading the sequel!
    `;
  }

  try {
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: bookSchema,
        systemInstruction: systemInstruction,
      }
    }));

    if (!response.text) {
      throw new Error("Failed to generate book content");
    }

    const book = JSON.parse(response.text) as Book;

    // Safety check for page count
    console.log(`Requested ${request.pageCount} pages, received ${book.pages.length} pages.`);

    // Inject Audio Configuration from Request
    book.metadata.audioConfig = {
      enabled: request.audioEnabled,
      voiceName: request.voiceName
    };

    if (request.previousContext?.baseCharacterImage) {
      book.metadata.baseCharacterImageUrl = request.previousContext.baseCharacterImage;
    }

    // Refine all image prompts to include the consistency guide for BOTH characters
    const traits = book.metadata.visualConsistencyGuide.characterTraits.join(", ");
    const objTraits = book.metadata.visualConsistencyGuide.objectTraits.join(", ");
    const mainMark = book.metadata.mainCharacterDistinctiveMark || "Distinctive feature";
    const secMark = book.metadata.secondaryCharacterDistinctiveMark;

    book.pages = book.pages.map((page, idx) => {
      // 1. Establish the visual anchor (Characters & Style)
      let refinedPrompt = `[MAIN CHARACTER]: ${book.metadata.mainCharacterDescription}. DISTINCTIVE FEATURE: ${mainMark}. Key Features: ${traits}. `;

      if (book.metadata.secondaryCharacterDescription) {
        refinedPrompt += `[SECONDARY CHARACTER]: ${book.metadata.secondaryCharacterDescription}. DISTINCTIVE FEATURE: ${secMark || 'None'}. `;
      }

      // 2. Set the Environment/Atmosphere 
      // NOTE: We label this "General Context" so it doesn't override the specific scene action
      refinedPrompt += `[GENERAL CONTEXT]: ${book.metadata.visualConsistencyGuide.backgroundStyle}. `;
      if (objTraits) refinedPrompt += `[PROPS]: ${objTraits}. `;

      // 3. Define the specific scene action - THIS IS PRIORITY
      refinedPrompt += `[SPECIFIC SCENE ACTION & ANGLE]: ${page.imagePrompt}. `;

      return { ...page, imagePrompt: refinedPrompt };
    });

    // PANEL-FIRST: For comic books, derive panelCaptions from panels (generated directly by Gemini)
    const isComicBook = book.metadata.artStyle.toLowerCase().includes('comic');
    if (isComicBook) {
      const { validateCaption, normalizeCaption } = await import('./captionService');

      for (let i = 0; i < book.pages.length; i++) {
        const page = book.pages[i];
        const isCover = i === 0;

        // Only process inner comic pages
        if (!isCover && page.panels) {
          // Derive panelCaptions from panels (validate and normalize each caption)
          const panelCaptions = {
            A: normalizeCaption(page.panels.A?.caption || ''),
            B: normalizeCaption(page.panels.B?.caption || ''),
            C: normalizeCaption(page.panels.C?.caption || ''),
            D: normalizeCaption(page.panels.D?.caption || '')
          };

          // Validate each caption
          const panelIds = ['A', 'B', 'C', 'D'] as const;
          let hasValidationErrors = false;
          let errorDetails: string[] = [];

          for (const panelId of panelIds) {
            const result = validateCaption(panelCaptions[panelId], panelId);
            if (!result.valid) {
              console.warn(`Page ${i + 1} Panel ${panelId} validation failed:`, result.errors);
              hasValidationErrors = true;
              errorDetails.push(...result.errors);
            }
          }

          // If any caption fails validation (length, language, connectors), regenerate!
          if (hasValidationErrors) {
            console.warn(`Page ${i + 1}: Validation errors detected (${errorDetails.join('; ')}), regenerating captions...`);
            try {
              const { generateComicCaptions, extractPanelScenesFromPrompt } = await import('./captionService');
              // Use panel scenes from the Gemini-generated panels
              const panelScenes = [
                { id: 'A' as const, scenePrompt: page.panels.A?.scene || '' },
                { id: 'B' as const, scenePrompt: page.panels.B?.scene || '' },
                { id: 'C' as const, scenePrompt: page.panels.C?.scene || '' },
                { id: 'D' as const, scenePrompt: page.panels.D?.scene || '' }
              ];
              const hebrewCaptions = await generateComicCaptions({
                pageId: String(i + 1),
                panels: panelScenes,
                targetAge: book.metadata.targetAge,
                mainTheme: book.metadata.mainTheme
              });
              page.panelCaptions = hebrewCaptions;
              console.log(`Page ${i + 1}: Regenerated Hebrew captions successfully`, hebrewCaptions);
            } catch (error) {
              console.error(`Failed to regenerate Hebrew captions for page ${i + 1}:`, error);
              page.panelCaptions = {
                A: 'תמונה ראשונה מרגשת ויפה מאוד',
                B: 'תמונה שנייה שממשיכה את הסיפור',
                C: 'תמונה חמודה שמראה שלב נוסף',
                D: 'תמונה רביעית שמסיימת את הדף'
              };
              console.warn(`Page ${i + 1}: Used hardcoded Hebrew fallback due to regeneration failure.`);
            }
          } else {
            page.panelCaptions = panelCaptions;
            console.log(`Page ${i + 1}: Derived panelCaptions from panels (all Hebrew)`, panelCaptions);
          }

          // PAGE-LEVEL WORD COUNT VALIDATION (CRITICAL)
          // Even if individual panels passed validation, check TOTAL words per page
          const totalWords = [
            page.panelCaptions.A,
            page.panelCaptions.B,
            page.panelCaptions.C,
            page.panelCaptions.D
          ]
            .map(caption => caption.split(/\s+/).filter(Boolean).length)
            .reduce((sum, count) => sum + count, 0);

          console.log(`🔍 PAGE ${i + 1} WORD COUNT CHECK: ${totalWords} words total`);
          console.log(`   A: "${page.panelCaptions.A}" (${page.panelCaptions.A.split(/\s+/).filter(Boolean).length} words)`);
          console.log(`   B: "${page.panelCaptions.B}" (${page.panelCaptions.B.split(/\s+/).filter(Boolean).length} words)`);
          console.log(`   C: "${page.panelCaptions.C}" (${page.panelCaptions.C.split(/\s+/).filter(Boolean).length} words)`);
          console.log(`   D: "${page.panelCaptions.D}" (${page.panelCaptions.D.split(/\s+/).filter(Boolean).length} words)`);

          const MIN_WORDS_PER_PAGE = 16;
          if (totalWords < MIN_WORDS_PER_PAGE) {
            console.warn(`Page ${i + 1}: TOTAL word count (${totalWords}) below minimum ${MIN_WORDS_PER_PAGE}, forcing regeneration...`);
            try {
              const { generateComicCaptions } = await import('./captionService');
              const panelScenes = [
                { id: 'A' as const, scenePrompt: page.panels.A?.scene || '' },
                { id: 'B' as const, scenePrompt: page.panels.B?.scene || '' },
                { id: 'C' as const, scenePrompt: page.panels.C?.scene || '' },
                { id: 'D' as const, scenePrompt: page.panels.D?.scene || '' }
              ];
              const hebrewCaptions = await generateComicCaptions({
                pageId: String(i + 1),
                panels: panelScenes,
                targetAge: book.metadata.targetAge,
                mainTheme: book.metadata.mainTheme
              });

              // Validate total again
              const newTotalWords = [hebrewCaptions.A, hebrewCaptions.B, hebrewCaptions.C, hebrewCaptions.D]
                .map(c => c.split(/\s+/).filter(Boolean).length)
                .reduce((s, n) => s + n, 0);

              if (newTotalWords >= MIN_WORDS_PER_PAGE) {
                page.panelCaptions = hebrewCaptions;
                console.log(`Page ${i + 1}: Regenerated captions with ${newTotalWords} total words`);
              } else {
                console.warn(`Page ${i + 1}: Regeneration still below minimum (${newTotalWords} words), using extended fallback`);
                page.panelCaptions = {
                  A: 'זהו הפאנל הראשון בסיפור המיוחד והמרתק שלנו',
                  B: 'כאן רואים את הפאנל השני המלא בפעולה',
                  C: 'עכשיו הגענו אל הפאנל השלישי המעניין מאוד',
                  D: 'ולסיום הנה הפאנל הרביעי והאחרון בדף'
                };
              }
            } catch (error) {
              console.error(`Failed to regenerate for word count on page ${i + 1}:`, error);
              page.panelCaptions = {
                A: 'זהו הפאנל הראשון בסיפור המיוחד והמרתק שלנו',
                B: 'כאן רואים את הפאנל השני המלא בפעולה',
                C: 'עכשיו הגענו אל הפאנל השלישי המעניין מאוד',
                D: 'ולסיום הנה הפאנל הרביעי והאחרון בדף'
              };
            }
          }

        } else if (!isCover && !page.panels && page.hebrewText) {
          // FALLBACK: If panels not generated, use legacy caption generation
          console.warn(`Page ${i + 1}: No panels data, falling back to caption generation`);
          try {
            const { generateComicCaptions, extractPanelScenesFromPrompt } = await import('./captionService');
            const panelScenes = extractPanelScenesFromPrompt(page.imagePrompt);
            const captions = await generateComicCaptions({
              pageId: String(i + 1),
              panels: panelScenes,
              targetAge: book.metadata.targetAge,
              mainTheme: book.metadata.mainTheme
            });
            page.panelCaptions = captions;
          } catch (error) {
            console.error(`Failed to generate fallback captions for page ${i + 1}:`, error);
          }
        }
      }
    }

    // Don't save here - saved during export instead
    return book;
  } catch (error: any) {
    console.error("Error generating book content:", error);
    // Extra catch just in case retryWithBackoff didn't catch it
    handleFatalError(error);
    throw error;
  }
};

export const generatePageImage = async (
  actionPrompt: string,
  characterDescription: string,
  artStyle: string,
  baseCharacterImageUrl?: string,
  isCover: boolean = false,
  textToRender?: string,
  colorPalette?: { skinTone: string; hairColor: string; primaryClothingColor: string; secondaryClothingColor: string; distinctiveMarkColor: string },
  hebrewText?: string
): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  // Build color lock section if palette is provided
  const colorLockSection = colorPalette ? `
      [COLOR LOCK - MANDATORY - DO NOT DEVIATE]:
      These are the EXACT HEX colors to use for the character. ANY deviation is FORBIDDEN.
      - SKIN TONE: ${colorPalette.skinTone} (EXACT match required)
      - HAIR COLOR: ${colorPalette.hairColor} (EXACT match required)
      - PRIMARY CLOTHING: ${colorPalette.primaryClothingColor} (EXACT match required)
      - SECONDARY CLOTHING/ACCESSORY: ${colorPalette.secondaryClothingColor} (EXACT match required)
      - DISTINCTIVE MARK: ${colorPalette.distinctiveMarkColor} (EXACT match required)
      
      VIOLATION EXAMPLES (FORBIDDEN):
      - If skin is ${colorPalette.skinTone}, DO NOT make it lighter or darker
      - If clothing is ${colorPalette.primaryClothingColor}, DO NOT change to any other shade
      - DO NOT interpret colors differently - use EXACT HEX values above
  ` : '';

  // Detect if this is comic strip style
  const isComicStyle = artStyle.toLowerCase().includes('comic');

  let finalPrompt = "";
  let modelName = "";
  let imageConfig = {};

  if (isCover) {
    // COVER STRATEGY: Use Pro model, bake text.
    modelName = 'gemini-3-pro-image-preview';
    imageConfig = { aspectRatio: "1:1", imageSize: "1K" };

    finalPrompt = `
      [ROLE]: Expert Children's Book Cover Designer.
      [ART STYLE]: ${artStyle}.
      
      [CAST DEFINITIONS]: 
      ${characterDescription}
      ${colorLockSection}
      
      [SCENE DESCRIPTION]: ${actionPrompt}
      
      [TITLE TEXT - ABSOLUTE REQUIREMENT]:
      The ONLY text in this entire image is: "${textToRender}"
      
      CRITICAL - TEXT RULES:
      1. ONLY display the exact title above - NO other text whatsoever
      2. ABSOLUTELY NO: subtitle, author, age range, page count, tagline, description
      3. ABSOLUTELY NO: "מחבר", "גיל", "עמודים", numbers, credits, watermarks
      4. ABSOLUTELY NO: English text, Latin letters, any text not in the title
      5. The title should be in the TOP THIRD of the image
      6. Use artistic Hebrew font matching ${artStyle} style
      7. Add glow/shadow behind text for readability
      
      [CHARACTER]:
      1. Main character must match Reference Image (if provided)
      2. Character in dynamic, inviting pose
      3. USE EXACT COLORS FROM COLOR LOCK SECTION ABOVE
      
      [TECHNICAL]: 8k resolution, cinematic lighting, vivid colors.
      [NEGATIVE PROMPT]: subtitle, author name, page count, age range, English text, extra text, watermark, tagline, credits, מחבר, גיל, עמודים, numbers at bottom, description text, any text besides title, wrong colors, different shades, changed clothing colors.
    `;

    // Add comic-specific instructions for cover
    if (isComicStyle) {
      finalPrompt += `
      
      [COMIC BOOK COVER STYLE - SPECIAL INSTRUCTIONS]:
      This is a COMIC BOOK cover, NOT a 4-panel layout.
      - Single heroic illustration (NO panels on the cover)
      - Bold, dynamic character pose
      - Vibrant action-oriented composition
      - Classic comic book cover aesthetic (think superhero comics)
      - Action lines, dramatic lighting, eye-catching colors
      `;
    }
  } else {
    // INNER PAGE STRATEGY: Use Flash model, NO text.
    modelName = 'gemini-2.5-flash-image';

    // Enhanced prompt with stronger character consistency
    finalPrompt = `
      [ROLE]: Professional Children's Book Illustrator specializing in character consistency.
      [ART STYLE]: ${artStyle}.
      
      [CAST DEFINITIONS - CRITICAL FOR CONSISTENCY]: 
      ${characterDescription}
      ${colorLockSection}
      
      [SCENE TO ILLUSTRATE]: 
      ${actionPrompt}
      
      [CHARACTER CONSISTENCY - MANDATORY]:
      1. SAME CHARACTER = IDENTICAL APPEARANCE in every illustration
      2. Main character MUST have the EXACT same:
         - Face shape and features
         - Hair color and style (USE EXACT HEX FROM COLOR LOCK)
         - Skin tone (USE EXACT HEX FROM COLOR LOCK)
         - Clothing colors (USE EXACT HEX FROM COLOR LOCK)
         - Any distinctive marks mentioned in CAST DEFINITIONS
      3. If a Reference Image is provided, the character MUST match it EXACTLY
      4. Secondary character (if present) must also be consistent
      5. DO NOT change character appearance between pages - COLORS MUST BE IDENTICAL
      
      [ILLUSTRATION RULES]:
      1. **ABSOLUTELY NO TEXT**: No text, speech bubbles, or words
      2. **FULL BLEED**: Use entire canvas, no borders or margins
      3. **DYNAMIC COMPOSITION**: Use the camera angle specified in the scene description
      
      [BACKGROUND INSTRUCTION]: 
      Match background to the specific scene action described above.
      Use varied camera angles (Close-up, Wide shot, Low angle) for visual variety.
      
      [TECHNICAL SPECS]: 8k resolution, cinematic lighting, vivid saturated colors.
      [NEGATIVE]: text, writing, letters, words, Hebrew text, Hebrew letters, watermark, logo, blurry, low quality, inconsistent character, different outfit, changed appearance, wrong skin color, wrong hair color, wrong clothing color, different shades than specified, color deviation, written content.
    `;

    // Add 4-panel comic layout instructions if comic style
    if (isComicStyle) {
      finalPrompt += `
      
      [COMIC STRIP 4-PANEL LAYOUT - CRITICAL REQUIREMENTS]:
      
      **LAYOUT STRUCTURE:**
      - Divide the ENTIRE canvas into EXACTLY 4 EQUAL RECTANGULAR PANELS in a 2x2 GRID
      - Top-left panel (Panel 1), Top-right panel (Panel 2)
      - Bottom-left panel (Panel 3), Bottom-right panel (Panel 4)
      - Each panel is approximately 50% width × 50% height of the total canvas
      
      **PANEL BORDERS:**
      - THICK BLACK BORDERS around each panel (classic comic book style)
      - WHITE GUTTERS (space) between panels of approximately 3-5% of canvas width
      - Clean, professional comic strip appearance
      
      **SEQUENTIAL STORYTELLING (CRITICAL):**
      Based on the SPECIFIC scene description above (Panel 1, Panel 2, etc.), show exactly those 4 moments.
      
      - Ensure VISUAL CONTINUITY between panels (same background, same lighting)
      - Show clear progression of action
      - Use dynamic angles as described in the prompt
      
      **Examples of good sequential flow:**
      - Wide shot -> Close up -> Action -> Reaction
      - Or whatever is specified in the [SCENE TO ILLUSTRATE] section above.
      
      FOLLOW THE PANEL DESCRIPTIONS EXACTLY.
        P1: Character running toward obstacle
        P2: Character mid-jump (from side)
        P3: Landing safely (different angle)
        P4: Character celebrating or continuing journey
      
      **CHARACTER CONSISTENCY ACROSS PANELS:**
      - SAME character appearance in ALL 4 panels
      - SAME colors (use COLOR LOCK section)
      - Characters may be in different positions/angles but IDENTICAL visual design
      
      **VISUAL VARIETY BETWEEN PANELS:**
      - Vary camera angles: close-up, medium shot, wide shot, over-shoulder
      - Vary perspectives: high angle, low angle, straight on
      - Each panel should feel VISUALLY DISTINCT but part of same sequence
      
      
      **NO TEXT AREAS - ABSOLUTE:**
      - Do NOT draw empty white bars, empty rectangles, text boxes, or speech bubbles.
      - The artwork in each panel must reach all the way to the bottom border.
      - The application will overlay text later using canvas.
      - The image must contain ZERO text of any kind.
      
      **WHAT TO AVOID:**
      - DO NOT make 4 identical panels with slight variations
      - DO NOT add speech bubbles or text bubbles
      - DO NOT write Hebrew text anywhere in the image
      - DO NOT create any text areas or reserved spaces for text
      - DO NOT make panels of different sizes (must be equal 2x2 grid)
      - DO NOT skip panel borders or gutters
      - DO NOT create single large illustration (MUST be 4 distinct panels)
      
      [COMIC TECHNICAL]: Clear panel separation, professional gutters, dynamic sequential storytelling, classic comic book visual language. NO text boxes, NO speech bubbles, and ZERO text in the image.
      `;
    }
  }

  const parts: any[] = [{ text: finalPrompt }];

  // If we have a base character image, we MUST send it as a reference for EVERY page
  if (baseCharacterImageUrl && baseCharacterImageUrl.startsWith('data:image/')) {
    const matches = baseCharacterImageUrl.match(/^data:(.+);base64,(.+)$/);
    if (matches) {
      parts.unshift({
        inlineData: {
          mimeType: matches[1],
          data: matches[2]
        }
      });
      parts.push({
        text: `
        CRITICAL REFERENCE IMAGE INSTRUCTION:
        The image above shows the MAIN character's EXACT appearance. You MUST:
        1. Match the character's face, body proportions, and pose style EXACTLY
        2. Use the IDENTICAL skin tone - no lighter, no darker
        3. Use the SAME hair color, style, and length
        4. Use the EXACT same clothing colors and style
        5. Keep ALL distinctive features (accessories, marks, etc.)
        
        This is a CHILDREN'S BOOK - the character MUST look the SAME on every page!
        ANY deviation will confuse the children reading this book.
        
        COPY the character from the reference image as closely as possible.
      ` });
    }
  }

  try {
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: isCover ? { imageConfig } : undefined
    }));

    for (const candidate of response.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch (error: any) {
    console.error("Error generating image:", error);
    handleFatalError(error);
    return null;
  }
};

export const analyzeBookPdf = async (pdfBase64: string): Promise<PreviousBookContext> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  // STEP 1: Extract metadata with enhanced character descriptions
  const metadataPrompt = `
    Analyze this PDF children's book. 
    Extract the following information to create a sequel context:
    
    1. Title of the book.
    2. A summary of the plot.
    3. A DETAILED visual description of the MAIN character. 
       CRITICAL - You MUST include ALL of the following:
       - SKIN TONE (be very specific: light/fair, medium, olive, tan, brown, dark, etc.)
       - ETHNICITY/RACE if apparent from illustrations
       - EXACT hair color (e.g., "dark brown", "blonde", "black", "red") and style (curly, straight, braids, etc.)
       - EXACT eye color and shape
       - Facial features (round face, freckles, glasses, etc.)
       - Body type (tall, short, chubby, slim)
       - EXACT clothing colors and style (e.g., "blue striped shirt", "yellow dress with polka dots")
       - Any distinctive marks, accessories, or features (hat, scarf, birthmark, etc.)
    4. A detailed visual description of any SECONDARY character (sidekick) if present - with same level of detail.
    5. The art style used (e.g., "3D animation", "watercolor", "digital illustration").
    
    IMPORTANT: Visual consistency in sequels depends on PRECISE descriptions. 
    Be EXTREMELY specific about skin tone, colors, and physical features.
    If a character has light/fair skin, say so. If a character has dark/brown skin, say so.
    
    Return the result as a JSON object.
  `;

  const extractionSchema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      summary: { type: Type.STRING },
      characterDescription: {
        type: Type.STRING,
        description: "Detailed character description including skin tone, hair color, eye color, clothing, and distinctive features"
      },
      secondaryCharacterDescription: { type: Type.STRING },
      artStyle: { type: Type.STRING },
    },
    required: ["title", "summary", "characterDescription", "artStyle"],
  };

  try {
    // Extract metadata
    const metadataResponse = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
          { text: metadataPrompt }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: extractionSchema
      }
    }));

    if (!metadataResponse.text) throw new Error("Failed to analyze PDF");
    const metadata = JSON.parse(metadataResponse.text) as PreviousBookContext;

    // STEP 2: Extract cover image as reference
    let baseCharacterImage: string | undefined;
    try {
      const imagePrompt = `
        Look at the COVER PAGE (first page) of this PDF children's book.
        Generate an EXACT reproduction of the main character as they appear on the cover.
        The image should show ONLY the main character in the same pose, clothing, and style as the cover.
        Maintain EXACT:
        - Skin tone
        - Hair color and style
        - Clothing colors and style
        - Art style
        - Any distinctive features
        
        This image will be used as a reference for creating sequel illustrations with consistent character appearance.
      `;

      const imageResponse = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
            { text: imagePrompt }
          ]
        }
      }));

      // Extract the generated image
      for (const candidate of imageResponse.candidates || []) {
        for (const part of candidate.content?.parts || []) {
          if (part.inlineData && part.inlineData.data) {
            baseCharacterImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            console.log("Successfully extracted character reference image from PDF");
            break;
          }
        }
        if (baseCharacterImage) break;
      }
    } catch (imageError) {
      console.warn("Could not extract reference image from PDF, continuing with text description only:", imageError);
      // Continue without the image - text description will still be used
    }

    return {
      ...metadata,
      baseCharacterImage
    };
  } catch (error: any) {
    console.error("Error analyzing PDF:", error);
    handleFatalError(error);
    throw error;
  }
};

// AUDIO GENERATION UTILS

// Decode base64 to binary string to Uint8Array to Int16Array
function decodeAudio(base64: string): Int16Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

export const generatePageAudio = async (text: string, audioContext: AudioContext, voiceName: string = 'Puck'): Promise<AudioBuffer | null> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  // Validate and Truncate Text
  if (!text || !text.trim()) return null;

  // Truncate to ~500 chars to avoid 500 Internal Error from TTS model which has input limits
  const safeText = text.trim().slice(0, 500);

  const prompt = `Read the following Hebrew text clearly, slowly, and warmly, suitable for a children's book storytelling:
    
    ${safeText}`;

  try {
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName }
          },
        },
      },
    }));

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) return null;

    // Decode PCM data
    const pcmData = decodeAudio(base64Audio);

    // Convert Int16 PCM to Float32 for AudioContext (-1.0 to 1.0)
    const float32Data = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      float32Data[i] = pcmData[i] / 32768.0;
    }

    // Create Audio Buffer (Mono, 24kHz as per standard GenAI output usually, but context sample rate matters)
    // Note: The raw output is usually 24000Hz.
    const audioBuffer = audioContext.createBuffer(1, float32Data.length, 24000);
    audioBuffer.getChannelData(0).set(float32Data);

    return audioBuffer;

  } catch (error: any) {
    console.error("Error generating audio:", error);

    // Propagate fatal errors to prompt key change
    handleFatalError(error);

    return null;
  }
}
