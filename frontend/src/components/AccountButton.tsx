// Header account button: avatar → name/email + sign out.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LogOut, Users } from "lucide-react";
import { apiPost } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export function Avatar({ name, picture, size = 7 }: { name: string; picture: string; size?: number }) {
  const cls = size === 7 ? "size-7" : "size-10";
  return picture ? (
    <img src={picture} alt="" referrerPolicy="no-referrer" className={`${cls} rounded-full object-cover ring-2 ring-background`} />
  ) : (
    <span className={`${cls} grid place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function AccountButton() {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: () => apiPost("/auth/logout"),
    onSuccess: () => {
      // Flip the gate first (its observer stays attached to ["me"]), then drop cached data.
      qc.setQueryData(["me"], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      toast.success("Signed out");
    },
    onError: () => toast.error("Could not sign out"),
  });
  const u = me.data;
  if (!u) return null;

  return (
    <Popover>
      <PopoverTrigger
        className="rounded-full transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Account"
        data-testid="account-button"
      >
        <Avatar name={u.name} picture={u.picture} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3" data-testid="account-menu">
        <div className="flex items-center gap-3">
          <Avatar name={u.name} picture={u.picture} size={10} />
          <div className="min-w-0">
            <p className="truncate font-medium" data-testid="account-name">{u.name}</p>
            <p className="truncate text-xs text-muted-foreground" data-testid="account-email">{u.email}</p>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Button variant="outline" size="sm" onClick={() => navigate("/sharing")} data-testid="account-sharing">
            <Users className="size-4" /> Bouquets &amp; friends
          </Button>
          <Button variant="ghost" size="sm" disabled={logout.isPending} onClick={() => logout.mutate()} data-testid="account-signout">
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
