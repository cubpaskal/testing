import React, { useEffect, useMemo, useState } from "react";

// --- CONFIG ---
// 1) Create an app at https://developer.spotify.com/dashboard
// 2) Add your app's Client ID below
// 3) Set Redirect URI in the dashboard to your site's URL (e.g., http://localhost:5173 or the canvas preview URL)
// 4) Refresh and click "Войти со Spotify"
const SPOTIFY_CLIENT_ID = "6d1ee13695594ea49e39794ee70ed4f7"; // ← замените на ваш Client ID

// --- CONSTANTS ---
const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const SCOPES = ["user-top-read"]; // нужно для top tracks

// --- PKCE HELPERS ---
async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

function base64UrlEncode(bytes) {
  let str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createCodeChallenge(verifier) {
  const hashed = await sha256(verifier);
  return base64UrlEncode(hashed);
}

function generateRandomString(length = 64) {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let text = "";
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// --- STORAGE KEYS ---
const LS = {
  verifier: "spotify_code_verifier",
  access: "spotify_access_token",
  refresh: "spotify_refresh_token",
  expiry: "spotify_token_expiry",
};

async function exchangeToken({ code, redirectUri }) {
  const codeVerifier = localStorage.getItem(LS.verifier);
  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${t}`);
  }
  return res.json();
}

async function refreshAccessToken({ refreshToken }) {
  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Refresh failed: ${res.status} ${t}`);
  }
  return res.json();
}

function saveTokens({ access_token, refresh_token, expires_in }) {
  if (access_token) localStorage.setItem(LS.access, access_token);
  if (refresh_token) localStorage.setItem(LS.refresh, refresh_token);
  if (expires_in) {
    const expiry = Date.now() + (expires_in - 30) * 1000; // 30s leeway
    localStorage.setItem(LS.expiry, String(expiry));
  }
}

function getStoredTokens() {
  const access = localStorage.getItem(LS.access);
  const refresh = localStorage.getItem(LS.refresh);
  const expiry = Number(localStorage.getItem(LS.expiry) || 0);
  return { access, refresh, expiry };
}

async function ensureValidToken() {
  const { access, refresh, expiry } = getStoredTokens();
  if (access && Date.now() < expiry) return access;
  if (refresh) {
    const updated = await refreshAccessToken({ refreshToken: refresh });
    saveTokens(updated);
    return localStorage.getItem(LS.access);
  }
  return null;
}

// --- API HELPERS ---
async function apiGet(path) {
  const token = await ensureValidToken();
  if (!token) throw new Error("Требуется авторизация");
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API error ${res.status}: ${t}`);
  }
  return res.json();
}

// --- UI ---
export default function App() {
  const [profile, setProfile] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const redirectUri = useMemo(() => window.location.origin + window.location.pathname, []);

  // Handle OAuth redirect
  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const errorParam = params.get("error");
      if (errorParam) setError(errorParam);

      // If returned from Spotify with code — exchange it
      if (code) {
        try {
          setLoading(true);
          const tokenData = await exchangeToken({ code, redirectUri });
          saveTokens(tokenData);
          // cleanup URL
          const url = new URL(window.location.href);
          url.search = "";
          window.history.replaceState({}, document.title, url.toString());
          await initData();
        } catch (e) {
          setError(String(e));
        } finally {
          setLoading(false);
        }
      } else {
        // If already authorized, just load
        const access = await ensureValidToken();
        if (access) initData();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login() {
    setError("");
    if (!SPOTIFY_CLIENT_ID || SPOTIFY_CLIENT_ID === "YOUR_SPOTIFY_CLIENT_ID") {
      setError("Укажите SPOTIFY_CLIENT_ID вверху файла.");
      return;
    }
    const verifier = generateRandomString(64);
    const challenge = await createCodeChallenge(verifier);
    localStorage.setItem(LS.verifier, verifier);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: SPOTIFY_CLIENT_ID,
      scope: SCOPES.join(" "),
      redirect_uri: redirectUri,
      code_challenge_method: "S256",
      code_challenge: challenge,
    });
    window.location.href = `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  async function logout() {
    Object.values(LS).forEach((k) => localStorage.removeItem(k));
    setProfile(null);
    setTracks([]);
  }

  async function initData() {
    try {
      setLoading(true);
      setError("");
      const me = await apiGet("/me");
      const tops = await apiGet("/me/top/tracks?time_range=short_term&limit=10");
      setProfile(me);
      setTracks(tops.items || []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#121212", color: "#fff", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, Noto Sans, Helvetica, Apple Color Emoji, Segoe UI Emoji" }}>
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-neutral-800/50" style={{ backgroundColor: "#121212" }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="#1DB954" aria-hidden>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 6.627 5.373 12 12 12 6.627 0 12-5.373 12-12C24 5.373 18.627 0 12 0Zm5.308 17.2a.9.9 0 0 1-1.24.306c-3.394-2.077-7.67-2.545-12.706-1.388a.9.9 0 1 1-.4-1.757c5.45-1.245 10.122-.71 13.83 1.48a.9.9 0 0 1 .516 1.36Zm1.652-3.258a1 1 0 0 1-1.378.34c-3.884-2.39-9.8-3.085-14.393-1.683a1 1 0 1 1-.598-1.913c5.182-1.618 11.71-.85 16.098 1.88a1 1 0 0 1 .271 1.376Zm.14-3.43a1.2 1.2 0 0 1-1.65.41c-4.453-2.737-12.03-2.99-16.38-1.73a1.2 1.2 0 1 1-.648-2.311c4.993-1.399 13.325-1.11 18.452 2.02a1.2 1.2 0 0 1 .226 1.61Z" />
            </svg>
            <span className="text-lg font-semibold">Ваш топ за месяц</span>
          </div>
          <div className="flex items-center gap-3">
            {profile ? (
              <>
                <div className="hidden sm:flex items-center gap-3">
                  {profile.images?.[0]?.url ? (
                    <img src={profile.images[0].url} alt="avatar" className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-neutral-700" />
                  )}
                  <span className="text-sm text-neutral-200">{profile.display_name}</span>
                </div>
                <button onClick={logout} className="px-3 py-2 rounded-full text-sm font-medium" style={{ backgroundColor: "#1DB954", color: "#121212" }}>Выйти</button>
              </>
            ) : (
              <button onClick={login} className="px-4 py-2 rounded-full font-semibold" style={{ backgroundColor: "#1DB954", color: "#121212" }}>Войти со Spotify</button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {!profile && (
          <div className="mt-16 text-center">
            <h1 className="text-3xl font-bold mb-3">Привет!</h1>
            <p className="text-neutral-300 mb-6">Авторизуйтесь через Spotify, и я покажу ваши 10 самых прослушиваемых треков за последний месяц.</p>
            <button onClick={login} className="px-6 py-3 rounded-full font-semibold" style={{ backgroundColor: "#1DB954", color: "#121212" }}>Войти со Spotify</button>
          </div>
        )}

        {profile && (
          <section>
            <h2 className="text-xl font-semibold mb-4">Топ‑10 треков · последний месяц</h2>
            {loading && (
              <div className="animate-pulse text-neutral-400">Загрузка…</div>
            )}
            {error && (
              <div className="mb-4 text-red-400 bg-red-900/20 border border-red-800 px-3 py-2 rounded">{String(error)}</div>
            )}

            <ol className="space-y-2">
              {tracks.map((t, idx) => (
                <li key={t.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-neutral-800/60 transition">
                  <div className="w-8 text-neutral-400 font-semibold tabular-nums">{idx + 1}</div>
                  <img src={t.album?.images?.[2]?.url || t.album?.images?.[1]?.url || t.album?.images?.[0]?.url} alt={t.name} className="w-14 h-14 rounded" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{t.name}</div>
                    <div className="text-sm text-neutral-400 truncate">{t.artists?.map(a => a.name).join(", ")}</div>
                  </div>
                  <div className="text-sm text-neutral-400 mr-2 hidden sm:block">{msToMinSec(t.duration_ms)}</div>
                  {t.preview_url ? (
                    <AudioPreview url={t.preview_url} />
                  ) : (
                    <span className="text-xs text-neutral-500">no preview</span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>

      <footer className="py-10 text-center text-xs text-neutral-500">Неофициальное приложение. Стиль вдохновлён Spotify.</footer>
    </div>
  );
}

function msToMinSec(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function AudioPreview({ url }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    return () => setPlaying(false);
  }, []);
  return (
    <audio controls src={url} className="h-8" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
  );
}
