// js/webConfirmService.js
import { supabase } from './userService.js';
import { replyWebConfirm } from './webConfirm.js';

/**
 * 监听 web_confirm 表
 * 当 status = 'pending' 时（App 正在询问）
 * Web 必须立即回复 confirmed
 */
export function subscribeWebConfirm(uid) {
  console.log("WebConfirm 订阅初始化, uid:", uid);

  const channel = supabase
    .channel(`web_confirm-${uid}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "web_confirm",
        filter: `uid=eq.${uid}`,
      },
      async (payload) => {
        console.log("收到 web_confirm 事件:", payload);

        if (payload.eventType === "DELETE") return;

        const status = payload.new?.status;

        // 当 App 设置为 pending → Web 马上回复 confirmed
        if (status === "pending") {
          console.log("检测到 pending → Web 回复 confirmed");
          await replyWebConfirm(uid);
        }
      }
    )
    .subscribe((status) => {
      console.log("web_confirm channel 状态:", status);
    });

  return channel;
}
