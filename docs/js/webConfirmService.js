// js/api/webConfirm.js
import { supabase } from "../userService.js";

/**
 * Web 端回应确认（将 pending → confirmed）
 */
export async function replyWebConfirm(uid) {
  const { error } = await supabase
    .from("web_confirm")
    .update({ status: "confirmed" })
    .eq("uid", uid);

  if (error) {
    console.error("replyWebConfirm(Web) error:", error);
    return false;
  }

  return true;
}
