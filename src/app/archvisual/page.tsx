"use client";

import { useState, useCallback } from "react";
import { DataFlowDiagram } from "../dashboard/components/data-flow-diagram";
import { ArchChat, type ChatMessage } from "./components/arch-chat";
import { DEFAULT_DIAGRAM, type DiagramData } from "@/lib/archvisual/types";
import { RotateCcw } from "lucide-react";

export default function ArchVisualPage() {
  const [diagram, setDiagram] = useState<DiagramData>(DEFAULT_DIAGRAM);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSend = useCallback(async (message: string) => {
    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: message, timestamp: Date.now() }]);
    setLoading(true);

    try {
      const resp = await fetch("/api/archvisual/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagramData: diagram, message }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${data.error}`, timestamp: Date.now() },
        ]);
        return;
      }

      setDiagram(data.diagramData);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Diagram updated.", timestamp: Date.now() },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Failed: ${err instanceof Error ? err.message : String(err)}`, timestamp: Date.now() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [diagram]);

  const handleReset = useCallback(() => {
    setDiagram(DEFAULT_DIAGRAM);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Diagram reset to default.", timestamp: Date.now() },
    ]);
  }, []);

  return (
    <div className="flex h-screen bg-white">
      {/* Diagram panel */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
        <div className="w-full max-w-2xl">
          <DataFlowDiagram data={diagram} />
        </div>
      </div>

      {/* Chat sidebar */}
      <div className="w-80 flex flex-col border-l border-gray-200 bg-gray-50/50">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
          <span className="text-xs font-medium text-gray-400">archvisual</span>
          <button
            onClick={handleReset}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Reset diagram"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <ArchChat messages={messages} onSend={handleSend} loading={loading} />
        </div>
      </div>
    </div>
  );
}
