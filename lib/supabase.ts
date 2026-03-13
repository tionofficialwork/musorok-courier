import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://vktumxwcjykqfmqdishc.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrdHVteHdjanlrcWZtcWRpc2hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODUwNTUsImV4cCI6MjA4ODY2MTA1NX0.GjLPNvK7C05BiFoOdoeSOkIQIHJO7eKplGrXWVRuuTU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);