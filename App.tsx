import React, { useState, useRef, useEffect, memo } from 'react';
import { 
  UploadCloud, Trash2, Eye, Loader2, CheckSquare, Square, 
  FileText, Copy, CheckCircle, AlertTriangle, 
  Menu, Check, X, ExternalLink
} from 'lucide-react';

// --- INTERFACES & TYPES ---
interface IdeaItem {
  id: string;
  title: string;
  sourceData: {
    id: number;
    originalKeywords: string;
  };
}

interface IdeaListProps {
  items: IdeaItem[];
  negativeContext: string;
  onDelete: (id: string) => void;
}

// --- HELPER FUNCTIONS ---
const extractSlugFromUrl = (str: string): string => {
  if (!str) return '';
  try {
    let clean = str.trim();
    if (clean.includes('http')) {
      const parts = clean.split('/');
      clean = parts.pop() || parts.pop() || '';
    }
    return clean.replace(/[-_]/g, ' ').replace(/\.[^/.]+$/, "").trim();
  } catch (e) {
    return str;
  }
};

const IDEA_FORBIDDEN_WORDS = "porn, sex, nude, naked, xxx, erotic, boobs, tits, pussy, fuck, dick, cock, penis, vagina, ass, orgasm, masturbate, bitch, whore, slut, milf, fetish, bdsm, rape, incest, anal, blowjob, cum, ejaculate, hentai, stripper, escort, hot girl, 18+, adult, bathroom, toilet, change clothes, undress, bhabhi, auntie, desi, upskirt, birth, pregnant, bloody, injury, gore";

// --- STYLES & CLASSES ---
const inputClass = "w-full text-sm px-2 py-1.5 border border-gray-300 rounded bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none focus:border-blue-500 transition-all disabled:bg-gray-100 disabled:text-gray-400 placeholder:text-gray-400 h-9";
const areaClass = "w-full text-sm p-2 border border-gray-300 rounded bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none focus:border-blue-500 transition-all disabled:bg-gray-100 disabled:text-gray-400 placeholder:text-gray-300 h-14";
const labelClass = "block text-sm font-medium text-gray-500 h-5 flex items-center whitespace-nowrap overflow-hidden";

// ==========================================
// LIST COMPONENT (BAGIAN KANAN)
// ==========================================
const IdeaListComponent = memo(({ items, negativeContext, onDelete }: IdeaListProps) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getCleanTitle = (text: string): string => {
    if (!text) return "";
    return text.includes('|||') ? text.split('|||')[0].trim() : text.trim();
  };

  const getVulgarWord = (text: string): string | null => {
    if (!text || !negativeContext) return null;
    const words = negativeContext.split(',').map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
    const lowerText = text.toLowerCase();
    for (const word of words) {
        if (lowerText.includes(word)) return word.toUpperCase();
    }
    return null;
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setActiveMenuId(null);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAll = () => {
    const allText = items.map(item => {
       const rowId = item.sourceData?.id || 0;
       const title = getCleanTitle(item.title || "");
       const vulgar = getVulgarWord(title);
       return `${rowId}. ${vulgar ? `[HIDDEN - ${vulgar} DETECTED]` : title}`;
    }).join('\n');
    navigator.clipboard.writeText(allText);
    setCopiedId('ALL');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleMenu = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setActiveMenuId(activeMenuId === id ? null : id);
  };

  const handleOpenLink = (url: string | undefined) => {
    if (!url) return;
    let finalUrl = url.trim();
    if (!finalUrl.startsWith('http')) {
      finalUrl = 'https://' + finalUrl;
    }
    window.open(finalUrl, '_blank');
    setActiveMenuId(null);
  };

  return (
    <div className="flex flex-col gap-0 bg-white rounded-lg shadow-sm border border-blue-200 overflow-hidden h-full">
      <div className="flex items-center justify-between p-3 bg-blue-50 border-b border-blue-100 shrink-0">
         <h3 className="text-sm font-bold text-blue-800 uppercase tracking-wide">
            Idea Output Results ({items.length})
         </h3>
         <div className="flex gap-2">
            <button 
              onClick={handleCopyAll}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 rounded text-xs font-bold text-blue-700 hover:bg-blue-100 transition-colors uppercase"
            >
              {copiedId === 'ALL' ? <CheckCircle size={14} /> : <Copy size={14} />}
              {copiedId === 'ALL' ? 'Copied All' : 'Copy All'}
            </button>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 bg-gray-50/30">
          <div className="flex flex-col divide-y divide-gray-100">
             {items.map((item) => {
                const rowId = item.sourceData?.id || 0;
                const title = getCleanTitle(item.title || "");
                const vulgarWord = getVulgarWord(title);
                const isMenuOpen = activeMenuId === item.id;
                const originalUrl = item.sourceData?.originalKeywords;

                return (
                   <div key={item.id} className={`flex items-center gap-3 px-3 transition-colors group relative h-16 shrink-0 ${vulgarWord ? 'bg-red-50 hover:bg-red-100/60' : 'hover:bg-white'}`}>
                      <div className={`shrink-0 w-8 h-8 flex items-center justify-center rounded text-xs font-bold ${vulgarWord ? 'bg-red-200 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                         {rowId}
                      </div>

                      <div className="flex-1 min-w-0">
                         {vulgarWord ? (
                            <div className="flex items-center gap-2 text-red-600 whitespace-nowrap overflow-hidden">
                               <AlertTriangle size={14} className="shrink-0" />
                               <span className="text-[10px] font-black uppercase tracking-widest bg-red-600 text-white px-2 py-0.5 rounded shadow-sm">
                                  {vulgarWord} / BLOCKED DETECTED
                               </span>
                            </div>
                         ) : (
                            <p className="text-sm text-gray-800 font-medium truncate select-all" title={title}>{title}</p>
                         )}
                      </div>

                      <div className="relative flex items-center justify-end shrink-0 w-9 h-9">
                        {isMenuOpen ? (
                            <div 
                                ref={menuRef}
                                className="absolute right-0 flex items-center gap-1.5 bg-white border border-gray-200 shadow-xl rounded-lg p-1.5 z-50 animate-in fade-in slide-in-from-right-2 duration-200 ring-1 ring-black/5"
                            >
                                {!vulgarWord && (
                                    <>
                                        {originalUrl && (
                                            <button 
                                                onClick={() => handleOpenLink(originalUrl)}
                                                className="p-2 rounded-md transition-colors bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600"
                                                title="Buka Link Asli"
                                            >
                                                <ExternalLink size={16} />
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => handleCopy(title, item.id)}
                                            className={`p-2 rounded-md transition-colors ${copiedId === item.id ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600'}`}
                                            title="Salin Teks"
                                        >
                                            {copiedId === item.id ? <Check size={16} /> : <Copy size={16} />}
                                        </button>
                                    </>
                                )}
                                <button 
                                    onClick={() => { onDelete(item.id); setActiveMenuId(null); }}
                                    className="p-2 rounded-md transition-colors bg-gray-100 text-red-500 hover:bg-red-100"
                                    title="Hapus"
                                >
                                    <Trash2 size={16} />
                                </button>
                                <div className="w-px h-6 bg-gray-200 mx-0.5" />
                                <button 
                                    onClick={() => setActiveMenuId(null)}
                                    className="p-2 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                                    title="Tutup"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={(e) => toggleMenu(e, item.id)}
                                className="p-1.5 rounded-lg border bg-white border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-200 transition-all group-hover:border-gray-300"
                            >
                                <Menu size={18} />
                            </button>
                        )}
                      </div>
                   </div>
                );
             })}
          </div>
      </div>
    </div>
  );
});

IdeaListComponent.displayName = 'IdeaListComponent';

// ==========================================
// MAIN APP COMPONENT
// ==========================================
export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Real-time Clock State
  const [currentTime, setCurrentTime] = useState(new Date());

  // Action States
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [actionState, setActionState] = useState<'idle'|'generate'|'clear'|'export'>('idle');
  const [dots, setDots] = useState('');

  // Local Storage Logic
  const [sourceLines, setSourceLines] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('IRS_DATA_SOURCELINES');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [generatedItems, setGeneratedItems] = useState<IdeaItem[]>(() => {
    try {
      const saved = localStorage.getItem('IRS_DATA_GENERATED');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Settings State
  const [startRow, setStartRow] = useState<number>(1);
  const [quantity, setQuantity] = useState<number>(50);
  const [workerCount, setWorkerCount] = useState<number>(50);
  const [negativeContext, setNegativeContext] = useState<string>(IDEA_FORBIDDEN_WORDS);
  const [outputFormat, setOutputFormat] = useState<'csv' | 'txt'>('csv');
  const [csvFilename, setCsvFilename] = useState<string>('');

  const defaultFilename = 'Data_Riset_IRS';

  // Clock Effect
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Save to LocalStorage Effect
  useEffect(() => {
    localStorage.setItem('IRS_DATA_SOURCELINES', JSON.stringify(sourceLines));
  }, [sourceLines]);

  useEffect(() => {
    localStorage.setItem('IRS_DATA_GENERATED', JSON.stringify(generatedItems));
  }, [generatedItems]);

  // Dots Animation Effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (actionState !== 'idle') {
      interval = setInterval(() => {
        setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
      }, 400);
    } else {
      setDots('');
    }
    return () => clearInterval(interval);
  }, [actionState]);

  // Formatting helpers
  const formatTime = (date: Date) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0'); 
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const formatDate = (date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Variables for Preview
  const lineCount = sourceLines.length;
  const previewStart = Math.max(0, startRow - 1);
  const previewLines = lineCount > 0 ? sourceLines.slice(previewStart, previewStart + 3) : [];
  
  // --- HANDLERS ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoadingFile(true);

    setTimeout(() => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
          setSourceLines(lines);
        }
        setIsLoadingFile(false);
      };
      reader.onerror = () => setIsLoadingFile(false);
      reader.readAsText(file);
    }, 500);
    e.target.value = '';
  };

  const handleClearDatabase = () => {
    setSourceLines([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleNumberChange = (setter: React.Dispatch<React.SetStateAction<number>>, value: string) => {
    if (value === '') { setter(0); return; }
    let num = parseInt(value);
    if (isNaN(num) || num < 0) num = 0;
    setter(num);
  };

  const handleGenerate = () => {
    if (lineCount === 0) {
        alert("Upload Database file first!");
        return;
    }
    setActionState('generate');
    
    setTimeout(() => {
        const actualStart = Math.max(0, startRow - 1);
        const actualEnd = Math.min(lineCount, actualStart + quantity);
        const sliced = sourceLines.slice(actualStart, actualEnd);

        const newItems: IdeaItem[] = sliced.map((line, idx) => {
            const cleanSlug = extractSlugFromUrl(line);
            return {
                id: Math.random().toString(36).substring(7),
                title: cleanSlug,
                sourceData: {
                    id: startRow + idx,
                    originalKeywords: line
                }
            };
        });

        setGeneratedItems(newItems);
        setActionState('idle');
    }, 1200);
  };

  const handleClearAll = () => {
    setActionState('clear');
    setTimeout(() => {
      setGeneratedItems([]);
      setActionState('idle');
    }, 600);
  };

  const handleDeleteItem = (id: string) => {
      setGeneratedItems(prev => prev.filter(item => item.id !== id));
  };

  const handleDownload = () => {
      setActionState('export');
      setTimeout(() => {
        const filename = (csvFilename.trim() || defaultFilename) + `.${outputFormat}`;
        const content = generatedItems.map(item => item.title).join('\n');
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setActionState('idle');
      }, 800);
  };

  const isAnyActionRunning = actionState !== 'idle';

  // --- RENDER ---
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech&display=swap');
        .font-share-tech { font-family: 'Share Tech', sans-serif; }
      `}</style>
      
      <div className="flex flex-col h-screen w-full bg-gray-50 overflow-hidden relative font-share-tech">
        
        {/* HEADER BAR */}
        <header className="w-full bg-white border-b border-gray-200 px-4 h-16 flex items-center justify-between shrink-0 shadow-sm z-50">
          <div className="flex items-center">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-400 bg-clip-text text-transparent tracking-tighter leading-none select-none">
              Data Riset
            </h1>
          </div>
          <div className="flex flex-col items-end justify-center text-gray-800">
             <span className="text-2xl leading-none tracking-tight tabular-nums">{formatTime(currentTime)}</span>
             <span className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-0.5 tabular-nums">{formatDate(currentTime)}</span>
          </div>
        </header>

        <main className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden relative">
          
          <aside className="w-full md:w-[380px] md:ml-2 bg-gray-50 md:border-r border-gray-200 flex flex-col z-20 shrink-0 md:h-full md:overflow-hidden order-1">
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 p-4 flex flex-col gap-4">
              
              <div className="bg-white p-4 rounded-lg shadow-sm border border-blue-200 flex flex-col gap-4">
                <div className="flex flex-col gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <label className={labelClass}>Database Source</label>
                      </div>
                      {isLoadingFile ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full border border-blue-200">
                          <Loader2 className="w-3 h-3 animate-spin" /> Analyzing...
                        </span>
                      ) : (
                        lineCount > 0 && (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                          {lineCount.toLocaleString()} Rows
                        </span>
                        )
                      )}
                    </div>
                    
                    <input 
                      ref={fileInputRef} type="file" accept=".txt,.csv" 
                      onChange={handleFileUpload} className="hidden" 
                    />
                    
                    <div className="flex gap-3">
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isAnyActionRunning || isLoadingFile}
                        className="flex-1 py-2 border-2 border-dashed rounded-lg text-xs font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2 bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-wait"
                      >
                        {isLoadingFile ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />} 
                        {isLoadingFile ? "Reading File..." : (lineCount > 0 ? "Replace File" : "Upload CSV/TXT")}
                      </button>

                      <button
                        onClick={handleClearDatabase}
                        disabled={isAnyActionRunning || lineCount === 0}
                        className="w-12 shrink-0 flex items-center justify-center border-2 border-dashed border-red-300 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Clear Database"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    
                    {/* DATA PREVIEW DI KUNCI TINGGINYA */}
                    <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded text-[10px] font-mono text-gray-500 flex flex-col h-[110px] overflow-hidden">
                      <div className="flex items-center gap-1 mb-1 font-bold text-gray-400 uppercase bg-gray-50 pb-1 border-b border-gray-100 shrink-0">
                          <Eye size={10} /> Data Preview
                      </div>
                      <div className="flex-1 overflow-hidden h-full flex flex-col">
                      {lineCount > 0 ? (
                          <div className="flex flex-col">
                              {previewLines.map((line, idx) => (
                                  <div key={idx} className="truncate border-b border-gray-100 last:border-0 py-1 opacity-80 flex gap-2">
                                      <span className="shrink-0 w-8 text-blue-400 font-bold">{previewStart + idx + 1}.</span>
                                      <span className="truncate">{line}</span>
                                  </div>
                              ))}
                              {lineCount > 3 && (
                                  <div className="italic opacity-50 pt-1 pl-10">... and {lineCount - 3} more rows</div>
                              )}
                          </div>
                      ) : (
                          <div className="flex flex-col gap-1 opacity-30 select-none h-full justify-center items-center">
                              <div className="text-center font-bold tracking-widest uppercase">No file uploaded</div>
                              <div className="text-[9px] uppercase">Upload Data to view database content</div>
                          </div>
                      )}
                      </div>
                    </div>
                  </div>

                  {/* Ketinggian Input dikurangi */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center h-5 mb-0.5">
                          <label className={labelClass}>Start Row</label>
                      </div>
                      <input
                        type="number" min="1" placeholder="1"
                        className={inputClass}
                        value={startRow === 0 ? '' : startRow}
                        onChange={(e) => handleNumberChange(setStartRow, e.target.value)}
                        disabled={isAnyActionRunning}
                      />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center h-5 mb-0.5">
                          <label className={labelClass}>Quantity</label>
                      </div>
                      <input
                        type="number" min="0" placeholder="No limits"
                        className={inputClass}
                        value={quantity === 0 ? '' : quantity}
                        onChange={(e) => handleNumberChange(setQuantity, e.target.value)}
                        disabled={isAnyActionRunning}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center h-5 mb-0.5">
                          <label className={labelClass} title="Jumlah proses paralel lokal">Worker</label>
                      </div>
                      <input
                        type="number" min="1" placeholder="50"
                        className={inputClass}
                        value={workerCount === 0 ? '' : workerCount}
                        onChange={(e) => handleNumberChange(setWorkerCount, e.target.value)}
                        disabled={isAnyActionRunning}
                      />
                    </div>
                  </div>

                  <div className="col-span-full">
                    <label className={labelClass}>Negative Context</label>
                    <textarea
                      className={`${areaClass} resize-none text-xs font-mono scrollbar-thin scrollbar-thumb-gray-200 leading-tight h-16`}
                      placeholder="Daftar kata yang dilarang muncul..."
                      value={negativeContext}
                      onChange={(e) => setNegativeContext(e.target.value)}
                      disabled={isAnyActionRunning}
                      spellCheck={false}
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-blue-100">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      <label className="block text-sm font-medium text-gray-500">Custom Filename</label>
                    </div>
                    
                    <div className="flex gap-3">
                      <button 
                        onClick={() => setOutputFormat('csv')} disabled={isAnyActionRunning}
                        className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-blue-600 transition-colors"
                      >
                        {outputFormat === 'csv' ? <CheckSquare className="w-3.5 h-3.5 text-blue-500" /> : <Square className="w-3.5 h-3.5 text-gray-300" />} CSV
                      </button>
                      <button 
                        onClick={() => setOutputFormat('txt')} disabled={isAnyActionRunning}
                        className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-blue-600 transition-colors"
                      >
                        {outputFormat === 'txt' ? <CheckSquare className="w-3.5 h-3.5 text-blue-500" /> : <Square className="w-3.5 h-3.5 text-gray-300" />} TXT
                      </button>
                    </div>
                  </div>

                  <div className="relative flex items-center">
                    <input
                      type="text"
                      className={`${inputClass} pr-12 !bg-white !text-gray-900`} 
                      placeholder={defaultFilename}
                      value={csvFilename}
                      onChange={(e) => setCsvFilename(e.target.value)}
                      disabled={isAnyActionRunning}
                    />
                    <span className="absolute right-3 text-gray-400 font-medium select-none pointer-events-none">
                      .{outputFormat}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ACTION BUTTONS: Generate - Clear - Export */}
            <div className="shrink-0 p-4 bg-gray-50 border-t border-gray-200 flex gap-2 z-10 h-[72px]">
                {/* GENERATE BUTTON */}
                <button 
                    onClick={handleGenerate} 
                    disabled={lineCount === 0 || isAnyActionRunning} 
                    className={`flex-1 text-xs font-bold rounded-lg border shadow-sm transition-colors uppercase tracking-wide flex justify-center items-center ${
                      actionState === 'generate' ? 'bg-blue-600 text-white border-blue-700' :
                      lineCount > 0 && !isAnyActionRunning ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700' : 
                      'bg-gray-100 border-gray-200 cursor-not-allowed text-gray-400 opacity-80'
                    }`}
                >
                    {actionState === 'generate' ? `Memproses${dots}` : 'Generate'}
                </button>

                {/* CLEAR BUTTON */}
                <button 
                    onClick={handleClearAll} 
                    disabled={generatedItems.length === 0 || isAnyActionRunning} 
                    className={`flex-1 text-xs font-bold rounded-lg border shadow-sm transition-colors uppercase tracking-wide flex justify-center items-center ${
                      actionState === 'clear' ? 'bg-red-50 text-red-600 border-red-200' :
                      generatedItems.length > 0 && !isAnyActionRunning ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 
                      'bg-gray-100 border-gray-200 cursor-not-allowed text-gray-400 opacity-80'
                    }`}
                >
                    {actionState === 'clear' ? `Memproses${dots}` : 'Clear'}
                </button>

                {/* EXPORT BUTTON */}
                <button 
                    onClick={handleDownload} 
                    disabled={generatedItems.length === 0 || isAnyActionRunning} 
                    className={`flex-1 text-xs font-bold rounded-lg border shadow-sm transition-colors uppercase tracking-wide flex justify-center items-center ${
                      actionState === 'export' ? 'bg-green-600 text-white border-green-700' :
                      generatedItems.length > 0 && !isAnyActionRunning ? 'bg-green-600 hover:bg-green-700 text-white border-green-700' : 
                      'bg-gray-100 border-gray-200 cursor-not-allowed text-gray-400 opacity-80'
                    }`}
                >
                    {actionState === 'export' ? `Memproses${dots}` : 'Export'}
                </button>
            </div>
          </aside>

          {/* MAIN SECTION (OUTPUT LIST) */}
          <section className="flex-1 p-4 bg-gray-100 flex flex-col relative order-2 min-h-[50vh] md:min-h-0 md:overflow-hidden">
             {generatedItems.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-gray-400">
                   <p className="text-base font-medium uppercase">Idea Workspace Ready.</p>
                   <p className="mt-1 max-w-xs text-center text-sm text-gray-500">
                     {lineCount > 0 
                       ? "Database loaded. Specify Start Row & Quantity, then click 'Generate' to start extraction." 
                       : "Upload a Database file in Idea Settings to start."}
                   </p>
                </div>
             ) : (
                <IdeaListComponent 
                   items={generatedItems} 
                   negativeContext={negativeContext} 
                   onDelete={handleDeleteItem}
                />
             )}
          </section>

        </main>
      </div>
    </>
  );
}
