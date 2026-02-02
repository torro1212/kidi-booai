'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { BookRequest, Book, PreviousBookContext } from '@/types'
import { analyzeBookPdf, generatePageAudio, generateStoryIdea } from '@/services/geminiService'

interface CreationFormProps {
  onSubmit: (request: BookRequest) => void;
  isLoading: boolean;
}

const ART_STYLES = [
  { id: 'Random', label: '🎲 הפתע אותי', value: 'Magical, colorful, commercial children\'s book illustration style' },
  { id: '3D', label: '🧸 תלת-ממד קסום', value: 'Cute 3D animation style, Disney-light, glossy, vibrant colors, expressive eyes, magical atmosphere' },
  { id: 'Watercolor', label: '🎨 צבעי מים', value: 'Bright watercolor illustration, defined lines, cheerful colors, magical storybook feel' },
  { id: 'Anime', label: '🎌 אנימה חמוד', value: 'Chibi style anime, bright eyes, colorful backgrounds, kawaii aesthetic' },
  { id: 'Paper', label: '✂️ גזרי נייר', value: 'Colorful layered paper cutout art, 3D depth, craft aesthetic, bright lighting' },
  { id: 'Clay', label: '🏺 פלסטלינה', value: 'Plasticine claymation style, cute, rounded shapes, handmade texture, bright colors' },
  { id: 'Pencil', label: '✏️ איור צבעוני', value: 'Vibrant colored pencil drawing, detailed, happy, storybook illustration' },
  { id: 'Pixel', label: '👾 פיקסל ארט', value: 'Retro 8-bit pixel art, vibrant, arcade colors, cute' },
  { id: 'Vector', label: '🔷 וקטורי מודרני', value: 'Modern flat vector art, clean curves, bold saturated colors, geometric happiness' },
  { id: 'Comic4Panel', label: '📰 קומיקס 4 פאנלים', value: 'Comic strip layout with 4 sequential panels arranged in 2x2 grid. Each panel shows a different moment or camera angle of the same scene. Clear black panel borders with white gutters between panels. Dynamic action poses, expressive characters, vibrant colors, classic comic book aesthetic with speech-less sequential storytelling.' },
];

const VOICE_OPTIONS = [
  { id: 'Puck', label: '🤡 שובב וקליל (Puck)', gender: 'זכר' },
  { id: 'Kore', label: '🌸 עדין ומרגיע (Kore)', gender: 'נקבה' },
  { id: 'Charon', label: '🦁 עמוק וסמכותי (Charon)', gender: 'זכר' },
  { id: 'Fenrir', label: '⚡ חזק ואנרגטי (Fenrir)', gender: 'זכר' },
  { id: 'Zephyr', label: '🍃 רך ומאוזן (Zephyr)', gender: 'נקבה' },
];

// Estimated costs based on Gemini API pricing (approximate)
const COSTS = {
  IMAGE: 0.04, // ~$0.04 per Imagen 3 generation
  AUDIO_PAGE: 0.006, // ~$0.006 per page (assuming ~300 chars @ $15/1M chars)
  TEXT_BASE: 0.02 // ~$0.02 fixed cost for prompt + output tokens (Gemini Pro)
};

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:application/pdf;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const CreationForm: React.FC<CreationFormProps> = ({ onSubmit, isLoading }) => {
  const [mode, setMode] = useState<'NEW' | 'SEQUEL'>('NEW');
  const [ageRange, setAgeRange] = useState('3-8');
  const [topic, setTopic] = useState('');
  const [pageCount, setPageCount] = useState<number>(15);
  const [selectedStyle, setSelectedStyle] = useState<string>('3D');
  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);

  // Audio State
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState('Puck');
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const [sequelContext, setSequelContext] = useState<PreviousBookContext | null>(null);
  const [isAnalyzingPdf, setIsAnalyzingPdf] = useState(false);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (activeSourceRef.current) {
        activeSourceRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Calculate Cost
  const costEstimate = useMemo(() => {
    const imagesCost = pageCount * COSTS.IMAGE;
    const audioCost = audioEnabled ? pageCount * COSTS.AUDIO_PAGE : 0;
    const total = imagesCost + audioCost + COSTS.TEXT_BASE;

    return {
      images: imagesCost.toFixed(2),
      audio: audioCost.toFixed(2),
      base: COSTS.TEXT_BASE.toFixed(2),
      total: total.toFixed(2)
    };
  }, [pageCount, audioEnabled]);

  const handlePlayPreview = async (voiceId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the card when clicking play

    // Stop current preview
    if (activeSourceRef.current) {
      try { activeSourceRef.current.stop(); } catch (err) { }
      activeSourceRef.current = null;
    }

    // If clicking the same button, just stop (toggle off)
    if (previewingVoice === voiceId) {
      setPreviewingVoice(null);
      return;
    }

    setPreviewingVoice(voiceId);

    // Init Audio Context
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    try {
      const buffer = await generatePageAudio("שלום ילדים! בואו נצא להרפתקה קסומה ביחד!", audioContextRef.current, voiceId);

      // If the user hasn't clicked something else in the meantime
      if (buffer) {
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);

        source.onended = () => {
          if (previewingVoice === voiceId) {
            setPreviewingVoice(null);
          }
        };

        activeSourceRef.current = source;
        source.start();
      } else {
        setPreviewingVoice(null);
      }
    } catch (error) {
      console.error("Preview failed", error);
      setPreviewingVoice(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target?.result as string) as Book;
          if (json.metadata && json.pages) {
            const fullStory = json.pages.map(p => p.hebrewText).join('\n');
            setSequelContext({
              title: json.metadata.title,
              summary: fullStory,
              characterDescription: json.metadata.mainCharacterDescription,
              artStyle: json.metadata.artStyle,
              baseCharacterImage: json.metadata.baseCharacterImageUrl
            });
            setAgeRange(json.metadata.targetAge);
            setTopic(`הרפתקה חדשה של ${json.metadata.title}...`);
          } else {
            alert("קובץ JSON לא תקין. נא להעלות קובץ שנוצר באפליקציה.");
          }
        } catch (err) {
          alert("שגיאה בקריאת הקובץ");
          console.error(err);
        }
      };
      reader.readAsText(file);
    } else if (file.type === 'application/pdf') {
      setIsAnalyzingPdf(true);
      try {
        const base64 = await readFileAsBase64(file);
        const context = await analyzeBookPdf(base64);
        setSequelContext(context);
        // Defaults since PDF extraction might not get these perfectly
        setAgeRange('3-8');
        setTopic(`הרפתקה חדשה של ${context.title}...`);
      } catch (err) {
        console.error(err);
        alert("לא הצלחנו לנתח את ה-PDF. אנא נסה שוב או השתמש בקובץ JSON.");
      } finally {
        setIsAnalyzingPdf(false);
      }
    } else {
      alert("נא להעלות קובץ JSON או PDF בלבד.");
    }
  };

  const handleSuggestIdea = async () => {
    setIsGeneratingIdea(true);
    try {
      const idea = await generateStoryIdea(ageRange, topic);
      if (idea) {
        setTopic(idea);
      } else {
        // Fallback if empty string returned but no error thrown (edge case)
        alert("לא הצלחנו לייצר רעיון. נסה שוב.");
      }
    } catch (e) {
      console.error(e);
      // If fatal error occurred, handleFatalError already dispatched event to App.tsx
      // If not fatal, we show this alert.
      alert("שגיאה ביצירת הרעיון. אנא בדוק את החיבור או נסה שוב.");
    } finally {
      setIsGeneratingIdea(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Determine art style: If Sequel, use previous. If New, use selected.
    let finalArtStyle = 'Magical 3D';

    if (mode === 'SEQUEL' && sequelContext) {
      finalArtStyle = sequelContext.artStyle;
    } else {
      const styleObj = ART_STYLES.find(s => s.id === selectedStyle);
      if (styleObj) finalArtStyle = styleObj.value;
    }

    // Default topics
    let finalTopic = topic.trim();
    if (!finalTopic) {
      if (mode === 'SEQUEL' && sequelContext) {
        finalTopic = `A continuation of the story '${sequelContext.title}'. Create a new adventure for the same main character.`;
      } else {
        finalTopic = `A creative, fun, and educational story suitable for children aged ${ageRange}. Surprise me!`;
      }
    }

    onSubmit({
      ageRange,
      topic: finalTopic,
      pageCount,
      artStyle: finalArtStyle,
      previousContext: (mode === 'SEQUEL' && sequelContext) ? sequelContext : undefined,
      audioEnabled,
      voiceName: selectedVoice
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-24 h-24 mb-8 relative">
          <div className="absolute inset-0 border-8 border-kid-blue/20 rounded-full"></div>
          <div className="absolute inset-0 border-8 border-kid-blue rounded-full border-t-transparent animate-spin"></div>
        </div>
        <h2 className="text-3xl font-bold text-slate-800 mb-4">Dreaming up your story...</h2>
        <p className="text-slate-600 text-lg animate-pulse">
          Crafting characters, writing rhymes, and preparing magic!
        </p>
        <div className="mt-8 text-4xl animate-bounce">🪄</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6">
      <div className="bg-white rounded-[2.5rem] shadow-xl p-8 sm:p-12 border border-slate-100">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold text-slate-800">What shall we create today?</h2>

          {/* Mode Toggle */}
          <div className="flex justify-center gap-4 mt-6">
            <button
              onClick={() => { setMode('NEW'); setSequelContext(null); }}
              className={`px-6 py-2 rounded-full font-bold transition-all ${mode === 'NEW' ? 'bg-kid-blue text-white shadow-lg' : 'bg-slate-100 text-slate-500'}`}
            >
              סיפור חדש ✨
            </button>
            <button
              onClick={() => setMode('SEQUEL')}
              className={`px-6 py-2 rounded-full font-bold transition-all ${mode === 'SEQUEL' ? 'bg-kid-orange text-white shadow-lg' : 'bg-slate-100 text-slate-500'}`}
            >
              ספר המשך 🔄
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* SEQUEL UPLOAD SECTION */}
          {mode === 'SEQUEL' && (
            <div className="bg-orange-50 border-2 border-orange-100 rounded-2xl p-6 text-center animate-fade-in relative overflow-hidden">
              {isAnalyzingPdf && (
                <div className="absolute inset-0 bg-white/80 z-10 flex flex-col items-center justify-center">
                  <div className="w-10 h-10 border-4 border-kid-orange border-t-transparent rounded-full animate-spin mb-2"></div>
                  <span className="text-kid-orange font-bold">קורא את הספר...</span>
                </div>
              )}

              {!sequelContext ? (
                <>
                  <div className="text-4xl mb-3">📂</div>
                  <h3 className="text-xl font-bold text-slate-700 mb-2">טען את הספר הקודם</h3>
                  <p className="text-slate-500 mb-4 text-sm">העלה את קובץ ה-JSON או PDF של הספר הקודם.</p>
                  <input
                    type="file"
                    accept=".json,.pdf"
                    onChange={handleFileUpload}
                    className="block w-full text-sm text-slate-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-full file:border-0
                                file:text-sm file:font-semibold
                                file:bg-kid-orange file:text-white
                                hover:file:bg-orange-600
                                cursor-pointer mx-auto max-w-xs"
                  />
                </>
              ) : (
                <div className="flex items-center gap-4 text-left bg-white p-4 rounded-xl border border-orange-200">
                  <div className="text-3xl">✅</div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-800">ממשיכים את: {sequelContext.title}</p>
                    <p className="text-xs text-slate-500">הדמות והסגנון נשמרו!</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSequelContext(null)}
                    className="ml-auto text-xs text-red-500 underline"
                  >
                    החלף
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Age Selection */}
          <div>
            <label className="block text-lg font-bold text-slate-700 mb-3">
              Target Age Group
            </label>
            <div className="grid grid-cols-3 gap-4">
              {['3-8', '9-12', '13-16'].map((age) => (
                <button
                  key={age}
                  type="button"
                  onClick={() => setAgeRange(age)}
                  className={`py-3 px-4 rounded-2xl font-bold text-lg transition-all ${ageRange === age
                    ? 'bg-kid-blue text-white shadow-lg scale-105'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                >
                  {age}
                </button>
              ))}
            </div>
          </div>

          {/* Art Style Selection - Disabled if Sequel */}
          <div className={mode === 'SEQUEL' && sequelContext ? 'opacity-50 pointer-events-none grayscale' : ''}>
            <div className="flex justify-between items-center mb-3">
              <label className="block text-lg font-bold text-slate-700">
                Art Style
              </label>
              {mode === 'SEQUEL' && sequelContext && (
                <span className="text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded font-bold">
                  ננעל לפי הספר הקודם
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ART_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setSelectedStyle(style.id)}
                  className={`py-2 px-3 rounded-xl font-bold text-sm sm:text-base transition-all border-2 ${selectedStyle === style.id
                    ? 'bg-white border-kid-orange text-kid-orange shadow-md scale-105'
                    : 'bg-slate-50 border-transparent text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          {/* Audio Settings */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="text-2xl">🔊</div>
                <div>
                  <label className="block text-lg font-bold text-slate-700">
                    הקראת סיפור
                  </label>
                  <p className="text-xs text-slate-500">יצירת אודיו איכותי לכל עמוד</p>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={`w-14 h-8 rounded-full transition-colors relative ${audioEnabled ? 'bg-kid-blue' : 'bg-slate-300'}`}
              >
                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all shadow-sm ${audioEnabled ? 'left-1' : 'left-7'}`}></div>
              </button>
            </div>

            {/* Voice Selection - Conditional */}
            {audioEnabled && (
              <div className="animate-fade-in grid grid-cols-1 gap-3 mt-3 border-t border-blue-100 pt-3">
                {VOICE_OPTIONS.map((voice) => (
                  <div
                    key={voice.id}
                    onClick={() => setSelectedVoice(voice.id)}
                    className={`flex items-center justify-between p-3 rounded-xl transition-all border cursor-pointer ${selectedVoice === voice.id
                      ? 'bg-white border-kid-blue text-kid-blue shadow-md'
                      : 'bg-blue-50/50 border-transparent text-slate-600 hover:bg-blue-100'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedVoice === voice.id ? 'border-kid-blue' : 'border-slate-400'}`}>
                        {selectedVoice === voice.id && <div className="w-2.5 h-2.5 rounded-full bg-kid-blue"></div>}
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="font-bold text-base">{voice.label}</span>
                        <span className="text-xs opacity-70 bg-slate-200/50 px-2 py-0.5 rounded-md mt-1">{voice.gender}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handlePlayPreview(voice.id, e)}
                      className={`w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 hover:bg-blue-200 transition-colors ${previewingVoice === voice.id ? 'text-kid-orange animate-pulse bg-blue-100' : 'text-slate-500'}`}
                      title="השמע דוגמה"
                    >
                      {previewingVoice === voice.id ? (
                        // Stop Icon / Spinner
                        <span className="text-xl">⏹</span>
                      ) : (
                        // Play Icon
                        <span className="text-xl">▶</span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Page Count Selection */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="block text-lg font-bold text-slate-700">
                Story Length
              </label>
              <span className="bg-kid-blue/10 text-kid-blue px-3 py-1 rounded-full font-bold text-sm">
                {pageCount} {pageCount === 1 ? 'Page' : 'Pages'}
              </span>
            </div>

            <input
              type="range"
              min="1"
              max="20"
              value={pageCount}
              onChange={(e) => setPageCount(parseInt(e.target.value))}
              className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-kid-blue hover:bg-slate-300 transition-colors"
            />
            <div className="flex justify-between text-sm text-slate-400 mt-2 font-medium px-1">
              <span>Short (1)</span>
              <span>Long (20)</span>
            </div>
          </div>

          {/* Topic Input */}
          <div>
            <div className="flex justify-between items-end mb-3">
              <label htmlFor="topic" className="block text-lg font-bold text-slate-700">
                What is the story about?
              </label>
              {/* Generate Idea Button - Only for NEW mode */}
              {mode === 'NEW' && (
                <button
                  type="button"
                  onClick={handleSuggestIdea}
                  disabled={isGeneratingIdea}
                  className="text-sm bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-1.5 rounded-full font-bold shadow-md hover:shadow-lg transition-transform transform hover:-translate-y-0.5 flex items-center gap-1 disabled:opacity-50"
                >
                  {isGeneratingIdea ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      חושב...
                    </>
                  ) : (
                    <>
                      <span>✨</span> המצא לי רעיון
                    </>
                  )}
                </button>
              )}
            </div>
            <textarea
              id="topic"
              rows={4}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., A brave turtle who wants to fly... OR leave blank for a surprise!"
              className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 text-lg focus:border-kid-blue focus:ring-0 outline-none transition-colors"
            />
            <p className="text-xs text-slate-400 mt-2 text-right">
              טיפ: השתמש בכפתור הקסם למעלה כדי לקבל רעיון, שם דמות ועלילה!
            </p>
          </div>

          {/* Cost Estimator */}
          <div className="bg-slate-800 text-white p-5 rounded-2xl shadow-lg border-2 border-slate-700">
            <h4 className="text-lg font-bold mb-3 flex items-center gap-2">
              <span>💰</span> עלות משוערת
            </h4>
            <div className="space-y-2 text-sm text-slate-300">
              <div className="flex justify-between">
                <span>תמונות ({pageCount} עמודים)</span>
                <span>${costEstimate.images}</span>
              </div>
              {audioEnabled && (
                <div className="flex justify-between">
                  <span>אודיו (TTS)</span>
                  <span>${costEstimate.audio}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>טקסט ועיבוד</span>
                <span>${costEstimate.base}</span>
              </div>
              <div className="h-px bg-slate-600 my-2"></div>
              <div className="flex justify-between text-xl font-bold text-kid-yellow">
                <span>סה"כ</span>
                <span>${costEstimate.total}</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-3 text-center">
              * המחיר מוערך לפי תעריפי Gemini API הרשמיים. החיוב בפועל מתבצע בחשבון ה-Google Cloud שלך.
            </p>
          </div>

          <button
            type="submit"
            disabled={mode === 'SEQUEL' && !sequelContext}
            className="w-full bg-kid-yellow hover:bg-yellow-400 text-kid-text text-xl font-bold py-5 rounded-2xl shadow-lg transform transition hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mode === 'SEQUEL' ? 'Create Sequel! 🔄' : (topic.trim() ? 'Create My Book! 🚀' : 'Surprise Me! 🎲')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreationForm;
