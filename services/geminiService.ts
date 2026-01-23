
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
      required: ["title", "targetAge", "mainTheme", "educationalMessage", "mainCharacterDescription", "mainCharacterDistinctiveMark", "artStyle", "keyObjectDescription", "titlePrimaryColor", "titleSecondaryColor", "titleEffectTheme", "visualConsistencyGuide"],
    },
    pages: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          pageNumber: { type: Type.INTEGER },
          hebrewText: { type: Type.STRING },
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
  
  Remember: Quality over rhyming. Every word should have PURPOSE. Match images to TEXT!`;

  if (request.previousContext) {
    prompt += `
    SEQUEL MODE: Maintain character consistency with the previous story: "${request.previousContext.title}".
    Previous Main Character: ${request.previousContext.characterDescription}.
    ${request.previousContext.secondaryCharacterDescription ? `Previous Secondary Character: ${request.previousContext.secondaryCharacterDescription}` : ''}
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
  textToRender?: string
): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

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
      
      [TECHNICAL]: 8k resolution, cinematic lighting, vivid colors.
      [NEGATIVE PROMPT]: subtitle, author name, page count, age range, English text, extra text, watermark, tagline, credits, מחבר, גיל, עמודים, numbers at bottom, description text, any text besides title.
    `;
  } else {
    // INNER PAGE STRATEGY: Use Flash model, NO text.
    modelName = 'gemini-2.5-flash-image';

    // Enhanced prompt with stronger character consistency
    finalPrompt = `
      [ROLE]: Professional Children's Book Illustrator specializing in character consistency.
      [ART STYLE]: ${artStyle}.
      
      [CAST DEFINITIONS - CRITICAL FOR CONSISTENCY]: 
      ${characterDescription}
      
      [SCENE TO ILLUSTRATE]: 
      ${actionPrompt}
      
      [CHARACTER CONSISTENCY - MANDATORY]:
      1. SAME CHARACTER = IDENTICAL APPEARANCE in every illustration
      2. Main character MUST have the EXACT same:
         - Face shape and features
         - Hair color and style
         - Clothing and accessories
         - Any distinctive marks mentioned in CAST DEFINITIONS
      3. If a Reference Image is provided, the character MUST match it EXACTLY
      4. Secondary character (if present) must also be consistent
      5. DO NOT change character appearance between pages
      
      [ILLUSTRATION RULES]:
      1. **ABSOLUTELY NO TEXT**: No text, captions, speech bubbles, or words
      2. **FULL BLEED**: Use entire canvas, no borders or margins
      3. **DYNAMIC COMPOSITION**: Use the camera angle specified in the scene description
      
      [BACKGROUND INSTRUCTION]: 
      Match background to the specific scene action described above.
      Use varied camera angles (Close-up, Wide shot, Low angle) for visual variety.
      
      [TECHNICAL SPECS]: 8k resolution, cinematic lighting, vivid saturated colors.
      [NEGATIVE]: text, writing, letters, words, watermark, logo, blurry, low quality, inconsistent character, different outfit, changed appearance.
    `;
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
      parts.push({ text: "REFERENCE IMAGE INSTRUCTION: The image above is the MAIN character reference. Match this character exactly." });
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

  const prompt = `
    Analyze this PDF children's book. 
    Extract the following information to create a sequel context:
    1. Title of the book.
    2. A summary of the plot.
    3. A detailed visual description of the MAIN character (appearance, clothes, hair, colors).
    4. A detailed visual description of any SECONDARY character (sidekick) if present.
    5. The art style used.
    
    Return the result as a JSON object.
  `;

  const extractionSchema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      summary: { type: Type.STRING },
      characterDescription: { type: Type.STRING },
      secondaryCharacterDescription: { type: Type.STRING },
      artStyle: { type: Type.STRING },
    },
    required: ["title", "summary", "characterDescription", "artStyle"],
  };

  try {
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: extractionSchema
      }
    }));

    if (!response.text) throw new Error("Failed to analyze PDF");
    return JSON.parse(response.text) as PreviousBookContext;
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
