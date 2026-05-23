'use client';

import { useState, useEffect } from 'react';

export default function ConnectionStatus({ wsConnected, error, hasPositions = true, loading = false, userDataConnected = false }) {
  const [statusPhase, setStatusPhase] = useState('ready'); // 'ready' | 'connecting' | 'retrying' | 'error'

  useEffect(() => {
    if (loading) {
      setStatusPhase('ready');
      return;
    }
    if (error) {
      setStatusPhase('error');
      return;
    }
    if (wsConnected) {
      setStatusPhase('ready'); // Live takes over via the wsConnected check below
      return;
    }
    if (!hasPositions) {
      setStatusPhase('ready');
      return;
    }

    // Has positions, not connected, no error → transitioning
    const timer5s = setTimeout(() => setStatusPhase('connecting'), 5000);
    const timer15s = setTimeout(() => setStatusPhase('retrying'), 15000);
    return () => {
      clearTimeout(timer5s);
      clearTimeout(timer15s);
    };
  }, [loading, hasPositions, wsConnected, error]);

  // Still fetching initial REST data — show nothing yet
  if (loading) return null;

  if (error) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30"
        title={error}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        Error
      </span>
    );
  }

  if (wsConnected) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30"
        title={`${userDataConnected ? 'Prices + Balance live via WebSocket' : 'Real-time prices via WebSocket'}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        Live{userDataConnected ? ' ●' : ''}
      </span>
    );
  }

  // No open positions → no WebSocket needed
  if (!hasPositions) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30"
        title="Balance loaded from REST API"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
        Ready
      </span>
    );
  }

  // Still within first 5s — show "Ready" to avoid flash
  if (statusPhase === 'ready') {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30"
        title="Balance loaded, connecting live feed..."
      >
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
        Ready
      </span>
    );
  }

  // 5s–15s — still trying initial connection
  if (statusPhase === 'connecting') {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
        title="Connecting to live price feed..."
      >
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
        Connecting
      </span>
    );
  }

  // 15s+ — retrying repeatedly (WebSocket is struggling)
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/20 text-orange-400 border border-orange-500/30"
      title="Live feed reconnecting — prices may be stale. Check console for details."
    >
      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
      Retrying
    </span>
  );
}
