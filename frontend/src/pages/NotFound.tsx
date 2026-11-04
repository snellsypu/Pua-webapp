import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="font-heading text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="text-sm text-muted-foreground">That loop doesn&apos;t exist.</p>
      <Link to="/" className={buttonVariants({ variant: "outline", size: "sm" })} data-testid="notfound-home-link">
        Back to today
      </Link>
    </div>
  );
}
