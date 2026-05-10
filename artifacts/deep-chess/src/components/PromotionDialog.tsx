interface PromotionDialogProps {
  playerColor: "white" | "black";
  onSelect: (piece: "q" | "r" | "b" | "n") => void;
  onCancel: () => void;
}

const PIECES: Array<{ value: "q" | "r" | "b" | "n"; label: string; white: string; black: string }> = [
  { value: "q", label: "Queen", white: "♛", black: "♛" },
  { value: "r", label: "Rook", white: "♜", black: "♜" },
  { value: "b", label: "Bishop", white: "♝", black: "♝" },
  { value: "n", label: "Knight", white: "♞", black: "♞" },
];

export default function PromotionDialog({ playerColor, onSelect, onCancel }: PromotionDialogProps) {
  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 rounded-xl">
      <div className="bg-[#1a1a2e] border border-[#2a2d4a] rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
        <h3 className="text-white font-bold text-center text-lg">Promote Pawn</h3>
        <div className="flex gap-3">
          {PIECES.map((p) => (
            <button
              key={p.value}
              onClick={() => onSelect(p.value)}
              className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[#16213e] border border-[#2a2d4a] hover:border-indigo-500 hover:bg-indigo-950/40 transition-all duration-150 group"
            >
              <span
                className={`text-4xl ${playerColor === "white" ? "text-white" : "text-[#8b8fa8]"}`}
              >
                {playerColor === "white" ? p.white : p.black}
              </span>
              <span className="text-xs text-[#8b8fa8] group-hover:text-indigo-400">{p.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="text-sm text-[#8b8fa8] hover:text-white transition-colors text-center"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
