import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mic, Sparkles } from "lucide-react";
import { apiGet, apiPut } from "@/lib/api";
import type { AppSettings } from "@/lib/types";
import { browserSpeechSupported } from "@/lib/speech";
import { WAKE_EVENT, WAKE_KEY } from "@/components/VoiceAssistant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

export function VoiceSettingsCard() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const [wake, setWake] = useState(() => localStorage.getItem(WAKE_KEY) === "1");
  const speech = browserSpeechSupported();

  const setPremium = useMutation({
    mutationFn: (premiumVoice: boolean) => apiPut<AppSettings>("/settings", { premiumVoice }),
    onSuccess: (s) => {
      qc.setQueryData(["settings"], s);
      toast.success(s.premiumVoice ? "Premium voice on" : "Premium voice off");
    },
    onError: () => toast.error("Could not change Premium voice"),
  });

  const toggleWake = async (on: boolean) => {
    if (on) {
      try {
        // Ask for the mic from this click, so the background listener can start.
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
      } catch {
        toast.error("Microphone access was blocked — allow it in your browser's site settings");
        return;
      }
    }
    localStorage.setItem(WAKE_KEY, on ? "1" : "0");
    window.dispatchEvent(new Event(WAKE_EVENT));
    setWake(on);
    toast.success(on ? 'Say "Hey PUA" any time the app is open' : "Wake word off");
  };

  return (
    <Card data-testid="voice-settings-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading">
          <Mic className="size-4" /> Voice
        </CardTitle>
        <CardDescription>
          Tap the mic button (next to +) to add appointments, habits and reminders by speaking.
          PUA shows a preview first — say &ldquo;yes&rdquo; to save or &ldquo;go back&rdquo; to try again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label htmlFor="premium-voice" className="flex items-start gap-2.5 rounded-xl border p-3">
          <Checkbox
            id="premium-voice"
            checked={settings.data?.premiumVoice ?? false}
            disabled={setPremium.isPending || settings.isLoading}
            onCheckedChange={(c) => setPremium.mutate(c === true)}
            data-testid="settings-premium-voice"
          />
          <span className="grid gap-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="size-3.5" /> Premium voice
            </span>
            <span className="text-xs text-muted-foreground">
              AI transcription (works in every browser, including iPhone) and natural speech —
              say it any way you like. Uses your Emergent AI credits, a small amount per command.
              Off: free mode using your browser&apos;s speech recognition and set phrases.
            </span>
          </span>
        </label>
        <label htmlFor="wake-word" className="flex items-start gap-2.5 rounded-xl border p-3">
          <Checkbox
            id="wake-word"
            checked={wake}
            disabled={!speech}
            onCheckedChange={(c) => void toggleWake(c === true)}
            data-testid="settings-wake-word"
          />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">&ldquo;Hey PUA&rdquo; wake word</span>
            <span className="text-xs text-muted-foreground">
              {speech
                ? 'Listens for "Hey PUA" while the app is open on this device (a green dot shows on the mic). Say it alone, or all at once: "Hey PUA, remind me to call mum at 6pm".'
                : "Needs Chrome, Edge, Safari or Samsung Internet."}
            </span>
          </span>
        </label>
      </CardContent>
    </Card>
  );
}
