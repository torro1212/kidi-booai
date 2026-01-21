
export enum AppView {
  HOME = 'HOME',
  CREATE = 'CREATE',
  EDITOR = 'EDITOR',
  READING = 'READING',
}

export interface BookPage {
  pageNumber: number;
  hebrewText: string;
  imagePrompt: string;
  generatedImageUrl?: string;
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
