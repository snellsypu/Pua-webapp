import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Check, Plus, Trash2 } from "lucide-react";
import { apiDelete, apiPatch, apiPost } from "@/lib/api";
import type { Reminder } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ReminderList({
  reminders,
  loading,
  quickAddDate,
  emptyLabel = "No reminders",
}: {
  reminders?: Reminder[];
  loading?: boolean;
  quickAddDate?: string;
  emptyLabel?: string;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["overview"] });
    qc.invalidateQueries({ queryKey: ["range"] });
  };

  const toggle = useMutation({
    mutationFn: (r: Reminder) => apiPatch<Reminder>(`/reminders/${r.id}`, { done: !r.done }),
    onSuccess: invalidate,
    onError: () => toast.error("Could not update reminder"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/reminders/${id}`),
    onSuccess: invalidate,
    onError: () => toast.error("Could not delete reminder"),
  });
  const add = useMutation({
    mutationFn: () =>
      apiPost<Reminder>("/reminders", { title: title.trim(), date: quickAddDate!, time: "08:00" }),
    onSuccess: () => {
      setTitle("");
      invalidate();
      toast.success("Reminder added");
    },
    onError: () => toast.error("Could not add reminder"),
  });

  const submit = () => {
    if (title.trim()) add.mutate();
  };

  return (
    <div className="space-y-2" data-testid="reminder-list">
      {loading && <div className="h-16 animate-pulse rounded-xl bg-muted" />}
      {!loading && !reminders?.length && (
        <p className="text-sm text-muted-foreground" data-testid="reminders-empty">
          {emptyLabel}
        </p>
      )}
      <ul className="space-y-1.5">
        {(reminders ?? []).map((r) => (
          <li key={r.id} className="flex items-center gap-2.5" data-testid={`reminder-item-${r.id}`}>
            <Checkbox
              checked={r.done}
              onCheckedChange={() => toggle.mutate(r)}
              data-testid={`reminder-check-${r.id}`}
              aria-label={`Mark ${r.title} ${r.done ? "not done" : "done"}`}
            />
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm transition-all",
                r.done && "text-muted-foreground line-through opacity-60",
              )}
            >
              {r.title}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{r.time}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Delete ${r.title}`}
              data-testid={`reminder-delete-${r.id}`}
              onClick={() => remove.mutate(r.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      {quickAddDate && (
        <div className="flex gap-2 pt-1">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Add a reminder…"
            data-testid="reminder-add-input"
          />
          <Button
            size="icon"
            variant="outline"
            data-testid="reminder-add-button"
            aria-label="Add reminder"
            onClick={submit}
            disabled={!title.trim() || add.isPending}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
