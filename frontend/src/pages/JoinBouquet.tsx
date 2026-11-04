// /join/:code — a bouquet invite link. Signed-out visitors see SignIn first (the Google
// redirect returns here), new accounts pick their planner, then the join happens by itself.
import { useEffect, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiPost, ApiError } from "@/lib/api";
import type { SharingState } from "@/lib/types";
import { Flower } from "@/components/Flower";

export default function JoinBouquet() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const started = useRef(false);
  const join = useMutation({
    mutationFn: () => apiPost<SharingState>("/sharing/join", { code }),
    onSuccess: (s) => {
      qc.setQueryData(["sharing"], s);
      qc.invalidateQueries({ queryKey: ["friends-calendar"] });
      const owner = s.joined.find((j) => j.user_id === s.joinedOwnerId);
      toast.success(owner ? `You're in ${owner.name.split(" ")[0]}'s bouquet` : "Joined the bouquet");
      navigate(s.joinedOwnerId ? `/shared/${s.joinedOwnerId}` : "/sharing", { replace: true });
    },
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    join.mutate();
  }, [join]);

  const err = join.error;
  const msg = err instanceof ApiError && err.body && typeof err.body === "object" && "detail" in err.body
    ? String((err.body as { detail: unknown }).detail) : "Couldn't join — try again in a moment";

  return (
    <div className="mx-auto grid max-w-md place-items-center gap-4 py-16 text-center" data-testid="join-page">
      <Flower kind="hibiscus" className={join.isError ? "size-14 grayscale" : "pua-bloom size-14"} />
      {join.isError ? (
        <>
          <p className="font-heading text-xl font-bold" data-testid="join-error">{msg}</p>
          <p className="text-sm text-muted-foreground">Ask for a fresh invite link — the bouquet&apos;s code may have changed.</p>
          <Link to="/sharing" className="text-sm text-primary underline" data-testid="join-back">Go to Bouquets</Link>
        </>
      ) : (
        <p className="flex items-center gap-2 font-heading text-xl font-bold" data-testid="join-pending">
          <Loader2 className="size-5 animate-spin" /> Joining the bouquet…
        </p>
      )}
    </div>
  );
}
