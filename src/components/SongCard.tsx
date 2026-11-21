import { useState } from "react";
import { parseSongUrl, safeUrl, spotifySearchUrl, youtubeSearchUrl, type Song } from "../lib/songs";
import { ExternalIcon, MusicIcon, PlayIcon } from "./icons";

interface SongCardProps {
  song: Song;
  eyebrow?: string;
}

/** The session's best song: title/artist, an inline Spotify player when the
 * link is a Spotify one, otherwise open/search links. */
export default function SongCard({ song, eyebrow = "Best song" }: SongCardProps) {
  const [showPlayer, setShowPlayer] = useState(false);
  const link = parseSongUrl(song.url);
  const href = safeUrl(song.url);

  return (
    <div>
      <div className="song-card">
        <span className="song-art">
          <MusicIcon width={22} height={22} />
        </span>
        <div className="grow">
          <p className="eyebrow" style={{ margin: 0 }}>
            {eyebrow}
          </p>
          <div className="song-title truncate">{song.title}</div>
          {song.artist && <div className="song-artist truncate">{song.artist}</div>}
        </div>
        {link?.spotifyEmbedUrl ? (
          <button
            type="button"
            className="primary icon-btn"
            style={{ color: "#fff" }}
            onClick={() => setShowPlayer((v) => !v)}
            aria-label={showPlayer ? "Hide player" : "Play"}
          >
            <PlayIcon width={18} height={18} />
          </button>
        ) : href ? (
          <a className="btn soft sm" href={href} target="_blank" rel="noopener noreferrer">
            <PlayIcon width={14} height={14} /> {link?.provider === "youtube" ? "YouTube" : "Open"}
          </a>
        ) : (
          <div className="row nowrap" style={{ gap: 4 }}>
            <a className="btn ghost sm" href={spotifySearchUrl(song)} target="_blank" rel="noopener noreferrer">
              Spotify <ExternalIcon width={13} height={13} />
            </a>
            <a className="btn ghost sm" href={youtubeSearchUrl(song)} target="_blank" rel="noopener noreferrer">
              YouTube <ExternalIcon width={13} height={13} />
            </a>
          </div>
        )}
      </div>
      {showPlayer && link?.spotifyEmbedUrl && (
        <iframe
          className="song-embed"
          title={`${song.title} on Spotify`}
          src={link.spotifyEmbedUrl}
          height={80}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        />
      )}
    </div>
  );
}
