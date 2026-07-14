'use server';

import * as cheerio from 'cheerio';
import { Document, Packer, Paragraph, TextRun, convertMillimetersToTwip, HighlightColor } from 'docx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// -- CONSTANTS --
const CHART_WIDTH_RATIO = 0.65;
const LINE_HEIGHT_RATIO = 1.25;
const MM_TO_PT = 2.83465;
const LUMINANCE_THRESHOLD = 128;
const MAX_INPUT_LENGTH = 200;
const KEY_CONFIDENCE_MAX = 8;
const KEY_CONFIDENCE_PER_CHORD = 0.3;
const TONIC_MATCH_WEIGHT = 3;
const TONIC_PARTIAL_WEIGHT = 1.5;
const DOMINANT_WEIGHT = 2;
const SUBDOMINANT_WEIGHT = 1.5;
const RELATIVE_WEIGHT = 0.8;
const BVI_WEIGHT = 0.6;
const VI_MINOR_WEIGHT = 0.5;
const IN_SCALE_WEIGHT = 0.3;
const OUT_OF_KEY_PENALTY = 0.8;
const FIRST_CHORD_BONUS = 0.3;
const FIRST_CHORD_DOMINANT_BONUS = 0.15;
const LAST_CHORD_BONUS = 0.6;
const MOST_FREQUENT_TONIC_BONUS = 1.5;
const TONIC_DOMINANT_PAIR_BONUS = 1.0;
const TONIC_SUBDOMINANT_PAIR_BONUS = 0.7;

// -- HARMONIC ENGINE --
const scale = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const scaleBemol = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Circle of fifths — keys that prefer flats
const flatKeys = new Set([5, 10, 3, 8, 1, 6]); // F, Bb, Eb, Ab, Db, Gb

function noteIndex(note: string): number {
    const idx = scale.indexOf(note);
    if (idx !== -1) return idx;
    return scaleBemol.indexOf(note);
}

function resolveEnharmonic(index: number, preferFlats: boolean): string {
    return preferFlats ? scaleBemol[index] : scale[index];
}

function detectKeyPreference(roots: string[]): boolean {
    if (roots.length === 0) return false;
    let flatScore = 0;
    let sharpScore = 0;
    const sharpPreferredIndices = new Set([0, 2, 4, 7, 9, 11]); // C, D, E, G, A, B
    for (const root of roots) {
        const idx = noteIndex(root);
        if (idx === -1) continue;
        if (flatKeys.has(idx)) flatScore++;
        else if (sharpPreferredIndices.has(idx)) sharpScore++;
    }
    return flatScore > sharpScore;
}

function transposeNote(note: string, steps: number, preferFlats?: boolean) {
    if (!note || steps === 0) return note;
    const idx = noteIndex(note);
    if (idx === -1) return note;
    const newIndex = ((idx + steps) % 12 + 12) % 12;
    if (preferFlats !== undefined) return resolveEnharmonic(newIndex, preferFlats);
    const wasFlat = note.includes('b');
    return resolveEnharmonic(newIndex, wasFlat);
}

function transposeChord(chordText: string, steps: number, preferFlats?: boolean): string {
    if (steps === 0) return chordText;
    if (chordText.includes('/')) {
        const parts = chordText.split('/');
        return transposeChord(parts[0], steps, preferFlats) + '/' + transposeChord(parts[1], steps, preferFlats);
    }
    const match = chordText.match(/^([A-G][b#]?)(.*)$/);
    if (!match) return chordText;
    return transposeNote(match[1], steps, preferFlats) + match[2];
}

const scaleDegrees = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

function keyDegrees(keyRoot: string, isMinor: boolean, preferFlats?: boolean): string[] {
    const idx = noteIndex(keyRoot);
    if (idx === -1) return scaleDegrees;
    if (isMinor) {
        // Natural minor: i ii° III iv v VI VII
        const intervals = [0, 2, 3, 5, 7, 8, 10];
        return intervals.map(iv => {
            const note = resolveEnharmonic((idx + iv) % 12, preferFlats ?? false);
            const deg = scaleDegrees[iv];
            if (iv === 0) return note + 'm (' + deg.toLowerCase() + ')';
            if (iv === 2) return note + ' (' + deg + ')';
            if (iv === 3) return note + 'm (iv)';
            if (iv === 4) return note + 'm (v)';
            if (iv === 5) return note + ' (' + deg + ')';
            if (iv === 6) return note + ' (' + deg + ')';
            return note;
        });
    }
    // Major: I ii iii IV V vi vii°
    const intervals = [0, 2, 4, 5, 7, 9, 11];
    return intervals.map(iv => {
        const note = resolveEnharmonic((idx + iv) % 12, preferFlats ?? false);
        if (iv === 0) return note + ' (I)';
        if (iv === 1) return note + 'm (ii)';
        if (iv === 2) return note + 'm (iii)';
        if (iv === 3) return note + ' (IV)';
        if (iv === 4) return note + ' (V)';
        if (iv === 5) return note + 'm (vi)';
        if (iv === 6) return note + '° (vii°)';
        return note;
    });
}

function detectKeyFromChordTokens(tokens: string[], firstChord?: string, lastChord?: string): {
    root: string; isMinor: boolean; confidence: number; candidates: { root: string; isMinor: boolean; score: number }[]
} {
    if (tokens.length === 0) return { root: 'C', isMinor: false, confidence: 0, candidates: [{ root: 'C', isMinor: false, score: 0 }] };

    const rootFreq: Record<string, number> = {};
    const rootMinorFreq: Record<string, number> = {};
    let firstRoot = '';
    let lastRoot = '';

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const m = t.match(/^([A-G][#b]?)(.*)$/);
        if (!m) continue;
        const root = m[1];
        const quality = m[2] || '';
        rootFreq[root] = (rootFreq[root] || 0) + 1;
        if (quality.startsWith('m') && !quality.startsWith('M')) {
            rootMinorFreq[root] = (rootMinorFreq[root] || 0) + 1;
        }
        // Also count bass note from slash chords (e.g., C/E → E is also present)
        const bassMatch = t.match(/\/([A-G][#b]?)$/);
        if (bassMatch) {
            const bassRoot = bassMatch[1];
            rootFreq[bassRoot] = (rootFreq[bassRoot] || 0) + 1;
        }
        if (i === 0) firstRoot = root;
        lastRoot = root;
    }

    firstRoot = firstChord || firstRoot;
    lastRoot = lastChord || lastRoot;
    const totalCount = tokens.length;

    // Score each possible key (12 major + 12 minor)
    type Candidate = { root: string; isMinor: boolean; score: number };
    const candidates: Candidate[] = [];

    for (const isMinor of [false, true]) {
        for (let keyIdx = 0; keyIdx < 12; keyIdx++) {
            const keyRoot = resolveEnharmonic(keyIdx, false);
            // Scale intervals for the key
            const intervals = isMinor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
            const scaleNotes = intervals.map(iv => (keyIdx + iv) % 12);

            let score = 0;
            // For each root in the song, check if it belongs to this key
            for (const [root, count] of Object.entries(rootFreq)) {
                const rootIdx = noteIndex(root);
                if (rootIdx === -1) continue;
                const weight = count / totalCount;

                if (rootIdx === keyIdx) {
                    // Tonic match
                    const isTonicMinor = (rootMinorFreq[root] || 0) > count / 2;
                    if (isMinor === isTonicMinor) score += TONIC_MATCH_WEIGHT * weight;
                    else score += TONIC_PARTIAL_WEIGHT * weight;
                } else if (rootIdx === (keyIdx + 7) % 12) {
                    // Dominant (V) — very strong indicator
                    score += DOMINANT_WEIGHT * weight;
                } else if (rootIdx === (keyIdx + 5) % 12) {
                    // Subdominant (IV)
                    score += SUBDOMINANT_WEIGHT * weight;
                } else if (rootIdx === (keyIdx + 3) % 12) {
                    // Relative minor/major
                    score += RELATIVE_WEIGHT * weight;
                } else if (isMinor && rootIdx === (keyIdx + 10) % 12) {
                    // bVII in minor — common in rock/pop
                    score += BVI_WEIGHT * weight;
                } else if (isMinor && rootIdx === (keyIdx + 8) % 12) {
                    // VI in minor
                    score += VI_MINOR_WEIGHT * weight;
                } else if (scaleNotes.includes(rootIdx)) {
                    score += IN_SCALE_WEIGHT * weight;
                } else {
                    score -= OUT_OF_KEY_PENALTY * weight; // Penalty for out-of-key roots
                }
            }

            // Bonus for first chord matching tonic
            if (firstRoot) {
                const fIdx = noteIndex(firstRoot);
                if (fIdx === keyIdx) score += FIRST_CHORD_BONUS;
                else if (fIdx === (keyIdx + 7) % 12) score += FIRST_CHORD_DOMINANT_BONUS;
            }
            // Bonus for last chord matching tonic
            if (lastRoot) {
                const lIdx = noteIndex(lastRoot);
                if (lIdx === keyIdx) score += LAST_CHORD_BONUS;
            }

            // Bonus: most frequent chord in the song is the tonic
            let maxFreq = 0;
            let mostFrequentRoot = '';
            for (const [root, count] of Object.entries(rootFreq)) {
                if (count > maxFreq) {
                    maxFreq = count;
                    mostFrequentRoot = root;
                }
            }
            if (mostFrequentRoot) {
                const mfIdx = noteIndex(mostFrequentRoot);
                if (mfIdx === keyIdx) {
                    score += MOST_FREQUENT_TONIC_BONUS;
                }
            }

            // Bonus: tonic-dominant pair (I and V both present as major chords)
            const hasTonic = rootFreq[resolveEnharmonic(keyIdx, false)] > 0;
            const hasDominant = rootFreq[resolveEnharmonic((keyIdx + 7) % 12, false)] > 0;
            const hasSubdominant = rootFreq[resolveEnharmonic((keyIdx + 5) % 12, false)] > 0;
            if (hasTonic && hasDominant) score += TONIC_DOMINANT_PAIR_BONUS;
            if (hasTonic && hasSubdominant) score += TONIC_SUBDOMINANT_PAIR_BONUS;

            candidates.push({ root: keyRoot, isMinor, score: Math.round(score * 100) / 100 });
        }
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const runnerUp = candidates[1];

    // Normalize confidence
    const maxPossible = Math.min(KEY_CONFIDENCE_MAX, TONIC_MATCH_WEIGHT + totalCount * KEY_CONFIDENCE_PER_CHORD);
    const rawConfidence = best.score / maxPossible;
    const confidence = Math.min(1, Math.max(0.1, rawConfidence));

    // If top two are very close, lower confidence
    const gap = best.score - runnerUp.score;
    const finalConfidence = gap < 0.3 ? confidence * 0.6 : confidence;

    return {
        root: best.root,
        isMinor: best.isMinor,
        confidence: Math.round(finalConfidence * 100) / 100,
        candidates: candidates.slice(0, 5)
    };
}

const chordPattern = /([A-G][b#]?(?:m|M|sus|add|maj|min|dim|aug)?\d*(?:m|M|sus|add|maj|min|dim|aug)?(?:\([^)]+\))?(?:\/[A-G][b#]?)?)/g;

function isChordToken(token: string) {
    if (!token) return false;
    return /^[A-G][b#]?(m|M|sus|add|maj|min|dim|aug)?\d*(m|M|sus|add|maj|min|dim|aug)?(\([^)]+\))?(?:\/[A-G][b#]?)?$/.test(token);
}

function isChordLine(line: string) {
    const tokens = line.split(/[\s\t]+/).filter(Boolean);
    if (tokens.length === 0) return false;
    
    // Ignore lines that are clearly tab headers or contain mostly dashes
    if (line.includes('|') || line.includes('---')) return false;
    if (line.toLowerCase().includes('[tab')) return false;

    const chordTokens = tokens.filter(isChordToken);
    if (chordTokens.length === 0) return false;

    const isMostlyChords = chordTokens.length / tokens.length > 0.5;
    const containsLowerCase = /[a-z]{3,}/.test(line.replace(/\[.*?\]/g, '')); 
    return isMostlyChords && !containsLowerCase;
}

function transposeLinePreservingSpacing(line: string, steps: number, preferFlats?: boolean) {
    if (steps === 0 && !preferFlats) return line;
    let result = "";
    const regex = new RegExp(chordPattern);
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(line)) !== null) {
        const original = match[0];
        const charAfter = line[match.index + original.length];
        const isPartOfWord = charAfter !== undefined && /[a-zA-Záéíóúàãõâêôüç]/.test(charAfter);
        if (isChordToken(original) && !isPartOfWord) {
            const start = match.index;
            result += line.substring(lastIndex, start);
            const transposed = transposeChord(original, steps, preferFlats);
            result += transposed;
            
            let lengthDiff = transposed.length - original.length;
            let currentIdx = start + original.length;
            
            if (lengthDiff > 0) {
                while (lengthDiff > 0 && currentIdx < line.length && line[currentIdx] === ' ') {
                    currentIdx++;
                    lengthDiff--;
                }
            } else if (lengthDiff < 0) {
                result += ' '.repeat(-lengthDiff);
            }
            lastIndex = currentIdx;
            regex.lastIndex = currentIdx;
        } else {
            result += line.substring(lastIndex, match.index + original.length);
            lastIndex = match.index + original.length;
            regex.lastIndex = lastIndex;
        }
    }
    result += line.substring(lastIndex);
    return result;
}

function cleanYoutubeTitle(title: string) {
  title = title.replace(/- YouTube$/i, '');
  const termsToRemove = [
    '(Official Video)', '[Official Video]', 'Official Video',
    '(Official Audio)', '[Official Audio]', 'Official Audio',
    '(Official Music Video)', '[Official Music Video]',
    '(Lyric Video)', '[Lyric Video]',
    '(Ao Vivo)', '[Ao Vivo]', 'Ao Vivo',
    '(Live)', '[Live]', 'Live',
    '(Videoclipe Oficial)', '[Videoclipe Oficial]', 'Videoclipe Oficial',
    '(Clipe Oficial)', '[Clipe Oficial]', 'Clipe Oficial',
    '(Video Oficial)', '[Video Oficial]'
  ];
  for (const term of termsToRemove) {
    title = title.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  }
  // Only remove leading/trailing separators and pipes/semicolons, preserve internal hyphens and underscores
  return title.replace(/^[|:;\s\\]+|[|:;\s\\]+$/g, '').replace(/\s+/g, ' ').trim();
}

export type MusicQueryOptions = {
    fontFamily?: string;
    transposeBy?: number;
    pageSize?: 'DESKTOP' | 'MOBILE';
    formats?: string[];
    removeTabs?: boolean;
    simplified?: boolean;
    colors?: {
        title: string;
        lyrics: string;
        chorus: string;
        preChorus: string;
        bridge: string;
        chords: string;
    };
    darkMode?: boolean;
    capoPosition?: number;
    enharmonicPreference?: 'auto' | 'sharp' | 'flat';
    detectOnly?: boolean;
    targetKey?: string;
    targetIsMinor?: boolean;
};

export type RunData = { text: string; color: string; bold: boolean; isHighlight?: boolean; isChord?: boolean };

type BulkSongResult = {
    filename: string;
    previewText: string;
    detectedLabel: string;
    confidence: number;
    structuredParagraphs: RunData[][];
    finalFontSizePt: number;
    finalFontSizeHalfPt: number;
    songName: string;
    artistName: string;
    error?: string;
};

export type BulkMusicQueryResult = {
    success: true;
    data: string | null;
    pdfData: string | null;
    songs: BulkSongResult[];
} | {
    success: false;
    error: string;
};

type SolrDoc = { tipo: string; dns?: string; url?: string; txt?: string; art?: string };

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 25000) {
  console.log(`[Cifrador] Fetching: ${url} (timeout: ${timeout}ms)`);
  const controller = new AbortController();
  const id = setTimeout(() => {
    controller.abort();
    console.log(`[Cifrador] Timeout reached for: ${url}`);
  }, timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  };
}

function isTabLine(line: string) {
    const dashCount = (line.match(/-/g) || []).length;
    const barCount = (line.match(/\|/g) || []).length;
    const guitarNotation = (line.match(/^[abcdefg][#b]?\s*\|/i) || []).length;
    // Require a higher threshold of dashes to avoid false positives on lyrics with hyphens
    const isDashHeavy = dashCount > 8 && dashCount / Math.max(line.length, 1) > 0.15;
    const isBarHeavy = barCount > 3 && dashCount > 3;
    return isDashHeavy || isBarHeavy || (guitarNotation >= 1);
}

function ensureBrightness(hexColor: string, fallback: string): string {
    const h = hexColor.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance < LUMINANCE_THRESHOLD ? fallback : h;
}


export type ProcessMusicQueryResult = {
    success: true;
    data: string | null;
    pdfData: string | null;
    filename: string;
    previewText: string;
    capoReport?: { userCapo: number; originalCapo: number; realKey: string; shapeKey: string };
    preferFlats: boolean;
    detectedKey: string;
    detectedIsMinor: boolean;
    detectedLabel: string;
    confidence: number;
    degrees: string[];
    candidates: { root: string; isMinor: boolean; score: number }[];
    originalCapo: number;
    shapeKey: string;
    shapeIsMinor: boolean;
    shapeLabel: string;
    structuredParagraphs?: RunData[][];
    finalFontSizePt?: number;
    finalFontSizeHalfPt?: number;
    songName?: string;
    artistName?: string;
} | {
    success: false;
    error: string;
} | {
    success: true;
    detectOnly: true;
    detectedKey: string;
    detectedIsMinor: boolean;
    detectedLabel: string;
    confidence: number;
    degrees: string[];
    candidates: { root: string; isMinor: boolean; score: number }[];
    filename: string;
    previewText: string;
    originalCapo: number;
    shapeKey: string;
    shapeIsMinor: boolean;
    shapeLabel: string;
};

export async function processMusicQuery(query: string, options?: MusicQueryOptions): Promise<ProcessMusicQueryResult> {
  const detectOnly = options?.detectOnly || false;
  let transposeByVal = options?.transposeBy || 0;

  const opts = {
      fontFamily: options?.fontFamily || 'Courier New',
      transposeBy: transposeByVal,
      pageSize: options?.pageSize || 'DESKTOP',
      formats: options?.formats || ['docx', 'pdf'],
      removeTabs: options?.removeTabs || false,
      simplified: options?.simplified || false,
      darkMode: options?.darkMode || false,
      capoPosition: options?.capoPosition || 0,
      enharmonicPreference: options?.enharmonicPreference || 'auto',
      targetKey: options?.targetKey || '',
      targetIsMinor: options?.targetIsMinor || false,
      colors: {
         title: (options?.colors?.title || '#2B6CB0').replace('#', ''),
         lyrics: (options?.colors?.lyrics || '#000000').replace('#', ''),
         chorus: (options?.colors?.chorus || '#E53E3E').replace('#', ''),
         preChorus: (options?.colors?.preChorus || '#D69E2E').replace('#', ''),
         bridge: (options?.colors?.bridge || '#805AD5').replace('#', ''),
         chords: (options?.colors?.chords || '#000000').replace('#', ''),
      }
  };

  if (opts.darkMode) {
      opts.colors = {
          title: ensureBrightness(opts.colors.title, '64B5F6'),
          chords: ensureBrightness(opts.colors.chords, 'FFFFFF'),
          lyrics: ensureBrightness(opts.colors.lyrics, 'E0E0E0'),
          chorus: ensureBrightness(opts.colors.chorus, 'FF6B6B'),
          preChorus: ensureBrightness(opts.colors.preChorus, 'FFD54F'),
          bridge: ensureBrightness(opts.colors.bridge, 'CE93D8'),
      };
  }

  try {
    let searchTerm = query.trim();
    if (!searchTerm) {
        return { success: false, error: 'Por favor, insira o nome de uma música ou link do YouTube.' };
    }
    if (searchTerm.length > MAX_INPUT_LENGTH) {
        return { success: false, error: `Entrada muito longa (máximo ${MAX_INPUT_LENGTH} caracteres). Tente um nome mais curto.` };
    }
    console.log(`[Cifrador] Iniciando processamento para: "${searchTerm}"`);

    if (searchTerm.includes('youtube.com/') || searchTerm.includes('youtu.be/')) {
      console.log(`[Cifrador] Detectado link do YouTube, buscando título...`);
      const ytRes = await fetchWithTimeout(searchTerm, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } 
      });
      if (!ytRes.ok) throw new Error('Não foi possível acessar o YouTube.');
      const html = await ytRes.text();
      const $ = cheerio.load(html);
      // Try og:title first (more reliable), then <title>, then fallback
      const ogTitle = $('meta[property="og:title"]').attr('content') || '';
      const pageTitle = $('title').text() || '';
      const rawTitle = ogTitle || pageTitle;
      searchTerm = cleanYoutubeTitle(rawTitle);
      if (!searchTerm) {
        throw new Error('Não foi possível extrair o título do vídeo do YouTube. Tente pesquisar pelo nome da música diretamente.');
      }
      console.log(`[Cifrador] Título extraído do YouTube: "${searchTerm}"`);
    }
    
    const commonHeaders = { 
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };

    let cifraUrl = '';

    // Direct CifraClub link support
    if (searchTerm.startsWith('http') && (searchTerm.includes('cifraclub.com.br/') || searchTerm.includes('cifras.com.br/'))) {
        cifraUrl = searchTerm;
        console.log(`[Cifrador] Usando link direto: ${cifraUrl}`);
    } else {
        // Busca usando a API Solr do CifraClub (funciona em ambientes serverless sem bloqueio)
        console.log(`[Cifrador] Buscando cifra via API CifraClub para: ${searchTerm}`);
        
        try {
            const solrUrl = `https://solr.sscdn.co/cc/c7/?q=${encodeURIComponent(searchTerm)}&rows=15`;
            const solrRes = await fetchWithTimeout(solrUrl, { 
                headers: { 
                    'Accept': 'application/json',
                    'Origin': 'https://www.cifraclub.com.br',
                    'Referer': 'https://www.cifraclub.com.br/'
                } 
            }, 15000);
            
            if (solrRes.ok) {
                const solrData = await solrRes.json();
                const docs = solrData?.response?.docs || [];
                
                // Procura o primeiro resultado do tipo "2" (música) que tenha url
                const songResult = docs.find((doc: SolrDoc) => doc.tipo === '2' && doc.dns && doc.url);
                
                if (songResult) {
                    cifraUrl = `https://www.cifraclub.com.br/${songResult.dns}/${songResult.url}/`;
                    console.log(`[Cifrador] Encontrado via API Solr: ${songResult.txt} - ${songResult.art} => ${cifraUrl}`);
                } else {
                    // Se não encontrou música direta, tenta com resultado de artista
                    const artistResult = docs.find((doc: SolrDoc) => doc.tipo === '1' && doc.dns);
                    if (artistResult) {
                        console.log(`[Cifrador] Artista encontrado: ${artistResult.txt}. Buscando música no perfil...`);
                        // Tenta buscar novamente com query mais específica
                        const retryQuery = searchTerm.replace(new RegExp(artistResult.txt, 'gi'), '').trim();
                        if (retryQuery) {
                            const retryUrl = `https://solr.sscdn.co/cc/c7/?q=${encodeURIComponent(retryQuery + ' ' + artistResult.txt)}&rows=10`;
                            const retryRes = await fetchWithTimeout(retryUrl, { headers: { 'Accept': 'application/json' } }, 10000);
                            if (retryRes.ok) {
                                const retryData = await retryRes.json();
                                const retrySong = retryData?.response?.docs?.find((doc: SolrDoc) => doc.tipo === '2' && doc.dns && doc.url);
                                if (retrySong) {
                                    cifraUrl = `https://www.cifraclub.com.br/${retrySong.dns}/${retrySong.url}/`;
                                    console.log(`[Cifrador] Encontrado na retry: ${retrySong.txt} => ${cifraUrl}`);
                                }
                            }
                        }
                    }
                }
            } else {
                console.log(`[Cifrador] API Solr falhou (Status: ${solrRes.status})`);
            }
        } catch (solrErr: unknown) {
            const msg = solrErr instanceof Error ? solrErr.message : String(solrErr);
            console.log(`[Cifrador] Erro na API Solr: ${msg}. Tentando fallback...`);
        }

        // Fallback: busca via Google (mais resiliente que DuckDuckGo/Bing em serverless)
        if (!cifraUrl) {
            console.log(`[Cifrador] Tentando fallback via Google...`);
            try {
                const googleUrl = 'https://www.google.com/search?q=' + encodeURIComponent(`${searchTerm} cifra site:cifraclub.com.br`);
                const googleRes = await fetchWithTimeout(googleUrl, { headers: commonHeaders }, 15000);
                
                if (googleRes.ok) {
                    const googleHtml = await googleRes.text();
                    const $google = cheerio.load(googleHtml);
                    
                    $google('a').each((_, el) => {
                        let href = $google(el).attr('href') || '';
                        // Google wraps links in /url?q=...
                        if (href.includes('/url?q=')) {
                            const urlParams = new URLSearchParams(href.split('?')[1]);
                            href = decodeURIComponent(urlParams.get('q') || '');
                        }
                        if (href.includes('cifraclub.com.br/') && !href.includes('/search') && !href.includes('/letra/') && !href.includes('/academy/')) {
                            try {
                                const urlObj = new URL(href);
                                const paths = urlObj.pathname.split('/').filter(Boolean);
                                if (paths.length >= 2) {
                                    cifraUrl = urlObj.origin + urlObj.pathname;
                                    return false;
                                }
                            } catch { /* ignore invalid URLs */ }
                        }
                    });
                }
            } catch (googleErr: unknown) {
                const msg = googleErr instanceof Error ? googleErr.message : String(googleErr);
                console.log(`[Cifrador] Google fallback falhou: ${msg}`);
            }
        }
    }

    if (!cifraUrl) throw new Error(`Não foi possível encontrar a cifra para: ${searchTerm}. Tente um nome mais específico (ex: "Lugar Secreto Gabriela Rocha").`);
    
    // Remove qualquer fragmento ou query param anterior antes de remontar
    let cleanUrl = cifraUrl.split('#')[0].split('?')[0];
    if (cleanUrl.endsWith('/')) {
        // ok
    } else if (!cleanUrl.endsWith('.html')) {
        cleanUrl += '/';
    }

    // A lógica solicitada: usar o link que remove as tabs (#tabs=false)
    if (opts.simplified && !cleanUrl.includes('simplificada.html')) {
        cleanUrl = cleanUrl.replace(/\/$/, '') + '/simplificada.html';
    }

    const finalUrl = opts.removeTabs 
        ? (cleanUrl.includes('?') ? `${cleanUrl}&tabs=false#tabs=false` : `${cleanUrl}?tabs=false#tabs=false`)
        : cleanUrl;

    console.log(`[Cifrador] URL final processada: ${finalUrl}`);

    // Fetch cipher
    console.log(`[Cifrador] Baixando conteúdo da cifra...`);
    const cifraRes = await fetchWithTimeout(finalUrl, { 
      headers: { ...commonHeaders } 
    });
    if (!cifraRes.ok) throw new Error('Não foi possível acessar a página da cifra.');
    const cifraHtml = await cifraRes.text();
    const $cifra = cheerio.load(cifraHtml);
    
    // Seleção específica do bloco de cifra para evitar lixo de outras partes da página
    let preElement = $cifra('pre.cifra_cnt');
    if (preElement.length === 0) preElement = $cifra('#cifra_raw');
    if (preElement.length === 0) preElement = $cifra('pre').first();
    
    // Se removeTabs ativo, remove elementos de tablatura do DOM ANTES de extrair texto
    // Isso replica exatamente o que o #tabs=false do CifraClub faz via JavaScript
    if (opts.removeTabs) {
        console.log(`[Cifrador] Removendo tablaturas via DOM (como #tabs=false)...`);
        preElement.find('.tablatura').remove();
        preElement.find('.tablatura-container').remove();
        preElement.find('[data-tab]').remove();
        preElement.find('span.tablatura').remove();
        // Remove blocos de tab que usam classe 'tab' ou 'cifra_tab'
        preElement.find('.tab, .cifra_tab, .tabInativa').remove();
    }
    
    let rawCipher = preElement.text() || $cifra('.cifra_cnt').text() || $cifra('.ct_cifra').text() || '';
    if (!rawCipher) throw new Error('Conteúdo da cifra não encontrado na página.');
    
    // Limpeza profunda de tablaturas para simular o efeito do link #tabs=false
    if (opts.removeTabs) {
        console.log(`[Cifrador] Iniciando limpeza profunda de tablaturas...`);
        const lines = rawCipher.split('\n');
        
        // 1. Limpeza cirúrgica de rótulos de Tab em linhas de acordes
        const cleanedLines = lines.map(line => {
            let l = line;
            // Remove "[Tab - Intro]", "[Tab]", etc, mas mantém os acordes vizinhos
            l = l.replace(/\[\s*tab.*?\s*\]/gi, '');
            // Remove chord names soltos que costumam vir após o rótulo de Tab
            // ex: "[Tab - Intro] C7M" -> remove o C7M extra se estiver no fim
            l = l.replace(/\s+[A-G][b#]?(?:m|M|sus|add|maj|min|dim|aug)?\d*$/g, '');
            return l;
        });

        // 2. Filtro agressivo de linhas de tablatura
        rawCipher = cleanedLines.filter(line => {
            const l = line.trim();
            if (!l) return true; // Mantém linhas vazias para estrutura
            
            // Se for identificado como linha de tab (mais de 4 hifens ou barras verticais)
            const hyphenCount = (l.match(/-/g) || []).length;
            const barCount = (l.match(/\|/g) || []).length;
            if (barCount >= 1 && (hyphenCount > 3 || l.includes('|'))) return false;
            
            // Utilitário isTabLine mais abrangente
            if (isTabLine(l)) return false;
            
            // Setas de batida v v v ou ^ ^
            if (/^[v\^\>\s\d\.\~\/\|]+$/.test(l) && (l.includes('v') || l.includes('^')) && l.length > 1) return false;
            
            // Resíduos de "Parte X de Y" ou "Solo:" se seguidos de vazio
            if (/^Parte\s+\d+\s+de\s+\d+$/i.test(l)) return false;
            if (/^Solo:?\s*$/i.test(l)) return false;
            if (/^Dedilhado:?\s*$/i.test(l)) return false;
            
            return true;
        }).join('\n');
        
        // Remove blocos de linhas vazias excessivas que sobram da remoção
        rawCipher = rawCipher.replace(/\n\s*\n\s*\n/g, '\n\n');
    }

    const songName = $cifra('h1').first().text().trim() || searchTerm;
    const artistName = $cifra('.t3').text().trim() || $cifra('h2').first().text().trim() || 'Artista Desconhecido';

    // --- DETECT CAPO FROM ORIGINAL CIFRA PAGE ---
    // CifraClub stores capo in JS data: `capo: 7,` or sometimes as text "capo na 5ª casa"
    let originalCapo = 0;
    let originalKeyFromPage = '';
    const pageText = $cifra('body').text();
    // Try extracting capo from JS data format first (newer CifraClub)
    const capoJsMatch = pageText.match(/capo(?:Position)?:\s*(\d+)/i);
    if (capoJsMatch) {
        originalCapo = parseInt(capoJsMatch[1], 10);
        console.log(`[Cifrador] Capo detectado na cifra original (JS data): ${originalCapo}ª casa`);
    } else {
        // Fallback to Portuguese text format (older CifraClub or other sites)
        const capoTextMatch = pageText.match(/capo\s+(?:na|em)\s+(\d+)[ªa]?\s*(?:casa|traste)?/i)
                       || pageText.match(/capotraste\s+(?:na|em)\s+(\d+)[ªa]?\s*(?:casa|traste)?/i)
                       || pageText.match(/cavaquinho\s+.*?(\d+)[ªa]?\s*(?:casa|traste)/i);
        if (capoTextMatch) {
            originalCapo = parseInt(capoTextMatch[1], 10);
            console.log(`[Cifrador] Capo detectado na cifra original (texto): ${originalCapo}ª casa`);
        }
    }
    // Extract original key hint from CifraClub JS data (like `key: 'C'`)
    const keyJsMatch = pageText.match(/key:\s*'([A-G][#b]?)'/);
    if (keyJsMatch) {
        originalKeyFromPage = keyJsMatch[1];
        console.log(`[Cifrador] Tom informado na página original: ${originalKeyFromPage}`);
    }

    const rawLines = rawCipher.split('\n');

    const pageWidthMM = opts.pageSize === 'MOBILE' ? 100 : 210;

    const marginTopMM = 5;
    const marginBottomMM = 10;
    const marginLeftMM = 5;
    const marginRightMM = 10;

    const printableWidthMM = pageWidthMM - marginLeftMM - marginRightMM;
    const printableWidthPt = printableWidthMM * MM_TO_PT;

    // --- ENHARMONIC DETECTION + KEY DETECTION ---
    const chordRoots: string[] = [];
    const allChordTokens: string[] = [];
    let firstChord = '';
    let lastChord = '';
    for (const line of rawLines) {
        if (!isChordLine(line)) continue;
        const tokens = line.split(/[\s\t]+/).filter(Boolean);
        for (const t of tokens) {
            const m = t.match(/^([A-G][#b]?)/);
            if (m) {
                chordRoots.push(m[1]);
                allChordTokens.push(t);
                if (!firstChord) firstChord = t;
                lastChord = t;
            }
        }
    }

    const keyResult = detectKeyFromChordTokens(allChordTokens, firstChord, lastChord);
    const shapeRoot = keyResult.root;
    const shapeIsMinor = keyResult.isMinor;
    const detectedConfidence = keyResult.confidence;
    const shapeLabel = shapeRoot + (shapeIsMinor ? 'm' : '');
    const keyCandidates = keyResult.candidates;

    // When original capo > 0, the detected key is the SHAPE key.
    // The REAL key = shape key + originalCapo semitones.
    const originalCapoAdjust = originalCapo > 0 ? originalCapo : 0;
    const shapeIdx = noteIndex(shapeRoot);
    const realIdx = shapeIdx !== -1 && originalCapo > 0 ? (shapeIdx + originalCapo) % 12 : shapeIdx;
    const detectedRoot = realIdx !== -1 ? resolveEnharmonic(realIdx, detectKeyPreference(chordRoots)) : shapeRoot;
    const detectedIsMinor = shapeIsMinor;
    const detectedLabel = detectedRoot + (detectedIsMinor ? 'm' : '');
    const preferFlats = opts.enharmonicPreference === 'flat' ? true
                      : opts.enharmonicPreference === 'sharp' ? false
                      : detectKeyPreference(chordRoots);

    const detectedDegrees = keyDegrees(detectedRoot, detectedIsMinor, preferFlats);

    console.log(`[Cifrador] Shape key: ${shapeLabel}${originalCapo > 0 ? ` | Real key: ${detectedLabel} (capo ${originalCapo})` : ''}`);

    // Auto-set transpose when target key is provided
    if (opts.targetKey) {
        const targetIdx = noteIndex(opts.targetKey);
        const detectedIdx = noteIndex(detectedRoot);
        if (targetIdx !== -1 && detectedIdx !== -1) {
            const autoTranspose = (targetIdx - detectedIdx + 12) % 12;
            opts.transposeBy = autoTranspose;
            transposeByVal = autoTranspose;
        }
    }

    // If detectOnly, return key info without generating files
    if (detectOnly) {
        console.log(`[Cifrador] Detecção de tom: ${detectedLabel} (confiança: ${Math.round(detectedConfidence * 100)}%)` +
            (originalCapo > 0 ? ` | Shape: ${shapeLabel} | Capo original: ${originalCapo}ª casa` : ''));
        return {
            success: true,
            detectOnly: true,
            detectedKey: detectedRoot,
            detectedIsMinor,
            detectedLabel,
            confidence: detectedConfidence,
            degrees: detectedDegrees,
            candidates: keyCandidates,
            filename: `${artistName} - ${songName}`,
            previewText: rawLines.join('\n'),
            originalCapo,
            shapeKey: shapeRoot,
            shapeIsMinor,
            shapeLabel,
        };
    }

    // --- CAPO + TRANSPOSE ---
    // originalCapo already defines originalCapoAdjust at line ~687
    const effectiveSteps = opts.transposeBy - opts.capoPosition + originalCapoAdjust;

    // --- PROCESS LINES ---
    let maxLineLength = 0;
    const processedLines = rawLines.map(line => {
        const isChord = isChordLine(line);
        const transposed = isChord ? transposeLinePreservingSpacing(line, effectiveSteps, preferFlats) : line;
        if (transposed.length > maxLineLength) maxLineLength = transposed.length;
        return { original: line, text: transposed, isChord };
    });

    const previewText = processedLines.map(pl => pl.text).join('\n');

    const requiredFontSizePt = printableWidthPt / (Math.max(maxLineLength, 1) * CHART_WIDTH_RATIO);
    const finalFontSizePt = Math.min(14, Math.max(6, requiredFontSizePt));
    const finalFontSizeHalfPt = Math.floor(finalFontSizePt * 2);

    // Structure generation
    let sectionColor = opts.colors.lyrics; 

    const structuredParagraphs: RunData[][] = [];

    processedLines.forEach(lineObj => {
      const trimmed = lineObj.original.trim();
      const lower = trimmed.toLowerCase();
      
      if (lower.includes('[refrão]') || lower.includes('[refrao]') || lower.includes('[chorus]')) {
         sectionColor = opts.colors.chorus; 
      } else if (lower.includes('pré-refrão') || lower.includes('pre-refrão') || lower.includes('pre refrão') || lower.includes('pré refrão') || lower.includes('pre-chorus') || lower.includes('pré-chorus')) {
         sectionColor = opts.colors.preChorus;
      } else if (lower.includes('[ponte]') || lower.includes('[bridge]')) {
         sectionColor = opts.colors.bridge;
      } else if (lower.startsWith('[') && lower.endsWith(']')) {
         if (lower.includes('parte') || lower.includes('verso') || lower.includes('solo') || lower.includes('intro')) {
             sectionColor = opts.colors.lyrics; 
         }
      }

      const blocks = lineObj.text.split(/(\[.*?\])/g);
      const pRuns: RunData[] = [];

      for (const block of blocks) {
          if (!block) continue;
          const isBracket = block.startsWith('[') && block.endsWith(']');
          
          let color = sectionColor;
          let bold = false;
          let highlight = false;

          if (isBracket) {
              bold = true;
              highlight = true;
              color = "000000"; // Black contrast for yellow highlight
          } else if (lineObj.isChord) {
              bold = true;
              color = opts.colors.chords; 
          }

          pRuns.push({ text: block, color, bold, isHighlight: highlight, isChord: lineObj.isChord });
      }

      structuredParagraphs.push(pRuns);
    });

    let docxBase64 = null;
    let pdfBase64 = null;

    if (opts.formats.includes('docx')) {
        console.log(`[Cifrador] Gerando DOCX...`);
        const paragraphElements = structuredParagraphs.map(pRuns => {
           if (pRuns.length === 0) return new Paragraph({ children: [] });
           
           return new Paragraph({
              children: pRuns.map(r => {
                 return new TextRun({
                    text: r.text,
                    font: opts.fontFamily,
                    size: finalFontSizeHalfPt,
                    color: r.isHighlight ? "000000" : r.color,
                    bold: r.bold,
                    highlight: r.isHighlight ? HighlightColor.YELLOW : undefined
                 });
              })
           });
        });

        const doc = new Document({
          creator: 'Cifrador Pro',
          sections: [{
            properties: { 
                page: {
                    size: {
                        width: convertMillimetersToTwip(pageWidthMM),
                        height: convertMillimetersToTwip(opts.pageSize === 'MOBILE' ? 300 : 297)
                    },
                    margin: {
                        top: convertMillimetersToTwip(marginTopMM),
                        bottom: convertMillimetersToTwip(marginBottomMM),
                        left: convertMillimetersToTwip(marginLeftMM),
                        right: convertMillimetersToTwip(marginRightMM)
                    }
                },
                ...(opts.darkMode ? { background: { color: "000000" } } : {})
            },
            children: [
              new Paragraph({
                children: [new TextRun({ text: songName, bold: true, size: 32, font: 'Arial', color: opts.colors.title })]
              }),
              new Paragraph({
                 children: [new TextRun({ text: artistName, size: 24, font: 'Arial', color: opts.colors.title })]
              }),
              new Paragraph({ children: [] }), 
              ...paragraphElements
            ]
          }]
        });

        const buffer = await Packer.toBuffer(doc);
        docxBase64 = buffer.toString('base64');
    }

    if (opts.formats.includes('pdf')) {
        console.log(`[Cifrador] Gerando PDF...`);
        
        function hexToRgbPdf(hexColor: string) {
            let cleanHex = hexColor.replace('#', '');
            if (cleanHex.length === 3) {
                cleanHex = cleanHex.split('').map(c => c + c).join('');
            }
            const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
            const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
            const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
            return rgb(r, g, b);
        }

        const pdfDoc = await PDFDocument.create();
        const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const courier = await pdfDoc.embedFont(StandardFonts.Courier);
        const courierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

        const pWidth = opts.pageSize === 'MOBILE' ? 283.46 : 595.28;
        const pHeight = opts.pageSize === 'MOBILE' ? 850.39 : 841.89;
        
        const mTop = marginTopMM * MM_TO_PT;
        const mBot = marginBottomMM * MM_TO_PT;
        const mLeft = marginLeftMM * MM_TO_PT;

        // Note: PDF coordinates: 0,0 is bottom-left, y goes UP.
        let page = pdfDoc.addPage([pWidth, pHeight]);
        if (opts.darkMode) {
            page.drawRectangle({ x: 0, y: 0, width: pWidth, height: pHeight, color: rgb(0, 0, 0) });
        }
        let currentY = pHeight - mTop - 16;

        page.drawText(songName, { x: mLeft, y: currentY, size: 16, font: helveticaBold, color: hexToRgbPdf(opts.colors.title) });
        currentY -= 20;
        page.drawText(artistName, { x: mLeft, y: currentY, size: 12, font: helvetica, color: hexToRgbPdf(opts.colors.title) });
        currentY -= 30;

        const lineHeight = finalFontSizePt * LINE_HEIGHT_RATIO;

        structuredParagraphs.forEach(pRuns => {
            if (currentY < mBot + lineHeight) {
                page = pdfDoc.addPage([pWidth, pHeight]);
                if (opts.darkMode) {
                    page.drawRectangle({ x: 0, y: 0, width: pWidth, height: pHeight, color: rgb(0, 0, 0) });
                }
                currentY = pHeight - mTop - finalFontSizePt;
            }

            if (pRuns.length === 0) {
               currentY -= lineHeight;
               return;
            }

            let currentX = mLeft;
          for (let i = 0; i < pRuns.length; i++) {
               const r = pRuns[i];
               const textFont = r.bold ? courierBold : courier;
                // PDF-Lib standard fonts support WinAnsi (Portuguese accents)
                const cleanText = r.text.replace(/\r/g, '')
                                    .replace(/↓/g, 'v')
                                    .replace(/↑/g, '^')
                                    .replace(/[^\x00-\xFF]/g, ' '); // Keep Latin-1 characters (accents), remove others
               const textWidth = textFont.widthOfTextAtSize(cleanText, finalFontSizePt);
               
               let textColor = hexToRgbPdf(r.color);

               if (r.isHighlight) {
                   page.drawRectangle({
                       x: currentX,
                       y: currentY - (finalFontSizePt * 0.2), // Box padding
                       width: textWidth,
                       height: finalFontSizePt * 1.2, // Box height
                       color: rgb(1, 1, 0) // yellow
                   });
                   textColor = rgb(0, 0, 0); // black text
               }
               
               page.drawText(cleanText, {
                   x: currentX,
                   y: currentY,
                   size: finalFontSizePt,
                   font: textFont,
                   color: textColor
               });

               currentX += textWidth;
            }
            
            currentY -= lineHeight;
        });

        pdfBase64 = await pdfDoc.saveAsBase64();
    }

    const finalFilename = `${artistName} - ${songName}`;
    console.log(`[Cifrador] Sucesso: ${finalFilename}`);
    const detectedIdx = noteIndex(detectedRoot);
    const capoReport = (opts.capoPosition > 0 || originalCapo > 0) ? {
        userCapo: opts.capoPosition || 0,
        originalCapo: originalCapo || 0,
        realKey: resolveEnharmonic((detectedIdx + opts.transposeBy + 12) % 12, preferFlats) + (detectedIsMinor ? 'm' : ''),
        shapeKey: resolveEnharmonic((detectedIdx + effectiveSteps + 12) % 12, preferFlats) + (detectedIsMinor ? 'm' : ''),
    } : undefined;

    return {
      success: true,
      data: docxBase64,
      pdfData: pdfBase64,
      filename: finalFilename,
      previewText,
      capoReport,
      preferFlats,
      detectedKey: detectedRoot,
      detectedIsMinor,
      detectedLabel,
      confidence: detectedConfidence,
      degrees: detectedDegrees,
      candidates: keyCandidates,
      originalCapo,
      shapeKey: shapeRoot,
      shapeIsMinor,
      shapeLabel,
      structuredParagraphs,
      finalFontSizePt,
      finalFontSizeHalfPt,
      songName,
      artistName,
    };

  } catch (error: unknown) {
    console.error(`[Cifrador] ERRO:`, error);
    const message = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
    if (message.includes('timeout') || message.includes('abort')) {
        return { success: false, error: 'A busca demorou muito. Verifique sua conexão e tente novamente.' };
    }
    if (message.includes('fetch')) {
        return { success: false, error: 'Erro de conexão ao buscar a cifra. Tente novamente em alguns instantes.' };
    }
    return { success: false, error: message };
  }
}

export async function processBulkMusicQuery(
  queries: string[],
  options?: MusicQueryOptions
): Promise<BulkMusicQueryResult> {
  if (!queries || queries.length === 0) {
    return { success: false, error: 'Nenhuma música fornecida.' };
  }
  if (queries.length > 30) {
    return { success: false, error: 'Máximo de 30 músicas por vez.' };
  }

  console.log(`[Cifrador] Processamento em massa: ${queries.length} músicas`);

  const bulkOptions: MusicQueryOptions = {
    ...options,
    formats: [],
  };

  const results = await Promise.all(
    queries.map((q) => processMusicQuery(q, bulkOptions))
  );

  const songs: BulkSongResult[] = [];
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (res.success && 'structuredParagraphs' in res && res.structuredParagraphs) {
      songs.push({
        filename: res.filename,
        previewText: res.previewText,
        detectedLabel: res.detectedLabel,
        confidence: res.confidence,
        structuredParagraphs: res.structuredParagraphs,
        finalFontSizePt: res.finalFontSizePt || 10,
        finalFontSizeHalfPt: res.finalFontSizeHalfPt || 20,
        songName: res.songName || queries[i],
        artistName: res.artistName || 'Artista',
      });
    } else {
      const error = !res.success ? res.error : 'Dados intermediários não disponíveis.';
      songs.push({
        filename: queries[i],
        previewText: '',
        detectedLabel: '',
        confidence: 0,
        structuredParagraphs: [],
        finalFontSizePt: 10,
        finalFontSizeHalfPt: 20,
        songName: queries[i],
        artistName: '',
        error,
      });
    }
  }

  const successfulSongs = songs.filter((s) => !s.error);
  if (successfulSongs.length === 0) {
    return { success: false, error: 'Nenhuma cifra foi encontrada. Verifique os nomes das músicas.' };
  }

  const formats = options?.formats || ['docx', 'pdf'];
  const fontFamily = options?.fontFamily || 'Courier New';
  const pageSize = options?.pageSize || 'DESKTOP';
  const darkMode = options?.darkMode || false;

  const colors = {
    title: (options?.colors?.title || '#2B6CB0').replace('#', ''),
    lyrics: (options?.colors?.lyrics || '#000000').replace('#', ''),
    chorus: (options?.colors?.chorus || '#E53E3E').replace('#', ''),
    preChorus: (options?.colors?.preChorus || '#D69E2E').replace('#', ''),
    bridge: (options?.colors?.bridge || '#805AD5').replace('#', ''),
    chords: (options?.colors?.chords || '#000000').replace('#', ''),
  };

  if (darkMode) {
    colors.title = ensureBrightness(colors.title, '64B5F6');
    colors.chords = ensureBrightness(colors.chords, 'FFFFFF');
    colors.lyrics = ensureBrightness(colors.lyrics, 'E0E0E0');
    colors.chorus = ensureBrightness(colors.chorus, 'FF6B6B');
    colors.preChorus = ensureBrightness(colors.preChorus, 'FFD54F');
    colors.bridge = ensureBrightness(colors.bridge, 'CE93D8');
  }

  let docxBase64 = null;
  let pdfBase64 = null;

  if (formats.includes('docx')) {
    console.log(`[Cifrador] Gerando DOCX em massa...`);
    const pageWidthMM = pageSize === 'MOBILE' ? 100 : 210;
    const marginTopMM = 5;
    const marginBottomMM = 10;
    const marginLeftMM = 5;
    const marginRightMM = 10;

    const allChildren: Paragraph[] = [];

    successfulSongs.forEach((song, idx) => {
      if (idx > 0) {
        allChildren.push(new Paragraph({ pageBreakBefore: true, children: [] }));
      }
      allChildren.push(
        new Paragraph({
          children: [new TextRun({ text: song.songName, bold: true, size: 32, font: 'Arial', color: colors.title })],
        })
      );
      allChildren.push(
        new Paragraph({
          children: [new TextRun({ text: song.artistName, size: 24, font: 'Arial', color: colors.title })],
        })
      );
      allChildren.push(new Paragraph({ children: [] }));

      const paragraphElements = song.structuredParagraphs.map((pRuns) => {
        if (pRuns.length === 0) return new Paragraph({ children: [] });
        return new Paragraph({
          children: pRuns.map((r) => {
            return new TextRun({
              text: r.text,
              font: fontFamily,
              size: song.finalFontSizeHalfPt,
              color: r.isHighlight ? '000000' : r.color,
              bold: r.bold,
              highlight: r.isHighlight ? HighlightColor.YELLOW : undefined,
            });
          }),
        });
      });

      allChildren.push(...paragraphElements);
    });

    const doc = new Document({
      creator: 'Cifrador Pro',
      sections: [
        {
          properties: {
            page: {
              size: {
                width: convertMillimetersToTwip(pageWidthMM),
                height: convertMillimetersToTwip(pageSize === 'MOBILE' ? 300 : 297),
              },
              margin: {
                top: convertMillimetersToTwip(marginTopMM),
                bottom: convertMillimetersToTwip(marginBottomMM),
                left: convertMillimetersToTwip(marginLeftMM),
                right: convertMillimetersToTwip(marginRightMM),
              },
            },
            ...(darkMode ? { background: { color: '000000' } } : {}),
          },
          children: allChildren,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    docxBase64 = buffer.toString('base64');
  }

  if (formats.includes('pdf')) {
    console.log(`[Cifrador] Gerando PDF em massa...`);

    function hexToRgbPdf(hexColor: string) {
      let cleanHex = hexColor.replace('#', '');
      if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map((c) => c + c).join('');
      }
      const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
      const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
      const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
      return rgb(r, g, b);
    }

    const pdfDoc = await PDFDocument.create();
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const courier = await pdfDoc.embedFont(StandardFonts.Courier);
    const courierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

    const pWidth = pageSize === 'MOBILE' ? 283.46 : 595.28;
    const pHeight = pageSize === 'MOBILE' ? 850.39 : 841.89;
    const mTop = 5 * MM_TO_PT;
    const mBot = 10 * MM_TO_PT;
    const mLeft = 5 * MM_TO_PT;

    let page = pdfDoc.addPage([pWidth, pHeight]);
    if (darkMode) {
      page.drawRectangle({ x: 0, y: 0, width: pWidth, height: pHeight, color: rgb(0, 0, 0) });
    }
    let currentY = pHeight - mTop - 16;

    successfulSongs.forEach((song, idx) => {
      if (idx > 0) {
        page = pdfDoc.addPage([pWidth, pHeight]);
        if (darkMode) {
          page.drawRectangle({ x: 0, y: 0, width: pWidth, height: pHeight, color: rgb(0, 0, 0) });
        }
        currentY = pHeight - mTop - 16;
      }

      page.drawText(song.songName, {
        x: mLeft,
        y: currentY,
        size: 16,
        font: helveticaBold,
        color: hexToRgbPdf(colors.title),
      });
      currentY -= 20;
      page.drawText(song.artistName, {
        x: mLeft,
        y: currentY,
        size: 12,
        font: helvetica,
        color: hexToRgbPdf(colors.title),
      });
      currentY -= 30;

      const lineHeight = song.finalFontSizePt * LINE_HEIGHT_RATIO;

      song.structuredParagraphs.forEach((pRuns) => {
        if (currentY < mBot + lineHeight) {
          page = pdfDoc.addPage([pWidth, pHeight]);
          if (darkMode) {
            page.drawRectangle({ x: 0, y: 0, width: pWidth, height: pHeight, color: rgb(0, 0, 0) });
          }
          currentY = pHeight - mTop - song.finalFontSizePt;
        }

        if (pRuns.length === 0) {
          currentY -= lineHeight;
          return;
        }

        let currentX = mLeft;
        for (let i = 0; i < pRuns.length; i++) {
          const r = pRuns[i];
          const textFont = r.bold ? courierBold : courier;
          const cleanText = r.text
            .replace(/\r/g, '')
            .replace(/↓/g, 'v')
            .replace(/↑/g, '^')
            .replace(/[^\x00-\xFF]/g, ' ');
          const textWidth = textFont.widthOfTextAtSize(cleanText, song.finalFontSizePt);

          let textColor = hexToRgbPdf(r.color);
          if (r.isHighlight) {
            page.drawRectangle({
              x: currentX,
              y: currentY - song.finalFontSizePt * 0.2,
              width: textWidth,
              height: song.finalFontSizePt * 1.2,
              color: rgb(1, 1, 0),
            });
            textColor = rgb(0, 0, 0);
          }

          page.drawText(cleanText, {
            x: currentX,
            y: currentY,
            size: song.finalFontSizePt,
            font: textFont,
            color: textColor,
          });

          currentX += textWidth;
        }

        currentY -= lineHeight;
      });
    });

    pdfBase64 = await pdfDoc.saveAsBase64();
  }

  console.log(`[Cifrador] Massa concluída: ${successfulSongs.length}/${queries.length} músicas`);

  return {
    success: true,
    data: docxBase64,
    pdfData: pdfBase64,
    songs,
  };
}
