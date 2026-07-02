'use client';

import React, { useEffect, useRef, useState } from 'react';
import { PerformanceMonitor } from '@/lib/performance-monitor';

export function FPSMeter() {
  const [fps, setFps] = useState(60);
  const [visible, setVisible] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const isDevEnv =
    process.env.NEXT_PUBLIC_APP_ENV === "development" || process.env.NODE_ENV === "development";

  useEffect(() => {
    // Only show in development
    if (!isDevEnv) {
      return;
    }

    lastTimeRef.current = performance.now();

    const updateFPS = () => {
      const now = performance.now();
      lastTimeRef.current = now;

      PerformanceMonitor.updateFPS();
      setFps(Math.round(PerformanceMonitor.getFPS()));

      animationFrameRef.current = requestAnimationFrame(updateFPS);
    };

    animationFrameRef.current = requestAnimationFrame(updateFPS);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isDevEnv]);

  // Toggle visibility with 'F' key
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        setVisible((v) => !v);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  if (!visible || !isDevEnv) {
    return null;
  }

  const getColor = () => {
    if (fps >= 50) return 'text-green-600';
    if (fps >= 30) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="fixed bottom-4 right-4 rounded-lg border border-gray-300 bg-gray-900 p-3 text-sm font-mono text-white shadow-lg z-40">
      <div className={`${getColor()} font-bold`}>{fps} FPS</div>
      <div className="text-xs text-gray-400 mt-1">Press &apos;F&apos; to toggle</div>
    </div>
  );
}
