'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Link, Music, Download, FileText, Loader2, Settings, Plus, Minus, Smartphone, Monitor, Check, Scissors, AlertCircle, Info, Moon, Sun, Eye, X, Clock } from 'lucide-react';
import { processMusicQuery, MusicQueryOptions } from '@/lib/actions';

export default function Home() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ filename: string, data: string | null, pdfData: string | null, previewText: string, detectedLabel?: string, confidence?: number } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectedKey, setDetectedKey] = useState<{ root: string; isMinor: boolean; label: string; confidence: number; degrees?: string[]; candidates?: { root: string; isMinor: boolean; score: number }[]; originalCapo?: number; shapeKey?: string; shapeIsMinor?: boolean; shapeLabel?: string } | null>(null);
  const [targetKey, setTargetKey] = useState('');

  // Options
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
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const toggleFormat = (f: string) => {
    setFormats(prev => {
      if (prev.includes(f)) {
        if (prev.length === 1) return prev; // keep at least one
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

    if (res.success && (res.data || res.pdfData)) {
      const entry: HistoryEntry = {
        id: Date.now(),
        query: query.trim(),
        filename: res.filename || 'cifra',
        data: res.data || null,
        pdfData: res.pdfData || null,
        previewText: (res as any).previewText || '',
        options,
        detectedLabel: (res as any).detectedLabel
      };
      setResult({ ...entry, detectedLabel: (res as any).detectedLabel, confidence: (res as any).confidence });
      setHistory(prev => [entry, ...prev]);
    } else {
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

  const handleHistoryLoad = (entry: HistoryEntry) => {
    setResult(entry);
  };

  const majorKeys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const minorKeys = ['Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

  const handleDetectKey = async () => {
    if (!query.trim()) return;
    setDetecting(true);
    setError('');
    setDetectedKey(null);
    setTargetKey('');
    try {
      const res = await processMusicQuery(query, { detectOnly: true } as any);
      if (res.success && (res as any).detectedKey) {
        const info = {
          root: (res as any).detectedKey,
          isMinor: (res as any).detectedIsMinor,
          label: (res as any).detectedLabel,
          confidence: (res as any).confidence,
          degrees: (res as any).degrees,
          candidates: (res as any).candidates,
          originalCapo: (res as any).originalCapo || 0,
          shapeKey: (res as any).shapeKey,
          shapeIsMinor: (res as any).shapeIsMinor,
          shapeLabel: (res as any).shapeLabel,
        };
        setDetectedKey(info);
        setTargetKey(info.root);
      } else {
        setError((res as any).error || 'Não foi possível detectar o tom.');
      }
    } catch {
      setError('Erro ao detectar tom.');
    }
    setDetecting(false);
  };

  const handleTargetKeySelect = (key: string, isMinor: boolean) => {
    setTargetKey(key);
    // Calculate semitones from detected key
    if (detectedKey) {
      const noteIdx = (note => {
        const notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
        const idx = notes.indexOf(note);
        return idx >= 12 ? idx - 12 : idx;
      })(key);
      const detectedIdx = (note => {
        const notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
        const idx = notes.indexOf(detectedKey.root);
        return idx >= 12 ? idx - 12 : idx;
      })(detectedKey.root);
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
    <main className="min-h-screen bg-black text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-indigo-500/30 font-sans relative overflow-x-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-fuchsia-600/20 blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-2xl z-10"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.2 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-fuchsia-500 shadow-xl shadow-fuchsia-500/20 mb-6"
          >
            <Music className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="font-[family-name:var(--font-outfit)] text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-white to-fuchsia-300">
            Cifrador v1.0.0
          </h1>
          <p className="text-slate-400 text-lg md:text-xl font-light">
            Cole o link do YouTube ou o nome da música e receba a cifra estruturada.
          </p>
        </div>

        <motion.div
          className="bg-zinc-900 border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-2xl relative"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Link className="w-6 h-6 text-slate-400 group-focus-within:text-fuchsia-400 transition-colors" />
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex: Nome da música - Nome do artista"
                className="w-full bg-black/40 border border-white/10 text-white rounded-2xl pl-12 pr-4 py-4 md:py-5 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 focus:border-fuchsia-500/50 transition-all font-medium placeholder:text-slate-500 shadow-inner"
                disabled={loading}
              />
            </div>

            {/* Detectar Tom */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDetectKey}
                disabled={detecting || !query.trim()}
                className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-slate-200 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {detecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Music className="w-5 h-5" />}
                {detecting ? 'Analisando harmonia...' : 'Detectar Tom'}
              </button>
            </div>

            {/* Resultado da detecção de tom */}
            <AnimatePresence>
              {detectedKey && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-zinc-800/60 border border-white/10 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                          <Music className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                          <p className="text-sm text-slate-400">Tom detectado</p>
                          <p className="text-xl font-bold text-white">
                            {detectedKey.originalCapo != null && detectedKey.originalCapo > 0 && detectedKey.shapeLabel ? (
                              <>
                                {detectedKey.label}
                                <span className="text-xs text-slate-500 ml-2 font-normal">
                                  Real &middot; {detectedKey.isMinor ? 'Menor' : 'Maior'} &middot; {Math.round(detectedKey.confidence * 100)}% confiança
                                </span>
                                <br />
                                <span className="text-sm text-slate-500 font-normal">
                                  Forma: {detectedKey.shapeLabel}
                                </span>
                              </>
                            ) : (
                              <>
                                {detectedKey.label}
                                <span className="text-xs text-slate-500 ml-2 font-normal">
                                  {detectedKey.isMinor ? 'Menor' : 'Maior'} &middot; {Math.round(detectedKey.confidence * 100)}% confiança
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                    {detectedKey.degrees && (
                      <div className="mb-3">
                        <label className="text-[10px] text-slate-600 font-medium mb-1.5 block tracking-wide">GRAUS DA ESCALA</label>
                        <div className="flex flex-wrap gap-1">
                          {detectedKey.degrees.map((d, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/40 text-slate-400 border border-white/5 font-mono">
                              {d}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {(detectedKey?.originalCapo ?? 0) > 0 && (
                      <div className="mb-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <span className="text-amber-400 text-xs">↕</span>
                        <p className="text-xs text-amber-300/90 leading-relaxed">
                          Cifra original com <strong className="text-amber-200">capotraste na {detectedKey.originalCapo}ª casa</strong>.
                          Acordes escritos na <strong className="text-amber-200">forma de {detectedKey.shapeLabel}</strong> com som real em <strong className="text-amber-200">{detectedKey.label}</strong>.
                          A cifra foi ajustada automaticamente para o tom real.
                        </p>
                      </div>
                    )}
                    <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl px-3 py-2 mb-3 flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-indigo-300/80 leading-relaxed">
                        Clique em um <strong className="text-indigo-200">tom na grade abaixo</strong> para transpor automaticamente.
                        Use os botões <strong className="text-indigo-200">+ / -</strong> para ajuste fino em semitons.
                        O tom detectado fica destacado como <strong className="text-indigo-200">selecionado</strong>.
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 font-medium mb-2 block">Transpor para:</label>
                      <div className="flex flex-wrap gap-1.5">
                        {majorKeys.map(k => {
                          const noteIdx = majorKeys.indexOf(k);
                          const relativeMinor = minorKeys[(noteIdx + 9) % 12];
                          const isSelected = targetKey === k && !detectedKey?.isMinor;
                          const isDetected = detectedKey?.root === k && !detectedKey?.isMinor;
                          const isRelative = targetKey === relativeMinor.replace('m', '') && detectedKey?.isMinor;
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => handleTargetKeySelect(k, false)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${isSelected ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 border-indigo-400' : isRelative ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : isDetected ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 ring-1 ring-indigo-500/30' : 'bg-zinc-700/60 text-slate-300 hover:bg-zinc-700 border-white/5'}`}
                            >
                              {k}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {minorKeys.map(k => {
                          const root = k.replace('m', '');
                          const noteIdx = minorKeys.indexOf(k);
                          const relativeMajor = majorKeys[(noteIdx + 3) % 12];
                          const isSelected = targetKey === root && !!detectedKey?.isMinor;
                          const isDetected = detectedKey?.root === root && !!detectedKey?.isMinor;
                          const isRelative = targetKey === relativeMajor && !detectedKey?.isMinor;
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => handleTargetKeySelect(root, true)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${isSelected ? 'bg-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/30 border-fuchsia-400' : isRelative ? 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30' : isDetected ? 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20 ring-1 ring-fuchsia-500/30' : 'bg-zinc-700/60 text-slate-400 hover:bg-zinc-700 border-white/5'}`}
                            >
                              {k}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs text-slate-500 font-medium">
                          {targetKey
                            ? `Transposição: ${transposeBy > 0 ? '+' : ''}${transposeBy} semitons → ${targetKey}${detectedKey.isMinor ? 'm' : ''}`
                            : `${transposeBy > 0 ? '+' : ''}${transposeBy} semitons`}
                        </label>
                        <div className="flex items-center gap-1">
                          {targetKey && (
                            <button
                              type="button"
                              onClick={clearTargetKey}
                              className="text-[10px] text-slate-500 hover:text-red-400 transition-colors px-1.5 py-0.5 rounded bg-zinc-700/40 border border-white/5"
                            >
                              Limpar
                            </button>
                          )}
                          <span className="text-[11px] bg-zinc-700/60 px-1.5 py-0.5 rounded font-mono text-slate-400">
                            {transposeBy > 0 ? `+${transposeBy}` : transposeBy}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center bg-black/40 border border-white/10 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            setTargetKey('');
                            setTransposeBy(p => Math.max(-12, p - 1));
                          }}
                          className="px-4 py-2.5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <div className="flex-1 flex justify-center px-4">
                          <div className="w-full relative h-1 bg-white/10 rounded-full overflow-hidden">
                            <div className="absolute top-0 bottom-0 bg-indigo-500 rounded-full transition-all" style={{ left: '50%', width: `${Math.abs(transposeBy) / 12 * 50}%`, transform: transposeBy < 0 ? 'translateX(-100%)' : 'none', transformOrigin: 'left' }} />
                            <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white/30 -translate-x-1/2" />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setTargetKey('');
                            setTransposeBy(p => Math.min(12, p + 1));
                          }}
                          className="px-4 py-2.5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Configurações */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => setShowOptions(!showOptions)}
                className="w-full flex items-center justify-between p-4 text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
              >
                <span className="flex items-center gap-2 font-medium">
                  <Settings className="w-5 h-5" /> Opções de Formatação, Exportação e Cores
                </span>
                <motion.div animate={{ rotate: showOptions ? 180 : 0 }}>
                  <Plus className="w-5 h-5" />
                </motion.div>
              </button>
              <AnimatePresence>
                {showOptions && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-4 pb-5 border-t border-white/10"
                  >
                    <div className="grid grid-cols-1 gap-6 mt-5 md:grid-cols-2">
                      {/* Formatos */}
                      <div className="flex flex-col gap-3 md:col-span-2">
                        <label className="text-sm text-slate-400 font-medium tracking-wide">Formatos de Exportação</label>
                        <div className="flex gap-4">
                          <label className="flex items-start gap-3 p-3 flex-1 bg-black/40 border border-white/10 rounded-xl cursor-pointer hover:bg-white/5 transition-colors group">
                            <div className={`mt-0.5 w-5 h-5 rounded border ${formats.includes('docx') ? 'bg-indigo-500 border-indigo-400' : 'border-white/20'} flex items-center justify-center`}>
                              {formats.includes('docx') && <Check className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-white">Documento DOCX</span>
                              <span className="text-xs text-slate-500">Editável via Word</span>
                            </div>
                            <input type="checkbox" className="hidden" checked={formats.includes('docx')} onChange={() => toggleFormat('docx')} />
                          </label>
                          <label className="flex items-start gap-3 p-3 flex-1 bg-black/40 border border-white/10 rounded-xl cursor-pointer hover:bg-white/5 transition-colors group">
                            <div className={`mt-0.5 w-5 h-5 rounded border ${formats.includes('pdf') ? 'bg-indigo-500 border-indigo-400' : 'border-white/20'} flex items-center justify-center`}>
                              {formats.includes('pdf') && <Check className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-white">Arquivo PDF</span>
                              <span className="text-xs text-slate-500">Pronto p/ Leitura</span>
                            </div>
                            <input type="checkbox" className="hidden" checked={formats.includes('pdf')} onChange={() => toggleFormat('pdf')} />
                          </label>
                        </div>
                      </div>

                      {/* Tema Escuro */}
                      <div className="flex flex-col gap-3 md:col-span-2">
                        <label className="text-sm text-slate-400 font-medium tracking-wide flex items-center gap-2">
                          Tema <Moon className="w-3 h-3 opacity-50" />
                        </label>
                        <button
                          type="button"
                          onClick={() => setDarkMode(!darkMode)}
                          className={`group flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${darkMode ? 'bg-indigo-500/10 border-indigo-500/40 text-white shadow-[0_0_15px_rgba(99,102,241,0.1)]' : 'bg-black/40 border-white/5 text-slate-400 hover:border-white/20 hover:bg-white/5'}`}
                        >
                          <div className="flex items-center gap-3">
                            {darkMode ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-amber-400" />}
                            <div className="flex flex-col items-start">
                              <span className="text-sm font-bold">{darkMode ? 'Modo Escuro' : 'Modo Claro'}</span>
                              <span className="text-[11px] opacity-60">Fundo preto com texto claro nos documentos.</span>
                            </div>
                          </div>
                          <div className={`w-10 h-5 rounded-full relative transition-all duration-500 ${darkMode ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-white/10'}`}>
                            <motion.div
                              animate={{ x: darkMode ? 22 : 2 }}
                              className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm"
                            />
                          </div>
                        </button>
                      </div>

                      {/* Layout Format Section */}
                      <div className="flex flex-col gap-3 md:col-span-2">
                        <label className="text-sm text-slate-400 font-medium tracking-wide">Tamanho e Margens da Página</label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setPageSize('DESKTOP')}
                            className={`flex flex-col items-center justify-center py-4 px-3 rounded-xl border transition-all ${pageSize === 'DESKTOP' ? 'bg-indigo-500/20 border-indigo-500/50 text-white shadow-lg' : 'bg-black/40 border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/30'}`}
                          >
                            <Monitor className="w-6 h-6 mb-2" />
                            <span className="text-sm font-semibold">Folha A4 (Desktop)</span>
                            <span className="text-xs opacity-70 mt-1">Largura 210mm</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPageSize('MOBILE')}
                            className={`flex flex-col items-center justify-center py-4 px-3 rounded-xl border transition-all ${pageSize === 'MOBILE' ? 'bg-fuchsia-500/20 border-fuchsia-500/50 text-white shadow-lg' : 'bg-black/40 border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/30'}`}
                          >
                            <Smartphone className="w-6 h-6 mb-2" />
                            <span className="text-sm font-semibold">Mobile (10x30cm)</span>
                            <span className="text-xs opacity-70 mt-1">Estreito</span>
                          </button>
                        </div>
                      </div>

                      {/* Cores Section */}
                      <div className="flex flex-col gap-3 md:col-span-2">
                        <label className="text-sm text-slate-400 font-medium tracking-wide">Personalização de Cores</label>
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                          <div className="flex flex-col items-center gap-2 p-3 bg-black/40 border border-white/10 rounded-xl">
                            <label className="text-[10px] text-slate-300">Títulos</label>
                            <input type="color" title="Cor dos títulos" value={colors.title} onChange={(e) => setColors({ ...colors, title: e.target.value })} className="w-full h-8 cursor-pointer rounded bg-transparent border-0 outline-none p-0" />
                          </div>
                          <div className="flex flex-col items-center gap-2 p-3 bg-black/40 border border-white/10 rounded-xl">
                            <label className="text-[10px] text-slate-300">Acordes</label>
                            <input type="color" title="Cor dos acordes" value={colors.chords} onChange={(e) => setColors({ ...colors, chords: e.target.value })} className="w-full h-8 cursor-pointer rounded bg-transparent border-0 outline-none p-0" />
                          </div>
                          <div className="flex flex-col items-center gap-2 p-3 bg-black/40 border border-white/10 rounded-xl">
                            <label className="text-[10px] text-slate-300">Letras</label>
                            <input type="color" title="Cor das letras" value={colors.lyrics} onChange={(e) => setColors({ ...colors, lyrics: e.target.value })} className="w-full h-8 cursor-pointer rounded bg-transparent border-0 outline-none p-0" />
                          </div>
                          <div className="flex flex-col items-center gap-2 p-3 bg-black/40 border border-white/10 rounded-xl border-red-500/30">
                            <label className="text-[10px] text-red-300">Refrão</label>
                            <input type="color" title="Cor do refrão" value={colors.chorus} onChange={(e) => setColors({ ...colors, chorus: e.target.value })} className="w-full h-8 cursor-pointer rounded bg-transparent border-0 outline-none p-0" />
                          </div>
                          <div className="flex flex-col items-center gap-2 p-3 bg-black/40 border border-white/10 rounded-xl border-yellow-500/30">
                            <label className="text-[10px] text-yellow-300">Pré-Refrão</label>
                            <input type="color" title="Cor do pré-refrão" value={colors.preChorus} onChange={(e) => setColors({ ...colors, preChorus: e.target.value })} className="w-full h-8 cursor-pointer rounded bg-transparent border-0 outline-none p-0" />
                          </div>
                          <div className="flex flex-col items-center gap-2 p-3 bg-black/40 border border-white/10 rounded-xl border-purple-500/30">
                            <label className="text-[10px] text-purple-300">Ponte</label>
                            <input type="color" title="Cor da ponte" value={colors.bridge} onChange={(e) => setColors({ ...colors, bridge: e.target.value })} className="w-full h-8 cursor-pointer rounded bg-transparent border-0 outline-none p-0" />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 md:col-span-2">
                        <label className="text-sm text-slate-400 font-medium tracking-wide">Fonte do Documento</label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {['Courier New', 'Consolas', 'Fira Code', 'Monaco'].map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setFontFamily(f)}
                              className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${fontFamily === f ? 'bg-indigo-500/20 border-indigo-500/50 text-white shadow-lg' : 'bg-black/40 border-white/10 text-slate-400 hover:border-white/30'}`}
                            >
                              <span className="text-sm mb-1">{f}</span>
                              <span className="text-[11px] opacity-80 whitespace-nowrap overflow-hidden text-ellipsis max-w-full" style={{ fontFamily: f }}>Am&nbsp;Bm&nbsp;C</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 md:col-span-2">
                        <label className="text-sm text-slate-400 font-medium tracking-wide flex items-center gap-2">
                          <Minus className="w-3 h-3 opacity-50" /> Transposição unificada no painel de detecção acima <Plus className="w-3 h-3 opacity-50" />
                        </label>
                        <div className="p-3 rounded-xl bg-zinc-800/40 border border-white/5">
                          <p className="text-xs text-slate-500 leading-relaxed">
                            A transposição por <strong className="text-slate-400">semitons</strong> ou por <strong className="text-slate-400">tom alvo</strong> agora está integrada no painel <strong className="text-indigo-400">"Tom detectado"</strong> logo acima. Clique em uma tecla na grade ou use +/−.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 md:col-span-1">
                        <label className="text-sm text-slate-400 font-medium tracking-wide flex items-center gap-2">
                          Limpeza Especial <Scissors className="w-3 h-3 opacity-50" />
                        </label>
                        <button
                          type="button"
                          onClick={() => setRemoveTabs(!removeTabs)}
                          className={`group flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${removeTabs ? 'bg-indigo-500/10 border-indigo-500/40 text-white shadow-[0_0_15px_rgba(99,102,241,0.1)]' : 'bg-black/40 border-white/5 text-slate-400 hover:border-white/20 hover:bg-white/5'}`}
                        >
                          <div className="flex flex-col items-start gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold">Ocultar Tabs</span>
                              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 text-amber-500 text-[9px] font-black rounded border border-amber-500/20 uppercase tracking-tighter">
                                <AlertCircle className="w-2.5 h-2.5" /> Exp.
                              </span>
                            </div>
                            <span className="text-[11px] opacity-60 leading-tight text-left">Remove tablaturas via limpeza algorítmica.</span>
                          </div>
                          <div className={`w-10 h-5 rounded-full relative transition-all duration-500 ${removeTabs ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-white/10'}`}>
                            <motion.div 
                              animate={{ x: removeTabs ? 22 : 2 }}
                              className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm"
                            />
                          </div>
                        </button>
                      </div>

                      <div className="flex flex-col gap-3 md:col-span-1">
                        <label className="text-sm text-slate-400 font-medium tracking-wide flex items-center gap-2">
                          Variação <Music className="w-3 h-3 opacity-50" />
                        </label>
                        <button
                          type="button"
                          onClick={() => setSimplified(!simplified)}
                          className={`group flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${simplified ? 'bg-fuchsia-500/10 border-fuchsia-500/40 text-white shadow-[0_0_15px_rgba(217,70,239,0.1)]' : 'bg-black/40 border-white/5 text-slate-400 hover:border-white/20 hover:bg-white/5'}`}
                        >
                          <div className="flex flex-col items-start gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold">Versão Simplificada</span>
                            </div>
                            <span className="text-[11px] opacity-60 leading-tight text-left">Acordes básicos (ideal para iniciantes).</span>
                          </div>
                          <div className={`w-10 h-5 rounded-full relative transition-all duration-500 ${simplified ? 'bg-fuchsia-500 shadow-[0_0_10px_rgba(217,70,239,0.5)]' : 'bg-white/10'}`}>
                            <motion.div 
                              animate={{ x: simplified ? 22 : 2 }}
                              className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm"
                            />
                          </div>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={!!loading || !query.trim()}
              className="w-full bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white rounded-2xl py-4 flex items-center justify-center space-x-3 font-semibold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_30px_-10px_rgba(217,70,239,0.5)]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span>Construindo sua cifra...</span>
                </>
              ) : (
                <>
                  <Search className="w-6 h-6" />
                  <span>Gerar Cifra Personalizada</span>
                </>
              )}
            </motion.button>
          </form>

          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-center flex items-center justify-center gap-2"
              >
                <span className="font-medium">{error}</span>
              </motion.div>
            )}

            {result && !loading && (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="mt-8 pt-6 border-t border-white/10"
              >
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-400/20 to-emerald-600/10 flex items-center justify-center border border-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.15)] relative">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      className="absolute inset-0 bg-green-500/10 rounded-2xl"
                    />
                    <FileText className="w-10 h-10 text-green-400 relative z-10" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold tracking-tight text-white mb-2">Processo Concluído!</h3>
                    <p className="text-slate-400 text-sm md:text-base px-4 truncate max-w-[280px] md:max-w-md">
                      {result.filename}
                    </p>
                    {result.detectedLabel && (
                      <div className="flex items-center justify-center gap-2 mt-1">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          Tom: {result.detectedLabel}
                        </span>
                        {result.confidence !== undefined && (
                          <span className="text-xs text-slate-600">{Math.round(result.confidence * 100)}%</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col md:flex-row gap-3 mt-2 w-full max-w-md">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowPreview(true)}
                      className="flex-1 py-3 bg-zinc-700 hover:bg-zinc-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg"
                    >
                      <Eye className="w-5 h-5" />
                      Visualizar
                    </motion.button>
                    {result.data && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleDownloadDocx}
                        className="flex-1 py-3 bg-white hover:bg-slate-100 text-black rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg"
                      >
                        <Download className="w-5 h-5" />
                        Baixar DOCX
                      </motion.button>
                    )}
                    {result.pdfData && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleDownloadPdf}
                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg"
                      >
                        <Download className="w-5 h-5" />
                        Baixar PDF
                      </motion.button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {history.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8"
          >
            <h2 className="text-lg font-bold text-slate-300 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" /> Histórico da Sessão
            </h2>
            <div className="flex flex-col gap-3">
              {history.map((entry) => (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-zinc-900/80 border border-white/10 rounded-2xl p-4 hover:border-white/20 transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{entry.filename}</p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{entry.query}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {entry.detectedLabel && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            Tom: {entry.detectedLabel}
                          </span>
                        )}
                        {(entry.options.transposeBy ?? 0) !== 0 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            Tom: {(entry.options.transposeBy ?? 0) > 0 ? '+' : ''}{entry.options.transposeBy ?? 0}
                          </span>
                        )}
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${(entry.options.pageSize ?? 'DESKTOP') === 'MOBILE' ? 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`}>
                          {(entry.options.pageSize ?? 'DESKTOP') === 'MOBILE' ? 'Mobile' : 'Desktop'}
                        </span>
                        {entry.options.darkMode && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-600/40 text-zinc-300 border border-white/10">
                            <Moon className="w-3 h-3 inline-block mr-0.5" />Escuro
                          </span>
                        )}
                        {entry.options.simplified && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                            Simplificada
                          </span>
                        )}
                        {entry.options.removeTabs && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Sem Tabs
                          </span>
                        )}
                        {(entry.options.fontFamily ?? 'Courier New') !== 'Courier New' && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                            {entry.options.fontFamily}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {entry.previewText && (
                        <button
                          onClick={() => handleHistoryPreview(entry)}
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                          title="Visualizar"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      {entry.data && (
                        <button
                          onClick={() => handleHistoryDownloadDocx(entry)}
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                          title="Baixar DOCX"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      )}
                      {entry.pdfData && (
                        <button
                          onClick={() => handleHistoryDownloadPdf(entry)}
                          className="p-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 hover:text-white transition-all"
                          title="Baixar PDF"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        <p className="text-center text-slate-600 text-sm mt-8 pb-8 font-medium">
          por: mayck_eduardo • ferramenta de personalização de cifras
        </p>
      </motion.div>

      <AnimatePresence>
        {showPreview && result?.previewText && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowPreview(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-3xl max-h-[85vh] overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h3 className="font-bold text-lg text-white">Pré-visualização</h3>
                <button
                  onClick={() => setShowPreview(false)}
                  className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <pre className="p-4 overflow-auto text-sm font-mono leading-relaxed text-slate-200 max-h-[calc(85vh-80px)] whitespace-pre">
                {result.previewText}
              </pre>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
