import { useRef, useState, useEffect, useCallback } from "react";

const DEPTH_MAP: Record<string, number> = {
  Easy: 2,
  Medium: 10,
  Hard: 20,
};

export function useStockfish() {
  const workerRef = useRef<Worker | null>(null);
  const resolveRef = useRef<((move: string | null) => void) | null>(null);
  const isReadyRef = useRef(false);
  const pendingRef = useRef<{ fen: string; depth: number } | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    const worker = new Worker("/stockfish.js");
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const msg: string =
        typeof e.data === "string" ? e.data : e.data?.toString() ?? "";

      if (msg === "uciok" || msg === "readyok") {
        isReadyRef.current = true;
        setIsReady(true);

        // If a move was requested before the engine was ready, send it now
        if (pendingRef.current) {
          const { fen, depth } = pendingRef.current;
          pendingRef.current = null;
          worker.postMessage(`position fen ${fen}`);
          worker.postMessage(`go depth ${depth}`);
        }
      }

      if (msg.startsWith("bestmove") && resolveRef.current) {
        const parts = msg.split(" ");
        const move = parts[1];
        const resolve = resolveRef.current;
        resolveRef.current = null;
        setIsThinking(false);
        resolve(move === "(none)" ? null : move);
      }
    };

    worker.onerror = () => {
      if (resolveRef.current) {
        const resolve = resolveRef.current;
        resolveRef.current = null;
        resolve(null);
      }
      setIsThinking(false);
    };

    worker.postMessage("uci");
    worker.postMessage("isready");

    return () => {
      worker.postMessage("quit");
      worker.terminate();
    };
  }, []);

  const getBestMove = useCallback(
    (fen: string, difficulty: string): Promise<string | null> => {
      return new Promise((resolve) => {
        const worker = workerRef.current;
        if (!worker) {
          resolve(null);
          return;
        }

        // If there's already a pending search, cancel it and reject the old promise
        if (resolveRef.current) {
          const oldResolve = resolveRef.current;
          resolveRef.current = null;
          worker.postMessage("stop");
          oldResolve(null);
        }

        const depth = DEPTH_MAP[difficulty] ?? 10;
        setIsThinking(true);
        resolveRef.current = resolve;

        if (!isReadyRef.current) {
          // Engine not ready yet — queue the request
          pendingRef.current = { fen, depth };
          return;
        }

        worker.postMessage("stop");
        // Small delay to let the stop command be processed before sending new position
        setTimeout(() => {
          if (resolveRef.current !== resolve) return; // was superseded
          worker.postMessage(`position fen ${fen}`);
          worker.postMessage(`go depth ${depth}`);
        }, 50);
      });
    },
    []
  );

  const stopSearch = useCallback(() => {
    workerRef.current?.postMessage("stop");
    if (resolveRef.current) {
      const resolve = resolveRef.current;
      resolveRef.current = null;
      resolve(null);
    }
    setIsThinking(false);
  }, []);

  return { getBestMove, stopSearch, isReady, isThinking };
}
