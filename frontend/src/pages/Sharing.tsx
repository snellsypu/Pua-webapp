// Bouquets: groups you share your planner with. Each bouquet has its own code and its own
// choice of what's shared (view-only, plus optional shopping edits). Joining another
// bouquet never removes you from the first.
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { usePaywall, usePremium } from "@/components/Paywall";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Copy, Eye, Link2, LogOut, Pause, Pencil, Plus, QrCode, RefreshCw, Sparkles, Trash2, UserMinus, UserPlus } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from "@/lib/api";
import type { Bouquet, BouquetUpdate, ShareCategory, SharingState } from "@/lib/types";
import { Avatar } from "@/components/AccountButton";
import { Flower, flowerFor } from "@/components/Flower";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FriendColorPicker } from "@/components/FriendColorPicker";

export const SHARE_LABELS: Record<ShareCategory, string> = {
  appointments: "Appointments", reminders: "Reminders", habits: "Habits",
  routines: "Routines", meals: "Meal plan", shopping: "Shopping list",
};
const ALL = Object.keys(SHARE_LABELS) as ShareCategory[];
const fmtCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;
export const inviteLink = (code: string) => `${window.location.origin}/join/${fmtCode(code)}`;

const errText = (e: unknown) =>
  e instanceof ApiError && e.body && typeof e.body === "object" && "detail" in e.body
    ? String((e.body as { detail: unknown }).detail) : "Something went wrong";

function useSharingMutations() {
  const qc = useQueryClient();
  const set = (s: SharingState) => {
    qc.setQueryData(["sharing"], s);
    qc.invalidateQueries({ queryKey: ["friends-calendar"] });
  };
  const wrap = <V,>(fn: (v: V) => Promise<SharingState>, ok?: (v: V) => string) => ({
    mutationFn: fn,
    onSuccess: (s: SharingState, v: V) => { set(s); if (ok) toast.success(ok(v)); },
    onError: (e: unknown) => toast.error(errText(e)),
  });
  return { wrap };
}

function BouquetCard({ b }: { b: Bouquet }) {
  const { wrap } = useSharingMutations();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(b.name);
  const update = useMutation(wrap((u: BouquetUpdate) => apiPut<SharingState>(`/sharing/bouquets/${b.id}`, u)));
  const regen = useMutation(wrap(() => apiPost<SharingState>(`/sharing/bouquets/${b.id}/code`), () => `New code for ${b.name} — the old one no longer works`));
  const del = useMutation(wrap(() => apiDelete<SharingState>(`/sharing/bouquets/${b.id}`), () => `${b.name} removed`));
  const remove = useMutation(wrap((id: string) => apiDelete<SharingState>(`/sharing/bouquets/${b.id}/members/${id}`), () => "Removed from this bouquet"));
  const [confirmDel, setConfirmDel] = useState(false);

  const selected = new Set(b.categories);
  const everything = ALL.every((c) => selected.has(c));
  const toggle = (c: ShareCategory, on: boolean) => update.mutate({ categories: ALL.filter((x) => (x === c ? on : selected.has(x))) });
  const copy = async () => {
    try { await navigator.clipboard.writeText(b.code); toast.success(`${b.name} code copied`); }
    catch { toast.error("Couldn't copy — select the code and copy it"); }
  };
  const tid = `bouquet-${b.id}`;
  const [qr, setQr] = useState(false);
  const openPaywall = usePaywall();
  const premium = usePremium();
  const invite = async () => {
    const url = inviteLink(b.code);
    const text = `Join my ${b.name} bouquet on PUA`;
    if (navigator.share) {
      try { await navigator.share({ title: "PUA bouquet invite", text, url }); return; }
      catch (e) { if (e instanceof DOMException && e.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); toast.success("Invite link copied — send it to anyone you want in this bouquet"); }
    catch { toast.error("Couldn't copy the link"); }
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}>
      <Card data-testid={tid} className="overflow-hidden">
        <CardHeader className="flex flex-row flex-wrap items-center gap-3">
          <Flower kind={flowerFor(b.id)} className="size-9 shrink-0" />
          <div className="min-w-0 flex-1">
            {editing ? (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { update.mutate({ name: name.trim() }); setEditing(false); } }}>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus className="h-8" data-testid={`${tid}-name-input`} />
                <Button type="submit" size="sm" disabled={!name.trim()} data-testid={`${tid}-name-save`}>Save</Button>
              </form>
            ) : (
              <CardTitle className="flex items-center gap-1.5 font-heading text-lg" data-testid={`${tid}-name`}>
                {b.name}
                <button type="button" className="rounded p-1 text-muted-foreground transition-colors duration-150 hover:text-foreground" aria-label="Rename"
                  onClick={() => { setName(b.name); setEditing(true); }} data-testid={`${tid}-rename`}><Pencil className="size-3.5" /></button>
              </CardTitle>
            )}
            <CardDescription>{premium.data?.active ? `${b.members.length} ${b.members.length === 1 ? "person" : "people"}` : `${b.members.length + 1}/${premium.data?.freeGroupSize ?? 6} people incl. you`} · {b.categories.length ? `${b.categories.length} shared` : "nothing shared yet"}</CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="select-all rounded-xl border bg-muted/40 px-3 py-1.5 font-mono text-base font-bold tracking-[0.2em]" data-testid={`${tid}-code`}>{fmtCode(b.code)}</span>
            <Button size="sm" onClick={() => void invite()} data-testid={`${tid}-invite`} title={inviteLink(b.code)}><Link2 className="size-4" /> Invite link</Button>
            <Button size="icon-sm" variant="outline" aria-label="Show QR code" onClick={() => setQr(true)} data-testid={`${tid}-qr`}><QrCode className="size-4" /></Button>
            <Button size="icon-sm" variant="outline" aria-label="Copy code" onClick={() => void copy()} data-testid={`${tid}-copy`}><Copy className="size-4" /></Button>
            <Button size="icon-sm" variant="outline" aria-label="New code" title="New code — members stay" onClick={() => regen.mutate(undefined)} disabled={regen.isPending}
              data-testid={`${tid}-regenerate`}><RefreshCw className="size-4" /></Button>
          </div>
        </CardHeader>
        {b.paused && (
          <div className="mx-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-400/10 px-3 py-2.5 text-sm" data-testid={`${tid}-paused`}>
            <Pause className="size-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <span className="min-w-0 flex-1">Paused — without Premium only your first bouquet works. Its people can&apos;t see anything until you upgrade.</span>
            <Button size="sm" onClick={() => openPaywall("More than 2 bouquets")} data-testid={`${tid}-unlock`}><Sparkles className="size-4" /> Unlock</Button>
          </div>
        )}
        <CardContent className="grid gap-5 md:grid-cols-5">
          <div className="space-y-2 md:col-span-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What this bouquet sees</p>
            <label htmlFor={`${tid}-everything`} className="flex items-center gap-2.5 rounded-xl border bg-muted/30 px-3 py-2 text-sm font-medium">
              <Checkbox id={`${tid}-everything`} checked={everything} disabled={update.isPending}
                onCheckedChange={(c) => update.mutate({ categories: c === true ? ALL : [] })} data-testid={`${tid}-share-everything`} />
              Everything
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ALL.map((c) => (
                <label key={c} htmlFor={`${tid}-share-${c}`} className="flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm">
                  <Checkbox id={`${tid}-share-${c}`} checked={selected.has(c)} disabled={update.isPending}
                    onCheckedChange={(v) => toggle(c, v === true)} data-testid={`${tid}-share-${c}`} />
                  {SHARE_LABELS[c]}
                </label>
              ))}
            </div>
            {selected.has("shopping") && (
              <label htmlFor={`${tid}-shopping-edit`} className="flex items-start gap-2.5 rounded-xl border border-dashed px-3 py-2 text-sm">
                <Checkbox id={`${tid}-shopping-edit`} className="mt-0.5" checked={b.shoppingEdit} disabled={update.isPending}
                  onCheckedChange={(v) => update.mutate({ shoppingEdit: v === true })} data-testid={`${tid}-shopping-edit`} />
                <span><span className="block font-medium">Can tick off &amp; add shopping items</span>
                  <span className="block text-xs text-muted-foreground">Everything else stays view-only.</span></span>
              </label>
            )}
          </div>
          <div className="space-y-2 md:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">People</p>
            {b.members.length ? (
              <ul className="divide-y rounded-xl border" data-testid={`${tid}-members`}>
                {b.members.map((p) => (
                  <li key={p.user_id} className="flex items-center gap-2.5 px-3 py-2" data-testid={`${tid}-member-${p.user_id}`}>
                    <Avatar name={p.name} picture={p.picture} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{p.email}</span></span>
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${p.name}`} onClick={() => remove.mutate(p.user_id)} disabled={remove.isPending}
                      data-testid={`${tid}-member-remove-${p.user_id}`}><UserMinus className="size-4" /></Button>
                  </li>
                ))}
              </ul>
            ) : <p className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground" data-testid={`${tid}-members-empty`}>Share the code above to invite people.</p>}
            <div className="flex justify-end pt-1">
              {confirmDel ? (
                <span className="flex items-center gap-2 text-xs">
                  Delete {b.name}?
                  <Button size="xs" variant="destructive" onClick={() => del.mutate(undefined)} disabled={del.isPending} data-testid={`${tid}-delete-confirm`}>Delete</Button>
                  <Button size="xs" variant="ghost" onClick={() => setConfirmDel(false)} data-testid={`${tid}-delete-cancel`}>Keep</Button>
                </span>
              ) : (
                <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setConfirmDel(true)} data-testid={`${tid}-delete`}>
                  <Trash2 className="size-3.5" /> Delete bouquet
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <Dialog open={qr} onOpenChange={setQr}>
        <DialogContent className="sm:max-w-sm" data-testid={`${tid}-qr-dialog`}>
          <DialogHeader>
            <DialogTitle className="font-heading">Scan to join {b.name}</DialogTitle>
            <DialogDescription>Point a phone camera at the code — it opens PUA and joins this bouquet.</DialogDescription>
          </DialogHeader>
          <div className="mx-auto rounded-3xl border bg-white p-4 shadow-sm">
            <QRCodeSVG value={inviteLink(b.code)} size={232} level="H" fgColor="#0b4f49" marginSize={0} data-testid={`${tid}-qr-code`}
              imageSettings={{ src: "/favicon.svg", height: 46, width: 46, excavate: true }} />
          </div>
          <p className="text-center font-mono text-lg font-bold tracking-[0.2em]">{fmtCode(b.code)}</p>
          <Button variant="outline" onClick={() => void invite()} data-testid={`${tid}-qr-share`}><Link2 className="size-4" /> Share the link instead</Button>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

export default function Sharing() {
  const state = useQuery({ queryKey: ["sharing"], queryFn: () => apiGet<SharingState>("/sharing") });
  const s = state.data;
  const qc = useQueryClient();
  const { wrap } = useSharingMutations();
  const [newName, setNewName] = useState("");
  const [code, setCode] = useState("");
  const openPaywall = usePaywall();
  const premium = usePremium();
  const create = useMutation({
    ...wrap((n: string) => apiPost<SharingState>("/sharing/bouquets", { name: n }), (n) => `${n} bouquet made — share its code`),
    onError: (e: unknown) => (e instanceof ApiError && e.status === 402 ? openPaywall("More than 2 bouquets") : toast.error(errText(e))),
    onSuccess: (s: SharingState, n: string) => { qc.setQueryData(["sharing"], s); setNewName(""); toast.success(`${n} bouquet made — share its code`); },
  });
  const atLimit = !!s && !premium.data?.active && s.bouquets.length >= (premium.data?.freeBouquets ?? 2);
  const join = useMutation({
    ...wrap((c: string) => apiPost<SharingState>("/sharing/join", { code: c }), () => "Joined! Their planner is below"),
    onSettled: () => setCode(""),
  });
  const leave = useMutation(wrap((id: string) => apiDelete<SharingState>(`/sharing/joined/${id}`), () => "Left that planner"));

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="sharing-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Bouquets</h1>
          <p className="mt-1 max-w-xl text-muted-foreground">
            Make a bouquet for each group — family, flatmates, work — and choose what each one sees. Every bouquet has its own code.
            Appointments marked Private show as &ldquo;Unavailable&rdquo;.
          </p>
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) create.mutate(newName.trim()); }}>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New bouquet, e.g. Family" maxLength={40} className="w-56" data-testid="bouquet-new-input" />
          <Button type="submit" disabled={!newName.trim() || create.isPending} data-testid="bouquet-new-button">
            {atLimit ? <Sparkles className="size-4" /> : <Plus className="size-4" />} Make
          </Button>
        </form>
        {atLimit && (
          <p className="w-full text-right text-xs text-muted-foreground" data-testid="bouquet-limit-note">
            Free plan: 1 bouquet of up to 6 people. <button type="button" className="font-medium text-primary underline" onClick={() => openPaywall("More than 2 bouquets")} data-testid="bouquet-limit-upgrade">Go Premium</button> for more.
          </p>
        )}
      </header>

      <div className="space-y-4" data-testid="bouquets-list">
        <AnimatePresence initial={false}>
          {s?.bouquets.map((b) => <BouquetCard key={b.id} b={b} />)}
        </AnimatePresence>
        {s && !s.bouquets.length && (
          <div className="flex items-center gap-4 rounded-3xl border border-dashed p-6" data-testid="bouquets-empty">
            <Flower kind="hibiscus" className="size-10 shrink-0" />
            <p className="text-sm text-muted-foreground">No bouquets yet. Name one above (like &ldquo;Family&rdquo;), tick what it can see, then send its code to the people in it.</p>
          </div>
        )}
      </div>

      <Card data-testid="joined-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading"><UserPlus className="size-4" /> Planners shared with you</CardTitle>
          <CardDescription>Open an invite link or enter a bouquet code to join it. Joining another bouquet keeps you in the ones you&apos;re already in.</CardDescription>
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
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground" data-testid={`joined-bouquets-${p.user_id}`}>
                      {p.bouquets.map((n, i) => (
                        <span key={p.bouquetIds[i] ?? n} className="inline-flex items-center gap-1"><Flower kind={flowerFor(p.bouquetIds[i])} className="size-3.5" />{n}</span>
                      ))}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.categories.length ? p.categories.map((c) => SHARE_LABELS[c]).join(" · ") : "Nothing shared yet"}
                      {p.shoppingEdit && " · you can edit shopping"}
                    </span>
                  </span>
                  {p.categories.includes("appointments") && (
                    <FriendColorPicker ownerId={p.user_id} name={p.name.split(" ")[0]} color={p.color} bouquetId={p.bouquetIds[0]} bouquetName={p.bouquets[0]} />
                  )}
                  <Link to={`/shared/${p.user_id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90"
                    data-testid={`joined-open-${p.user_id}`}><Eye className="size-4" /> View</Link>
                  <Button variant="ghost" size="icon-sm" aria-label="Leave" title="Leave all their bouquets" onClick={() => leave.mutate(p.user_id)} disabled={leave.isPending}
                    data-testid={`joined-leave-${p.user_id}`}><LogOut className="size-4" /></Button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground" data-testid="joined-empty">You haven&apos;t joined any bouquets yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
