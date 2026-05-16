import { supabase } from '../lib/supabase';
import { requireLogin } from '../lib/route-guards';
import { notify } from '../lib/notifications';
import { type ClubApplication, type NewClubApplication, APPLICATION_STATUS_LABELS } from '../data/supabase-types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function renderExistingApplication(app: ClubApplication): string {
  return `
    <div class="dashboard-existing__card">
      <h3>У тебя уже есть заявка</h3>
      <p><strong>${app.club_name}</strong> — ${app.address}</p>
      <p>Статус: <span class="pill pill--${app.status}">${APPLICATION_STATUS_LABELS[app.status]}</span></p>
      <p>Подана: ${formatDate(app.created_at)}</p>
      ${app.review_note ? `<p>Комментарий модератора: ${app.review_note}</p>` : ''}
      <p style="margin-top:16px">
        <a href="/dashboard/applications/" class="btn btn--ghost">Все мои заявки</a>
        <button type="button" class="btn btn--primary" id="register-new">Подать ещё заявку</button>
      </p>
    </div>
  `;
}

async function loadExistingApplications(userId: string): Promise<ClubApplication[]> {
  const { data, error } = await supabase
    .from('club_applications')
    .select('*')
    .eq('applicant_user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[register] failed to load applications', error);
    return [];
  }
  return (data ?? []) as ClubApplication[];
}

export async function setupDashboardRegister(): Promise<void> {
  const root = document.getElementById('register-root');
  if (!root) return;

  const loadingEl = document.getElementById('register-loading');
  const existingEl = document.getElementById('register-existing');
  const formEl = document.getElementById('register-form') as HTMLFormElement | null;
  const successEl = document.getElementById('register-success');
  const errorEl = document.getElementById('register-error');
  if (!loadingEl || !existingEl || !formEl || !successEl || !errorEl) return;

  // Gate: require login
  const { user } = await requireLogin();
  if (!user) return; // redirected

  // Pre-fill email
  const emailInput = formEl.querySelector('input[name="applicant_email"]') as HTMLInputElement;
  if (emailInput) emailInput.value = user.email ?? '';

  // Check for existing pending application
  const existing = await loadExistingApplications(user.id);
  loadingEl.hidden = true;

  const pending = existing.find((a) => a.status === 'pending');
  if (pending) {
    existingEl.innerHTML = renderExistingApplication(pending);
    existingEl.hidden = false;
    document.getElementById('register-new')?.addEventListener('click', () => {
      existingEl.hidden = true;
      formEl.hidden = false;
    });
  } else {
    formEl.hidden = false;
  }

  // Handle submit
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const fd = new FormData(formEl);
    const newApp: NewClubApplication = {
      applicant_user_id: user.id,
      applicant_name: String(fd.get('applicant_name') ?? '').trim(),
      applicant_email: String(fd.get('applicant_email') ?? '').trim(),
      applicant_phone: String(fd.get('applicant_phone') ?? '').trim() || null,
      club_name: String(fd.get('club_name') ?? '').trim(),
      city: String(fd.get('city') ?? '').trim(),
      district: String(fd.get('district') ?? '').trim() || null,
      address: String(fd.get('address') ?? '').trim(),
      working_hours: String(fd.get('working_hours') ?? '').trim() || null,
      equipment_note: String(fd.get('equipment_note') ?? '').trim() || null,
      photo_url: String(fd.get('photo_url') ?? '').trim() || null,
      description: String(fd.get('description') ?? '').trim() || null,
    };

    const submitBtn = formEl.querySelector('button[type="submit"]') as HTMLButtonElement;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляем…';

    const { data, error } = await supabase
      .from('club_applications')
      .insert(newApp)
      .select()
      .single();

    if (error || !data) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Отправить заявку';
      errorEl.textContent = `Не удалось отправить: ${error?.message ?? 'неизвестная ошибка'}`;
      errorEl.hidden = false;
      return;
    }

    await notify({
      type: 'application_submitted',
      applicationId: data.id,
      applicantEmail: newApp.applicant_email,
    });

    formEl.hidden = true;
    existingEl.hidden = true;
    successEl.hidden = false;
  });
}
