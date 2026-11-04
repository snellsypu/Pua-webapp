import { useState } from "react";
import { usePaywall, usePremium } from "@/components/Paywall";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mic, Sparkles } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { AppSettings, PremiumState } from "@/lib/types";
import { browserSpeechSupported, SPEAK_KEY, speak, speechOutputSupported } from "@/lib/speech";
import { WAKE_EVENT, WAKE_KEY } from "@/components/VoiceAssistant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

export function VoiceSettingsCard() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const [wake, setWake] = useState(() => localStorage.getItem(WAKE_KEY) === "1");
  const speech = browserSpeechSupported();
  const [talk, setTalk] = useState(() => localStorage.getItem(SPEAK_KEY) !== "0");
  const toggleTalk = (on: boolean) => {
    localStorage.setItem(SPEAK_KEY, on ? "1" : "0");
    setTalk(on);
    if (on) void speak("Spoken replies are on.");
  };

  const openPaywall = usePaywall();
  const premium = usePremium();
  const cancelPremium = useMutation({
    mutationFn: () => apiPost<PremiumState>("/premium/cancel"),
    onSuccess: (p) => {
      qc.setQueryData(["premium"], p);
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["sharing"] });
      toast.success("Premium cancelled — bouquets past your first one are paused");
    },
    onError: () => toast.error("Could not cancel Premium"),
  });
  const setPremium = { isPending: cancelPremium.isPending, mutate: (on: boolean) => (on ? openPaywall("AI voice") : cancelPremium.mutate()) };

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
          Tap the mic button (next to +) to add appointments, habits, reminders and shopping items,
          tick things off (&ldquo;I ran 5k&rdquo;) or ask &ldquo;what&apos;s my day?&rdquo;.
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
              <Sparkles className="size-3.5" /> Premium
            </span>
            <span className="text-xs text-muted-foreground">
              AI transcription (works in every browser, including iPhone) and natural speech —
              say it any way you like — plus a travel mode per appointment and live-location
              commutes. Voice uses your Emergent AI credits, a small amount per command.
              Off: free mode using your browser&apos;s speech recognition and set phrases.
            </span>
            <span className="text-xs font-medium text-primary" data-testid="settings-premium-status">
              {premium.data?.active
                ? `${premium.data.plan === "yearly" ? "Yearly" : "Monthly"} plan · renews ${premium.data.renewsOn ?? ""} · untick to cancel.`
                : "Tick to see plans — from £2.99 / month."}
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
        <label htmlFor="spoken-replies" className="flex items-start gap-2.5 rounded-xl border p-3">
          <Checkbox
            id="spoken-replies"
            checked={talk && speechOutputSupported()}
            disabled={!speechOutputSupported()}
            onCheckedChange={(c) => toggleTalk(c === true)}
            data-testid="settings-spoken-replies"
          />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">Spoken replies</span>
            <span className="text-xs text-muted-foreground">
              {speechOutputSupported()
                ? "PUA reads each preview and your day briefing aloud, then listens for “yes” or “go back” — hands-free. On this device only."
                : "This browser can't speak aloud."}
            </span>
          </span>
        </label>
      </CardContent>
    </Card>
  );
}
