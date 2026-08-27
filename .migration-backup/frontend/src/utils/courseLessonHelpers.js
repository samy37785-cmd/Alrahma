// Converts a youtu.be/youtube.com/shorts URL into an embeddable player URL.
// Returns null for anything unparseable so callers can fall back to the
// existing "open in a new tab" link rather than risk an embed showing an
// error frame for a URL that was never actually a YouTube link.
export function getYouTubeEmbedUrl(url) {
  try {
    const u = new URL(url);
    let videoId = null;
    if (u.hostname.includes('youtu.be')) {
      videoId = u.pathname.slice(1);
    } else if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch') videoId = u.searchParams.get('v');
      else if (u.pathname.startsWith('/embed/')) videoId = u.pathname.split('/embed/')[1];
      else if (u.pathname.startsWith('/shorts/')) videoId = u.pathname.split('/shorts/')[1];
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  } catch {
    return null;
  }
}
