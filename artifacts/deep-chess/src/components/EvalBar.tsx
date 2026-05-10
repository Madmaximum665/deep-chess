interface EvalBarProps {
  evaluation: number;
  playerColor: "white" | "black";
  boardHeight?: number;
}

export default function EvalBar({ evaluation, playerColor, boardHeight = 480 }: EvalBarProps) {
  // evaluation is in centipawns from white's perspective
  // clamp to ±1000 cp for display
  const clamped = Math.max(-1000, Math.min(1000, evaluation));
  // percentage white occupies (top = black, bottom = white when white plays down)
  const whitePct = 50 + (clamped / 1000) * 50;

  const evalText =
    Math.abs(evaluation) >= 10000
      ? evaluation > 0
        ? "M"
        : "-M"
      : Math.abs(evaluation) >= 100
      ? `${(evaluation / 100).toFixed(1)}`
      : `${(evaluation / 100).toFixed(2)}`;

  return (
    <div className="flex flex-col items-center gap-1 select-none" title={`Evaluation: ${evalText}`}>
      <div className="text-xs text-[#8b8fa8] font-mono">{evaluation > 0 ? `+${evalText}` : evalText}</div>
      <div
        className="w-5 rounded-full overflow-hidden relative"
        style={{ height: boardHeight }}
      >
        {/* Black portion */}
        <div
          className="absolute top-0 left-0 right-0 bg-[#2a2d4a] transition-all duration-500 rounded-t-full"
          style={{
            height: `${playerColor === "white" ? 100 - whitePct : whitePct}%`,
          }}
        />
        {/* White portion */}
        <div
          className="absolute bottom-0 left-0 right-0 bg-white transition-all duration-500 rounded-b-full"
          style={{
            height: `${playerColor === "white" ? whitePct : 100 - whitePct}%`,
          }}
        />
        {/* Center line */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-[#8b8fa8] opacity-50" />
      </div>
    </div>
  );
}
