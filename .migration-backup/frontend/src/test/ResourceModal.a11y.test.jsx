import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LangProvider } from '../context/LangContext';
import ResourceModal from '../components/ui/ResourceModal';

// Coverage for T20: ResourceModal previously had neither a dialog role nor
// any Escape/focus handling at all (the biggest gap among the 6 modals
// audited). Verifies the real component, wired to the shared useModalA11y
// hook, actually closes on Escape and moves focus to its close button —
// not just the hook in isolation (see useModalA11y.test.jsx for that).

const course = {
  title: 'Tajweed Basics',
  resources: [{ url: 'https://example.com/a', type: 'pdf', label: 'Workbook' }],
};

function renderModal(onClose) {
  return render(
    <LangProvider>
      <ResourceModal course={course} onClose={onClose} />
    </LangProvider>,
  );
}

describe('ResourceModal accessibility', () => {
  it('is announced as a dialog with a label', () => {
    renderModal(() => {});
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Tajweed Basics');
  });

  it('moves initial focus to the close button', async () => {
    renderModal(() => {});
    const closeBtn = screen.getByRole('button', { name: /close/i });
    await waitFor(() => expect(closeBtn).toHaveFocus());
  });

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal(onClose);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
