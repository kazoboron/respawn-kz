-- Migration 0017: email notification when a club admin replies to a review.
-- Builds on 0016 (reply_text/replied_at columns) and SP5 outbox pipeline.

-- ============================================================
-- 1. Extend outbox event_type CHECK with the 11th value
-- ============================================================
alter table public.notifications_outbox
  drop constraint notifications_outbox_event_type_check;
alter table public.notifications_outbox
  add constraint notifications_outbox_event_type_check
  check (event_type in (
    'application_submitted',
    'application_approved',
    'application_rejected',
    'booking_created',
    'booking_confirmed',
    'booking_cancelled',
    'booking_completed',
    'booking_no_show',
    'review_created',
    'booking_rescheduled',
    'review_replied'
  ));

-- ============================================================
-- 2. Notify trigger — fire on reviews UPDATE when reply_text appears
-- ============================================================
create or replace function notify_review_replied()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_customer_email text;
begin
  -- Only fire on the transition null -> non-null (first reply).
  -- Edits to an existing reply do not re-notify — would be spammy.
  -- Deletion (non-null -> null) also doesn't notify.
  if OLD.reply_text is not null then
    return NEW;
  end if;
  if NEW.reply_text is null then
    return NEW;
  end if;

  v_customer_email := get_user_email(NEW.user_id);
  if v_customer_email is null then
    return NEW;
  end if;

  v_payload := jsonb_build_object(
    'review_id', NEW.id,
    'club_slug', NEW.club_slug,
    'reply_text', NEW.reply_text,
    'review_text', NEW.text,
    'review_rating', NEW.rating,
    'customer_email', v_customer_email
  );

  insert into public.notifications_outbox
    (event_type, source_table, source_id, recipient_email, payload)
  values
    ('review_replied', 'reviews', NEW.id, v_customer_email, v_payload)
  on conflict (event_type, source_id, recipient_email) do nothing;

  return NEW;
end;
$$;

revoke execute on function notify_review_replied() from public, anon, authenticated;

drop trigger if exists reviews_notify_replied on public.reviews;
create trigger reviews_notify_replied
  after update on public.reviews
  for each row execute function notify_review_replied();
