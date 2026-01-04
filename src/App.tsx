import { useState, useRef, useEffect } from "react";
import {
  Mic,
  MicOff,
  Settings,
  Volume2,
  History,
  RotateCcw,
  Monitor,
  ExternalLink,
} from "lucide-react";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { invoke } from "@tauri-apps/api/core";
// import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

const API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY;

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isWidget, setIsWidget] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const transcriptRef = useRef("");

  useEffect(() => {
    let unlistenShortcut: (() => void) | undefined;

    const setup = async () => {
      try {
        const win = getCurrentWindow();
        setIsWidget(win.label === "widget");

        // Listen for global shortcut from Rust (window-specific)
        unlistenShortcut = await win.listen("shortcut-triggered", () => {
          toggleRecording();
        });
      } catch (err) {
        console.error("Setup error:", err);
      }
    };

    setup();

    return () => {
      if (unlistenShortcut) unlistenShortcut();
      stopRecording();
    };
  }, []);

  // Update a ref to keep track of recording state for the event listener closure
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const startRecording = async () => {
    if (!API_KEY) {
      setErrorMsg("Deepgram API Key is missing. Please check your .env file.");
      return;
    }

    setTranscript("");
    transcriptRef.current = "";
    setErrorMsg(null);
    setConnectionStatus("connecting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const deepgram = createClient(API_KEY);
      const connection = deepgram.listen.live({
        model: "nova-2",
        language: "en-US",
        smart_format: true,
      });

      socketRef.current = connection;

      connection.on(LiveTranscriptionEvents.Open, () => {
        setConnectionStatus("connected");
        setIsRecording(true);

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: "audio/webm",
        });

        mediaRecorder.addEventListener("dataavailable", (event) => {
          if (event.data.size > 0 && connection.getReadyState() === 1) {
            connection.send(event.data);
          }
        });

        mediaRecorder.start(250);
        mediaRecorderRef.current = mediaRecorder;
      });

      connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const received = data.channel.alternatives[0].transcript;
        if (received && data.is_final) {
          const space = transcriptRef.current ? " " : "";
          const textToType = space + received;

          console.log("Typing:", textToType);
          invoke("type_text", { text: textToType }).catch(console.error);

          setTranscript((prev) => prev + space + received);
          transcriptRef.current += space + received;
        }
      });

      connection.on(LiveTranscriptionEvents.Close, () => {
        setConnectionStatus("idle");
        setIsRecording(false);
      });

      connection.on(LiveTranscriptionEvents.Error, (err) => {
        console.error("Deepgram Error:", err);
        setErrorMsg("Failed to connect to Deepgram.");
        setConnectionStatus("error");
      });
    } catch (err) {
      console.error("Microphone Access Error:", err);
      setErrorMsg("Could not access microphone. Please check permissions.");
      setConnectionStatus("error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((track) => track.stop());
      mediaRecorderRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.finish();
      socketRef.current = null;
    }

    setIsRecording(false);
    setConnectionStatus("idle");
  };

  const toggleRecording = () => {
    if (isRecordingRef.current) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const clearTranscript = () => {
    setTranscript("");
  };

  const toggleWidget = async () => {
    await invoke("open_widget");
  };

  if (isWidget) {
    return (
      <div
        className="flex flex-col h-full w-full bg-slate-900/90 shadow-2xl border border-primary-500/30 rounded-xl p-3 overflow-hidden select-none cursor-move"
        data-tauri-drag-region
      >
        <div
          className="flex items-center justify-between"
          data-tauri-drag-region
        >
          <div className="flex items-center space-x-2 pointer-events-none">
            <Volume2 size={14} className="text-primary-400" />
            <span className="text-xs font-bold text-slate-300">
              Wispr Widget
            </span>
          </div>
          <div className="flex items-center space-x-2">
            {isRecording && (
              <div className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </div>
            )}
            <button
              onClick={async () => {
                await invoke("open_main_window");
              }}
              className="text-slate-500 hover:text-white transition-colors"
              title="Open Main App"
            >
              <ExternalLink size={12} />
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center space-x-3 h-full overflow-hidden">
          <button
            onClick={toggleRecording}
            className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg ${
              isRecording
                ? "bg-red-500 shadow-red-500/20"
                : "bg-primary-500 shadow-primary-500/20"
            }`}
          >
            {isRecording ? (
              <MicOff size={18} className="text-white" />
            ) : (
              <Mic size={18} className="text-white" />
            )}
          </button>
          <div className="flex-1 truncate text-xs text-slate-400 italic">
            {isRecording
              ? transcript || "Listening..."
              : "Ctrl+Shift+F9 to record"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex justify-between items-center pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center shadow-lg shadow-primary-500/20">
            <Volume2 size={20} className="text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            WisprFlow <span className="text-primary-400">Clone</span>
          </h1>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={toggleWidget}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
            title="Open Widget"
          >
            <Monitor size={20} />
          </button>
          <button className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
            <History size={20} />
          </button>
          <button className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
            <Settings size={20} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Live Transcription & Auto-Type
          </h2>
          {connectionStatus === "connected" && (
            <div className="flex items-center space-x-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <span className="text-xs text-red-500 font-medium">
                Recording (Auto-Typing Active)
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6 overflow-y-auto transcript-area shadow-inner relative group">
          {transcript ? (
            <p className="text-lg leading-relaxed text-slate-200 whitespace-pre-wrap">
              {transcript}
              {isRecording && (
                <span className="inline-block w-1.5 h-5 bg-primary-500 ml-1 animate-pulse rounded-full align-middle"></span>
              )}
            </p>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-2">
              <Mic size={40} className="opacity-20 translate-y-2" />
              <p>
                {isRecording ? "Listening..." : "Shortcut: Ctrl + Windows Key"}
              </p>
              <p className="text-xs opacity-50">
                Transcribed text will be typed at your cursor position live.
              </p>
            </div>
          )}

          {transcript && (
            <button
              onClick={clearTranscript}
              className="absolute top-4 right-4 p-2 bg-slate-900/80 hover:bg-slate-900 rounded-lg border border-slate-700 text-slate-400 hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-lg"
              title="Clear transcript"
            >
              <RotateCcw size={16} />
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
          {errorMsg}
        </div>
      )}

      <footer className="flex flex-col items-center space-y-4 pt-4">
        <button
          onClick={toggleRecording}
          disabled={connectionStatus === "connecting"}
          className={`
            relative group flex items-center justify-center w-20 h-20 rounded-full transition-all duration-500
            ${
              isRecording
                ? "bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.4)] hover:bg-red-600"
                : "bg-primary-500 shadow-[0_0_30px_rgba(14,165,233,0.4)] hover:bg-primary-600 hover:scale-105 active:scale-95"
            }
            ${
              connectionStatus === "connecting"
                ? "opacity-50 cursor-not-allowed"
                : ""
            }
          `}
        >
          {connectionStatus === "connecting" ? (
            <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          ) : isRecording ? (
            <MicOff size={32} className="text-white" />
          ) : (
            <Mic size={32} className="text-white" />
          )}

          {isRecording && (
            <>
              <div className="absolute inset-0 rounded-full bg-red-500 animate-[ping_2s_ease-in-out_infinite] opacity-20 -z-10"></div>
              <div className="absolute inset-0 rounded-full bg-red-500 animate-[ping_3s_ease-in-out_infinite] opacity-10 -z-10"></div>
            </>
          )}
        </button>

        <p className="text-xs text-slate-500 font-medium">
          {isRecording
            ? "Press Ctrl+Win or click to stop"
            : connectionStatus === "connecting"
            ? "Establishing connection..."
            : "Press Ctrl+Win to start transcribing"}
        </p>
      </footer>
    </div>
  );
}

export default App;
