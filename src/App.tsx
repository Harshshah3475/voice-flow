import { useState, useRef, useEffect } from "react";
import {
  Mic,
  Settings,
  Volume2,
  RotateCcw,
  Monitor,
  X,
  Keyboard,
  Loader2,
  Type,
  Sun,
  Moon,
  Laptop,
  Trash2,
  Clock,
  ChevronLeft,
  AlertCircle,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { load } from "@tauri-apps/plugin-store";

interface HistoryItem {
  id: string;
  text: string;
  timestamp: number;
}

function App() {
  // UI State
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isWidget, setIsWidget] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [view, setView] = useState<"main" | "history">("main");
  
  // Settings State
  const [apiKey, setApiKey] = useState<string>("");
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [theme, setTheme] = useState<"dark" | "light" | "system">("system");
  const [shortcut, setShortcut] = useState<string>("Ctrl+Shift+F9");
  const [shortcutInput, setShortcutInput] = useState<string>("Ctrl+Shift+F9");
  
  // Data State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWidgetHovered, setIsWidgetHovered] = useState(false);
  const [isCapturingShortcut, setIsCapturingShortcut] = useState(false);
  const [showFirstTimeSetup, setShowFirstTimeSetup] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const apiKeyRef = useRef("");
  const isRecordingRef = useRef(false);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);

  // Clear error message after some time
  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  // Theme effect
  useEffect(() => {
    const applyTheme = (t: string) => {
      const root = window.document.documentElement;
      root.classList.remove("light", "dark");
      
      let themeToApply = t;
      if (t === "system") {
        themeToApply = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      
      root.classList.add(themeToApply);
      
      // Also apply to body for good measure
      document.body.classList.remove("light", "dark");
      document.body.classList.add(themeToApply);
    };

    applyTheme(theme);
    
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("system");
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, [theme]);

  // Load everything on mount
  useEffect(() => {
    const init = async () => {
      try {
        const store = await load("settings.json");
        const historyStore = await load("history.json");
        
        // Load Settings
        const storedKey = await store.get<string>("deepgram_api_key");
        const storedTheme = await store.get<string>("theme") as any;
        const storedShortcut = await store.get<string>("global_shortcut");
        
        if (storedKey) { setApiKey(storedKey); setApiKeyInput(storedKey); }
        
        if (storedTheme) setTheme(storedTheme);
        
        if (storedShortcut) {
          setShortcut(storedShortcut);
          setShortcutInput(storedShortcut);
          await invoke("register_shortcut", { shortcutStr: storedShortcut });
        } else {
          setShowFirstTimeSetup(true);
        }

        // Load History
        const storedHistory = await historyStore.get<HistoryItem[]>("items") || [];
        setHistory(storedHistory);

      } catch (err) {
        console.error("Init error:", err);
        setShowFirstTimeSetup(true);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    let unlistenDown: (() => void) | undefined;
    let unlistenUp: (() => void) | undefined;

    const setup = async () => {
      try {
        const win = getCurrentWindow();
        const isWidgetWindow = win.label === "widget";
        setIsWidget(isWidgetWindow);
        if (isWidgetWindow) document.body.classList.add("widget-mode");

        unlistenDown = await win.listen("shortcut-down", () => { if (isWidgetWindow) startRecording(); });
        unlistenUp = await win.listen("shortcut-up", () => { if (isWidgetWindow) stopAndProcess(); });
      } catch (err) { console.error("Setup error:", err); }
    };
    setup();
    return () => { if (unlistenDown) unlistenDown(); if (unlistenUp) unlistenUp(); };
  }, []);

  const saveSettings = async (newKey: string, newTheme: string) => {
    try {
      const store = await load("settings.json");
      await store.set("deepgram_api_key", newKey);
      await store.set("theme", newTheme);
      await store.save();
      setApiKey(newKey);
      setTheme(newTheme as any);
      setShowSettings(false);
      setErrorMsg(null);
    } catch (err) { setErrorMsg("Save failed"); }
  };

  const saveShortcut = async () => {
    if (!shortcutInput.trim()) return;
    try {
      await invoke("register_shortcut", { shortcutStr: shortcutInput });
      const store = await load("settings.json");
      await store.set("global_shortcut", shortcutInput);
      await store.save();
      setShortcut(shortcutInput);
      setShowSettings(false);
      setShowFirstTimeSetup(false);
    } catch (err) { setErrorMsg(`Hotkey fail`); }
  };

  const addToHistory = async (text: string) => {
    const newItem = { id: crypto.randomUUID(), text, timestamp: Date.now() };
    const historyStore = await load("history.json");
    const currentItems = await historyStore.get<HistoryItem[]>("items") || [];
    const updatedHistory = [newItem, ...currentItems].slice(0, 50); 
    setHistory(updatedHistory);
    await historyStore.set("items", updatedHistory);
    await historyStore.save();
  };

  const clearHistory = async () => {
    setHistory([]);
    const historyStore = await load("history.json");
    await historyStore.set("items", []);
    await historyStore.save();
  };

  const captureShortcut = (e: React.KeyboardEvent) => {
    e.preventDefault();
    const keys: string[] = [];
    if (e.ctrlKey) keys.push("Ctrl");
    if (e.shiftKey) keys.push("Shift");
    if (e.altKey) keys.push("Alt");
    if (e.metaKey) keys.push("CommandOrControl");
    const key = e.key;
    if (key !== "Control" && key !== "Shift" && key !== "Alt" && key !== "Meta") keys.push(key.toUpperCase());
    if (keys.length >= 2) { setShortcutInput(keys.join("+")); setIsCapturingShortcut(false); }
  };

  const startRecording = async () => {
    if (isRecordingRef.current) return;
    const currentApiKey = apiKeyRef.current || apiKey;
    if (!currentApiKey) {
      setErrorMsg("Missing API Key");
      return;
    }
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        processAudio(audioBlob);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (err) { setErrorMsg("Mic error"); }
  };

  const stopAndProcess = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
    setIsRecording(false);
  };

  const processAudio = async (audioBlob: Blob) => {
    const currentApiKey = apiKeyRef.current || apiKey;
    if (!currentApiKey || audioBlob.size < 1000) return;
    setIsProcessing(true);
    try {
      const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true", {
        method: "POST",
        headers: { "Authorization": `Token ${currentApiKey}`, "Content-Type": "audio/webm" },
        body: audioBlob,
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      const fullTranscript = result.results?.channels[0]?.alternatives[0]?.transcript;
      if (fullTranscript) {
        setTranscript(fullTranscript);
        addToHistory(fullTranscript);
        setIsProcessing(false);
        setIsTyping(true);
        await invoke("type_text", { text: fullTranscript });
        setIsTyping(false);
      }
    } catch (err) { setErrorMsg("AI error"); }
    finally { setIsProcessing(false); setIsTyping(false); }
  };

  if (isLoading) return <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950"><Loader2 className="animate-spin text-primary-500" /></div>;

  if (isWidget) {
    return (
      <div className="flex flex-col items-center justify-end h-screen w-screen pb-0.5 overflow-hidden pointer-events-none text-zinc-100">
        <div 
          className={`pointer-events-auto relative flex items-center justify-center rounded-full bg-zinc-900 border border-white/10 shadow-2xl transition-all duration-300 ${isRecording ? 'px-2.5 py-1 border-red-500/50' : isProcessing || isTyping || isWidgetHovered || errorMsg ? 'px-3 py-1.5' : 'px-1.5 py-1'}`}
          onMouseEnter={() => setIsWidgetHovered(true)} onMouseLeave={() => setIsWidgetHovered(false)}
        >
          {errorMsg ? (
            <div className="flex items-center space-x-1 text-red-400 max-w-[150px]">
              <AlertCircle size={8} className="shrink-0" />
              <span className="text-[8px] font-black uppercase tracking-tighter truncate">{errorMsg}</span>
            </div>
          ) : isRecording ? (
             <div className="flex items-center space-x-1.5">
               <div className="flex items-end space-x-0.5 h-2">
                 {[0, 1, 2].map((i) => (
                   <div 
                     key={i}
                     className="w-0.5 bg-red-500 rounded-full animate-waveform"
                     style={{ 
                       height: i === 1 ? '100%' : '60%',
                       animationDelay: `${i * 0.2}s`,
                     }}
                   />
                 ))}
               </div>
               <span className="text-[8px] text-red-400 font-black uppercase tracking-tighter">Recording</span>
             </div>
          ) : isProcessing ? (
             <div className="flex items-center space-x-1"><Loader2 className="w-2 h-2 text-primary-400 animate-spin" /><span className="text-[8px] text-primary-400 font-black uppercase tracking-tighter">AI</span></div>
          ) : isTyping ? (
             <div className="flex items-center space-x-1"><Type className="w-2 h-2 text-pink-400 animate-pulse" /><span className="text-[8px] text-pink-400 font-black uppercase tracking-tighter">Type</span></div>
          ) : (
            <div className="flex items-center">
              <div className="flex space-x-0.5">
                <div className="w-0.5 h-0.5 rounded-full bg-white/40" />
                <div className="w-0.5 h-0.5 rounded-full bg-white/40" />
                <div className="w-0.5 h-0.5 rounded-full bg-white/40" />
              </div>
              {isWidgetHovered && (
                <span className="ml-1.5 text-[8px] text-white/40 font-bold uppercase tracking-widest whitespace-nowrap animate-in fade-in slide-in-from-left-1">HOLD {shortcut}</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
      <header className="px-6 py-4 flex justify-between items-center border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 backdrop-blur-xl sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary-500 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/20"><Volume2 className="text-white" size={20} /></div>
          <div><h1 className="text-sm font-black uppercase tracking-tighter leading-none">VoiceFlow</h1><p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mt-1">VoiceFlow Prototype v2.2</p></div>
        </div>
        <div className="flex items-center space-x-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
          <button onClick={() => setView("main")} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${view === "main" ? 'bg-white dark:bg-zinc-700 shadow-sm text-primary-500' : 'text-zinc-400'}`}>Talk</button>
          <button onClick={() => setView("history")} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${view === "history" ? 'bg-white dark:bg-zinc-700 shadow-sm text-primary-500' : 'text-zinc-400'}`}>History</button>
          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
          <button onClick={() => setShowSettings(true)} className="p-2 text-zinc-400 hover:text-primary-500 transition-colors"><Settings size={18} /></button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        {view === "main" ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm min-h-[300px] flex flex-col">
               <div className="flex justify-between items-center mb-6"><h2 className="text-xs font-black uppercase tracking-widest text-zinc-400">Latest Transcript</h2>{transcript && <button onClick={() => setTranscript("")} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"><RotateCcw size={14} /></button>}</div>
               <div className="flex-1">{transcript ? (<p className="text-xl font-medium leading-relaxed">{transcript}</p>) : (<div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-30"><Mic size={48} />{apiKey ? <p className="text-sm font-bold uppercase tracking-widest">Hold <span className="text-primary-500">{shortcut}</span> to start</p> : <p className="text-sm font-bold uppercase tracking-widest text-red-500">API Key Required</p>}</div>)}</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-100 dark:bg-zinc-900/50 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex items-center space-x-3"><div className={`w-2 h-2 rounded-full ${apiKey ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} /><span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Deepgram {apiKey ? 'Online' : 'Offline'}</span></div>
              <button onClick={() => invoke("open_widget")} className="bg-primary-500 hover:bg-primary-600 text-white p-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary-500/20 transition-all flex items-center justify-center space-x-2"><Monitor size={14} /><span>Reset Widget</span></button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center"><h2 className="text-xl font-black italic tracking-tighter uppercase">HISTORY</h2>{history.length > 0 && <button onClick={clearHistory} className="flex items-center space-x-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 px-3 py-2 rounded-xl transition-colors"><Trash2 size={14} /><span>Clear All</span></button>}</div>
            {history.length > 0 ? (
              <div className="space-y-3">{history.map(item => (<div key={item.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl hover:border-primary-500 transition-colors group"><p className="text-sm font-medium mb-3 line-clamp-3">{item.text}</p><div className="flex justify-between items-center pt-3 border-t border-zinc-100 dark:border-zinc-800"><div className="flex items-center space-x-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest"><Clock size={12} /><span>{new Date(item.timestamp).toLocaleString()}</span></div><button onClick={() => invoke("type_text", { text: item.text })} className="text-[10px] font-black uppercase tracking-widest text-primary-500 opacity-0 group-hover:opacity-100 transition-all">Re-Type</button></div></div>))}</div>
            ) : (
              <div className="py-20 flex flex-col items-center justify-center text-zinc-400 opacity-30 italic"><Clock size={48} className="mb-4" /><p>Your transcripts will appear here</p></div>
            )}
          </div>
        )}
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center z-50 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[2.5rem] p-10 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-8"><h2 className="text-2xl font-black italic tracking-tighter uppercase">SETTINGS</h2><button onClick={() => setShowSettings(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"><X size={20} /></button></div>
            <div className="space-y-8">
              <div className="space-y-3"><label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Deepgram Key</label><input type="password" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-5 py-4 text-sm font-medium focus:ring-2 ring-primary-500/20 outline-none transition-all" placeholder="sk_..." /></div>
              <div className="space-y-3"><label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Appearance</label><div className="grid grid-cols-3 gap-2">{[{ id: 'light', icon: Sun, label: 'Light' }, { id: 'dark', icon: Moon, label: 'Dark' }, { id: 'system', icon: Laptop, label: 'Auto' }].map(t => (<button key={t.id} onClick={() => setTheme(t.id as any)} className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${theme === t.id ? 'bg-primary-500 border-primary-500 text-white shadow-lg shadow-primary-500/20' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500'}`}><t.icon size={18} className="mb-2" /><span className="text-[10px] font-black uppercase">{t.label}</span></button>))}</div></div>
              <div className="space-y-3"><label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Global Hotkey</label><div className="flex space-x-2"><div className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-5 py-4 text-sm font-bold font-mono text-primary-500 truncate">{shortcutInput}</div><button onClick={() => setIsCapturingShortcut(true)} className="px-6 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:scale-105 transition-transform">Capture</button></div></div>
              <button onClick={() => { saveSettings(apiKeyInput, theme); saveShortcut(); }} className="w-full bg-primary-500 hover:bg-primary-600 text-white py-5 rounded-[1.5rem] font-black uppercase tracking-[0.3em] text-xs shadow-xl shadow-primary-500/25 active:scale-95 transition-all">Save All Config</button>
            </div>
          </div>
        </div>
      )}

      {/* Capture Overlay */}
      {isCapturingShortcut && (
        <div className="fixed inset-0 bg-primary-500 flex items-center justify-center z-[60] p-10 focus:outline-none" onKeyDown={captureShortcut} tabIndex={0} autoFocus>
          <div className="text-center text-white space-y-6"><Keyboard className="w-24 h-24 mx-auto animate-pulse" /><h2 className="text-4xl font-black italic tracking-tighter uppercase">PRESS KEYS NOW</h2><p className="text-primary-100 font-bold uppercase tracking-widest text-sm opacity-60">Release to save combination</p><button onClick={() => setIsCapturingShortcut(false)} className="text-xs font-black uppercase tracking-[0.4em] pt-10 hover:tracking-[0.6em] transition-all">Cancel Capture</button></div>
        </div>
      )}

      {/* Onboarding */}
      {showFirstTimeSetup && !isWidget && (
        <div className="fixed inset-0 bg-white dark:bg-zinc-950 z-[100] flex items-center justify-center p-10">
          <div className="max-w-md w-full space-y-12 text-center animate-in fade-in zoom-in duration-700">
             <div className="w-24 h-24 bg-primary-500 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl shadow-primary-500/40 rotate-12"><Mic size={48} className="text-white -rotate-12" /></div>
             <div className="space-y-4">               <h2 className="text-5xl font-black tracking-tighter leading-tight italic uppercase">VOICE<br/>FLOW</h2><p className="text-zinc-500 font-medium leading-relaxed">The fastest way to turn thoughts into text. Configure your setup to start dictating everywhere.</p></div>
             <button onClick={() => setShowFirstTimeSetup(false)} className="group w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-6 rounded-[2rem] font-black uppercase tracking-[0.4em] text-xs hover:bg-primary-500 dark:hover:bg-primary-500 hover:text-white transition-all flex items-center justify-center space-x-4"><span>Setup App</span><ChevronLeft size={16} className="rotate-180 group-hover:translate-x-2 transition-transform" /></button>
          </div>
        </div>
      )}
      {errorMsg && !isWidget && (<div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-2xl animate-in slide-in-from-bottom-10">{errorMsg}</div>)}
    </div>
  );
}

export default App;
