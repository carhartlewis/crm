import { Kbd } from "@crm/ui/components/kbd";
import { cn } from "cn";
import type { ReactNode } from "react";

export interface QuestionOption {
  readonly id: string;
  /** One to four words, such as "Yes, add all six". */
  readonly label: string;
  /** What happens with this answer, in one sentence. */
  readonly description?: string;
}

/**
 * A question the agent waits on, as in T3 Code: the question, then one row per answer with its
 * label and what it does, numbered for the 1–9 keys. The first answer is the agent's
 * recommendation, so it leads. The person can always type their own answer in the composer
 * instead.
 */
export function QuestionCard({
  question,
  title,
  options,
  onAnswer,
}: {
  question: ReactNode;
  title?: string;
  options: readonly QuestionOption[];
  onAnswer: (optionId: string) => void;
}) {
  return (
    <section
      aria-label={title ?? "Question"}
      data-slot="question-card"
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground select-none"
    >
      <div className="flex flex-col gap-0.5 p-4 pb-3">
        {title && <p className="text-xs font-medium text-muted-foreground">{title}</p>}
        <p className="text-sm font-medium text-pretty text-foreground select-text">{question}</p>
      </div>
      <div className="flex flex-col gap-1 px-2 pb-2">
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onAnswer(option.id)}
            className={cn(
              "flex w-full min-w-0 items-start gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
              index === 0 && "bg-muted/60",
            )}
          >
            {index < 9 && <Kbd className="mt-px shrink-0">{index + 1}</Kbd>}
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium text-foreground">{option.label}</span>
              {option.description && option.description !== option.label && (
                <span className="text-xs text-pretty text-muted-foreground">
                  {option.description}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
