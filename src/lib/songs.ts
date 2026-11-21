// "Best song" of a workout -- parsing of the optional link, and search links
// for songs logged without one. Nothing here talks to Spotify/YouTube APIs
// (no OAuth in a static GitHub Pages app); everything is plain URLs.

export interface Song {
  title: string;
  artist: string | null;
  url: string | null;
}

export type SongProvider = "spotify" | "youtube" | "apple" | "other";

export interface ParsedSongLink {
  provider: SongProvider;
  /** Spotify track/album/playlist embed URL, for the inline player. */
  spotifyEmbedUrl: string | null;
  /** YouTube video id -- lets several songs be chained into one playlist. */
  youtubeId: string | null;
}

export function parseSongUrl(url: string | null | undefined): ParsedSongLink | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, "");

  if (host === "open.spotify.com") {
    // /track/<id>, also /intl-it/track/<id>
    const m = u.pathname.match(/\/(track|album|playlist|episode)\/([A-Za-z0-9]+)/);
    return {
      provider: "spotify",
      spotifyEmbedUrl: m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : null,
      youtubeId: null,
    };
  }
  if (host === "youtube.com" || host === "youtu.be") {
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0] || null;
    else if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/\/(shorts|embed|live)\/([\w-]{6,})/);
      id = m ? m[2] : null;
    }
    return { provider: "youtube", spotifyEmbedUrl: null, youtubeId: id && /^[\w-]{6,}$/.test(id) ? id : null };
  }
  if (host === "music.apple.com" || host === "apple.com") {
    return { provider: "apple", spotifyEmbedUrl: null, youtubeId: null };
  }
  return { provider: "other", spotifyEmbedUrl: null, youtubeId: null };
}

/** Only http(s) links are ever rendered as hrefs. */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function query(song: Pick<Song, "title" | "artist">): string {
  return [song.title, song.artist].filter(Boolean).join(" ");
}

export function spotifySearchUrl(song: Pick<Song, "title" | "artist">): string {
  return `https://open.spotify.com/search/${encodeURIComponent(query(song))}`;
}

export function youtubeSearchUrl(song: Pick<Song, "title" | "artist">): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query(song))}`;
}

/** YouTube turns a list of video ids into an anonymous, playable playlist --
 * no account or API key needed. Capped at 50 ids by YouTube itself. */
export function youtubePlaylistUrl(videoIds: string[]): string | null {
  const ids = [...new Set(videoIds)].slice(0, 50);
  if (ids.length === 0) return null;
  return `https://www.youtube.com/watch_videos?video_ids=${ids.join(",")}`;
}

export function songLabel(song: Pick<Song, "title" | "artist">): string {
  return song.artist ? `${song.artist} – ${song.title}` : song.title;
}

/** Same song logged by several people (or several times) collapses into one
 * playlist entry -- case/whitespace-insensitive on title + artist. */
export function songKey(song: Pick<Song, "title" | "artist">): string {
  const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${norm(song.title)}|${norm(song.artist)}`;
}
