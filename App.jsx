import React, { useEffect, useMemo, useState } from "react";

// --- CONFIG ---
// 1) Create an app at https://developer.spotify.com/dashboard
// 2) Add your app's Client ID below
// 3) Set Redirect URI in the dashboard to your site's URL (e.g., https://top10test1.vercel.app or your preview URL)
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

// --- MODERN STYLES (2025 vibe) ---
const css = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
:root {
  --bg: #0f0f10;
  --panel: #151516;
  --text: #ffffff;
  --muted: #a1a1aa;
  --line: #262629;
  --brand: #1DB954;
  --brand-2: #169c46;
}
* { box-sizing: border-box; }
html, body, #root { height: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial; }
.container { max-width: 1120px; margin: 0 auto; padding: 0 20px; }

.header { position: sticky; top: 0; z-index: 10; backdrop-filter: blur(10px); background: linear-gradient(180deg, rgba(15,15,16,0.9), rgba(15,15,16,0.7)); border-bottom: 1px solid var(--line); }
.header-inner { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 0; }
.brand { display: flex; align-items: center; gap: 10px; }
.brand-title { font-weight: 700; letter-spacing: 0.2px; }
.btn { border: 0; background: var(--brand); color: #0f0f10; padding: 10px 16px; border-radius: 999px; font-weight: 700; cursor: pointer; transition: transform .08s ease, background .2s ease; }
.btn:hover { background: var(--brand-2); }
.btn:active { transform: translateY(1px); }
.btn-secondary { background: #232326; color: var(--text); }
.btn-secondary:hover { background: #2b2b30; }
.avatar { width: 32px; height: 32px; border-radius: 50%; background: #2b2b2e; object-fit: cover; }

.hero { text-align: center; padding: 72px 0 24px; }
.hero h1 { font-size: 40px; margin: 0 0 10px; letter-spacing: -0.3px; }
.hero p { color: var(--muted); margin: 0 auto; max-width: 540px; }

.grid { display: grid; grid-template-columns: repeat(1, minmax(0, 1fr)); gap: 10px; }
@media (min-width: 640px) { .grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 900px) { .grid { grid-template-columns: repeat(3, 1fr); } }
.card { display: flex; align-items: center; gap: 14px; padding: 12px; border-radius: 14px; background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)); border: 1px solid var(--line); transition: transform .15s ease, background .2s ease, border-color .2s ease; }
.card:hover { transform: translateY(-2px); background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02)); border-color: #2f2f33; }
.card .idx { width: 24px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.cover { width: 68px; height: 68px; border-radius: 10px; object-fit: cover; background: #1b1b1e; }
.title { font-weight: 600; letter-spacing: .1px; }
.meta { color: var(--muted); font-size: 14px; margin-top: 2px; }
.dur { color: var(--muted); font-size: 13px; margin-left: auto; margin-right: 10px; }
.preview { height: 34px; }

.kbd { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background: #202023; color: #d4d4d8; border: 1px solid #2b2b30; border-bottom-width: 3px; border-radius: 10px; padding: 12px 14px; display: inline-flex; align-items: center; gap: 10px; }
.kbd b { color: #fff; }

.footer { text-align: center; color: var(--muted); font-size: 12px; padding: 36px 0 60px; }

.skeleton { position: relative; overflow: hidden; background: #1a1a1d; border: 1px solid var(--line); border-radius: 14px; height: 92px; }
.skeleton::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.02) 100%); transform: translateX(-100%); animation: shine 1.2s infinite; }
@keyframes shine { to { transform: translateX(100%); } }
`;

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

      if (code) {
        try {
          setLoading(true);
          const tokenData = await exchangeToken({ code, redirectUri });
          saveTokens(tokenData);
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
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <header className="header">
        <div className="container header-inner">
          <div className="brand">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="#1DB954" aria-hidden>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 6.627 5.373 12 12 12 6.627 0 12-5.373 12-12C24 5.373 18.627 0 12 0Zm5.308 17.2a.9.9 0 0 1-1.24.306c-3.394-2.077-7.67-2.545-12.706-1.388a.9.9 0 1 1-.4-1.757c5.45-1.245 10.122-.71 13.83 1.48a.9.9 0 0 1 .516 1.36Zm1.652-3.258a1 1 0 0 1-1.378.34c-3.884-2.39-9.8-3.085-14.393-1.683a1 1 0 1 1-.598-1.913c5.182-1.618 11.71-.85 16.098 1.88a1 1 0 0 1 .271 1.376Zm.14-3.43a1.2 1.2 0 0 1-1.65.41c-4.453-2.737-12.03-2.99-16.38-1.73a1.2 1.2 0 1 1-.648-2.311c4.993-1.399 13.325-1.11 18.452 2.02a1.2 1.2 0 0 1 .226 1.61Z" />
            </svg>
            <div className="brand-title">Ваш топ за месяц</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {profile ? (
              <>
                {profile.images?.[0]?.url ? (
                  <img src={profile.images[0].url} alt="avatar" className="avatar" />
                ) : (
                  <div className="avatar" />
                )}
                <button onClick={logout} className="btn btn-secondary">Выйти</button>
              </>
            ) : (
              <button onClick={login} className="btn">Войти со Spotify</button>
            )}
          </div>
        </div>
      </header>

      <main className="container">
        {!profile && (
          <section className="hero">
            <h1>Откройте свой звук 30‑дневки</h1>
            <p>Войдите через Spotify, чтобы увидеть ваши 10 самых прослушиваемых треков за последний месяц. Безопасная авторизация через PKCE, без хранения пароля.</p>
            <div style={{ marginTop: 22 }}>
              <button onClick={login} className="btn">Войти со Spotify</button>
            </div>
            <div style={{ marginTop: 14 }}>
              <span className="kbd">Скоп: <b>user-top-read</b></span>
            </div>
          </section>
        )}

        {profile && (
          <section style={{ padding: "28px 0" }}>
            <h2 style={{ margin: "0 0 18px", letterSpacing: ".2px" }}>Топ‑10 треков · последний месяц</h2>
            {error && (
              <div style={{ marginBottom: 14, color: "#ff7a7a" }}>{String(error)}</div>
            )}

            {loading ? (
              <div className="grid">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div className="skeleton" key={i} />
                ))}
              </div>
            ) : (
              <div className="grid">
                {tracks.map((t, idx) => (
                  <article key={t.id || idx} className="card">
                    <div className="idx">{String(idx + 1).padStart(2, "0")}</div>
                    <img
                      className="cover"
                      src={t.album?.images?.[1]?.url || t.album?.images?.[0]?.url}
                      alt={t.name}
                      width={68}
                      height={68}
                      loading="lazy"
                    />
                    <div style={{ minWidth: 0 }}>
                      <div className="title" title={t.name}>{t.name}</div>
                      <div className="meta" title={t.artists?.map(a=>a.name).join(", ")}>{t.artists?.map(a => a.name).join(", ")}</div>
                    </div>
                    <div className="dur">{msToMinSec(t.duration_ms)}</div>
                    {t.preview_url ? (
                      <audio className="preview" controls src={t.preview_url} />
                    ) : (
                      <span className="meta">без предпрослушивания</span>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="footer">Неофициальное приложение. Стиль вдохновлён Spotify · © {new Date().getFullYear()}</footer>
    </>
  );
}

function msToMinSec(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, "0");
  return `${m}:${s}`;
}
