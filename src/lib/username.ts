/**
 * Username generation shared with DB trigger handle_new_user().
 * Trigger formula: COALESCE(raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8))
 * This keeps internal and external default usernames consistent (user_<first8ofId>).
 */
export function generateDefaultUsername(userId: string): string {
  const first8 = userId.slice(0, 8)
  return `user_${first8}`
}
