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

  const { getBestMove, stopSearch, isReady, isThinking } = useStockfish();
  const statusRef = useRef(status);
  statusRef.current = status;

  // Board width: measured from container ref
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(480);
  useEffect(() => {
    if (!boardContainerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setBoardWidth(Math.floor(w));
      }
    });
    ro.observe(boardContainerRef.current);
    return () => ro.disconnect();
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

      const result = chess.move({ from, to, promotion });
      if (result === null) return;

      setFen(chess.fen());
      setLastMove({ from, to });
      setMoveHistory((prev) => [...prev, result.san]);
      updateCheckHighlight();

      // Update evaluation after bot move
      const evalFen = chess.fen();
      getBestMove(evalFen, currentDifficulty).then(() => {
        // We don't actually use this for eval, we use a rough estimate
      });

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

    const result = chess.move({ from, to, promotion });
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
    if (statusRef.current !== "playing") return;
    if (chess.turn() !== playerColor[0]) return;

    // Case A: already selected and this is a legal target
    if (selectedSquare && legalMoveSquares[square]) {
      makePlayerMove(selectedSquare, square);
      return;
    }

    // Case B: clicking own piece
    const piece = chess.get(square as Parameters<typeof chess.get>[0]);
    if (piece && piece.color === playerColor[0]) {
      getLegalMovesForSquare(square);
      return;
    }

    // Case C: anything else
    clearSelection();
  }

  function onPieceDrop(sourceSquare: string, targetSquare: string, piece: string): boolean {
    if (statusRef.current !== "playing") return false;
    if (chess.turn() !== playerColor[0]) return false;

    const pieceColor = piece[0];
    if (pieceColor !== playerColor[0]) return false;

    const movingPiece = chess.get(sourceSquare as Parameters<typeof chess.get>[0]);
    const isPromotion =
      movingPiece?.type === "p" &&
      ((playerColor === "white" && targetSquare[1] === "8") ||
        (playerColor === "black" && targetSquare[1] === "1"));

    if (isPromotion) {
      setPromotionMove({ from: sourceSquare, to: targetSquare });
      return false;
    }

    return makePlayerMove(sourceSquare, targetSquare);
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

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[#2a2d4a]">
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
          <div
            className={`w-2 h-2 rounded-full ${isReady ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`}
          />
          <span className="text-xs text-[#8b8fa8]">{isReady ? "Engine ready" : "Loading engine..."}</span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row items-start justify-center gap-4 p-3 lg:p-5 overflow-hidden">
        {/* Board + eval bar */}
        <div className="flex items-start gap-2 flex-shrink-0">
          <EvalBar evaluation={evaluation} playerColor={playerColor} boardHeight={boardWidth} />

          {/* Board container — ref measures the actual available space */}
          <div
            ref={boardContainerRef}
            className="relative"
            style={{ width: "min(calc(100vw - 320px), calc(100vh - 100px))", maxWidth: 520 }}
          >
            <Chessboard
              position={fen}
              onPieceDrop={onPieceDrop}
              onSquareClick={onSquareClick}
              boardOrientation={boardOrientation}
              customSquareStyles={customSquareStyles}
              animationDuration={200}
              boardWidth={boardWidth}
              customDarkSquareStyle={{ backgroundColor: "#4a4a8a" }}
              customLightSquareStyle={{ backgroundColor: "#d4d4f0" }}
            />

            {/* Promotion dialog */}
            {promotionMove && (
              <PromotionDialog
                playerColor={playerColor}
                onSelect={onPromotionSelect}
                onCancel={onPromotionCancel}
              />
            )}

            {/* Game over overlay */}
            {status === "gameover" && gameResult && (
              <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center rounded-sm gap-4">
                <div className="text-center">
                  <div className="text-4xl mb-2">
                    {gameResult === "You Win!" ? "🏆" : gameResult === "Bot Wins!" ? "😔" : "🤝"}
                  </div>
                  <h2 className="text-white text-2xl font-black">{gameResult}</h2>
                </div>
                <button
                  onClick={() => newGame()}
                  className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors"
                >
                  Play Again
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="w-full lg:w-72 flex-shrink-0 flex flex-col gap-4">
          <ControlsPanel
            difficulty={difficulty}
            playerColor={playerColor}
            status={status}
            moveHistory={moveHistory}
            evaluation={evaluation}
            isThinking={isThinking}
            onDifficultyChange={(d) => {
              setDifficulty(d);
              newGame(playerColor, d);
            }}
            onColorChange={(c) => setPlayerColor(c)}
            onNewGame={() => newGame()}
            onFlip={() => setBoardOrientation((o) => (o === "white" ? "black" : "white"))}
            onUndo={undoMove}
            onHint={getHint}
          />
        </div>
      </div>
    </div>
  );
}
