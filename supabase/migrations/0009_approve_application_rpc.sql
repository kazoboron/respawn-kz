-- Migration 0009: atomic approve_club_application RPC
-- Creates draft club + binds owner + marks application approved in one transaction.

create or replace function approve_club_application(
  p_application_id uuid,
  p_club_slug text,
  p_review_note text default null
) returns text
language plpgsql
security invoker
as $$
declare v_app club_applications;
begin
  if not exists (select 1 from super_admins where user_id = auth.uid()) then
    raise exception 'Only super-admins can approve';
  end if;

  select * into v_app from club_applications where id = p_application_id;
  if not found then
    raise exception 'Application not found';
  end if;
  if v_app.status != 'pending' then
    raise exception 'Application already %', v_app.status;
  end if;

  insert into clubs (
    slug, name, city, district, address, phone, price_per_hour,
    working_hours, description, gradient, initial, is_published
  ) values (
    p_club_slug, v_app.club_name, v_app.city, v_app.district, v_app.address,
    v_app.applicant_phone, 1000,
    '{}'::jsonb,
    v_app.description,
    'linear-gradient(135deg, #8b5cf6, #ec4899)',
    upper(left(v_app.club_name, 1)),
    false
  );

  if v_app.applicant_user_id is not null then
    insert into club_admins (user_id, club_slug, granted_by)
    values (v_app.applicant_user_id, p_club_slug, auth.uid());
  end if;

  update club_applications set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = p_review_note
  where id = p_application_id;

  return p_club_slug;
end;
$$;
