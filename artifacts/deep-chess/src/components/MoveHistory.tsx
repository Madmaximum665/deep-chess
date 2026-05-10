import { useEffect, useRef } from "react";

interface MoveHistoryProps {
  moves: string[];
}

export default function MoveHistory({ moves }: MoveHistoryProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [moves]);

  // Group into pairs
  const pairs: Array<[string, string | null]> = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push([moves[i], moves[i + 1] ?? null]);
  }

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8b8fa8] mb-2 px-1">
        Move History
      </h3>
      <div className="flex-1 overflow-y-auto min-h-0 rounded-lg bg-[#0f0f23] border border-[#2a2d4a]">
        {pairs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#8b8fa8] text-sm py-4">
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
                  <td className="px-2 py-1 text-[#8b8fa8] w-8 text-right font-mono">
                    {i + 1}.
                  </td>
                  <td className="px-2 py-1 text-white font-mono font-medium w-1/2">
                    {white}
                  </td>
                  <td className="px-2 py-1 text-[#c4c8e0] font-mono w-1/2">
                    {black ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
