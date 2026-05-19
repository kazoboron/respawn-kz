import { setupGeolocation } from './geolocation';
import { setupModal } from './modal';
import { setupModalA11y } from './modal-a11y';
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
import { setupAdminOwners } from './admin-owners';
import { setupAdminUsers } from './admin-users';
import { setupDashboardClubEdit } from './dashboard-club-edit';
import { setupReviewsForm } from './reviews-form';
import { setupClubReviews } from './club-reviews';
import { setupAdminReviews } from './admin-reviews';
import { setupDashboardReviews } from './dashboard-reviews';
import { setupGalleryLightbox } from './gallery-lightbox';

function init(): void {
  setupHeaderScroll();
  setupMobileMenu();
  setupModal();
  setupModalA11y();
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
  if (document.getElementById('club-edit-root')) {
    setupDashboardClubEdit();
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
  if (document.getElementById('admin-owners-root')) {
    setupAdminOwners();
  }
  if (document.getElementById('admin-users-root')) {
    setupAdminUsers();
  }
  if (document.getElementById('review-form-root')) {
    setupReviewsForm();
  }
  if (document.getElementById('reviews-section')) {
    setupClubReviews();
  }
  if (document.getElementById('admin-reviews-root')) {
    setupAdminReviews();
  }
  if (document.getElementById('dashboard-reviews-root')) {
    setupDashboardReviews();
  }
  // Document-level delegation works for both SSG club gallery and dynamically-rendered review photos
  setupGalleryLightbox();
  // Cookie consent — on every page, shows once if not yet answered
  setupCookieBanner();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
