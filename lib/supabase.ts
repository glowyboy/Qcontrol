import { createClient } from '@supabase/supabase-js';

// Supabase public config — anon key is safe to be in client code
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://lxkovilybzcbgugqyjaa.supabase.co';

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4a292aWx5YnpjYmd1Z3F5amFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3ODg5OTgsImV4cCI6MjEwMDM2NDk5OH0.FaP1uik4X-37o_FUqdiEIFcb2U_AHf3HRaEKONMcT7M';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
