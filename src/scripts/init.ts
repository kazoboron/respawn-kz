import { setupGeolocation } from './geolocation';
import { setupModal } from './modal';
import { setupMobileMenu } from './menu';
import { setupHeaderScroll } from './header-scroll';
import { setupSearchForm, setupTimeSelect, setupDateDefault } from './search';
import { setupBookingButtons } from './booking';
import { setupGlitch } from './glitch';
import { setupClubApplication } from './club-application';

function init(): void {
  setupHeaderScroll();
  setupMobileMenu();
  setupModal();
  setupBookingButtons();
  if (document.getElementById('search-form')) {
    setupTimeSelect();
    setupDateDefault();
    setupSearchForm();
    setupGeolocation();
  }
  if (document.querySelector('.glitch')) {
    setupGlitch();
  }
  if (document.getElementById('club-application-form')) {
    setupClubApplication();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
