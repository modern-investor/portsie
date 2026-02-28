"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface Props {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  loading: boolean;
}

export function ArchChat({ messages, onSend, loading }: Props) {
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    onSend(msg);
  }

  return (
    <div className="flex flex-col h-full border border-gray-200 rounded-lg bg-white">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Diagram Editor
        </span>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">
            Describe changes to the architecture diagram.
            <br />
            <span className="text-gray-300">e.g. &quot;Add a Redis cache between LLM and Database&quot;</span>
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-xs leading-relaxed ${
              m.role === "user"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700"
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 text-gray-400 animate-spin" />
              <span className="text-xs text-gray-400">Modifying diagram...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-gray-100 p-2 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe a change..."
          disabled={loading}
          className="flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm
                     placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400
                     disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-white disabled:opacity-40
                     hover:bg-gray-700 transition-colors"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
