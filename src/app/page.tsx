'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Link, Music, Download, FileText, Loader2, Settings, Plus, Minus, Smartphone, Monitor, Check } from 'lucide-react';
import { processMusicQuery, MusicQueryOptions } from '@/lib/actions';

export default function Home() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ filename: string, data: string | null, pdfData: string | null } | null>(null);

  // Options
  const [showOptions, setShowOptions] = useState(false);
  const [fontFamily, setFontFamily] = useState('Courier New');
  const [pageSize, setPageSize] = useState<'DESKTOP' | 'MOBILE'>('DESKTOP');
  const [transposeBy, setTransposeBy] = useState(0);
  const [formats, setFormats] = useState<string[]>(['docx', 'pdf']);

  const [colors, setColors] = useState({
    title: '#2B6CB0',
    chords: '#000000',
    lyrics: '#000000',
    chorus: '#E53E3E',
    preChorus: '#D69E2E',
    bridge: '#805AD5'
  });

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

    const options: MusicQueryOptions = {
      fontFamily,
      pageSize,
      transposeBy,
      colors,
      formats
    };

    const res = await processMusicQuery(query, options);

    if (res.success && (res.data || res.pdfData)) {
      setResult({
        filename: res.filename || 'cifra',
        data: res.data || null,
        pdfData: res.pdfData || null
      });
    } else {
      setError(res.error || 'Não foi possível encontrar a cifra.');
    }

    setLoading(false);
  };

  const downloadFile = (base64Data: string, extension: string, mimeType: string) => {
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
    a.download = `${result?.filename}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadDocx = () => {
    if (result?.data) downloadFile(result.data, 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  };

  const handleDownloadPdf = () => {
    if (result?.pdfData) downloadFile(result.pdfData, 'pdf', 'application/pdf');
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
                        <label className="text-sm text-slate-400 font-medium tracking-wide flex items-center justify-between">
                          Transpor Tom (Semitons)
                          <span className="bg-white/10 px-2 py-0.5 rounded text-xs font-mono">{transposeBy > 0 ? `+${transposeBy}` : transposeBy}</span>
                        </label>
                        <div className="flex items-center bg-black/40 border border-white/10 rounded-xl overflow-hidden shadow-inner w-full max-w-sm mx-auto">
                          <button type="button" onClick={() => setTransposeBy(p => Math.max(-12, p - 1))} className="px-6 py-3 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"><Minus className="w-5 h-5" /></button>
                          <div className="flex-1 flex justify-center px-4">
                            <div className="w-full relative h-1 bg-white/10 rounded-full overflow-hidden">
                              <div className="absolute top-0 bottom-0 bg-indigo-500 rounded-full transition-all" style={{ left: '50%', width: `${Math.abs(transposeBy) / 12 * 50}%`, transform: transposeBy < 0 ? 'translateX(-100%)' : 'none', transformOrigin: 'left' }} />
                              <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white/30 -translate-x-1/2"></div>
                            </div>
                          </div>
                          <button type="button" onClick={() => setTransposeBy(p => Math.min(12, p + 1))} className="px-6 py-3 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"><Plus className="w-5 h-5" /></button>
                        </div>
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
              disabled={loading || !query.trim()}
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
                  </div>

                  <div className="flex flex-col md:flex-row gap-3 mt-2 w-full max-w-md">
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

        <p className="text-center text-slate-600 text-sm mt-8 pb-8 font-medium">
          por: mayck_eduardo • ferramenta de personalização de cifras
        </p>
      </motion.div>
    </main>
  );
}
