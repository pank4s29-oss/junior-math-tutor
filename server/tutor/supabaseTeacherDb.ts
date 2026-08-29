import type { Grade } from "../../shared/mathCurriculum";
import { getSupabaseServerClient } from "../supabase";

const TEACHER_MATERIAL_BUCKET = "teacher-materials";
const SUPPORTED_TEACHER_MATERIAL_TYPES = ["application/pdf", "text/plain", "text/markdown"] as const;
const MAX_TEACHER_MATERIAL_BYTES = 3 * 1024 * 1024;

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

type TutorModeRow = {
  id: string;
  mode_key: string;
  name: string;
  description: string;
  teaching_instructions: string;
  is_approved: boolean;
  version: number;
};

type TeacherMaterialRow = {
  id: string;
  unit_id: string;
  title: string;
  original_name: string;
  bucket_id: string;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  extracted_text: string;
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

function modeView(row: TutorModeRow) {
  return {
    id: row.id,
    modeKey: row.mode_key,
    name: row.name,
    description: row.description,
    teachingInstructions: row.teaching_instructions,
    isApproved: row.is_approved,
    version: row.version,
  };
}

/** 僅提供學生選擇器所需的已核准模式名稱與說明；不公開教師完整提示指令。 */
export async function listApprovedTutorModes() {
  const db = getSupabaseServerClient() as any;
  const { data, error } = await db.from("teacher_tutor_modes")
    .select("id, mode_key, name, description, teaching_instructions, is_approved, version")
    .eq("is_approved", true).order("mode_key", { ascending: true }).returns();
  fail(error, "讀取學生可用解題模式");
  return ((data ?? []) as TutorModeRow[]).map(row => ({ key: row.mode_key, name: row.name, description: row.description }));
}

/** 未核准模式不會進入模型 prompt。 */
export async function getApprovedTutorMode(modeKey: string) {
  const db = getSupabaseServerClient() as any;
  const { data, error } = await db.from("teacher_tutor_modes")
    .select("id, mode_key, name, description, teaching_instructions, is_approved, version")
    .eq("mode_key", modeKey).eq("is_approved", true).maybeSingle();
  fail(error, "確認學生可用解題模式");
  return data ? modeView(data) : undefined;
}

export async function listTeacherTutorModes() {
  const db = getSupabaseServerClient() as any;
  const { data, error } = await db.from("teacher_tutor_modes")
    .select("id, mode_key, name, description, teaching_instructions, is_approved, version")
    .order("mode_key", { ascending: true }).returns();
  fail(error, "讀取教師解題模式");
  return (data ?? []).map(modeView);
}

export async function getTeacherTutorMode(modeKey: string) {
  const db = getSupabaseServerClient() as any;
  const { data, error } = await db.from("teacher_tutor_modes")
    .select("id, mode_key, name, description, teaching_instructions, is_approved, version")
    .eq("mode_key", modeKey).maybeSingle();
  fail(error, "確認教師解題模式");
  return data ? modeView(data) : undefined;
}

export async function upsertTeacherTutorMode(input: { modeKey: string; name: string; description: string; teachingInstructions: string; isApproved: boolean }) {
  const supabase = getSupabaseServerClient() as any;
  const current = await getTeacherTutorMode(input.modeKey);
  if (current) {
    const { data, error } = await supabase.from("teacher_tutor_modes").update({
      name: input.name, description: input.description, teaching_instructions: input.teachingInstructions,
      is_approved: input.isApproved, version: current.version + 1, updated_at: new Date().toISOString(),
    }).eq("id", current.id).select("id").single();
    fail(error, "更新解題模式");
    return data.id;
  }
  const { data, error } = await supabase.from("teacher_tutor_modes").insert({
    mode_key: input.modeKey, name: input.name, description: input.description,
    teaching_instructions: input.teachingInstructions, is_approved: input.isApproved,
  }).select("id").single();
  fail(error, "新增解題模式");
  return data.id;
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

  const [{ data: contents, error: contentError }, { data: materials, error: materialError }] = await Promise.all([
    supabase.from("approved_contents")
      .select("id, unit_id, type, title, body, is_approved, version")
      .eq("unit_id", unit.id).eq("is_approved", true)
      .order("updated_at", { ascending: false }).limit(8).returns<ApprovedContentRow[]>(),
    supabase.from("teacher_materials")
      .select("id, unit_id, title, original_name, bucket_id, storage_path, mime_type, byte_size, extracted_text, is_approved, version")
      .eq("unit_id", unit.id).eq("is_approved", true)
      .order("updated_at", { ascending: false }).limit(4).returns<TeacherMaterialRow[]>(),
  ]);
  fail(contentError, "讀取核准教材");
  fail(materialError, "讀取核准教材檔案");

  return {
    name: unit.name,
    rules: unit.teaching_rules,
    contents: [
      ...(contents ?? []).map(content => ({ title: content.title, body: content.body, type: content.type })),
      ...(materials ?? []).filter(material => material.extracted_text.trim()).map(material => ({ title: material.title, body: material.extracted_text, type: "教材檔案" })),
    ],
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

/** 讓教材可直接歸屬既有核心單元；首次加入時建立可由教師再編輯的初始規則版本。 */
export async function ensureTeacherUnitForContent(input: { grade: Grade; unitKey: string; name: string }) {
  const existing = await getTeacherUnitByKey(input.grade, input.unitKey);
  if (existing) return existing.id;
  return upsertTeacherUnit({
    grade: input.grade,
    unitKey: input.unitKey,
    name: input.name,
    teachingRules: "先請學生說出已知條件與要求的未知量；以提示引導學生完成推理；完整步驟要說明每一步理由，並以代入或合理性檢查驗算。",
    isApproved: true,
  });
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

export async function uploadTeacherMaterial(input: {
  unitId: string; title: string; filename: string; mimeType: string; bytes: Buffer; extractedText: string; isApproved: boolean;
}) {
  if (!SUPPORTED_TEACHER_MATERIAL_TYPES.includes(input.mimeType as (typeof SUPPORTED_TEACHER_MATERIAL_TYPES)[number])) throw new Error("教材檔案格式不受支援。");
  if (input.bytes.length === 0 || input.bytes.length > MAX_TEACHER_MATERIAL_BYTES) throw new Error("教材檔案大小不符合 3MB 處理限制。");
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 140) || "teacher-material";
  const storagePath = `${input.unitId}/${Date.now()}-${safeName}`;
  const supabase = getSupabaseServerClient() as any;
  const { error: uploadError } = await supabase.storage.from(TEACHER_MATERIAL_BUCKET).upload(storagePath, input.bytes, { contentType: input.mimeType, upsert: false });
  fail(uploadError, "上傳私有教材檔案");
  const { data, error } = await supabase.from("teacher_materials").insert({
    unit_id: input.unitId, title: input.title, original_name: safeName, bucket_id: TEACHER_MATERIAL_BUCKET,
    storage_path: storagePath, mime_type: input.mimeType, byte_size: input.bytes.length,
    extracted_text: input.extractedText.slice(0, 12000), is_approved: input.isApproved,
  }).select("id").single();
  if (error) {
    await supabase.storage.from(TEACHER_MATERIAL_BUCKET).remove([storagePath]);
    fail(error, "保存教材檔案參照");
  }
  return String(data.id);
}

export async function listTeacherMaterials() {
  const supabase = getSupabaseServerClient() as any;
  const [{ data, error }, units] = await Promise.all([
    supabase.from("teacher_materials").select("id, unit_id, title, original_name, bucket_id, storage_path, mime_type, byte_size, extracted_text, is_approved, version").order("created_at", { ascending: false }).limit(80),
    listTeacherUnits(),
  ]);
  fail(error, "讀取教材檔案");
  const unitsById = new Map(units.map(unit => [unit.id, unit]));
  return ((data ?? []) as TeacherMaterialRow[]).map(material => ({
    id: material.id, unitId: material.unit_id, title: material.title, originalName: material.original_name,
    mimeType: material.mime_type, byteSize: material.byte_size, extractedText: material.extracted_text,
    isApproved: material.is_approved, version: material.version, unitName: unitsById.get(material.unit_id)?.name ?? "未指定單元",
    grade: unitsById.get(material.unit_id)?.grade ?? null,
  }));
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

export async function getBatchQuestionLimit() {
  const { data, error } = await getSupabaseServerClient()
    .from("teacher_tutor_settings")
    .select("max_batch_questions")
    .eq("id", true)
    .single<{ max_batch_questions: number }>();
  fail(error, "讀取多題解題上限");
  return data.max_batch_questions === 10 ? 10 : 5;
}

export async function updateBatchQuestionLimit(maxBatchQuestions: 5 | 10) {
  const { data, error } = await getSupabaseServerClient()
    .from("teacher_tutor_settings")
    .upsert({ id: true, max_batch_questions: maxBatchQuestions, updated_at: new Date().toISOString() } as any)
    .select("max_batch_questions")
    .single<{ max_batch_questions: number }>();
  fail(error, "更新多題解題上限");
  return data.max_batch_questions === 10 ? 10 : 5;
}
