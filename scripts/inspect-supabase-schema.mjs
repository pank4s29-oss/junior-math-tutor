import pg from "pg";

const { Client } = pg;
const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });

try {
  await client.connect();
  const result = await client.query(`
    select table_name, column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'app_users', 'profiles', 'teacher_units', 'approved_contents', 'math_conversations',
        'math_attachments', 'math_attempts', 'practice_results',
        'teacher_escalations', 'daily_usage'
      )
    order by table_name, ordinal_position
  `);
  for (const row of result.rows) {
    console.log(`${row.table_name}.${row.column_name} ${row.data_type} nullable=${row.is_nullable}`);
  }

  const authColumns = await client.query(`
    select table_schema, table_name, column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'auth' and table_name = 'users'
    order by ordinal_position
  `);
  console.log("-- auth.users columns --");
  for (const row of authColumns.rows) console.log(`${row.table_name}.${row.column_name} ${row.data_type} nullable=${row.is_nullable}`);

  const counts = await client.query(`
    select 'profiles' as table_name, count(*)::int as row_count from public.profiles
    union all select 'teacher_units', count(*)::int from public.teacher_units
    union all select 'approved_contents', count(*)::int from public.approved_contents
    union all select 'math_conversations', count(*)::int from public.math_conversations
    union all select 'math_attachments', count(*)::int from public.math_attachments
    union all select 'math_attempts', count(*)::int from public.math_attempts
    union all select 'practice_results', count(*)::int from public.practice_results
    union all select 'teacher_escalations', count(*)::int from public.teacher_escalations
    union all select 'daily_usage', count(*)::int from public.daily_usage
    order by table_name
  `);
  console.log("-- row counts --");
  for (const row of counts.rows) console.log(`${row.table_name}=${row.row_count}`);

  const constraints = await client.query(`
    select tc.table_name, tc.constraint_name, ccu.table_name as referenced_table
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
    where tc.table_schema = 'public' and tc.constraint_type = 'FOREIGN KEY'
    order by tc.table_name, tc.constraint_name
  `);
  console.log("-- foreign keys --");
  for (const row of constraints.rows) console.log(`${row.table_name}.${row.constraint_name} -> ${row.referenced_table}`);

  const enums = await client.query(`
    select t.typname as enum_name, e.enumlabel as enum_value
    from pg_type t
    join pg_enum e on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    order by t.typname, e.enumsortorder
  `);
  console.log("-- enum values --");
  for (const row of enums.rows) console.log(`${row.enum_name}=${row.enum_value}`);
} finally {
  await client.end();
}
