import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PreviewBanner from '../components/ui/PreviewBanner';

// Learning Experience Sprint 3: shared by HomeworkPage.jsx and
// AttendancePage.jsx, both of which have no real backend yet and used to
// render fabricated data indistinguishably from real records.

describe('PreviewBanner', () => {
  it('renders its message', () => {
    render(<PreviewBanner>Preview — nothing here is real.</PreviewBanner>);
    expect(screen.getByText('Preview — nothing here is real.')).toBeInTheDocument();
  });
});
