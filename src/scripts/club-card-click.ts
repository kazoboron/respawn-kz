/**
 * Make the entire ClubCard clickable, not just its title.
 * Click navigates to /clubs/<slug>/ unless the click target is:
 * - the booking button (has its own handler)
 * - another link inside the card (let normal navigation happen)
 * - any other interactive element
 *
 * Keyboard a11y: cards are not focusable themselves — keyboard users tab
 * through the inner <a> (title) and <button> (book) which work as before.
 * This handler is purely for mouse/touch users who tap on the card body.
 */
export function setupClubCardClicks(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const card = target.closest('.club-card') as HTMLElement | null;
    if (!card) return;
    // Skip if click landed on an interactive element with its own behavior
    if (target.closest('a, button, [data-book], input, select, textarea')) return;
    const href = card.getAttribute('data-href');
    if (!href) return;
    // Mid-click / cmd-click → open in new tab; left-click → same tab
    if ((e as MouseEvent).button === 1 || (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey) {
      window.open(href, '_blank');
    } else {
      window.location.href = href;
    }
  });
}
