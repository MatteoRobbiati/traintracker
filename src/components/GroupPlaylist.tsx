import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { formatShortDate } from "../lib/format";
import {
  parseSongUrl,
  safeUrl,
  songKey,
  songLabel,
  spotifySearchUrl,
  youtubePlaylistUrl,
  youtubeSearchUrl,
} from "../lib/songs";
import Avatar from "./Avatar";
import { CopyIcon, ExternalIcon, MusicIcon, PlayIcon } from "./icons";

interface SongRow {
  id: string;
  date: string;
  user_id: string;
  song_title: string;
  song_artist: string | null;
  song_url: string | null;
  profile: { name: string } | null;
}

interface PlaylistEntry {
  key: string;
  title: string;
  artist: string | null;
  url: string | null;
  lastDate: string;
  lastWorkoutId: string;
  count: number;
  pickers: string[];
}

/** Every "best song" logged by you and your connections (RLS on workouts
 * already limits it to those), merged into one shared playlist. */
export default function GroupPlaylist() {
  const [rows, setRows] = useState<SongRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<"latest" | "top">("latest");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    supabase
      .from("workouts")
      .select("id, date, user_id, song_title, song_artist, song_url, profile:profiles!user_id(name)")
      .not("song_title", "is", null)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data, error }) => {
        if (error) {
          // 42703 = undefined column: migration 011 hasn't been applied yet.
          setError(
            error.code === "42703" || /song_title/.test(error.message)
              ? "The playlist needs a quick database update (supabase/migrations/011_workout_song.sql)."
              : error.message
          );
        }
        setRows((data as unknown as SongRow[]) ?? []);
        setLoading(false);
      });
  }, []);

  const entries = useMemo(() => {
    const map = new Map<string, PlaylistEntry>();
    for (const r of rows) {
      const key = songKey({ title: r.song_title, artist: r.song_artist });
      const name = r.profile?.name ?? "?";
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        if (!existing.pickers.includes(name)) existing.pickers.push(name);
        if (!existing.url && r.song_url) existing.url = r.song_url;
      } else {
        map.set(key, {
          key,
          title: r.song_title,
          artist: r.song_artist,
          url: r.song_url,
          lastDate: r.date,
          lastWorkoutId: r.id,
          count: 1,
          pickers: [name],
        });
      }
    }
    const list = [...map.values()];
    if (sort === "top") list.sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate));
    return list;
  }, [rows, sort]);

  const youtubeAll = useMemo(
    () =>
      youtubePlaylistUrl(
        entries.map((e) => parseSongUrl(e.url)?.youtubeId).filter((id): id is string => !!id)
      ),
    [entries]
  );

  async function copyList() {
    const text = entries.map((e) => songLabel(e)).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copy the playlist:", text);
    }
  }

  const visible = showAll ? entries : entries.slice(0, 10);

  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: 12 }}>
        <div className="row nowrap" style={{ gap: 12 }}>
          <span className="song-art">
            <MusicIcon width={22} height={22} />
          </span>
          <div>
            <h3 style={{ margin: 0 }}>Group playlist</h3>
            <p className="muted small" style={{ margin: 0 }}>
              {entries.length > 0
                ? `${entries.length} song${entries.length === 1 ? "" : "s"} that carried our sessions`
                : "Best songs from everyone's workouts"}
            </p>
          </div>
        </div>
        {entries.length > 1 && (
          <div className="segmented" role="group" aria-label="Sort playlist">
            <button type="button" aria-pressed={sort === "latest"} onClick={() => setSort("latest")}>
              Latest
            </button>
            <button type="button" aria-pressed={sort === "top"} onClick={() => setSort("top")}>
              Top
            </button>
          </div>
        )}
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && entries.length === 0 && (
        <div className="empty-state">
          <span className="emoji">🎧</span>
          No songs yet — add the <strong>best song</strong> when you log a workout and it lands here.
        </div>
      )}

      {entries.length > 0 && (
        <>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            {youtubeAll && (
              <a className="btn primary sm" href={youtubeAll} target="_blank" rel="noopener noreferrer">
                <PlayIcon width={14} height={14} /> Play all on YouTube
              </a>
            )}
            <button type="button" className="sm" onClick={copyList}>
              <CopyIcon width={15} height={15} /> {copied ? "Copied!" : "Copy list"}
            </button>
          </div>

          <div className="playlist">
            {visible.map((e, i) => {
              const link = parseSongUrl(e.url);
              const href = safeUrl(e.url);
              const isOpen = expanded === e.key;
              return (
                <div key={e.key}>
                  <div
                    className="playlist-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpanded(isOpen ? null : e.key)}
                    onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && setExpanded(isOpen ? null : e.key)}
                    style={{ cursor: "pointer" }}
                  >
                    <span className="pos">{i + 1}</span>
                    <div className="grow">
                      <div className="song-title truncate" style={{ fontSize: 14.5 }}>
                        {e.title}
                      </div>
                      <div className="song-artist truncate">
                        {e.artist ?? "Unknown artist"}
                        {e.count > 1 && <> · ×{e.count}</>}
                      </div>
                    </div>
                    <span className="who">
                      {e.pickers.slice(0, 3).map((n) => (
                        <Avatar key={n} name={n} size={22} />
                      ))}
                    </span>
                  </div>
                  {isOpen && (
                    <div style={{ padding: "2px 6px 10px 38px", animation: "page-in 0.2s var(--ease)" }}>
                      {link?.spotifyEmbedUrl && (
                        <iframe
                          className="song-embed"
                          style={{ marginTop: 0, marginBottom: 8 }}
                          title={`${e.title} on Spotify`}
                          src={link.spotifyEmbedUrl}
                          height={80}
                          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                          loading="lazy"
                        />
                      )}
                      <div className="row" style={{ gap: 6 }}>
                        {href && !link?.spotifyEmbedUrl && (
                          <a className="btn soft sm" href={href} target="_blank" rel="noopener noreferrer">
                            <PlayIcon width={13} height={13} /> Open
                          </a>
                        )}
                        <a className="btn ghost sm" href={spotifySearchUrl(e)} target="_blank" rel="noopener noreferrer">
                          Spotify <ExternalIcon width={13} height={13} />
                        </a>
                        <a className="btn ghost sm" href={youtubeSearchUrl(e)} target="_blank" rel="noopener noreferrer">
                          YouTube <ExternalIcon width={13} height={13} />
                        </a>
                        <Link className="btn ghost sm" to={`/workouts/${e.lastWorkoutId}`}>
                          {e.pickers.join(", ")} · {formatShortDate(e.lastDate)}
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {entries.length > 10 && (
            <button type="button" className="ghost sm" style={{ marginTop: 6 }} onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show less" : `Show all ${entries.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
