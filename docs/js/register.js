import { supabase } from './userService.js';

/**
 * 注册用户
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<Object>} 注册结果
 */
export async function registerWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

