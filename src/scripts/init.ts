import { setupGeolocation } from './geolocation';
import { setupModal } from './modal';
import { setupMobileMenu } from './menu';
import { setupHeaderScroll } from './header-scroll';
import { setupSearchForm, setupTimeSelect, setupDateDefault } from './search';
import { setupBookingButtons } from './booking-real';
import { setupGlitch } from './glitch';
import { setupClubApplication } from './club-application';
import { setupCatalogFilters } from './filters';
import { setupAuthButton } from './auth';
import { setupLoginPage } from './login-page';
import { setupAuthCallback } from './auth-callback';
import { setupMePage } from './me-page';
import { setupDashboardRegister } from './dashboard-register';
import { setupDashboard } from './dashboard';
import { setupDashboardBookings } from './dashboard-bookings';
import { setupDashboardApplications } from './dashboard-applications';
import { setupCookieBanner } from './cookie-banner';
import { setupAdminApplications } from './admin-applications';

function init(): void {
  setupHeaderScroll();
  setupMobileMenu();
  setupModal();
  setupBookingButtons();
  setupAuthButton();
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
  if (document.getElementById('catalog-grid')) {
    setupCatalogFilters();
    setupGeolocation();
  }
  if (document.getElementById('login-form')) {
    setupLoginPage();
  }
  if (document.getElementById('auth-callback-root')) {
    setupAuthCallback();
  }
  if (document.getElementById('me-root')) {
    setupMePage();
  }
  if (document.getElementById('register-root')) {
    setupDashboardRegister();
  }
  if (document.getElementById('dashboard-root')) {
    setupDashboard();
  }
  if (document.getElementById('bookings-root')) {
    setupDashboardBookings();
  }
  if (document.getElementById('my-apps-root')) {
    setupDashboardApplications();
  }
  if (document.getElementById('admin-apps-root')) {
    setupAdminApplications();
  }
  // Cookie consent — on every page, shows once if not yet answered
  setupCookieBanner();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
