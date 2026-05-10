import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

interface Stats {
  wins: number;
  losses: number;
  draws: number;
}

export default function Home() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ wins: 0, losses: 0, draws: 0 });

  useEffect(() => {
    const stored = localStorage.getItem("deepchess_stats");
    if (stored) {
      try {
        setStats(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
  }, []);

  const total = stats.wins + stats.losses + stats.draws;
  const winRate = total > 0 ? Math.round((stats.wins / total) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col items-center justify-center px-4">
      {/* Background grid effect */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-10 max-w-2xl w-full">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl shadow-lg shadow-indigo-500/30">
              ♟
            </div>
            <h1 className="text-5xl font-black tracking-tight text-white">
              Deep<span className="text-indigo-400">Chess</span>
            </h1>
          </div>
          <p className="text-[#8b8fa8] text-lg text-center">
            Challenge the machine. Master the board.
          </p>
        </div>

        {/* Stats card */}
        {total > 0 && (
          <div className="w-full bg-[#16213e] border border-[#2a2d4a] rounded-2xl p-6">
            <h2 className="text-[#8b8fa8] text-sm font-semibold uppercase tracking-wider mb-4">
              Your Record
            </h2>
            <div className="grid grid-cols-4 gap-4">
              <div className="flex flex-col items-center gap-1">
                <span className="text-3xl font-bold text-white">{total}</span>
                <span className="text-[#8b8fa8] text-xs">Games</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-3xl font-bold text-emerald-400">{stats.wins}</span>
                <span className="text-[#8b8fa8] text-xs">Wins</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-3xl font-bold text-red-400">{stats.losses}</span>
                <span className="text-[#8b8fa8] text-xs">Losses</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-3xl font-bold text-yellow-400">{stats.draws}</span>
                <span className="text-[#8b8fa8] text-xs">Draws</span>
              </div>
            </div>
            {total > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-[#8b8fa8] mb-1">
                  <span>Win rate</span>
                  <span>{winRate}%</span>
                </div>
                <div className="h-2 bg-[#2a2d4a] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-700"
                    style={{ width: `${winRate}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Play button */}
        <button
          onClick={() => navigate("/game")}
          className="group relative px-12 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl text-white text-xl font-bold shadow-lg shadow-indigo-500/40 hover:shadow-indigo-500/60 hover:scale-105 active:scale-95 transition-all duration-200"
        >
          <span className="relative z-10">Play Now</span>
          <div className="absolute inset-0 rounded-2xl bg-white opacity-0 group-hover:opacity-10 transition-opacity" />
        </button>

        {/* Feature pills */}
        <div className="flex flex-wrap gap-3 justify-center">
          {["Stockfish AI", "3 Difficulty Levels", "Move Analysis", "Hints"].map((f) => (
            <span
              key={f}
              className="px-3 py-1.5 bg-[#16213e] border border-[#2a2d4a] text-[#8b8fa8] text-sm rounded-full"
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
