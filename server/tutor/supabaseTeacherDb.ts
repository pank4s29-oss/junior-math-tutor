import type { Grade } from "../../shared/mathCurriculum";
import { getSupabaseServerClient } from "../supabase";

type TeacherUnitRow = {
  id: string;
  grade: Grade;
  unit_key: string;
  name: string;
  teaching_rules: string;
  is_approved: boolean;
  version: number;
};

type StudentUnitRow = Pick<TeacherUnitRow, "grade" | "unit_key" | "name">;

type ApprovedContentRow = {
  id: string;
  unit_id: string;
  type: "concept" | "example" | "misconception" | "rubric";
  title: string;
  body: string;
  is_approved: boolean;
  version: number;
};

type TeacherEscalationRow = {
  id: string;
  attempt_id: string;
  reason: "wrong_answer" | "unclear_photo" | "teacher_help" | "safety_concern";
  detail: string | null;
  priority: string;
  status: "new" | "reviewing" | "resolved";
  notification_delivered: boolean;
  created_at: string;
};

function fail(error: { message: string } | null, action: string): asserts error is null {
  if (error) throw new Error(`${action}失敗：${error.message}`);
}

function unitView(row: TeacherUnitRow) {
  return {
    id: row.id,
    grade: row.grade,
    unitKey: row.unit_key,
    name: row.name,
    teachingRules: row.teaching_rules,
    isApproved: row.is_approved,
    version: row.version,
  };
}

export async function getTutorContext(grade: Grade, unitKey: string) {
  const supabase = getSupabaseServerClient();
  const { data: unit, error: unitError } = await supabase
    .from("teacher_units")
    .select("id, grade, unit_key, name, teaching_rules, is_approved, version")
    .eq("grade", grade)
    .eq("unit_key", unitKey)
    .eq("is_approved", true)
    .maybeSingle<TeacherUnitRow>();
  fail(unitError, "讀取教師單元規則");
  if (!unit) return { name: undefined, rules: "", contents: [] as Array<{ title: string; body: string; type: string }> };

  const { data: contents, error: contentError } = await supabase
    .from("approved_contents")
    .select("id, unit_id, type, title, body, is_approved, version")
    .eq("unit_id", unit.id)
    .eq("is_approved", true)
    .order("updated_at", { ascending: false })
    .limit(8)
    .returns<ApprovedContentRow[]>();
  fail(contentError, "讀取核准教材");

  return {
    name: unit.name,
    rules: unit.teaching_rules,
    contents: (contents ?? []).map(content => ({ title: content.title, body: content.body, type: content.type })),
  };
}

/** 僅提供學生端選單所需的已核准公開名稱；不得回傳教師規則或草稿。 */
export async function listApprovedStudentUnits() {
  const { data, error } = await getSupabaseServerClient()
    .from("teacher_units")
    .select("grade, unit_key, name")
    .eq("is_approved", true)
    .order("grade", { ascending: true })
    .order("unit_key", { ascending: true })
    .returns<StudentUnitRow[]>();
  fail(error, "讀取學生可用單元");
  return (data ?? []).map(unit => ({ grade: unit.grade, key: unit.unit_key, label: unit.name }));
}

/** 只用於確認非核心自訂單元是否已核准可供學生解題。 */
export async function getApprovedStudentUnit(grade: Grade, unitKey: string) {
  const { data, error } = await getSupabaseServerClient()
    .from("teacher_units")
    .select("grade, unit_key, name")
    .eq("grade", grade)
    .eq("unit_key", unitKey)
    .eq("is_approved", true)
    .maybeSingle<StudentUnitRow>();
  fail(error, "確認學生可用單元");
  return data ? { grade: data.grade, key: data.unit_key, label: data.name } : undefined;
}

export async function getTeacherUnitByKey(grade: Grade, unitKey: string) {
  const { data, error } = await getSupabaseServerClient()
    .from("teacher_units")
    .select("id, grade, unit_key, name, teaching_rules, is_approved, version")
    .eq("grade", grade)
    .eq("unit_key", unitKey)
    .maybeSingle<TeacherUnitRow>();
  fail(error, "確認教師單元");
  return data ? unitView(data) : undefined;
}

export async function listTeacherUnits() {
  const { data, error } = await getSupabaseServerClient()
    .from("teacher_units")
    .select("id, grade, unit_key, name, teaching_rules, is_approved, version")
    .order("grade", { ascending: true })
    .order("unit_key", { ascending: true })
    .returns<TeacherUnitRow[]>();
  fail(error, "讀取教師單元規則");
  return (data ?? []).map(unitView);
}

export async function listTeacherContents() {
  const supabase = getSupabaseServerClient();
  const [{ data: contents, error: contentError }, units] = await Promise.all([
    supabase
      .from("approved_contents")
      .select("id, unit_id, type, title, body, is_approved, version")
      .order("updated_at", { ascending: false })
      .limit(80)
      .returns<ApprovedContentRow[]>(),
    listTeacherUnits(),
  ]);
  fail(contentError, "讀取核准教材");
  const unitsById = new Map(units.map(unit => [unit.id, unit]));
  return (contents ?? []).map(content => {
    const unit = unitsById.get(content.unit_id);
    return {
      id: content.id,
      unitId: content.unit_id,
      type: content.type,
      title: content.title,
      body: content.body,
      isApproved: content.is_approved,
      version: content.version,
      unitName: unit?.name ?? "未指定單元",
      grade: unit?.grade ?? null,
    };
  });
}

export async function upsertTeacherUnit(input: {
  grade: Grade;
  unitKey: string;
  name: string;
  teachingRules: string;
  isApproved: boolean;
}) {
  const supabase = getSupabaseServerClient();
  const { data: current, error: currentError } = await supabase
    .from("teacher_units")
    .select("id, version")
    .eq("grade", input.grade)
    .eq("unit_key", input.unitKey)
    .maybeSingle<{ id: string; version: number }>();
  fail(currentError, "檢查單元規則版本");

  if (current) {
    const { data, error } = await supabase
      .from("teacher_units")
      .update({
        name: input.name,
        teaching_rules: input.teachingRules,
        is_approved: input.isApproved,
        version: current.version + 1,
      })
      .eq("id", current.id)
      .select("id")
      .single<{ id: string }>();
    fail(error, "更新單元規則");
    return data.id;
  }

  const { data, error } = await supabase
    .from("teacher_units")
    .insert({
      grade: input.grade,
      unit_key: input.unitKey,
      name: input.name,
      teaching_rules: input.teachingRules,
      is_approved: input.isApproved,
    })
    .select("id")
    .single<{ id: string }>();
  fail(error, "新增單元規則");
  return data.id;
}

export async function addApprovedContent(input: {
  unitId: string;
  type: "concept" | "example" | "misconception" | "rubric";
  title: string;
  body: string;
  isApproved: boolean;
}) {
  const { data, error } = await getSupabaseServerClient()
    .from("approved_contents")
    .insert({
      unit_id: input.unitId,
      type: input.type,
      title: input.title,
      body: input.body,
      is_approved: input.isApproved,
    })
    .select("id")
    .single<{ id: string }>();
  fail(error, "新增核准教材");
  return data.id;
}

export async function listTeacherEscalations() {
  const { data, error } = await getSupabaseServerClient()
    .from("teacher_escalations")
    .select("id, attempt_id, reason, detail, priority, status, notification_delivered, created_at")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<TeacherEscalationRow[]>();
  fail(error, "讀取 Supabase 學生回報案件");
  return (data ?? []).map(item => ({
    id: item.id,
    attemptId: item.attempt_id,
    reason: item.reason,
    detail: item.detail,
    priority: item.priority,
    status: item.status,
    notificationDelivered: item.notification_delivered,
    createdAt: item.created_at,
    source: "supabase" as const,
  }));
}

export async function updateTeacherEscalationStatus(input: { id: string; status: "new" | "reviewing" | "resolved" }) {
  const { error } = await getSupabaseServerClient()
    .from("teacher_escalations")
    .update({ status: input.status })
    .eq("id", input.id);
  fail(error, "更新 Supabase 學生回報案件");
}
