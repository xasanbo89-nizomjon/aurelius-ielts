"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  Sparkles,
  RotateCcw,
  Flag,
  Loader2,
  Bot,
  User,
  Radio,
  Keyboard,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  generateLiveExaminerTurnAction,
  evaluateLiveSpeakingSessionAction,
  type ConversationMessage,
  type LiveEvaluationResult,
} from "@/actions/live-examiner.actions";
import { LiveExaminerResultsModal } from "./live-examiner-results-modal";

interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: {
    [index: number]: SpeechRecognitionResultItem;
  };
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

const INITIAL_EXAMINER_PROMPT =
  "Good day! My name is Sarah, and I will be your IELTS Speaking examiner today. Can you please state your full name, and tell me where you are currently living?";

export function AiLiveExaminerStudio() {
  const [messages, setMessages] = useState<ConversationMessage[]>([
    {
      id: "init-1",
      role: "examiner",
      text: INITIAL_EXAMINER_PROMPT,
      timestamp: Date.now(),
      part: 1,
    },
  ]);

  const [currentPart, setCurrentPart] = useState<number>(1);
  const [questionCount, setQuestionCount] = useState<number>(1);
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [manualText, setManualText] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [isExaminerThinking, setIsExaminerThinking] = useState(false);
  const [isExaminerSpeaking, setIsExaminerSpeaking] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Result modal state
  const [evaluation, setEvaluation] = useState<LiveEvaluationResult | null>(null);
  const [showResultsModal, setShowResultsModal] = useState(false);

  // Session start time for duration tracking
  const sessionStartTimeRef = useRef<number>(Date.now());
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, interimTranscript, isExaminerThinking, scrollToBottom]);

  // Speech Synthesis (Examiner Voice)
  const speakExaminerText = useCallback(
    (text: string) => {
      if (!soundEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95; // realistic examiner pacing
      utterance.pitch = 1.05; // clear natural tone

      // Pick an English voice if available (prefer GB or US female)
      const voices = window.speechSynthesis.getVoices();
      const britishVoice =
        voices.find((v) => v.lang.startsWith("en-GB") && v.name.toLowerCase().includes("female")) ||
        voices.find((v) => v.lang.startsWith("en-GB")) ||
        voices.find((v) => v.lang.startsWith("en-US") && v.name.toLowerCase().includes("female")) ||
        voices.find((v) => v.lang.startsWith("en"));

      if (britishVoice) {
        utterance.voice = britishVoice;
      }

      utterance.onstart = () => setIsExaminerSpeaking(true);
      utterance.onend = () => setIsExaminerSpeaking(false);
      utterance.onerror = () => setIsExaminerSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [soundEnabled]
  );

  // Speak initial message on mount if sound is enabled
  useEffect(() => {
    const timer = setTimeout(() => {
      speakExaminerText(INITIAL_EXAMINER_PROMPT);
    }, 600);
    return () => clearTimeout(timer);
  }, [speakExaminerText]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let currentText = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          currentText += event.results[i][0].transcript;
        }
        setInterimTranscript(currentText);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn("[SpeechRecognition Error]", event.error);
        if (event.error === "not-allowed") {
          toast.error("Microphone access denied. You can still type your answers below.");
          setShowManualInput(true);
        }
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Handle Recording Timer
  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isRecording]);

  // Toggle Microphone
  const toggleRecording = () => {
    // If examiner is speaking, stop them
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsExaminerSpeaking(false);
    }

    if (isRecording) {
      // Stop recording and submit
      stopRecordingAndSubmit();
    } else {
      // Start recording
      if (!recognitionRef.current) {
        toast.info("Voice recognition is not supported in this browser. Please use text input.");
        setShowManualInput(true);
        return;
      }
      try {
        setInterimTranscript("");
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.warn("[Recognition Start Error]", err);
        setIsRecording(false);
      }
    }
  };

  const stopRecordingAndSubmit = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsRecording(false);

    const spokenText = interimTranscript.trim();
    if (spokenText.length > 0) {
      handleCandidateAnswer(spokenText);
      setInterimTranscript("");
    } else {
      toast.info("No speech detected. Try speaking closer to your mic or type below.");
    }
  };

  // Submit candidate answer (from voice or typing)
  const handleCandidateAnswer = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: ConversationMessage = {
      id: `cand-${Date.now()}`,
      role: "candidate",
      text: text.trim(),
      timestamp: Date.now(),
    };

    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setManualText("");
    setIsExaminerThinking(true);

    try {
      const result = await generateLiveExaminerTurnAction({
        history: updatedHistory.map((m) => ({ role: m.role, text: m.text })),
        part: currentPart,
        questionIndex: questionCount,
      });

      setIsExaminerThinking(false);

      if (result.success && result.nextQuestion) {
        const examinerMsg: ConversationMessage = {
          id: `exam-${Date.now()}`,
          role: "examiner",
          text: result.nextQuestion,
          timestamp: Date.now(),
          part: result.part,
        };
        setMessages((prev) => [...prev, examinerMsg]);
        setCurrentPart(result.part);
        setQuestionCount((prev) => prev + 1);

        // Speak examiner response
        speakExaminerText(result.nextQuestion);
      } else {
        toast.error("Examiner could not respond. Please try again.");
      }
    } catch (err) {
      setIsExaminerThinking(false);
      console.error("[LiveExaminer error]", err);
      toast.error("Network issue. Please try again.");
    }
  };

  // End & Evaluate Test
  const handleFinishAndEvaluate = async () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsExaminerSpeaking(false);
    }
    if (isRecording && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setIsRecording(false);
    }

    const candidateReplies = messages.filter((m) => m.role === "candidate");
    if (candidateReplies.length === 0) {
      toast.error("Please answer at least one question before ending the exam.");
      return;
    }

    setIsEvaluating(true);
    const durationSeconds = Math.max(15, Math.floor((Date.now() - sessionStartTimeRef.current) / 1000));

    try {
      const res = await evaluateLiveSpeakingSessionAction({
        history: messages,
        durationSeconds,
      });

      setIsEvaluating(false);

      if (res.success) {
        setEvaluation(res.evaluation);
        setShowResultsModal(true);
      } else {
        toast.error("Failed to evaluate session: " + res.error);
      }
    } catch (err) {
      setIsEvaluating(false);
      console.error("[Evaluation Error]", err);
      toast.error("Could not complete evaluation. Please try again.");
    }
  };

  const handleRestartSession = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    sessionStartTimeRef.current = Date.now();
    setCurrentPart(1);
    setQuestionCount(1);
    setInterimTranscript("");
    setManualText("");
    setIsRecording(false);
    setIsExaminerThinking(false);
    setIsExaminerSpeaking(false);
    setMessages([
      {
        id: `init-${Date.now()}`,
        role: "examiner",
        text: INITIAL_EXAMINER_PROMPT,
        timestamp: Date.now(),
        part: 1,
      },
    ]);
    setTimeout(() => {
      speakExaminerText(INITIAL_EXAMINER_PROMPT);
    }, 400);
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const candidateAnswerCount = messages.filter((m) => m.role === "candidate").length;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-blue-200/80 dark:border-blue-800/50 bg-gradient-to-b from-white/90 via-sky-50/40 to-white/90 dark:from-slate-900/90 dark:via-slate-900/60 dark:to-slate-950/90 backdrop-blur-xl shadow-xl p-4 sm:p-6 mb-8">
      {/* Top Studio Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-blue-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          {/* Avatar with Pulsing Waves */}
          <div className="relative">
            <div
              className={`size-12 rounded-full bg-gradient-to-tr from-blue-700 via-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-md transition-all ${
                isExaminerSpeaking ? "ring-4 ring-blue-400/50 animate-pulse" : ""
              }`}
            >
              <Bot className="size-6" />
            </div>
            {isExaminerSpeaking && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white"></span>
              </span>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display font-bold text-base sm:text-lg text-blue-950 dark:text-blue-100">
                Examiner Sarah
              </h3>
              <Badge
                variant="outline"
                className="text-[10px] font-semibold uppercase tracking-wider bg-blue-100/60 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200/80"
              >
                Part {currentPart} of 3
              </Badge>
            </div>
            <p className="text-xs text-blue-900/70 dark:text-blue-300/70 flex items-center gap-1.5 mt-0.5">
              <Radio className="size-3 text-emerald-500 animate-pulse" />
              {isExaminerSpeaking
                ? "Examiner is speaking out loud..."
                : isExaminerThinking
                ? "Examiner is evaluating & preparing next question..."
                : isRecording
                ? "Listening to you speaking..."
                : "Awaiting your spoken response"}
            </p>
          </div>
        </div>

        {/* Studio Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (soundEnabled && typeof window !== "undefined" && "speechSynthesis" in window) {
                window.speechSynthesis.cancel();
                setIsExaminerSpeaking(false);
              }
              setSoundEnabled(!soundEnabled);
            }}
            title={soundEnabled ? "Mute Examiner Voice" : "Unmute Examiner Voice"}
            className="size-9 p-0 rounded-xl border-blue-200/80 text-blue-950 dark:text-blue-200"
          >
            {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4 text-muted-foreground" />}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRestartSession}
            title="Restart Interview"
            className="size-9 p-0 rounded-xl border-blue-200/80 text-blue-950 dark:text-blue-200"
          >
            <RotateCcw className="size-4" />
          </Button>

          <Button
            type="button"
            onClick={handleFinishAndEvaluate}
            disabled={candidateAnswerCount === 0 || isEvaluating}
            size="sm"
            className="gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow font-medium text-xs sm:text-sm px-3 sm:px-4"
          >
            {isEvaluating ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Evaluating...
              </>
            ) : (
              <>
                <Flag className="size-3.5" /> Finish & Get Score
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Live Conversation Transcript Area */}
      <div className="my-4 rounded-2xl border border-blue-100/80 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/50 backdrop-blur-md p-4 sm:p-5 h-[340px] sm:h-[390px] overflow-y-auto space-y-4 shadow-inner">
        {messages.map((msg) => {
          const isExaminer = msg.role === "examiner";
          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${isExaminer ? "justify-start" : "justify-end"}`}
            >
              {isExaminer && (
                <div className="size-8 rounded-full bg-blue-700 text-white flex items-center justify-center shrink-0 shadow-sm text-xs mt-0.5">
                  <Bot className="size-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3.5 sm:p-4 text-sm leading-relaxed shadow-sm transition-all ${
                  isExaminer
                    ? "bg-white dark:bg-slate-800/90 text-blue-950 dark:text-blue-100 border border-blue-100/90 dark:border-slate-700/80 rounded-tl-sm"
                    : "bg-blue-600 text-white rounded-tr-sm shadow-md"
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-1.5 text-[11px] opacity-75">
                  <span className="font-semibold">
                    {isExaminer ? "Examiner Sarah" : "You (Candidate)"}
                  </span>
                  {isExaminer && msg.part && (
                    <span className="text-[10px] bg-blue-50 dark:bg-blue-900/60 text-blue-700 dark:text-blue-200 px-1.5 py-0.2 rounded font-medium">
                      Part {msg.part}
                    </span>
                  )}
                </div>

                <p className="whitespace-pre-wrap">{msg.text}</p>

                {isExaminer && (
                  <button
                    type="button"
                    onClick={() => speakExaminerText(msg.text)}
                    className="mt-2 text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                  >
                    <Volume2 className="size-3" /> Replay voice
                  </button>
                )}
              </div>

              {!isExaminer && (
                <div className="size-8 rounded-full bg-blue-100 dark:bg-blue-900/80 text-blue-900 dark:text-blue-200 flex items-center justify-center shrink-0 text-xs mt-0.5 border border-blue-200">
                  <User className="size-4" />
                </div>
              )}
            </div>
          );
        })}

        {/* Real-time Candidate Spoken Transcript Preview */}
        {isRecording && (
          <div className="flex items-start gap-3 justify-end animate-in fade-in duration-200">
            <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl p-3.5 bg-blue-500/10 dark:bg-blue-900/30 border border-blue-300/80 dark:border-blue-700 text-blue-950 dark:text-blue-100 rounded-tr-sm">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-600 dark:text-rose-400 mb-1">
                <span className="size-2 rounded-full bg-rose-500 animate-ping inline-block" />
                <span>Listening live ({formatTimer(recordingSeconds)})...</span>
              </div>
              <p className="text-sm italic">
                {interimTranscript || "Speak now... your answer is being recognized in real time."}
              </p>
            </div>
            <div className="size-8 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 border border-rose-200">
              <Mic className="size-4 animate-pulse" />
            </div>
          </div>
        )}

        {/* Examiner Thinking Indicator */}
        {isExaminerThinking && (
          <div className="flex items-start gap-3 justify-start animate-in fade-in duration-200">
            <div className="size-8 rounded-full bg-blue-700 text-white flex items-center justify-center shrink-0">
              <Bot className="size-4" />
            </div>
            <div className="rounded-2xl p-3.5 bg-white dark:bg-slate-800 border border-blue-100 dark:border-slate-700 text-blue-900/70 dark:text-blue-200 text-xs flex items-center gap-2 rounded-tl-sm shadow-sm">
              <Loader2 className="size-4 animate-spin text-blue-600" />
              <span>Examiner Sarah is formulating your next question...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Microphone Control Area & Soundwaves */}
      <div className="flex flex-col items-center justify-center pt-2">
        {/* Pulsing Recording Visualizer */}
        {isRecording && (
          <div className="flex items-center gap-1.5 mb-3 h-8">
            <div className="w-1.5 h-4 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-1.5 h-7 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-1.5 h-5 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            <div className="w-1.5 h-8 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: "75ms" }} />
            <div className="w-1.5 h-6 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: "225ms" }} />
            <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 ml-2">
              {formatTimer(recordingSeconds)} · Speak naturally
            </span>
          </div>
        )}

        {/* Central Voice Control Button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleRecording}
            disabled={isExaminerThinking || isEvaluating}
            className={`group relative flex items-center gap-2.5 px-6 py-3.5 rounded-2xl font-semibold text-sm transition-all duration-300 shadow-lg ${
              isRecording
                ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/30 ring-4 ring-rose-400/40 scale-105"
                : "bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white shadow-blue-500/20 hover:scale-102"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isRecording ? (
              <>
                <MicOff className="size-5 animate-pulse" />
                <span>Tap to Stop & Submit Answer</span>
              </>
            ) : (
              <>
                <Mic className="size-5" />
                <span>Start Speaking (Microphone)</span>
              </>
            )}
          </button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowManualInput(!showManualInput)}
            title="Toggle text input for silent demo"
            className="text-xs text-blue-900/80 dark:text-blue-300 gap-1 rounded-xl hover:bg-blue-100/50"
          >
            <Keyboard className="size-3.5" />
            <span className="hidden sm:inline">{showManualInput ? "Hide text bar" : "Type answer"}</span>
          </Button>
        </div>

        {/* Fallback / Silent Demo Text Input */}
        {showManualInput && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (manualText.trim()) {
                handleCandidateAnswer(manualText);
              }
            }}
            className="w-full max-w-xl mt-3 flex items-center gap-2 animate-in fade-in duration-200"
          >
            <Input
              type="text"
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Or type your response here (for silent demo / presentation)..."
              disabled={isExaminerThinking || isEvaluating}
              className="rounded-xl border-blue-200 bg-white dark:bg-slate-900 text-xs sm:text-sm text-blue-950 dark:text-blue-100 shadow-sm focus-visible:ring-blue-500"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!manualText.trim() || isExaminerThinking || isEvaluating}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3 shrink-0"
            >
              <Send className="size-4" />
            </Button>
          </form>
        )}

        <div className="mt-3 flex items-center gap-3 text-[11px] text-blue-900/60 dark:text-blue-300/60">
          <span className="flex items-center gap-1">
            <Clock className="size-3 text-blue-500" /> Real-time official timing
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Sparkles className="size-3 text-blue-500" /> GoPrep-style live conversational AI
          </span>
        </div>
      </div>

      {/* Results Assessment Modal */}
      <LiveExaminerResultsModal
        open={showResultsModal}
        onOpenChange={setShowResultsModal}
        evaluation={evaluation}
        onRestart={handleRestartSession}
      />
    </div>
  );
}
