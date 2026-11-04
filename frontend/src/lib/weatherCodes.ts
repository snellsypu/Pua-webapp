// WMO weather-code mapping (Open-Meteo) → label + emoji. Unknown codes degrade to "—".
export function weatherCodeInfo(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: "Clear sky", emoji: "☀️" };
  if (code === 1) return { label: "Mainly clear", emoji: "🌤️" };
  if (code === 2) return { label: "Partly cloudy", emoji: "⛅" };
  if (code === 3) return { label: "Overcast", emoji: "☁️" };
  if (code === 45 || code === 48) return { label: "Fog", emoji: "🌫️" };
  if (code >= 51 && code <= 55) return { label: "Drizzle", emoji: "🌦️" };
  if (code === 56 || code === 57) return { label: "Freezing drizzle", emoji: "🌧️" };
  if (code >= 61 && code <= 65) return { label: "Rain", emoji: "🌧️" };
  if (code === 66 || code === 67) return { label: "Freezing rain", emoji: "🌧️" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "Snow", emoji: "🌨️" };
  if ((code >= 80 && code <= 82) || code === 66) return { label: "Rain showers", emoji: "🌦️" };
  if (code >= 95) return { label: "Thunderstorm", emoji: "⛈️" };
  return { label: "—", emoji: "🌡️" };
}

export const fmtDeg = (t: number) => `${Math.round(t)}°`;
