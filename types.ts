

export enum AppView {
  HOME = 'HOME',
  CREATE = 'CREATE',
  EDITOR = 'EDITOR',
  READING = 'READING',
  AUTO_PILOT = 'AUTO_PILOT',
  RE_EDIT = 'RE_EDIT',
}

export interface BookPage {
  pageNumber: number;
  hebrewText: string;
  imagePrompt: string;
  generatedImageUrl?: string;
  // Panel-first structure for comics (generated directly, not split)
  panels?: {
    A: { scene: string; caption: string }; // Top-Right (Hebrew RTL first)
    B: { scene: string; caption: string }; // Top-Left
    C: { scene: string; caption: string }; // Bottom-Right
    D: { scene: string; caption: string }; // Bottom-Left
  };
  // Legacy: derived from panels or split from hebrewText
  panelCaptions?: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
}

export interface BookMetadata {
  title: string;
  targetAge: string;
  mainTheme: string;
  educationalMessage: string;
  mainCharacterDescription: string;
  mainCharacterDistinctiveMark: string; // New: Unique visual anchor
  secondaryCharacterDescription?: string; // New: For sidekicks (e.g., the bird)
  secondaryCharacterDistinctiveMark?: string; // New: Unique visual anchor for sidekick
  artStyle: string;
  keyObjectDescription: string;
  characterColorPalette?: {
    skinTone: string;
    hairColor: string;
    primaryClothingColor: string;
    secondaryClothingColor: string;
    distinctiveMarkColor: string;
  };
  baseCharacterImageUrl?: string;
  titlePrimaryColor: string;
  titleSecondaryColor: string;
  titleEffectTheme: 'magical' | 'natural' | 'tech' | 'classic' | 'playful' | 'elegant';
  // New: Specific visual guide to ensure consistency
  visualConsistencyGuide: {
    characterTraits: string[]; // e.g. ["Blue hat", "Red boots", "Golden curls"]
    objectTraits: string[];    // e.g. ["Glowing green staff", "Wooden texture"]
    backgroundStyle: string;   // e.g. "Pastel dreamscape with floating islands"
  };
  // New: Audio Configuration
  audioConfig?: {
    enabled: boolean;
    voiceName: string;
  };
}

export interface Book {
  metadata: BookMetadata;
  pages: BookPage[];
}

export interface PreviousBookContext {
  title: string;
  summary: string;
  characterDescription: string;
  secondaryCharacterDescription?: string;
  artStyle: string;
  baseCharacterImage?: string;
}

export interface BookRequest {
  ageRange: string;
  topic: string;
  pageCount: number;
  artStyle?: string;
  previousContext?: PreviousBookContext;
  audioEnabled: boolean;
  voiceName: string;
}

export enum GenerationStatus {
  IDLE = 'IDLE',
  GENERATING_TEXT = 'GENERATING_TEXT',
  GENERATING_IMAGES = 'GENERATING_IMAGES',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

// AUTO PILOT Types
export interface AutoPilotStory {
  title: string;
  heroName: string;
  heroDescription: string;
  distinctiveMark: string;
  plotSummary: string;
  mainTheme: string;
  educationalMessage: string;
}

export interface AutoPilotStoriesFile {
  description?: string;
  instructions_for_llm?: string;
  stories: AutoPilotStory[];
}

export interface AutoPilotProgress {
  currentIndex: number;
  totalStories: number;
  currentStoryTitle: string;
  status: 'idle' | 'generating' | 'downloading' | 'waiting' | 'complete' | 'error';
  completedBooks: string[];
  errorMessages: string[];
}

