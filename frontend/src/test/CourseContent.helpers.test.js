import { describe, it, expect } from 'vitest';
import { getYouTubeEmbedUrl } from '../utils/courseLessonHelpers';

// Learning Experience Sprint 3: CourseContent.jsx's youtube/video lesson rows
// used to always open a new tab; they now embed inline where the URL is a
// recognized YouTube link. This covers the URL-parsing logic that decides
// whether an embed is safe to attempt, falling back to the existing
// new-tab link for anything unparseable.

describe('getYouTubeEmbedUrl', () => {
  it('converts a standard watch URL', () => {
    expect(getYouTubeEmbedUrl('https://www.youtube.com/watch?v=abc123')).toBe('https://www.youtube.com/embed/abc123');
  });

  it('converts a youtu.be short URL', () => {
    expect(getYouTubeEmbedUrl('https://youtu.be/abc123')).toBe('https://www.youtube.com/embed/abc123');
  });

  it('converts a shorts URL', () => {
    expect(getYouTubeEmbedUrl('https://www.youtube.com/shorts/abc123')).toBe('https://www.youtube.com/embed/abc123');
  });

  it('passes through an already-embed URL', () => {
    expect(getYouTubeEmbedUrl('https://www.youtube.com/embed/abc123')).toBe('https://www.youtube.com/embed/abc123');
  });

  it('returns null for a non-YouTube URL instead of guessing', () => {
    expect(getYouTubeEmbedUrl('https://vimeo.com/12345')).toBeNull();
  });

  it('returns null for a malformed URL instead of throwing', () => {
    expect(getYouTubeEmbedUrl('not a url')).toBeNull();
  });

  it('returns null for a youtube.com URL with no recognizable video id', () => {
    expect(getYouTubeEmbedUrl('https://www.youtube.com/channel/xyz')).toBeNull();
  });
});
