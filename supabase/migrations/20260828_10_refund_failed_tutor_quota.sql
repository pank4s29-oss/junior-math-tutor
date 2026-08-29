begin;

-- 僅供受保護伺服器流程使用：模型或私有附件讀取失敗且尚未取得可用解題回覆時，
-- 退還已由 consume_tutor_quota 原子保留的當日一次計次。冷卻時間仍保留，避免重試風暴。
create or replace function public.refund_tutor_quota(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage public.daily_usage%rowtype;
begin
  select * into v_usage
  from public.daily_usage
  where user_id = p_user_id and usage_date = current_date
  for update;

  if not found or v_usage.request_count <= 0 then
    return jsonb_build_object('refunded', false);
  end if;

  update public.daily_usage
  set request_count = greatest(0, v_usage.request_count - 1),
      updated_at = now()
  where id = v_usage.id;

  return jsonb_build_object('refunded', true);
end;
$$;

revoke all on function public.refund_tutor_quota(uuid) from public, anon, authenticated;
grant execute on function public.refund_tutor_quota(uuid) to service_role;

commit;
