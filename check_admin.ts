import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  (process.env.SB_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!
)

async function checkAdminUser() {
  const { data: { users }, error } = await supabase.auth.admin.listUsers()
  if (error) {
    console.error('Error listing users:', error)
    return
  }
  
  const admin = users.find(u => u.email === 'admin@admin.os')
  console.log('Admin User:', JSON.stringify(admin, null, 2))
}

checkAdminUser()
