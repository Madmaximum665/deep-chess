import { useRef, useState, useEffect } from "react";

const DEPTH_MAP: Record<string, number> = {
  Easy: 2,
  Medium: 10,
  Hard: 20,
};

export function useStockfish() {
  const workerRef = useRef<Worker | null>(null);
  const resolveRef = useRef<((move: string | null) => void) | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    const worker = new Worker("/stockfish.js");
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const msg: string = typeof e.data === "string" ? e.data : e.data?.toString() ?? "";
      if (msg === "uciok" || msg === "readyok") {
        setIsReady(true);
      }
      if (msg.startsWith("bestmove") && resolveRef.current) {
        const parts = msg.split(" ");
        const move = parts[1];
        resolveRef.current(move === "(none)" ? null : move);
        resolveRef.current = null;
        setIsThinking(false);
      }
    };

    worker.onerror = () => {
      if (resolveRef.current) {
        resolveRef.current(null);
        resolveRef.current = null;
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

  function getBestMove(fen: string, difficulty: string): Promise<string | null> {
    if (!workerRef.current) return Promise.resolve(null);
    setIsThinking(true);
    return new Promise((resolve) => {
      workerRef.current!.postMessage("stop");
      setTimeout(() => {
        resolveRef.current = resolve;
        workerRef.current!.postMessage(`position fen ${fen}`);
        workerRef.current!.postMessage(`go depth ${DEPTH_MAP[difficulty] ?? 10}`);
      }, 50);
    });
  }

  function stopSearch() {
    workerRef.current?.postMessage("stop");
  }

  return { getBestMove, stopSearch, isReady, isThinking };
}
