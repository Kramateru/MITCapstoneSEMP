import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.REACT_APP_SUPABASE_URL ||
  process.env.SUPABASE_URL

const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.REACT_APP_ANON_KEY ||
  process.env.SUPABASE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

export default supabase