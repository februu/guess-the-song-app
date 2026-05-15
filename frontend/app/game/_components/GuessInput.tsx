"use client";

interface Props {
  onGuess: (guess: string) => void;
  submitted: boolean;
  correct: boolean | null;
  points?: number;
  disabled?: boolean;
}

export function GuessInput({ onGuess, submitted, correct, points, disabled }: Props) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const val = (e.target as HTMLInputElement).value.trim();
      if (val) onGuess(val);
    }
  }

  function handleClick(e: React.MouseEvent) {
    const input = (e.currentTarget.parentElement?.querySelector("input") as HTMLInputElement);
    if (input?.value.trim()) onGuess(input.value.trim());
  }

  if (submitted) {
    return (
      <div className={`rounded-[12px] px-5 py-4 text-sm font-semibold text-center ${
        correct
          ? "bg-green-500/20 text-green-600 dark:text-green-400"
          : "bg-red-500/20 text-red-500"
      }`}>
        {correct
          ? `✓ Correct! +${points ?? 0} points`
          : "✗ Wrong guess — keep listening!"}
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <input
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Type your guess…"
        maxLength={100}
        className="flex-1 rounded-[12px] px-4 py-3 text-sm outline-none bg-[oklch(0.88_0.005_272)] text-gray-800 placeholder:opacity-30 dark:bg-[oklch(0.2403_0.0137_272.76)] dark:text-white border border-transparent focus:border-white/20 disabled:opacity-40"
      />
      <button
        onClick={handleClick}
        disabled={disabled}
        className="rounded-[12px] px-5 py-3 text-sm font-semibold bg-green-500 text-white hover:bg-green-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Guess!
      </button>
    </div>
  );
}