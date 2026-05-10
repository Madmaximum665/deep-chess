import { useState, useCallback, useEffect, useRef } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useNavigate } from "react-router-dom";
import { useStockfish } from "../hooks/useStockfish";
import ControlsPanel from "../components/ControlsPanel";
import EvalBar from "../components/EvalBar";
import PromotionDialog from "../components/PromotionDialog";

type GameStatus = "playing" | "thinking" | "gameover";
type PlayerColor = "white" | "black";

const SQUARES = [
  "a1","a2","a3","a4","a5","a6","a7","a8",
  "b1","b2","b3","b4","b5","b6","b7","b8",
  "c1","c2","c3","c4","c5","c6","c7","c8",
  "d1","d2","d3","d4","d5","d6","d7","d8",
  "e1","e2","e3","e4","e5","e6","e7","e8",
  "f1","f2","f3","f4","f5","f6","f7","f8",
  "g1","g2","g3","g4","g5","g6","g7","g8",
  "h1","h2","h3","h4","h5","h6","h7","h8",
] as const;

export default function Game() {
  const navigate = useNavigate();
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(new Chess().fen());
  const [status, setStatus] = useState<GameStatus>("playing");
  const [playerColor, setPlayerColor] = useState<PlayerColor>("white");
  const [boardOrientation, setBoardOrientation] = useState<PlayerColor>("white");
  const [difficulty, setDifficulty] = useState("Medium");
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoveSquares, setLegalMoveSquares] = useState<Record<string, object>>({});
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [gameResult, setGameResult] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState(0);
  const [hintSquares, setHintSquares] = useState<Record<string, object>>({});
  const [checkSquare, setCheckSquare] = useState<string | null>(null);
  const [promotionMove, setPromotionMove] = useState<{ from: string; to: string } | null>(null);
  // Mobile: toggle between board view and controls view
  const [mobileTab, setMobileTab] = useState<"board" | "controls">("board");

  const { getBestMove, stopSearch, isReady, isThinking } = useStockfish();
  const statusRef = useRef(status);
  statusRef.current = status;

  // Suppress the onSquareClick that fires after a drag-and-drop
  const justDroppedRef = useRef(false);

  // Board width — computed from window size, works for both mobile and desktop
  function calcBoardWidth() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w >= 1024) {
      // Desktop: leave room for controls panel (288px) + gaps + eval bar (28px)
      return Math.min(520, Math.floor(Math.min(w - 340, h - 120)));
    }
    // Mobile: full viewport width, capped by viewport height minus header/tabs/bar (~130px)
    return Math.min(w, h - 130);
  }

  const [boardWidth, setBoardWidth] = useState(() => calcBoardWidth());

  useEffect(() => {
    function handleResize() {
      setBoardWidth(calcBoardWidth());
    }
    window.addEventListener("resize", handleResize);
    // Also recalculate once after mount in case initial render was wrong
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function updateCheckHighlight() {
    if (chess.inCheck()) {
      const turn = chess.turn();
      for (const sq of SQUARES) {
        const piece = chess.get(sq);
        if (piece?.type === "k" && piece.color === turn) {
          setCheckSquare(sq);
          return;
        }
      }
    } else {
      setCheckSquare(null);
    }
  }

  function checkGameOver(): boolean {
    if (!chess.isGameOver()) return false;

    let result: string;
    if (chess.isCheckmate()) {
      result = chess.turn() === playerColor[0] ? "Bot Wins!" : "You Win!";
    } else if (chess.isStalemate()) {
      result = "Draw — Stalemate";
    } else if (chess.isThreefoldRepetition()) {
      result = "Draw — Repetition";
    } else if (chess.isInsufficientMaterial()) {
      result = "Draw — Insufficient Material";
    } else {
      result = "Draw";
    }

    setGameResult(result);
    setStatus("gameover");

    const stats = JSON.parse(
      localStorage.getItem("deepchess_stats") || '{"wins":0,"losses":0,"draws":0}'
    );
    if (result === "You Win!") stats.wins++;
    else if (result === "Bot Wins!") stats.losses++;
    else if (result.includes("Draw")) stats.draws++;
    localStorage.setItem("deepchess_stats", JSON.stringify(stats));

    return true;
  }

  const botMove = useCallback(
    async (currentDifficulty: string) => {
      const currentFen = chess.fen();
      const uci = await getBestMove(currentFen, currentDifficulty);

      if (uci === null) {
        checkGameOver();
        return;
      }

      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci[4] : "q";

      let result;
      try {
        result = chess.move({ from, to, promotion });
      } catch {
        result = null;
      }
      if (result === null) return;

      setFen(chess.fen());
      setLastMove({ from, to });
      setMoveHistory((prev) => [...prev, result.san]);
      updateCheckHighlight();

      if (checkGameOver()) return;
      setStatus("playing");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chess, getBestMove]
  );

  const newGame = useCallback(
    (color?: PlayerColor, diff?: string) => {
      const pc = color ?? playerColor;
      const d = diff ?? difficulty;
      stopSearch();
      chess.reset();
      setFen(chess.fen());
      setStatus("playing");
      setSelectedSquare(null);
      setLegalMoveSquares({});
      setLastMove(null);
      setMoveHistory([]);
      setGameResult(null);
      setEvaluation(0);
      setHintSquares({});
      setCheckSquare(null);
      setPromotionMove(null);
      setMobileTab("board");

      if (pc === "black") {
        setTimeout(() => botMove(d), 300);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playerColor, difficulty, chess, stopSearch, botMove]
  );

  // When player color changes, start a new game
  useEffect(() => {
    setBoardOrientation(playerColor);
    newGame(playerColor, difficulty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerColor]);

  function clearSelection() {
    setSelectedSquare(null);
    setLegalMoveSquares({});
  }

  function getLegalMovesForSquare(square: string) {
    const moves = chess.moves({ square: square as Parameters<typeof chess.moves>[0]["square"], verbose: true });
    if (moves.length === 0) {
      clearSelection();
      return;
    }
    setSelectedSquare(square);
    const highlights: Record<string, object> = {};
    highlights[square] = { background: "rgba(255,255,0,0.4)" };
    moves.forEach((m) => {
      highlights[m.to] = chess.get(m.to)
        ? { background: "radial-gradient(circle, rgba(255,0,0,0.4) 70%, transparent 70%)" }
        : { borderRadius: "50%", background: "radial-gradient(circle, rgba(0,0,0,0.2) 40%, transparent 40%)" };
    });
    setLegalMoveSquares(highlights);
  }

  function makePlayerMove(from: string, to: string, promotion: string = "q"): boolean {
    if (statusRef.current !== "playing") return false;

    let result;
    try {
      result = chess.move({ from, to, promotion });
    } catch {
      result = null;
    }
    if (result === null) return false;

    clearSelection();
    setFen(chess.fen());
    setLastMove({ from, to });
    setMoveHistory((prev) => [...prev, result.san]);
    updateCheckHighlight();
    setHintSquares({});

    if (checkGameOver()) return true;

    setStatus("thinking");
    const d = difficulty;
    setTimeout(() => botMove(d), 0);
    return true;
  }

  function onSquareClick(square: string) {
    if (justDroppedRef.current) {
      justDroppedRef.current = false;
      return;
    }
    if (statusRef.current !== "playing") return;
    if (chess.turn() !== playerColor[0]) return;

    if (selectedSquare && legalMoveSquares[square]) {
      makePlayerMove(selectedSquare, square);
      return;
    }

    const piece = chess.get(square as Parameters<typeof chess.get>[0]);
    if (piece && piece.color === playerColor[0]) {
      getLegalMovesForSquare(square);
      return;
    }

    clearSelection();
  }

  function onPieceDrop(sourceSquare: string, targetSquare: string, pieceType: string): boolean {
    if (statusRef.current !== "playing") return false;
    if (!targetSquare) return false;
    if (chess.turn() !== playerColor[0]) return false;

    const pieceColor = pieceType[0].toLowerCase();
    if (pieceColor !== playerColor[0]) return false;

    const movingPiece = chess.get(sourceSquare as Parameters<typeof chess.get>[0]);
    const isPromotion =
      movingPiece?.type === "p" &&
      ((playerColor === "white" && targetSquare[1] === "8") ||
        (playerColor === "black" && targetSquare[1] === "1"));

    if (isPromotion) {
      justDroppedRef.current = true;
      setPromotionMove({ from: sourceSquare, to: targetSquare });
      return false;
    }

    const success = makePlayerMove(sourceSquare, targetSquare);
    justDroppedRef.current = true;
    return success;
  }

  function onPromotionSelect(piece: "q" | "r" | "b" | "n") {
    if (!promotionMove) return;
    makePlayerMove(promotionMove.from, promotionMove.to, piece);
    setPromotionMove(null);
  }

  function onPromotionCancel() {
    setPromotionMove(null);
  }

  function undoMove() {
    if (status !== "playing") return;
    if (moveHistory.length < 2) return;
    chess.undo();
    chess.undo();
    setFen(chess.fen());
    setMoveHistory((prev) => prev.slice(0, -2));
    setLastMove(null);
    clearSelection();
    updateCheckHighlight();
    setStatus("playing");
  }

  async function getHint() {
    if (status !== "playing") return;
    const uci = await getBestMove(chess.fen(), "Hard");
    if (uci === null) return;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    setHintSquares({
      [from]: { background: "rgba(0, 255, 0, 0.5)" },
      [to]: { background: "rgba(0, 255, 0, 0.3)" },
    });
    setTimeout(() => setHintSquares({}), 2000);
  }

  const customSquareStyles: Record<string, object> = {
    ...(lastMove
      ? {
          [lastMove.from]: { background: "rgba(155, 199, 0, 0.41)" },
          [lastMove.to]: { background: "rgba(155, 199, 0, 0.41)" },
        }
      : {}),
    ...legalMoveSquares,
    ...(selectedSquare ? { [selectedSquare]: { background: "rgba(255, 255, 0, 0.5)" } } : {}),
    ...(checkSquare ? { [checkSquare]: { background: "rgba(255, 0, 0, 0.6)" } } : {}),
    ...hintSquares,
  };

  const statusText = status === "thinking" || isThinking
    ? "Bot is thinking..."
    : status === "gameover"
    ? gameResult ?? "Game over"
    : "Your turn";

  return (
    <div className="h-screen bg-[#1a1a2e] flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-[#2a2d4a] flex-shrink-0">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-white hover:text-indigo-400 transition-colors"
        >
          <span className="text-xl">♟</span>
          <span className="font-black text-lg">
            Deep<span className="text-indigo-400">Chess</span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isReady ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
          <span className="text-xs text-[#8b8fa8] hidden sm:inline">
            {isReady ? "Engine ready" : "Loading engine..."}
          </span>
        </div>
      </header>

      {/* ── Mobile status bar ── */}
      <div className={`lg:hidden flex-shrink-0 px-4 py-1.5 text-xs font-semibold text-center transition-all ${
        status === "thinking" || isThinking
          ? "bg-amber-500/20 text-amber-400"
          : status === "gameover"
          ? "bg-red-500/20 text-red-400"
          : "bg-emerald-500/20 text-emerald-400"
      }`}>
        {(status === "thinking" || isThinking) && (
          <span className="inline-block w-1.5 h-1.5 bg-amber-400 rounded-full mr-1.5 animate-pulse" />
        )}
        {statusText}
      </div>

      {/* ── Desktop layout ── */}
      <div className="hidden lg:flex flex-1 items-start justify-center gap-4 p-5 overflow-hidden">
        {/* Board + eval bar */}
        <div className="flex items-start gap-2 flex-shrink-0">
          <EvalBar evaluation={evaluation} playerColor={playerColor} boardHeight={boardWidth} />
          <div
            className="relative"
            style={{ width: boardWidth, height: boardWidth }}
          >
            <Chessboard
              options={{
                position: fen,
                boardOrientation,
                squareStyles: customSquareStyles,
                animationDurationInMs: 200,
                darkSquareStyle: { backgroundColor: "#4a4a8a" },
                lightSquareStyle: { backgroundColor: "#d4d4f0" },
                boardStyle: { width: boardWidth, height: boardWidth },
                onSquareClick: ({ square }) => onSquareClick(square),
                onPieceDrop: ({ sourceSquare, targetSquare, piece }) =>
                  onPieceDrop(sourceSquare, targetSquare ?? "", piece.pieceType),
              }}
            />
            {promotionMove && (
              <PromotionDialog playerColor={playerColor} onSelect={onPromotionSelect} onCancel={onPromotionCancel} />
            )}
            {status === "gameover" && gameResult && (
              <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center rounded-sm gap-4">
                <div className="text-center">
                  <div className="text-4xl mb-2">
                    {gameResult === "You Win!" ? "🏆" : gameResult === "Bot Wins!" ? "😔" : "🤝"}
                  </div>
                  <h2 className="text-white text-2xl font-black">{gameResult}</h2>
                </div>
                <button onClick={() => newGame()} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors">
                  Play Again
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Controls */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-4">
          <ControlsPanel
            difficulty={difficulty}
            playerColor={playerColor}
            status={status}
            moveHistory={moveHistory}
            evaluation={evaluation}
            isThinking={isThinking}
            onDifficultyChange={(d) => { setDifficulty(d); newGame(playerColor, d); }}
            onColorChange={(c) => setPlayerColor(c)}
            onNewGame={() => newGame()}
            onFlip={() => setBoardOrientation((o) => (o === "white" ? "black" : "white"))}
            onUndo={undoMove}
            onHint={getHint}
          />
        </div>
      </div>

      {/* ── Mobile layout ── */}
      <div className="lg:hidden flex flex-col flex-1 overflow-hidden">

        {/* Mobile tab switcher */}
        <div className="flex border-b border-[#2a2d4a] flex-shrink-0">
          <button
            onClick={() => setMobileTab("board")}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${
              mobileTab === "board"
                ? "text-indigo-400 border-b-2 border-indigo-400"
                : "text-[#8b8fa8]"
            }`}
          >
            Board
          </button>
          <button
            onClick={() => setMobileTab("controls")}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${
              mobileTab === "controls"
                ? "text-indigo-400 border-b-2 border-indigo-400"
                : "text-[#8b8fa8]"
            }`}
          >
            Controls {moveHistory.length > 0 && `(${moveHistory.length})`}
          </button>
        </div>

        {/* Board tab */}
        {mobileTab === "board" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Board fills full width */}
            <div
              className="relative"
              style={{ width: boardWidth, height: boardWidth }}
            >
              <Chessboard
                options={{
                  position: fen,
                  boardOrientation,
                  squareStyles: customSquareStyles,
                  animationDurationInMs: 200,
                  darkSquareStyle: { backgroundColor: "#4a4a8a" },
                  lightSquareStyle: { backgroundColor: "#d4d4f0" },
                  boardStyle: { width: boardWidth, height: boardWidth },
                  onSquareClick: ({ square }) => onSquareClick(square),
                  onPieceDrop: ({ sourceSquare, targetSquare, piece }) =>
                    onPieceDrop(sourceSquare, targetSquare ?? "", piece.pieceType),
                }}
              />
              {promotionMove && (
                <PromotionDialog playerColor={playerColor} onSelect={onPromotionSelect} onCancel={onPromotionCancel} />
              )}
              {status === "gameover" && gameResult && (
                <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-4">
                  <div className="text-center">
                    <div className="text-4xl mb-2">
                      {gameResult === "You Win!" ? "🏆" : gameResult === "Bot Wins!" ? "😔" : "🤝"}
                    </div>
                    <h2 className="text-white text-2xl font-black">{gameResult}</h2>
                  </div>
                  <button onClick={() => newGame()} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors">
                    Play Again
                  </button>
                </div>
              )}
            </div>

            {/* Quick action bar below board on mobile */}
            <div className="flex gap-2 px-3 py-2 border-t border-[#2a2d4a] flex-shrink-0">
              <button
                onClick={() => newGame()}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-semibold transition-colors"
              >
                New Game
              </button>
              <button
                onClick={() => setBoardOrientation((o) => (o === "white" ? "black" : "white"))}
                className="flex-1 py-2.5 rounded-xl bg-[#16213e] border border-[#2a2d4a] text-white text-sm font-semibold transition-colors active:bg-[#1e2a4a]"
              >
                Flip
              </button>
              <button
                onClick={undoMove}
                disabled={moveHistory.length < 2 || status !== "playing"}
                className="flex-1 py-2.5 rounded-xl bg-[#16213e] border border-[#2a2d4a] text-white text-sm font-semibold transition-colors active:bg-[#1e2a4a] disabled:opacity-40"
              >
                Undo
              </button>
              <button
                onClick={getHint}
                disabled={status !== "playing" || isThinking}
                className="flex-1 py-2.5 rounded-xl bg-[#16213e] border border-[#2a2d4a] text-amber-400 text-sm font-semibold transition-colors active:bg-[#1e2a4a] disabled:opacity-40"
              >
                Hint
              </button>
            </div>
          </div>
        )}

        {/* Controls tab */}
        {mobileTab === "controls" && (
          <div className="flex-1 overflow-y-auto p-3">
            <ControlsPanel
              difficulty={difficulty}
              playerColor={playerColor}
              status={status}
              moveHistory={moveHistory}
              evaluation={evaluation}
              isThinking={isThinking}
              onDifficultyChange={(d) => { setDifficulty(d); newGame(playerColor, d); }}
              onColorChange={(c) => setPlayerColor(c)}
              onNewGame={() => { newGame(); setMobileTab("board"); }}
              onFlip={() => setBoardOrientation((o) => (o === "white" ? "black" : "white"))}
              onUndo={undoMove}
              onHint={getHint}
            />
          </div>
        )}
      </div>
    </div>
  );
}
