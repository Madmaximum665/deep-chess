interface ControlsPanelProps {
  difficulty: string;
  playerColor: "white" | "black";
  status: "playing" | "thinking" | "gameover";
  moveHistory: string[];
  evaluation: number;
  isThinking: boolean;
  onDifficultyChange: (d: string) => void;
  onColorChange: (c: "white" | "black") => void;
  onNewGame: () => void;
  onFlip: () => void;
  onUndo: () => void;
  onHint: () => void;
}

export default function ControlsPanel({
  difficulty,
  playerColor,
  status,
  moveHistory,
  isThinking,
  onDifficultyChange,
  onColorChange,
  onNewGame,
  onFlip,
  onUndo,
  onHint,
}: ControlsPanelProps) {
  const pairs: Array<[string, string | null]> = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    pairs.push([moveHistory[i], moveHistory[i + 1] ?? null]);
  }

  const statusText = () => {
    if (status === "thinking" || isThinking) return "Bot is thinking...";
    if (status === "gameover") return "Game over";
    return "Your turn";
  };

  return (
    <div className="flex flex-col gap-4">

      {/* Status — desktop only (mobile has its own bar) */}
      <div className={`hidden lg:flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-semibold text-center transition-all ${
        status === "thinking" || isThinking
          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
          : status === "gameover"
          ? "bg-red-500/20 text-red-400 border border-red-500/30"
          : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
      }`}>
        {(status === "thinking" || isThinking) && (
          <span className="inline-block w-2 h-2 bg-amber-400 rounded-full mr-2 animate-pulse" />
        )}
        {statusText()}
      </div>

      {/* Difficulty */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-[#8b8fa8] block mb-2">
          Difficulty
        </label>
        <div className="flex gap-1 bg-[#0f0f23] p-1 rounded-xl border border-[#2a2d4a]">
          {["Easy", "Medium", "Hard"].map((d) => (
            <button
              key={d}
              onClick={() => onDifficultyChange(d)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                difficulty === d
                  ? "bg-indigo-600 text-white shadow"
                  : "text-[#8b8fa8] hover:text-white active:bg-[#1e2a4a]"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Color */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-[#8b8fa8] block mb-2">
          Play as
        </label>
        <div className="flex gap-1 bg-[#0f0f23] p-1 rounded-xl border border-[#2a2d4a]">
          {(["white", "black"] as const).map((c) => (
            <button
              key={c}
              onClick={() => onColorChange(c)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 capitalize ${
                playerColor === c
                  ? c === "white"
                    ? "bg-slate-100 text-slate-900 shadow"
                    : "bg-slate-800 text-white shadow border border-slate-600"
                  : "text-[#8b8fa8] hover:text-white active:bg-[#1e2a4a]"
              }`}
            >
              {c === "white" ? "⬜ White" : "⬛ Black"}
            </button>
          ))}
        </div>
      </div>

      {/* Action buttons — desktop only (mobile has quick bar) */}
      <div className="hidden lg:grid grid-cols-2 gap-2">
        <button
          onClick={onNewGame}
          className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
        >
          New Game
        </button>
        <button
          onClick={onFlip}
          className="py-2.5 px-3 rounded-xl bg-[#16213e] hover:bg-[#1e2a4a] border border-[#2a2d4a] text-white text-sm font-semibold transition-colors"
        >
          Flip Board
        </button>
        <button
          onClick={onUndo}
          disabled={moveHistory.length < 2 || status !== "playing"}
          className="py-2.5 px-3 rounded-xl bg-[#16213e] hover:bg-[#1e2a4a] border border-[#2a2d4a] text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Undo
        </button>
        <button
          onClick={onHint}
          disabled={status !== "playing" || isThinking}
          className="py-2.5 px-3 rounded-xl bg-[#16213e] hover:bg-[#1e2a4a] border border-[#2a2d4a] text-amber-400 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Hint
        </button>
      </div>

      {/* Move history */}
      <div className="flex flex-col">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8b8fa8] mb-2 px-1">
          Move History
        </h3>
        <div
          className="overflow-y-auto rounded-lg bg-[#0f0f23] border border-[#2a2d4a]"
          style={{ maxHeight: 280 }}
        >
          {pairs.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-[#8b8fa8] text-sm">
              No moves yet
            </div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {pairs.map(([white, black], i) => (
                  <tr
                    key={i}
                    className={`border-b border-[#2a2d4a] last:border-0 ${
                      i === pairs.length - 1 ? "bg-indigo-950/30" : ""
                    }`}
                  >
                    <td className="px-2 py-1.5 text-[#8b8fa8] w-8 text-right font-mono text-xs">
                      {i + 1}.
                    </td>
                    <td className="px-2 py-1.5 text-white font-mono font-medium w-1/2">
                      {white}
                    </td>
                    <td className="px-2 py-1.5 text-[#c4c8e0] font-mono w-1/2">
                      {black ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Mobile new game button at bottom of controls tab */}
      <button
        onClick={onNewGame}
        className="lg:hidden w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold transition-colors"
      >
        New Game
      </button>
    </div>
  );
}
