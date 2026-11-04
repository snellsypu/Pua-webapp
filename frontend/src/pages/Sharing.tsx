// Sharing & friends: your friend code, what friends may see (view-only), who's viewing,
// and joining someone else's planner with their code.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Eye, KeyRound, LogOut, RefreshCw, UserMinus, UserPlus, Users } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from "@/lib/api";
import type { ShareCategory, SharingState } from "@/lib/types";
import { Avatar } from "@/components/AccountButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export const SHARE_LABELS: Record<ShareCategory, string> = {
  appointments: "Appointments", reminders: "Reminders", habits: "Habits",
  routines: "Routines", meals: "Meal plan", shopping: "Shopping list",
};
const ALL = Object.keys(SHARE_LABELS) as ShareCategory[];

const errText = (e: unknown) =>
  e instanceof ApiError && e.body && typeof e.body === "object" && "detail" in e.body
    ? String((e.body as { detail: unknown }).detail) : "Something went wrong";

export default function Sharing() {
  const qc = useQueryClient();
  const state = useQuery({ queryKey: ["sharing"], queryFn: () => apiGet<SharingState>("/sharing") });
  const [code, setCode] = useState("");
  const set = (s: SharingState) => qc.setQueryData(["sharing"], s);
  const m = (fn: () => Promise<SharingState>, ok: string) => ({
    mutationFn: fn,
    onSuccess: (s: SharingState) => { set(s); toast.success(ok); },
    onError: (e: unknown) => toast.error(errText(e)),
  });

  const cats = useMutation({
    mutationFn: (c: ShareCategory[]) => apiPut<SharingState>("/sharing/categories", { categories: c }),
    onSuccess: set,
    onError: (e) => toast.error(errText(e)),
  });
  const shopEdit = useMutation({
    mutationFn: (enabled: boolean) => apiPut<SharingState>("/sharing/shopping-edit", { enabled }),
    onSuccess: (st, enabled) => { set(st); toast.success(enabled ? "Friends can now tick off and add shopping items" : "Shopping list is view-only for friends"); },
    onError: (e) => toast.error(errText(e)),
  });
  const regen = useMutation(m(() => apiPost<SharingState>("/sharing/code/regenerate"), "New friend code — the old one no longer works"));
  const join = useMutation({
    mutationFn: (c: string) => apiPost<SharingState>("/sharing/join", { code: c }),
    onSuccess: (s) => { set(s); setCode(""); toast.success("Joined! Their shared planner is below"); },
    onError: (e) => toast.error(errText(e)),
  });
  const removeMember = useMutation({
    mutationFn: (id: string) => apiDelete<SharingState>(`/sharing/members/${id}`),
    onSuccess: (s) => { set(s); toast.success("Removed — they can no longer see your planner"); },
    onError: (e) => toast.error(errText(e)),
  });
  const leave = useMutation({
    mutationFn: (id: string) => apiDelete<SharingState>(`/sharing/joined/${id}`),
    onSuccess: (s) => { set(s); toast.success("Left that planner"); },
    onError: (e) => toast.error(errText(e)),
  });

  const s = state.data;
  const selected = new Set(s?.categories ?? []);
  const everything = ALL.every((c) => selected.has(c));
  const toggle = (c: ShareCategory, on: boolean) =>
    cats.mutate(ALL.filter((x) => (x === c ? on : selected.has(x))));
  const copy = async () => {
    if (!s) return;
    try { await navigator.clipboard.writeText(s.friendCode); toast.success("Friend code copied"); }
    catch { toast.error("Couldn't copy — select the code and copy it"); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="sharing-page">
      <header>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Sharing &amp; friends</h1>
        <p className="mt-1 text-muted-foreground">Give your friend code to people you trust. They can <b>view</b> the parts you choose — the shopping list is the only thing you can let them edit.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-5">
        <Card className="md:col-span-2" data-testid="friend-code-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading"><KeyRound className="size-4" /> Your friend code</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="select-all rounded-2xl border bg-muted/40 py-4 text-center font-mono text-3xl font-bold tracking-[0.25em]" data-testid="friend-code">
              {s ? `${s.friendCode.slice(0, 4)}-${s.friendCode.slice(4)}` : "····-····"}
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" size="sm" onClick={() => void copy()} disabled={!s} data-testid="friend-code-copy"><Copy className="size-4" /> Copy</Button>
              <Button variant="outline" size="sm" onClick={() => regen.mutate()} disabled={regen.isPending} data-testid="friend-code-regenerate"
                title="Make a new code; people already joined keep access"><RefreshCw className="size-4" /> New code</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3" data-testid="share-categories-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading"><Eye className="size-4" /> What friends can see</CardTitle>
            <CardDescription>You&apos;re the admin of your planner — this applies to everyone who joined with your code.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <label className="flex items-center gap-2.5 rounded-xl border bg-muted/30 px-3 py-2 text-sm font-medium" htmlFor="share-everything">
              <Checkbox id="share-everything" checked={everything} disabled={!s || cats.isPending}
                onCheckedChange={(c) => cats.mutate(c === true ? ALL : [])} data-testid="share-everything" />
              Everything
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ALL.map((c) => (
                <label key={c} htmlFor={`share-${c}`} className="flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm">
                  <Checkbox id={`share-${c}`} checked={selected.has(c)} disabled={!s || cats.isPending}
                    onCheckedChange={(v) => toggle(c, v === true)} data-testid={`share-${c}`} />
                  {SHARE_LABELS[c]}
                </label>
              ))}
            </div>
            {s && selected.has("shopping") && (
              <label htmlFor="share-shopping-edit" className="flex items-start gap-2.5 rounded-xl border border-dashed px-3 py-2 text-sm">
                <Checkbox id="share-shopping-edit" className="mt-0.5" checked={s.shoppingEdit} disabled={shopEdit.isPending}
                  onCheckedChange={(v) => shopEdit.mutate(v === true)} data-testid="share-shopping-edit" />
                <span><span className="block font-medium">Friends can tick off &amp; add shopping items</span>
                  <span className="block text-xs text-muted-foreground">Everything else stays view-only.</span></span>
              </label>
            )}
            <p className="text-xs text-muted-foreground" data-testid="share-private-hint">Appointments marked Private show to friends as &ldquo;Unavailable&rdquo;.</p>
            {s && selected.size === 0 && <p className="text-xs text-muted-foreground" data-testid="share-nothing">Nothing shared — friends who join see an empty page.</p>}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="members-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading"><Users className="size-4" /> People viewing your planner</CardTitle>
        </CardHeader>
        <CardContent>
          {s?.members.length ? (
            <ul className="divide-y" data-testid="members-list">
              {s.members.map((p) => (
                <li key={p.user_id} className="flex items-center gap-3 py-2" data-testid={`member-${p.user_id}`}>
                  <Avatar name={p.name} picture={p.picture} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{p.email}</span></span>
                  <Button variant="ghost" size="sm" onClick={() => removeMember.mutate(p.user_id)} disabled={removeMember.isPending}
                    data-testid={`member-remove-${p.user_id}`}><UserMinus className="size-4" /> Remove</Button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground" data-testid="members-empty">No one yet — share your code to invite someone.</p>}
        </CardContent>
      </Card>

      <Card data-testid="joined-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading"><UserPlus className="size-4" /> Planners shared with you</CardTitle>
          <CardDescription>Enter a friend&apos;s code to view their planner.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) join.mutate(code.trim()); }}>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD-2345" maxLength={16}
              className="font-mono tracking-widest" data-testid="join-code-input" />
            <Button type="submit" disabled={!code.trim() || join.isPending} data-testid="join-code-button">Join</Button>
          </form>
          {s?.joined.length ? (
            <ul className="grid gap-2" data-testid="joined-list">
              {s.joined.map((p) => (
                <li key={p.user_id} className="flex items-center gap-3 rounded-2xl border p-3" data-testid={`joined-${p.user_id}`}>
                  <Avatar name={p.name} picture={p.picture} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.categories.length ? p.categories.map((c) => SHARE_LABELS[c]).join(" · ") : "Nothing shared yet"}
                      {p.shoppingEdit && " · you can edit shopping"}
                    </span>
                  </span>
                  <Link to={`/shared/${p.user_id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90"
                    data-testid={`joined-open-${p.user_id}`}><Eye className="size-4" /> View</Link>
                  <Button variant="ghost" size="icon-sm" aria-label="Leave" onClick={() => leave.mutate(p.user_id)} disabled={leave.isPending}
                    data-testid={`joined-leave-${p.user_id}`}><LogOut className="size-4" /></Button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground" data-testid="joined-empty">You haven&apos;t joined anyone&apos;s planner yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
