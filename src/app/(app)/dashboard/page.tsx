import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  return <pre>{JSON.stringify(data.user, null, 2)}</pre>;
}
