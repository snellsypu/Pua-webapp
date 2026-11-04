// Settings: who can sign in. The owner adds/removes Google emails; others can view.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Crown, UserPlus, Users, X } from "lucide-react";
import { apiDelete, apiGet, apiPost, ApiError } from "@/lib/api";
import type { AccessList } from "@/lib/types";
import { useMe } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function AccessCard() {
  const qc = useQueryClient();
  const me = useMe();
  const owner = !!me.data?.isOwner;
  const access = useQuery({ queryKey: ["access"], queryFn: () => apiGet<AccessList>("/auth/access") });
  const [email, setEmail] = useState("");

  const onDone = (msg: string) => (a: AccessList) => {
    qc.setQueryData(["access"], a);
    toast.success(msg);
  };
  const onErr = (e: unknown) =>
    toast.error(e instanceof ApiError && e.status === 422 ? "That doesn't look like an email address" : "Could not update access");
  const add = useMutation({
    mutationFn: (e: string) => apiPost<AccessList>("/auth/access", { email: e }),
    onSuccess: (a, e) => {
      onDone(`${e} can now sign in`)(a);
      setEmail("");
    },
    onError: onErr,
  });
  const remove = useMutation({
    mutationFn: (e: string) => apiDelete<AccessList>(`/auth/access/${encodeURIComponent(e)}`),
    onSuccess: (a, e) => onDone(`${e} removed`)(a),
    onError: onErr,
  });

  return (
    <Card id="access" data-testid="access-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading">
          <Users className="size-4" /> Who has access
        </CardTitle>
        <CardDescription>
          Everyone listed signs in with Google and shares this planner. Anyone else is turned away.
          {!owner && " Only the owner can change the list."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y rounded-xl border" data-testid="access-list">
          {access.data?.emails.map((e) => (
            <li key={e} className="flex items-center gap-2 px-3 py-2 text-sm" data-testid={`access-row-${e}`}>
              <span className="flex-1 truncate">{e}</span>
              {e === access.data?.owner ? (
                <span className="flex items-center gap-1 text-xs font-medium text-primary"><Crown className="size-3.5" /> Owner</span>
              ) : (
                owner && (
                  <Button variant="ghost" size="icon-xs" aria-label={`Remove ${e}`} disabled={remove.isPending}
                    onClick={() => remove.mutate(e)} data-testid={`access-remove-${e}`}>
                    <X className="size-3.5" />
                  </Button>
                )
              )}
            </li>
          ))}
        </ul>
        {owner && (
          <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); if (email.trim()) add.mutate(email.trim()); }}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com"
              data-testid="access-email-input" />
            <Button type="submit" size="sm" variant="outline" disabled={!email.trim() || add.isPending} data-testid="access-add-button">
              <UserPlus className="size-4" /> Add
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
