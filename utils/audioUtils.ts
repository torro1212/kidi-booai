/**
 * Audio Utility Functions
 * Handles conversion of AudioBuffer to various formats (WAV, MP3)
 */



/**
 * Converts an AudioBuffer to WAV format (Blob)
 * Used for high-quality audio export
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataByteCount = buffer.length * blockAlign;
  const headerByteCount = 44;
  const totalByteCount = headerByteCount + dataByteCount;
  const headerBuffer = new ArrayBuffer(headerByteCount);
  const view = new DataView(headerBuffer);
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalByteCount - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataByteCount, true);
  const dataBuffer = new ArrayBuffer(dataByteCount);
  const dataView = new DataView(dataBuffer);
  let offset = 0;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = buffer.getChannelData(channel)[i];
      const s = Math.max(-1, Math.min(1, sample));
      const int16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
      dataView.setInt16(offset, int16, true);
      offset += 2;
    }
  }
  return new Blob([headerBuffer, dataBuffer], { type: 'audio/wav' });
}

/**
 * Converts an AudioBuffer to MP3 format (Blob)
 * Uses lamejs for MP3 encoding
 * 
 * @param buffer - The AudioBuffer to convert
 * @param bitrate - MP3 bitrate (default: 128 kbps)
 * @returns A Blob containing the MP3 data
 */
export async function audioBufferToMp3(buffer: AudioBuffer, bitrate: number = 128): Promise<Blob> {
  // Dynamically import lamejs
  const lame = await import('@breezystack/lamejs');

  const mp3encoder = new lame.Mp3Encoder(buffer.numberOfChannels, buffer.sampleRate, bitrate);
  const sampleBlockSize = 1152; // Standard MP3 frame size
  const mp3Data: Uint8Array[] = [];

  // Convert float samples to 16-bit PCM
  const channels: Int16Array[] = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    const samples = buffer.getChannelData(i);
    const int16Samples = new Int16Array(samples.length);
    for (let j = 0; j < samples.length; j++) {
      const s = Math.max(-1, Math.min(1, samples[j]));
      int16Samples[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    channels.push(int16Samples);
  }

  // Encode in chunks
  const length = channels[0].length;
  for (let i = 0; i < length; i += sampleBlockSize) {
    const leftChunk = channels[0].subarray(i, i + sampleBlockSize);
    const rightChunk = channels.length > 1
      ? channels[1].subarray(i, i + sampleBlockSize)
      : leftChunk; // Use left channel if mono

    const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
  }

  // Flush remaining data
  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }

  // Create blob from MP3 data
  return new Blob(mp3Data as BlobPart[], { type: 'audio/mp3' });
}


import type { Book } from '@/types';

/**
 * Generates a book summary text using AI
 * Creates a professional, teaser-style marketing blurb that introduces the book
 * without spoiling the plot. Uses Gemini AI to generate engaging back-cover copy.
 */
export async function generateBookSummary(book: Book): Promise<string> {
  try {
    // Import the AI-powered summary generator
    const { generateBookSummary: generateAISummary } = await import('@/services/geminiService');

    // Generate professional marketing blurb using AI
    const aiGeneratedBlurb = await generateAISummary(book);

    // Format the final summary
    const summary = `שם הספר: ${book.metadata.title}

גיל: ${book.metadata.targetAge}

עלילה: ${aiGeneratedBlurb || 'לא זמין'}
`.trim();

    return summary;
  } catch (error) {
    console.error('Failed to generate AI summary, using fallback:', error);

    // Fallback: simple teaser from metadata
    const fallbackSummary = `שם הספר: ${book.metadata.title}

גיל: ${book.metadata.targetAge}

עלילה: ${book.metadata.mainTheme || 'לא זמין'}
`.trim();

    return fallbackSummary;
  }
}

