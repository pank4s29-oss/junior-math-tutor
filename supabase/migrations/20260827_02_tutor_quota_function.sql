begin;

create unique index if not exists daily_usage_user_date_unique
  on public.daily_usage (user_id, usage_date);

create or replace function public.consume_tutor_quota(
  p_user_id uuid,
  p_daily_limit integer default 20,
  p_cooldown_seconds integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_today date := current_date;
  v_usage public.daily_usage%rowtype;
begin
  insert into public.daily_usage (user_id, usage_date, request_count, last_requested_at)
  values (p_user_id, v_today, 0, v_now - make_interval(secs => p_cooldown_seconds + 1))
  on conflict (user_id, usage_date) do nothing;

  select * into v_usage
  from public.daily_usage
  where user_id = p_user_id and usage_date = v_today
  for update;

  if v_usage.last_requested_at > v_now - make_interval(secs => p_cooldown_seconds) then
    return jsonb_build_object(
      'allowed', false,
      'remaining', greatest(0, p_daily_limit - v_usage.request_count),
      'message', '請稍候幾秒再送出，讓我完整整理上一題。'
    );
  end if;

  if v_usage.request_count >= p_daily_limit then
    return jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'message', '你今天的解題額度已用完，明天再繼續練習，或先回顧錯題本。'
    );
  end if;

  update public.daily_usage
  set request_count = v_usage.request_count + 1,
      last_requested_at = v_now,
      updated_at = v_now
  where id = v_usage.id;

  return jsonb_build_object(
    'allowed', true,
    'remaining', p_daily_limit - v_usage.request_count - 1
  );
end;
$$;

revoke all on function public.consume_tutor_quota(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_tutor_quota(uuid, integer, integer) to service_role;

commit;
