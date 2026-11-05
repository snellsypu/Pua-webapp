// Settings: switch the rainforest birdsong (routine finished / lei complete) on or off.
import { useState } from "react";
import { Bird, Play } from "lucide-react";
import { birdsongOn, playBirdsong, setBirdsong } from "@/lib/birdsong";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

export function BirdsongCard() {
  const [on, setOn] = useState(birdsongOn);
  return (
    <Card data-testid="birdsong-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading"><Bird className="size-4 text-emerald-600" /> Jungle sounds</CardTitle>
        <CardDescription>Soft rainforest birdsong when you finish a routine or complete a lei. Saved on this device.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <label htmlFor="birdsong-toggle" className="flex items-center gap-2.5 text-sm">
          <Checkbox id="birdsong-toggle" checked={on} onCheckedChange={(v) => { const b = v === true; setOn(b); setBirdsong(b); }} data-testid="birdsong-toggle" />
          Play birdsong
        </label>
        <Button variant="outline" size="sm" onClick={() => playBirdsong(true)} data-testid="birdsong-preview"><Play className="size-3.5" /> Listen</Button>
      </CardContent>
    </Card>
  );
}
