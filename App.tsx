import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Lightbulb, UploadCloud, Trash2, Eye, Loader2, FileText, CheckSquare, Square,
  Copy, CheckCircle, AlertTriangle, Menu, X, Check, ExternalLink,
  Play, Pause, Download, Wand2, Library,
} from 'lucide-react';
import { read, utils } from 'xlsx';

type OutputFormat = 'csv' | 'txt';
type ItemStatus = 'pending' | 'completed' | 'failed';

interface Settings {
  ideaFromRow: number;
  ideaBatchSize: number; // 0 = tanpa batas (sampai baris terakhir)
  ideaWorkerCount: number;
  ideaNegativeContext: string;
  outputFormat: OutputFormat;
  csvFilename: string;
}

interface IdeaItem {
  id: string;
  rowNumber: number; // nomor baris asli di database
  source: string; // isi baris mentah (biasanya URL)
  title: string; // hasil ekstraksi
  status: ItemStatus;
}

/* ----------------------------- CONSTANTS --------------------------------- */

const IDEA_FORBIDDEN_WORDS =
  'porn, sex, nude, naked, xxx, erotic, boobs, tits, pussy, fuck, dick, cock, penis, vagina, ass, orgasm, masturbate, bitch, whore, slut, milf, fetish, bdsm, rape, incest, anal, blowjob, cum, ejaculate, hentai, stripper, escort, hot girl, 18+, adult, bathroom, toilet, change clothes, undress, bhabhi, auntie, desi, upskirt, birth, pregnant, bloody, injury, gore';

const DEFAULT_SETTINGS: Settings = {
  ideaFromRow: 1,
  ideaBatchSize: 10,
  ideaWorkerCount: 50,
  ideaNegativeContext: IDEA_FORBIDDEN_WORDS,
  outputFormat: 'csv',
  csvFilename: '',
};

const DEFAULT_FILENAME = 'IsaIdea_Mode2';
const SETTINGS_KEY = 'ISA_IDEA_MODE2_SETTINGS';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/* ------------------------------ HELPERS ---------------------------------- */

// Segmen URL yang cuma penanda jenis konten, bukan judul.
const GENERIC_SEGMENTS = new Set([
  'image', 'images', 'photo', 'photos', 'video', 'videos', 'vector', 'vectors',
  'stock-photo', 'stock-photos', 'stock-video', 'stock-vector', 'stock-images',
  'image-photo', 'image-vector', 'image-illustration', 'image-video',
  'free-photo', 'free-vector', 'free-psd', 'premium-photo', 'premium-vector',
  'premium-psd', 'search', 'ai-image',
]);

/**
 * Ambil "judul" dari sebuah baris database.
 * - Kalau bukan URL → dikembalikan apa adanya.
 * - Kalau URL → ambil slug terakhir yang bermakna, buang ID angka & ekstensi.
 *   Contoh: .../image-photo/happy-family-on-beach-2345678901 → "Happy family on beach"
 */
export function extractSlugFromUrl(line: string): string {
  const raw = (line || '').trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) return raw;

  let segments: string[] = [];
  try {
    segments = new URL(raw).pathname.split('/').filter(Boolean);
  } catch {
    return raw;
  }

  for (let i = segments.length - 1; i >= 0; i--) {
    let seg = segments[i];
    try { seg = decodeURIComponent(seg); } catch { /* biarkan */ }

    seg = seg.replace(/\.(html?|php|aspx?|jpe?g|png|webp|svg|eps|ai)$/i, '');
    if (GENERIC_SEGMENTS.has(seg.toLowerCase())) continue;

    seg = seg.replace(/[-_]?\d{5,}$/, '').replace(/^\d{5,}[-_]?/, '');
    const words = seg.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();

    if (/\p{L}{2,}/u.test(words)) {
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
  }
  return raw;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Buat pendeteksi kata terlarang.
 * Pakai pencocokan KATA UTUH (bukan sekadar includes) supaya "grass" / "class"
 * tidak terblokir gara-gara kata "ass", dan "birthday"/"document" tidak
 * kena "birth"/"cum". Kalau mau balik ke perilaku lama, ganti dengan lowerText.includes(word).
 */
function buildBlockedMatcher(negativeContext: string): (text: string) => string | null {
  const words = negativeContext
    .split(',')
    .map(w => w.trim().toLowerCase())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (words.length === 0) return () => null;

  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])(${words.map(escapeRegex).join('|')})(?![\\p{L}\\p{N}])`,
    'iu'
  );
  return (text: string) => {
    if (!text) return null;
    const m = re.exec(text);
    return m ? m[1].toUpperCase() : null;
  };
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function downloadTXT(items: IdeaItem[], baseName: string): string {
  const filename = `${baseName}.txt`;
  triggerDownload(items.map(i => i.title).join('\n'), filename, 'text/plain;charset=utf-8');
  return filename;
}

function downloadCSV(items: IdeaItem[], baseName: string): string {
  const filename = `${baseName}.csv`;
  const rows = [
    ['No', 'Title', 'Source'].map(csvCell).join(','),
    ...items.map(i => [i.rowNumber, i.title, i.source].map(csvCell).join(',')),
  ];
  // BOM supaya Excel membaca UTF-8 dengan benar
  triggerDownload('\uFEFF' + rows.join('\r\n'), filename, 'text/csv;charset=utf-8');
  return filename;
}

/* --------------------------- RESULT LIST --------------------------------- */

const ROW_HEIGHT = 64;
const VIEW_HEIGHT = 600;
const OVERSCAN = 6;

interface ListProps {
  items: IdeaItem[];
  findBlocked: (text: string) => string | null;
  onDelete: (id: string) => void;
  deleteDisabled: boolean;
}

const IdeaList: React.FC<ListProps> = memo(({ items, findBlocked, onDelete, deleteDisabled }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setActiveMenuId(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setActiveMenuId(null);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAll = () => {
    const all = items
      .map(item => {
        const blocked = findBlocked(item.title);
        return `${item.rowNumber}. ${blocked ? `[HIDDEN - ${blocked} DETECTED]` : item.title}`;
      })
      .join('\n');
    navigator.clipboard.writeText(all);
    setCopiedId('ALL');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenLink = (url: string) => {
    if (url.startsWith('http')) {
      window.open(url, '_blank', 'noopener,noreferrer');
      setActiveMenuId(null);
    }
  };

  // Virtualisasi sederhana: hanya render baris yang terlihat
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(items.length, Math.ceil((scrollTop + VIEW_HEIGHT) / ROW_HEIGHT) + OVERSCAN);
  const visible = items.slice(start, end);

  return (
    <div
      className="flex flex-col bg-white rounded-lg shadow-sm border border-blue-200 overflow-hidden"
      style={{ height: VIEW_HEIGHT }}
    >
      <div className="flex items-center justify-between p-3 bg-blue-50 border-b border-blue-100 shrink-0">
        <h3 className="text-sm font-bold text-blue-800 uppercase tracking-wide">
          Idea Output Results ({items.length.toLocaleString()})
        </h3>
        <button
          onClick={handleCopyAll}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 rounded text-xs font-bold text-blue-700 hover:bg-blue-100 transition-colors uppercase"
        >
          {copiedId === 'ALL' ? <CheckCircle size={14} /> : <Copy size={14} />}
          {copiedId === 'ALL' ? 'Copied All' : 'Copy All'}
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto bg-gray-50/30"
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div style={{ height: items.length * ROW_HEIGHT, position: 'relative' }}>
          {visible.map((item, i) => {
            const isPending = item.status === 'pending';
            const isFailed = item.status === 'failed';
            const blocked = !isPending && !isFailed ? findBlocked(item.title) : null;
            const isMenuOpen = activeMenuId === item.id;
            const hasLink = item.source.startsWith('http');

            return (
              <div
                key={item.id}
                style={{ position: 'absolute', top: (start + i) * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT }}
                className={`flex items-center gap-3 px-3 border-b border-gray-100 transition-colors group ${
                  blocked ? 'bg-red-50 hover:bg-red-100/60' : 'hover:bg-white'
                }`}
              >
                <div
                  className={`shrink-0 min-w-8 h-8 px-1 flex items-center justify-center rounded text-xs font-bold ${
                    blocked ? 'bg-red-200 text-red-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {item.rowNumber}
                </div>

                <div className="flex-1 min-w-0">
                  {blocked ? (
                    <div className="flex items-center gap-2 text-red-600 whitespace-nowrap overflow-hidden">
                      <AlertTriangle size={14} className="shrink-0" />
                      <span className="text-[10px] font-black uppercase tracking-widest bg-red-600 text-white px-2 py-0.5 rounded shadow-sm">
                        {blocked} / BLOCKED DETECTED
                      </span>
                    </div>
                  ) : isPending ? (
                    <p className="text-sm text-gray-400 italic">Menunggu...</p>
                  ) : isFailed ? (
                    <p className="text-sm text-red-500 truncate">Gagal mengekstrak judul</p>
                  ) : (
                    <p className="text-sm text-gray-800 font-medium truncate select-all" title={item.title}>
                      {item.title}
                    </p>
                  )}
                </div>

                <div className="relative flex items-center justify-end shrink-0 w-9 h-9">
                  {isMenuOpen ? (
                    <div
                      ref={menuRef}
                      className="absolute right-0 flex items-center gap-1.5 bg-white border border-gray-200 shadow-xl rounded-lg p-1.5 z-50 ring-1 ring-black/5"
                    >
                      {!blocked && !isPending && !isFailed && (
                        <>
                          {hasLink && (
                            <button
                              onClick={() => handleOpenLink(item.source)}
                              className="p-2 rounded-md transition-colors bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600"
                              title="Buka Link Asli"
                            >
                              <ExternalLink size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => handleCopy(item.title, item.id)}
                            className={`p-2 rounded-md transition-colors ${
                              copiedId === item.id
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600'
                            }`}
                            title="Salin Teks"
                          >
                            {copiedId === item.id ? <Check size={16} /> : <Copy size={16} />}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => { onDelete(item.id); setActiveMenuId(null); }}
                        disabled={deleteDisabled}
                        className="p-2 rounded-md transition-colors bg-gray-100 text-red-500 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={deleteDisabled ? 'Tidak bisa hapus saat diproses' : 'Hapus'}
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
                      onClick={e => { e.stopPropagation(); setActiveMenuId(item.id); }}
                      className="p-1.5 rounded-lg border bg-white border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-200 transition-all"
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

/* ------------------------------- APP ------------------------------------- */

const inputClass =
  'w-full text-base p-2 border border-gray-300 rounded bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none focus:border-blue-500 transition-all disabled:bg-gray-100 disabled:text-gray-400 placeholder:text-gray-400 h-[42px]';
const areaClass =
  'w-full text-base p-2 border border-gray-300 rounded bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none focus:border-blue-500 transition-all disabled:bg-gray-100 disabled:text-gray-400 placeholder:text-gray-300 h-20';
const labelClass = 'block text-sm font-medium text-gray-500 h-5 flex items-center whitespace-nowrap overflow-hidden';

const App: React.FC = () => {
  // ---- Settings (disimpan di localStorage, tanpa isi database) ----
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch { /* abaikan */ }
    return DEFAULT_SETTINGS;
  });
  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* abaikan */ }
  }, [settings]);

  // ---- Database & hasil ----
  const [sourceLines, setSourceLines] = useState<string[]>([]);
  const [items, setItems] = useState<IdeaItem[]>([]);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [status, setStatus] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Refs untuk worker ----
  const itemsRef = useRef<IdeaItem[]>([]);
  const nextIdxRef = useRef(0);
  const processingRef = useRef(false);
  const pausedRef = useRef(false);
  const dirtyRef = useRef(false);

  const findBlocked = useMemo(
    () => buildBlockedMatcher(settings.ideaNegativeContext),
    [settings.ideaNegativeContext]
  );

  const setNumber = (field: 'ideaFromRow' | 'ideaBatchSize' | 'ideaWorkerCount', value: string) => {
    if (value === '') return setSettings(p => ({ ...p, [field]: 0 }));
    const n = parseInt(value, 10);
    if (isNaN(n)) return;
    setSettings(p => ({ ...p, [field]: Math.max(0, n) }));
  };

  // ---- Upload database ----
  const handleDbFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsLoadingFile(true);

    setTimeout(() => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const reader = new FileReader();

      if (ext === 'xlsx' || ext === 'xls') {
        reader.onload = ev => {
          try {
            const wb = read(ev.target?.result, { type: 'binary' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = utils.sheet_to_json(ws, { header: 1 }) as any[][];
            const lines = rows.map(r => (r[0] ? String(r[0]).trim() : '')).filter(l => l.length > 0);
            setSourceLines(lines);
          } catch (err) {
            console.error('Excel read error', err);
            alert('Failed to read Excel file.');
          }
          setIsLoadingFile(false);
        };
        reader.onerror = () => setIsLoadingFile(false);
        reader.readAsBinaryString(file);
      } else {
        reader.onload = ev => {
          const text = ev.target?.result as string;
          if (text) setSourceLines(text.split(/\r?\n/).filter(l => l.trim().length > 0));
          setIsLoadingFile(false);
        };
        reader.onerror = () => setIsLoadingFile(false);
        reader.readAsText(file);
      }
    }, 100);
  };

  const handleClearDatabase = () => setSourceLines([]);

  // ---- Worker queue (ekstraksi lokal, tanpa API) ----
  const flush = useCallback(() => {
    if (dirtyRef.current) {
      dirtyRef.current = false;
      setItems([...itemsRef.current]);
    }
  }, []);

  const runQueue = async (list: IdeaItem[], workerCount: number) => {
    itemsRef.current = list;
    nextIdxRef.current = 0;
    processingRef.current = true;
    pausedRef.current = false;
    dirtyRef.current = false;
    setIsProcessing(true);
    setIsPaused(false);
    setStatus(`Menjalankan ${Math.max(1, Math.min(workerCount, list.length))} worker...`);

    const timer = window.setInterval(flush, 150);

    const worker = async () => {
      let n = 0;
      while (processingRef.current) {
        if (pausedRef.current) { await sleep(200); continue; }
        const idx = nextIdxRef.current++;
        if (idx >= itemsRef.current.length) break;
        const cur = itemsRef.current[idx];
        try {
          const title = extractSlugFromUrl(cur.source);
          itemsRef.current[idx] = { ...cur, title, status: title ? 'completed' : 'failed' };
        } catch {
          itemsRef.current[idx] = { ...cur, status: 'failed' };
        }
        dirtyRef.current = true;
        if (++n % 25 === 0) await sleep(0); // beri napas ke UI
      }
    };

    const count = Math.max(1, Math.min(workerCount, list.length));
    await Promise.all(Array.from({ length: count }, (_, i) => sleep(i * 10).then(worker)));

    window.clearInterval(timer);
    dirtyRef.current = true;
    flush();

    const done = itemsRef.current.filter(i => i.status === 'completed').length;
    const failed = itemsRef.current.filter(i => i.status === 'failed').length;
    const pending = itemsRef.current.length - done - failed;
    setStatus(
      pending > 0
        ? `Dihentikan: ${done} selesai, ${pending} belum diproses.`
        : `Selesai: ${done} berhasil${failed ? `, ${failed} gagal` : ''}.`
    );
    processingRef.current = false;
    setIsProcessing(false);
    setIsPaused(false);
  };

  const canStart =
    sourceLines.length > 0 && settings.ideaFromRow > 0 && settings.ideaWorkerCount > 0 && !isLoadingFile;

  const handleGenerate = () => {
    if (isProcessing) return;
    if (sourceLines.length === 0) return alert('Please upload a file.');

    const from = Math.max(1, settings.ideaFromRow);
    if (from > sourceLines.length) {
      return alert(`Start Row (${from}) melebihi jumlah baris database (${sourceLines.length}).`);
    }
    const startIdx = from - 1;
    const endIdx = settings.ideaBatchSize > 0
      ? Math.min(sourceLines.length, startIdx + settings.ideaBatchSize)
      : sourceLines.length;

    const list: IdeaItem[] = sourceLines.slice(startIdx, endIdx).map((line, i) => ({
      id: `row_${from + i}`,
      rowNumber: from + i,
      source: line,
      title: '',
      status: 'pending',
    }));

    setItems(list);
    runQueue(list, settings.ideaWorkerCount);
  };

  const togglePause = () => {
    if (!isProcessing) return;
    const next = !isPaused;
    setIsPaused(next);
    pausedRef.current = next;
    setStatus(next ? 'Dijeda (Paused).' : 'Dilanjutkan (Resumed).');
  };

  const handleStop = () => {
    if (!isProcessing) return;
    pausedRef.current = false; // supaya worker yang sedang pause bisa keluar
    processingRef.current = false;
  };

  const handleDelete = (id: string) => {
    if (processingRef.current) return;
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleClearAll = () => {
    if (isProcessing) return;
    if (items.length > 0 && !confirm('Hapus semua hasil?')) return;
    setItems([]);
    itemsRef.current = [];
    setStatus('');
  };

  // ---- Statistik & ekspor ----
  const stats = useMemo(() => {
    let completed = 0, failed = 0, blocked = 0;
    for (const it of items) {
      if (it.status === 'completed') {
        completed++;
        if (!isProcessing && findBlocked(it.title)) blocked++;
      } else if (it.status === 'failed') failed++;
    }
    return { completed, failed, blocked, processed: completed + failed };
  }, [items, findBlocked, isProcessing]);

  const canDownload = stats.completed > 0 && (!isProcessing || isPaused);

  const handleDownload = () => {
    if (!canDownload) return;
    const exportable = items.filter(i => i.status === 'completed' && !findBlocked(i.title));
    if (exportable.length === 0) return alert('Semua hasil terblokir oleh Negative Context.');
    const base = settings.csvFilename.trim() || DEFAULT_FILENAME;
    const filename = settings.outputFormat === 'txt'
      ? downloadTXT(exportable, base)
      : downloadCSV(exportable, base);
    const skipped = stats.completed - exportable.length;
    setStatus(`Exported ${filename} (${exportable.length} baris${skipped ? `, ${skipped} terblokir dilewati` : ''}).`);
  };

  // ---- Preview data ----
  const lineCount = sourceLines.length;
  const previewStart = Math.max(0, (settings.ideaFromRow || 1) - 1);
  const previewLines = sourceLines.slice(previewStart, previewStart + 3);
  const progressPct = items.length > 0 ? Math.round((stats.processed / items.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      {/* Top bar */}
      <header className="bg-white border-b border-blue-100">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-blue-500" />
          <h1 className="text-base font-semibold text-gray-700 uppercase tracking-wide">Isa Idea</h1>
          <span className="ml-2 flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
            <Library size={12} /> Mode 2
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)] items-start">
        {/* ============ SETTINGS ============ */}
        <section className="bg-white p-4 rounded-lg shadow-sm border border-blue-200 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-blue-500" />
            <h2 className="text-base font-semibold text-gray-700 uppercase tracking-wide">Idea Setting</h2>
          </div>
          <div className="border-t border-blue-100 -my-2" />

          {/* Database source */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelClass}>Database Source</label>
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

            <input ref={fileInputRef} type="file" accept=".txt,.csv,.xlsx,.xls" onChange={handleDbFileUpload} className="hidden" />

            <div className="flex gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing || isLoadingFile}
                className="flex-1 py-3 border-2 border-dashed rounded-lg text-xs font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2 bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-wait"
              >
                {isLoadingFile ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                {isLoadingFile ? 'Reading File...' : lineCount > 0 ? 'Replace File' : 'Upload CSV/Excel'}
              </button>
              <button
                onClick={handleClearDatabase}
                disabled={isProcessing || lineCount === 0}
                className="w-12 shrink-0 flex items-center justify-center border-2 border-dashed border-red-300 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Clear Database"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded text-[10px] font-mono text-gray-500 flex flex-col h-[130px] overflow-hidden">
              <div className="flex items-center gap-1 mb-1 font-bold text-gray-400 uppercase pb-1 border-b border-gray-100 shrink-0">
                <Eye size={10} /> Data Preview
              </div>
              <div className="flex-1 overflow-hidden">
                {lineCount > 0 ? (
                  <div className="flex flex-col">
                    {previewLines.map((line, idx) => (
                      <div key={idx} className="truncate border-b border-gray-100 last:border-0 py-1 opacity-80 flex gap-2">
                        <span className="shrink-0 w-8 text-blue-400 font-bold">{previewStart + idx + 1}.</span>
                        <span className="truncate">{line}</span>
                      </div>
                    ))}
                    {lineCount > previewStart + 3 && (
                      <div className="italic opacity-50 pt-1 pl-10">... and {(lineCount - previewStart - 3).toLocaleString()} more rows</div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 opacity-30 select-none h-full justify-center items-center">
                    <div className="text-center font-bold tracking-widest uppercase">No file uploaded</div>
                    <div className="text-[9px] uppercase">Upload CSV/Excel to view database content</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Start row / Quantity / Worker */}
          <div className="grid grid-cols-3 gap-3">
            <div className="min-w-0">
              <label className={labelClass}>Start Row</label>
              <input
                type="number" min="1" placeholder="1" className={inputClass}
                value={settings.ideaFromRow === 0 ? '' : settings.ideaFromRow}
                onChange={e => setNumber('ideaFromRow', e.target.value)}
                disabled={isProcessing}
              />
            </div>
            <div className="min-w-0">
              <label className={labelClass}>Quantity</label>
              <input
                type="number" min="0" placeholder="No limits" className={inputClass}
                value={settings.ideaBatchSize === 0 ? '' : settings.ideaBatchSize}
                onChange={e => setNumber('ideaBatchSize', e.target.value)}
                disabled={isProcessing}
              />
            </div>
            <div className="min-w-0">
              <label className={labelClass} title="Jumlah proses paralel lokal">Worker</label>
              <input
                type="number" min="1" placeholder="50" className={inputClass}
                value={settings.ideaWorkerCount === 0 ? '' : settings.ideaWorkerCount}
                onChange={e => setNumber('ideaWorkerCount', e.target.value)}
                disabled={isProcessing}
              />
            </div>
          </div>

          {/* Negative context */}
          <div>
            <label className={labelClass}>Negative Context</label>
            <textarea
              className={`${areaClass} resize-none text-xs font-mono leading-tight`}
              placeholder="Daftar kata yang dilarang muncul, pisahkan dengan koma..."
              value={settings.ideaNegativeContext}
              onChange={e => setSettings(p => ({ ...p, ideaNegativeContext: e.target.value }))}
              disabled={isProcessing}
              spellCheck={false}
            />
          </div>

          {/* Filename + format */}
          <div className="pt-2 border-t border-blue-100">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                <label className="block text-sm font-medium text-gray-500">Custom Filename</label>
              </div>
              <div className="flex gap-3">
                {(['csv', 'txt'] as OutputFormat[]).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setSettings(p => ({ ...p, outputFormat: fmt }))}
                    disabled={isProcessing}
                    className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-blue-600 transition-colors"
                  >
                    {settings.outputFormat === fmt
                      ? <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
                      : <Square className="w-3.5 h-3.5 text-gray-300" />}
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative flex items-center">
              <input
                type="text"
                className={`${inputClass} pr-12`}
                placeholder={DEFAULT_FILENAME}
                value={settings.csvFilename}
                onChange={e => setSettings(p => ({ ...p, csvFilename: e.target.value }))}
              />
              <span className="absolute right-3 text-gray-400 font-medium select-none pointer-events-none">
                .{settings.outputFormat}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2 border-t border-blue-100">
            {!isProcessing ? (
              <button
                onClick={handleGenerate}
                disabled={!canStart}
                className="h-11 flex items-center justify-center gap-2 rounded-md bg-blue-600 text-white text-sm font-bold uppercase tracking-wide hover:bg-blue-700 transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                <Wand2 size={16} /> Generate Ideas
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={togglePause}
                  className="flex-1 h-11 flex items-center justify-center gap-2 rounded-md bg-amber-500 text-white text-sm font-bold uppercase hover:bg-amber-600 transition-colors"
                >
                  {isPaused ? <><Play size={16} /> Resume</> : <><Pause size={16} /> Pause</>}
                </button>
                <button
                  onClick={handleStop}
                  className="flex-1 h-11 flex items-center justify-center gap-2 rounded-md bg-red-500 text-white text-sm font-bold uppercase hover:bg-red-600 transition-colors"
                >
                  <X size={16} /> Stop
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleDownload}
                disabled={!canDownload}
                className="flex-1 h-10 flex items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold uppercase hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={14} /> Download {settings.outputFormat.toUpperCase()}
              </button>
              <button
                onClick={handleClearAll}
                disabled={isProcessing || items.length === 0}
                className="h-10 px-3 flex items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 text-red-600 text-xs font-bold uppercase hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Hapus semua hasil"
              >
                <Trash2 size={14} /> Clear
              </button>
            </div>
          </div>
        </section>

        {/* ============ RESULTS ============ */}
        <section className="flex flex-col gap-3 min-w-0">
          {(isProcessing || status) && (
            <div className="bg-white border border-blue-200 rounded-lg p-3 shadow-sm">
              <div className="flex items-center justify-between text-xs font-medium text-gray-600 mb-2">
                <span className="flex items-center gap-2">
                  {isProcessing && !isPaused && <Loader2 size={14} className="animate-spin text-blue-500" />}
                  {status}
                </span>
                <span className="font-bold text-blue-700">
                  {stats.processed.toLocaleString()} / {items.length.toLocaleString()} ({progressPct}%)
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 transition-all duration-150" style={{ width: `${progressPct}%` }} />
              </div>
              {!isProcessing && stats.blocked > 0 && (
                <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  {stats.blocked} baris terdeteksi Negative Context dan tidak akan ikut diekspor.
                </p>
              )}
            </div>
          )}

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center bg-white border border-dashed border-blue-200 rounded-lg text-gray-400 h-[420px] px-6">
              <Lightbulb size={64} className="mb-4 text-blue-500 opacity-20" />
              <p className="text-base font-medium uppercase">Idea Workspace Ready.</p>
              <p className="mt-1 max-w-xs text-center text-sm text-gray-500">
                {lineCount > 0
                  ? "Database loaded. Specify Start Row & Quantity, then click 'Generate Ideas' to start extraction."
                  : 'Upload a Database file (CSV / Excel / TXT) in Idea Settings to start.'}
              </p>
            </div>
          ) : (
            <IdeaList
              items={items}
              findBlocked={findBlocked}
              onDelete={handleDelete}
              deleteDisabled={isProcessing}
            />
          )}
        </section>
      </main>
    </div>
  );
};

export default App;
