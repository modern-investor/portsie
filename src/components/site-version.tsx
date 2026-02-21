"use client";

import { useEffect, useState, useRef } from "react";
import {
  fetchVersionInfo,
  getModelName,
  formatRelease,
  type VersionInfo,
} from "@/lib/version-info";

export function SiteVersion({ className = "" }: { className?: string }) {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [showModal, setShowModal] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchVersionInfo().then(setInfo);
  }, []);

  if (!info) return <span data-site-version className={className} />;

  return (
    <>
      <span
        data-site-version
        className={`inline-block cursor-pointer font-mono text-xs opacity-50 hover:opacity-100 transition-opacity relative group ${className}`}
        onClick={() => setShowModal(true)}
        title={`${info.version} | ${formatRelease(info.release)} | ${getModelName(info.model)}`}
      >
        {info.version}
        <div
          ref={tooltipRef}
          className="absolute bottom-full left-0 mb-1 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-50 pointer-events-none"
        >
          <div>{info.version}</div>
          <div>{formatRelease(info.release)}</div>
          <div>by {info.actor} via {getModelName(info.model)}</div>
          <div>on {info.machine}</div>
        </div>
      </span>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Build Info</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Version</dt>
                <dd className="font-mono">{info.version}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Release</dt>
                <dd className="font-mono">{formatRelease(info.release)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">SHA</dt>
                <dd className="font-mono">{info.sha}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Actor</dt>
                <dd>{info.actor}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Model</dt>
                <dd>{getModelName(info.model)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Source</dt>
                <dd>{info.source}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Machine</dt>
                <dd>{info.machine}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Pushed</dt>
                <dd>{new Date(info.pushedAt).toLocaleString()}</dd>
              </div>
            </dl>

            {info.commits.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <h3 className="text-sm font-medium mb-2">
                  Commits ({info.commits.length})
                </h3>
                <ul className="space-y-1 text-xs max-h-40 overflow-y-auto">
                  {info.commits.map((c) => (
                    <li key={c.sha} className="flex gap-2">
                      <span className="font-mono text-gray-400 shrink-0">
                        {c.short_sha}
                      </span>
                      <span className="truncate">{c.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
