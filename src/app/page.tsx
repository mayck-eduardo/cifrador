'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Link, Music, Download, FileText, Loader2, Settings, Plus, Minus, Smartphone, Monitor, Check, Scissors, AlertCircle, Moon, Sun, Eye, X, Clock, ArrowUp, ArrowDown, Trash2, List } from 'lucide-react';
import { processMusicQuery, processBulkMusicQuery, MusicQueryOptions, BulkMusicQueryResult } from '@/lib/actions';

function Toggle({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${enabled ? 'bg-white' : 'bg-white/20'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-[#0a0a0a] transition-transform duration-200 ${enabled ? 'translate-x-4' : ''}`} />
    </button>
  );
}

const CHORD_TOKEN_RE = /\b([A-G][#b]?(?:m|M|min|dim|aug|sus[24]?|add[0-9]+|[0-9]+)*(?:\/[A-G][#b]?)?)\b/g;

function isChordLine(line: string) {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length === 0 || tokens.length > 12) return false;
  let chordCount = 0;
  for (const t of tokens) {
    if (CHORD_TOKEN_RE.test(t)) chordCount++;
    CHORD_TOKEN_RE.lastIndex = 0;
  }
  return chordCount >= Math.ceil(tokens.length * 0.5);
}

function detectSection(line: string): string | null {
  const l = line.toLowerCase();
  if (l.includes('[refrão]') || l.includes('[refrao]') || l.includes('[chorus]')) return 'chorus';
  if (l.includes('pré-refrão') || l.includes('pre-refrão') || l.includes('pre refrão') || l.includes('pré refrão') || l.includes('pre-chorus') || l.includes('pré-chorus')) return 'preChorus';
  if (l.includes('[ponte]') || l.includes('[bridge]')) return 'bridge';
  return null;
}

function isSectionReset(line: string): boolean {
  const l = line.toLowerCase();
  if (!l.startsWith('[') || !l.endsWith(']')) return false;
  return l.includes('parte') || l.includes('verso') || l.includes('solo') || l.includes('intro');
}

type RichPreviewColors = {
  title: string; chords: string; lyrics: string;
  chorus: string; preChorus: string; bridge: string;
};

function RichPreview({ text, colors }: { text: string; colors: RichPreviewColors }) {
  const parsedLines = useMemo(() => {
    const sectionMap: Record<string, string> = {
      chorus: colors.chorus,
      preChorus: colors.preChorus,
      bridge: colors.bridge,
    };
    const lines = text.split('\n');

    const sectionIndices: { idx: number; color: string }[] = [];
    lines.forEach((line, i) => {
      const t = line.trim();
      const detected = detectSection(t);
      if (detected) {
        sectionIndices.push({ idx: i, color: sectionMap[detected] || colors.lyrics });
      } else if (isSectionReset(t)) {
        sectionIndices.push({ idx: i, color: colors.lyrics });
      }
    });

    return lines.map((line, i) => {
      const lastSection = sectionIndices.filter(s => s.idx <= i).pop();
      const sectionColor = lastSection?.color || colors.lyrics;
      return { line, trimmed: line.trim(), sectionColor };
    });
  }, [text, colors]);

  return (
    <div className="flex flex-col gap-0 font-mono text-[13px] leading-[1.8]">
      {parsedLines.map(({ line: rawLine, trimmed, sectionColor }, i) => {
        if (!trimmed) return <div key={i} className="h-[1.8em]" />;

        const isSection = trimmed.startsWith('[') && trimmed.endsWith(']');
        if (isSection) {
          return (
            <div key={i} className="font-bold" style={{ color: sectionColor }}>
              {trimmed}
            </div>
          );
        }

        const chordLine = isChordLine(trimmed);
        if (chordLine) {
          const parts = rawLine.split(/(\s+)/);
          return (
            <div key={i} className="font-bold" style={{ color: colors.chords }}>
              {parts.map((part, j) => {
                if (/^\s+$/.test(part)) return <span key={j}>{part}</span>;
                const isChord = CHORD_TOKEN_RE.test(part);
                CHORD_TOKEN_RE.lastIndex = 0;
                return isChord
                  ? <span key={j} className="font-bold">{part}</span>
                  : <span key={j} style={{ color: sectionColor }}>{part}</span>;
              })}
            </div>
          );
        }

        const parts = rawLine.split(/(\[.*?\])/g);
        return (
          <div key={i} style={{ color: sectionColor }}>
            {parts.map((part, j) => {
              if (!part) return null;
              if (part.startsWith('[') && part.endsWith(']')) {
                return <span key={j} className="font-bold" style={{ color: sectionColor }}>{part}</span>;
              }
              return <span key={j}>{part}</span>;
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ filename: string, data: string | null, pdfData: string | null, previewText: string, detectedLabel?: string, confidence?: number } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectedKey, setDetectedKey] = useState<{ root: string; isMinor: boolean; label: string; confidence: number; degrees?: string[]; candidates?: { root: string; isMinor: boolean; score: number }[]; originalCapo?: number; shapeKey?: string; shapeIsMinor?: boolean; shapeLabel?: string } | null>(null);
  const [targetKey, setTargetKey] = useState('');

  const [showOptions, setShowOptions] = useState(false);
  const [fontFamily, setFontFamily] = useState('Courier New');
  const [pageSize, setPageSize] = useState<'DESKTOP' | 'MOBILE'>('DESKTOP');
  const [transposeBy, setTransposeBy] = useState(0);
  const [formats, setFormats] = useState<string[]>(['docx', 'pdf']);
  const [removeTabs, setRemoveTabs] = useState(false);
  const [simplified, setSimplified] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const [colors, setColors] = useState({
    title: '#2B6CB0',
    chords: '#000000',
    lyrics: '#000000',
    chorus: '#E53E3E',
    preChorus: '#D69E2E',
    bridge: '#805AD5'
  });

  type HistoryEntry = {
    id: number;
    query: string;
    filename: string;
    data: string | null;
    pdfData: string | null;
    previewText: string;
    options: MusicQueryOptions;
    detectedLabel?: string;
    capoPosition?: number;
  };
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('cifrador_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('cifrador_history', JSON.stringify(history));
    } catch { /* storage full or unavailable */ }
  }, [history]);

  const [bulkMode, setBulkMode] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [bulkSongs, setBulkSongs] = useState<Array<{ query: string; status: 'pending' | 'loading' | 'done' | 'error'; error?: string }>>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkMusicQueryResult | null>(null);

  const parseBulkInput = () => {
    const lines = bulkInput.split('\n').map(l => l.trim()).filter(Boolean);
    setBulkSongs(lines.map(query => ({ query, status: 'pending' as const })));
  };

  const moveBulkSong = (idx: number, dir: -1 | 1) => {
    setBulkSongs(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const removeBulkSong = (idx: number) => {
    setBulkSongs(prev => prev.filter((_, i) => i !== idx));
  };

  const handleBulkGenerate = async () => {
    if (bulkSongs.length === 0) return;
    setBulkLoading(true);
    setBulkResult(null);
    setBulkSongs(prev => prev.map(s => ({ ...s, status: 'loading' as const })));

    const options: MusicQueryOptions = {
      fontFamily,
      pageSize,
      transposeBy,
      colors,
      formats,
      removeTabs,
      simplified,
      darkMode,
    };

    const queries = bulkSongs.map(s => s.query);
    const res = await processBulkMusicQuery(queries, options);

    if (res.success) {
      setBulkResult(res);
      setBulkSongs(prev => prev.map((s, i) => {
        const songResult = res.songs[i];
        if (songResult?.error) return { ...s, status: 'error' as const, error: songResult.error };
        return { ...s, status: 'done' as const };
      }));
    } else {
      setBulkSongs(prev => prev.map(s => ({ ...s, status: 'error' as const, error: res.error })));
    }

    setBulkLoading(false);
  };

  const toggleFormat = (f: string) => {
    setFormats(prev => {
      if (prev.includes(f)) {
        if (prev.length === 1) return prev;
        return prev.filter(x => x !== f);
      }
      return [...prev, f];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);
    setDetectedKey(null);

    const options: MusicQueryOptions = {
      fontFamily,
      pageSize,
      transposeBy,
      colors,
      formats,
      removeTabs,
      simplified,
      darkMode,
      targetKey: targetKey || undefined,
      targetIsMinor: targetKey ? detectedKey?.isMinor : undefined
    };

    const res = await processMusicQuery(query, options);

    if (res.success && 'data' in res) {
      const entry: HistoryEntry = {
        id: Date.now(),
        query: query.trim(),
        filename: res.filename || 'cifra',
        data: res.data || null,
        pdfData: res.pdfData || null,
        previewText: res.previewText || '',
        options,
        detectedLabel: res.detectedLabel
      };
      setResult({ ...entry, detectedLabel: res.detectedLabel, confidence: res.confidence });
      setHistory(prev => [entry, ...prev]);
    } else if (!res.success) {
      setError(res.error || 'Não foi possível encontrar a cifra.');
    }

    setLoading(false);
  };

  const downloadFile = (base64Data: string, filename: string, extension: string, mimeType: string) => {
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadDocx = () => {
    if (result?.data) downloadFile(result.data, result.filename, 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  };

  const handleDownloadPdf = () => {
    if (result?.pdfData) downloadFile(result.pdfData, result.filename, 'pdf', 'application/pdf');
  };

  const handleHistoryPreview = (entry: HistoryEntry) => {
    setResult(entry);
    setShowPreview(true);
  };

  const handleHistoryDownloadDocx = (entry: HistoryEntry) => {
    if (entry.data) downloadFile(entry.data, entry.filename, 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  };

  const handleHistoryDownloadPdf = (entry: HistoryEntry) => {
    if (entry.pdfData) downloadFile(entry.pdfData, entry.filename, 'pdf', 'application/pdf');
  };

  const majorKeys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const minorKeys = ['Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

  const handleDetectKey = async () => {
    if (!query.trim()) return;
    setDetecting(true);
    setError('');
    setDetectedKey(null);
    setTargetKey('');
    const normalizeNote = (note: string) => {
      const map: Record<string, string> = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#' };
      return map[note] || note;
    };
    try {
      const res = await processMusicQuery(query, { detectOnly: true });
      if (res.success && 'detectedKey' in res) {
        const root = normalizeNote(res.detectedKey);
        const info = {
          root,
          isMinor: res.detectedIsMinor,
          label: root + (res.detectedIsMinor ? 'm' : ''),
          confidence: res.confidence,
          degrees: res.degrees,
          candidates: res.candidates,
          originalCapo: res.originalCapo || 0,
          shapeKey: normalizeNote(res.shapeKey || ''),
          shapeIsMinor: res.shapeIsMinor,
          shapeLabel: res.shapeLabel?.replace(/^[A-G][#b]?/, (m: string) => normalizeNote(m)),
        };
        setDetectedKey(info);
        setTargetKey(root);
      } else if (!res.success) {
        setError(res.error || 'Não foi possível detectar o tom.');
      }
    } catch {
      setError('Erro ao detectar tom.');
    }
    setDetecting(false);
  };

  const handleTargetKeySelect = (key: string) => {
    setTargetKey(key);
    if (detectedKey) {
      const notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
      const keyIndex = (n: string) => {
        let idx = notes.indexOf(n as typeof notes[number]);
        if (idx === -1) idx = notes.indexOf(n.replace('m', '') as typeof notes[number]);
        return idx;
      };
      const noteIdx = keyIndex(key);
      const detectedIdx = keyIndex(detectedKey.root);
      if (noteIdx !== -1 && detectedIdx !== -1) {
        setTransposeBy((noteIdx - detectedIdx + 12) % 12);
      }
    }
  };

  const clearTargetKey = () => {
    setTargetKey('');
    setTransposeBy(0);
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white font-sans">
      <div className="max-w-xl mx-auto px-5 py-16 md:py-24">

        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight mb-1">Cifrador</h1>
          <p className="text-white/40 text-sm">Busque cifras no CifraClub e exporte em DOCX ou PDF.</p>
        </div>

        <div className="flex gap-1 p-0.5 bg-white/5 rounded-lg mb-8">
          <button
            type="button"
            onClick={() => { setBulkMode(false); setBulkResult(null); setBulkSongs([]); setBulkInput(''); }}
            className={`flex-1 py-2 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${!bulkMode ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}
          >
            <Search className="w-3 h-3" /> Individual
          </button>
          <button
            type="button"
            onClick={() => { setBulkMode(true); setResult(null); }}
            className={`flex-1 py-2 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${bulkMode ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}
          >
            <List className="w-3 h-3" /> Massa
          </button>
        </div>

        {!bulkMode ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Link className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nome da música ou link do YouTube"
              className="w-full bg-white/5 border border-white/10 text-white rounded-lg pl-10 pr-3 py-3 text-sm focus:outline-none focus:border-white/30 transition-colors placeholder:text-white/25"
              disabled={loading}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDetectKey}
              disabled={detecting || !query.trim()}
              className="flex-1 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white/60 hover:text-white hover:border-white/20 flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {detecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Music className="w-3.5 h-3.5" />}
              {detecting ? 'Analisando...' : 'Detectar Tom'}
            </button>
          </div>

          <AnimatePresence>
            {detectedKey && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="border border-white/10 rounded-lg p-4 space-y-4">
                  <div className="flex items-baseline gap-3">
                    <span className="text-2xl font-bold">{detectedKey.label}</span>
                    <span className="text-xs text-white/30">
                      {detectedKey.isMinor ? 'menor' : 'maior'} &middot; {Math.round(detectedKey.confidence * 100)}%
                    </span>
                  </div>

                  {(detectedKey?.originalCapo ?? 0) > 0 && (
                    <p className="text-xs text-white/40 leading-relaxed">
                      Capo na {detectedKey.originalCapo}a casa &middot; forma de {detectedKey.shapeLabel} &middot; tom real {detectedKey.label}
                    </p>
                  )}

                  {detectedKey.degrees && (
                    <div className="flex flex-wrap gap-1">
                      {detectedKey.degrees.map((d, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40 font-mono">
                          {d}
                        </span>
                      ))}
                    </div>
                  )}

                  <div>
                    <p className="text-[10px] text-white/25 uppercase tracking-wider mb-2">Transpor para</p>
                    <div className="flex flex-wrap gap-1">
                      {majorKeys.map(k => {
                        const isSelected = targetKey === k && !detectedKey?.isMinor;
                        const isDetected = detectedKey?.root === k && !detectedKey?.isMinor;
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => handleTargetKeySelect(k)}
                            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${isSelected ? 'bg-white text-[#0a0a0a]' : isDetected ? 'bg-white/15 text-white' : 'bg-white/5 text-white/40 hover:text-white/70'}`}
                          >
                            {k}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {minorKeys.map(k => {
                        const root = k.replace('m', '');
                        const isSelected = targetKey === root && !!detectedKey?.isMinor;
                        const isDetected = detectedKey?.root === root && !!detectedKey?.isMinor;
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => handleTargetKeySelect(root)}
                            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${isSelected ? 'bg-white text-[#0a0a0a]' : isDetected ? 'bg-white/15 text-white' : 'bg-white/5 text-white/40 hover:text-white/70'}`}
                          >
                            {k}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setTargetKey(''); setTransposeBy(p => Math.max(-12, p - 1)); }}
                      className="w-8 h-8 rounded bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex-1 text-center text-xs font-mono text-white/40">
                      {targetKey && <span className="text-white/60">{targetKey}{detectedKey.isMinor ? 'm' : ''} &middot; </span>}
                      {transposeBy > 0 ? '+' : ''}{transposeBy} st
                    </div>
                    <button
                      type="button"
                      onClick={() => { setTargetKey(''); setTransposeBy(p => Math.min(12, p + 1)); }}
                      className="w-8 h-8 rounded bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    {targetKey && (
                      <button type="button" onClick={clearTargetKey} className="text-[10px] text-white/25 hover:text-white/50 transition-colors">
                        Limpar
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={!!loading || !query.trim()}
            className="w-full bg-white text-[#0a0a0a] rounded-lg py-3 text-sm font-medium flex items-center justify-center gap-2 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Gerando...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Gerar Cifra</span>
              </>
            )}
          </button>
        </form>
        ) : (
        <div className="space-y-3">
          <textarea
            value={bulkInput}
            onChange={(e) => setBulkInput(e.target.value)}
            placeholder="Uma música por linha&#10;Ex:&#10;Lugar Secreto&#10;Bendito é o Rei&#10;Não há outro"
            rows={5}
            className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-white/30 transition-colors placeholder:text-white/25 resize-none font-mono"
            disabled={bulkLoading}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={parseBulkInput}
              disabled={!bulkInput.trim() || bulkLoading}
              className="flex-1 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white/60 hover:text-white hover:border-white/20 flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar
            </button>
            <button
              type="button"
              onClick={handleBulkGenerate}
              disabled={bulkSongs.length === 0 || bulkLoading}
              className="flex-1 py-2.5 bg-white text-[#0a0a0a] rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
            >
              {bulkLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
              ) : (
                <><Download className="w-4 h-4" /> Gerar Cifras</>
              )}
            </button>
          </div>

          {bulkSongs.length > 0 && (
            <div className="border border-white/10 rounded-lg divide-y divide-white/5">
              {bulkSongs.map((song, idx) => (
                <div key={idx} className="flex items-center gap-2 px-3 py-2.5">
                  <span className="text-[10px] text-white/20 w-4 text-right shrink-0">{idx + 1}</span>
                  <span className="flex-1 text-xs truncate text-white/60">{song.query}</span>
                  {song.status === 'loading' && <Loader2 className="w-3 h-3 animate-spin text-white/30 shrink-0" />}
                  {song.status === 'done' && <Check className="w-3 h-3 text-white/40 shrink-0" />}
                  {song.status === 'error' && <span className="text-[10px] text-red-400/60 truncate max-w-[120px]">{song.error}</span>}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => moveBulkSong(idx, -1)} disabled={idx === 0 || bulkLoading} className="p-1 text-white/20 hover:text-white/50 disabled:opacity-20"><ArrowUp className="w-3 h-3" /></button>
                    <button onClick={() => moveBulkSong(idx, 1)} disabled={idx === bulkSongs.length - 1 || bulkLoading} className="p-1 text-white/20 hover:text-white/50 disabled:opacity-20"><ArrowDown className="w-3 h-3" /></button>
                    <button onClick={() => removeBulkSong(idx)} disabled={bulkLoading} className="p-1 text-white/20 hover:text-red-400/60 disabled:opacity-20"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        <button
          type="button"
          onClick={() => setShowOptions(!showOptions)}
          className="mt-4 w-full flex items-center justify-between py-2.5 px-1 text-xs text-white/30 hover:text-white/50 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Settings className="w-3 h-3" /> Opções
          </span>
          <motion.span animate={{ rotate: showOptions ? 180 : 0 }}>
            <Plus className="w-3 h-3" />
          </motion.span>
        </button>

        <AnimatePresence>
          {showOptions && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="border-t border-white/5 pt-4 pb-2 space-y-5">

                <div className="space-y-2">
                  <label className="text-[10px] text-white/25 uppercase tracking-wider">Formatos</label>
                  <div className="flex gap-2">
                    {['docx', 'pdf'].map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => toggleFormat(f)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${formats.includes(f) ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/5 text-white/30'}`}
                      >
                        {formats.includes(f) && <Check className="w-3 h-3" />}
                        {f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-white/25 uppercase tracking-wider">Tema do documento</label>
                  <button
                    type="button"
                    onClick={() => setDarkMode(!darkMode)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-white/5 bg-white/5 text-xs transition-colors hover:border-white/10"
                  >
                    <span className="flex items-center gap-2 text-white/50">
                      {darkMode ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                      {darkMode ? 'Escuro' : 'Claro'}
                    </span>
                    <Toggle enabled={darkMode} onClick={() => setDarkMode(!darkMode)} />
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-white/25 uppercase tracking-wider">Formato da página</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPageSize('DESKTOP')}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs transition-colors ${pageSize === 'DESKTOP' ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/5 text-white/30 hover:border-white/10'}`}
                    >
                      <Monitor className="w-3.5 h-3.5" /> A4
                    </button>
                    <button
                      type="button"
                      onClick={() => setPageSize('MOBILE')}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs transition-colors ${pageSize === 'MOBILE' ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/5 text-white/30 hover:border-white/10'}`}
                    >
                      <Smartphone className="w-3.5 h-3.5" /> Mobile
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-white/25 uppercase tracking-wider">Cores</label>
                  <div className="grid grid-cols-6 gap-2">
                    {([
                      [colors.title, 'Títulos', 'title'],
                      [colors.chords, 'Acordes', 'chords'],
                      [colors.lyrics, 'Letras', 'lyrics'],
                      [colors.chorus, 'Refrão', 'chorus'],
                      [colors.preChorus, 'Pré', 'preChorus'],
                      [colors.bridge, 'Ponte', 'bridge'],
                    ] as const).map(([val, label, key]) => (
                      <div key={key} className="flex flex-col items-center gap-1.5">
                        <input
                          type="color"
                          title={label}
                          value={val}
                          onChange={(e) => setColors({ ...colors, [key]: e.target.value })}
                          className="w-full h-7 rounded cursor-pointer bg-transparent border-0 outline-none p-0"
                        />
                        <span className="text-[9px] text-white/25">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-white/25 uppercase tracking-wider">Fonte</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {['Courier New', 'Consolas', 'Fira Code', 'Monaco'].map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFontFamily(f)}
                        className={`px-2 py-2 rounded-lg border text-[11px] transition-colors ${fontFamily === f ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/5 text-white/30 hover:border-white/10'}`}
                      >
                        {f.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRemoveTabs(!removeTabs)}
                    className={`flex-1 flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs transition-colors ${removeTabs ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/5 text-white/30 hover:border-white/10'}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Scissors className="w-3 h-3" /> Tabs
                    </span>
                    <Toggle enabled={removeTabs} onClick={() => setRemoveTabs(!removeTabs)} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimplified(!simplified)}
                    className={`flex-1 flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs transition-colors ${simplified ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/5 text-white/30 hover:border-white/10'}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Music className="w-3 h-3" /> Simplificar
                    </span>
                    <Toggle enabled={simplified} onClick={() => setSimplified(!simplified)} />
                  </button>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-6 px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-xs text-white/50 flex items-center gap-2"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-white/30" />
              {error}
            </motion.div>
          )}

          {result && !loading && (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-8 border-t border-white/5 pt-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-white/60" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{result.filename}</p>
                  {result.detectedLabel && (
                    <p className="text-[11px] text-white/30">
                      Tom: {result.detectedLabel} &middot; {Math.round((result.confidence ?? 0) * 100)}%
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowPreview(true)}
                  className="flex-1 py-2.5 rounded-lg border border-white/10 bg-white/5 text-xs font-medium text-white/60 hover:text-white hover:border-white/20 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" /> Ver
                </button>
                {result.data && (
                  <button
                    onClick={handleDownloadDocx}
                    className="flex-1 py-2.5 rounded-lg bg-white text-[#0a0a0a] text-xs font-medium flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                  >
                    <Download className="w-3.5 h-3.5" /> DOCX
                  </button>
                )}
                {result.pdfData && (
                  <button
                    onClick={handleDownloadPdf}
                    className="flex-1 py-2.5 rounded-lg bg-white text-[#0a0a0a] text-xs font-medium flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                  >
                    <Download className="w-3.5 h-3.5" /> PDF
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {bulkMode && bulkResult && bulkResult.success && (
          <div className="mt-8 border-t border-white/5 pt-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <FileText className="w-4 h-4 text-white/60" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{bulkResult.songs.filter(s => !s.error).length} cifras geradas</p>
                <p className="text-[11px] text-white/30">
                  {bulkResult.songs.filter(s => s.error).length > 0 && `${bulkResult.songs.filter(s => s.error).length} falharam`}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              {bulkResult.data && (
                <button
                  onClick={() => downloadFile(bulkResult.data!, 'cifras-massa', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')}
                  className="flex-1 py-2.5 rounded-lg bg-white text-[#0a0a0a] text-xs font-medium flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                >
                  <Download className="w-3.5 h-3.5" /> DOCX
                </button>
              )}
              {bulkResult.pdfData && (
                <button
                  onClick={() => downloadFile(bulkResult.pdfData!, 'cifras-massa', 'pdf', 'application/pdf')}
                  className="flex-1 py-2.5 rounded-lg bg-white text-[#0a0a0a] text-xs font-medium flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                >
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
              )}
            </div>

            <div className="border border-white/10 rounded-lg divide-y divide-white/5 max-h-48 overflow-auto">
              {bulkResult.songs.map((song, idx) => (
                <div key={idx} className="flex items-center gap-2 px-3 py-2">
                  <span className="text-[10px] text-white/20 w-4 text-right shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate text-white/60">{song.filename}</p>
                    {song.detectedLabel && <p className="text-[10px] text-white/25">Tom: {song.detectedLabel}</p>}
                  </div>
                  {song.error && <span className="text-[10px] text-red-400/60">Erro</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-12 border-t border-white/5 pt-6">
            <h2 className="text-[10px] text-white/25 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Histórico
            </h2>
            <div className="space-y-1.5">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 py-2 px-2.5 rounded-lg hover:bg-white/5 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{entry.filename}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {entry.detectedLabel && (
                        <span className="text-[10px] text-white/25">{entry.detectedLabel}</span>
                      )}
                      {(entry.options.transposeBy ?? 0) !== 0 && (
                        <span className="text-[10px] text-white/25">
                          {(entry.options.transposeBy ?? 0) > 0 ? '+' : ''}{entry.options.transposeBy}
                        </span>
                      )}
                      {entry.options.darkMode && <Moon className="w-2.5 h-2.5 text-white/15" />}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {entry.previewText && (
                      <button onClick={() => handleHistoryPreview(entry)} className="p-1.5 rounded text-white/30 hover:text-white transition-colors" title="Visualizar">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {entry.data && (
                      <button onClick={() => handleHistoryDownloadDocx(entry)} className="p-1.5 rounded text-white/30 hover:text-white transition-colors" title="DOCX">
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {entry.pdfData && (
                      <button onClick={() => handleHistoryDownloadPdf(entry)} className="p-1.5 rounded text-white/30 hover:text-white transition-colors" title="PDF">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-white/10 text-[11px] mt-16 pb-8">
          mayck_eduardo
        </p>
      </div>

      <AnimatePresence>
        {showPreview && result?.previewText && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#0a0a0a]/95 flex items-center justify-center p-5"
            onClick={() => setShowPreview(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="w-full max-w-2xl max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-white/50">Pré-visualização</h3>
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-auto bg-white/5 border border-white/5 rounded-lg p-4">
                <RichPreview text={result.previewText} colors={colors} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
