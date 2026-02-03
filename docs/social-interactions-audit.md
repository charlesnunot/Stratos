# 审计任务 26：社交互动模块

**目标**：确保用户在帖子和个人主页上的互动功能（关注、收藏、点赞、评论、转发、分享、打赏）安全、权限正确、数据一致，并防止滥用或异常操作。

**审计日期**：2025-01-31

---

## 1. 关注与取消关注

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 用户只能关注或取消关注其他用户 | RLS：follows INSERT WITH CHECK (auth.uid() = follower_id)；DELETE USING (auth.uid() = follower_id)。useProfile.followMutation 使用 user.id 作为 follower_id，且禁止关注自己（user.id === followingId 抛错）。 | 无 | 已满足 |
| 数据库状态与前端显示一致 | 关注/取关后 invalidateQueries(['profile', ...], ['isFollowing', ...])；follower_count/following_count 由 DB trigger update_follow_counts 维护。 | 无 | 已满足 |
| 防止重复关注或越权操作 | 唯一约束 (follower_id, followee_id)；重复 insert 返回 23505 被忽略。不能关注自己、被封禁/暂停用户及已拉黑自己的用户（useProfile 内校验）。 | 无 | 已满足 |

---

## 2. 收藏功能

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 用户只能收藏自己有权限访问的内容 | favorites 表 RLS 限制 INSERT/DELETE 为 user_id = auth.uid()；收藏列表按 user_id 查询，仅本人可见。收藏项对应的 post/product 由 RLS 控制可见性。 | 无 | 已满足 |
| 收藏状态正确同步 | 增删后 invalidateQueries(['isFavorite', ...], ['favorites', ...], ['favoriteCount', ...], ['post', ...], ['product', ...])；favorite_count 由 DB trigger 维护。 | 无 | 已满足 |
| 删除或取消收藏操作回滚正常 | 取消收藏为 DELETE，失败则 throw error，前端 toast；唯一约束 23505 在“添加收藏”时被忽略（视为已存在），不抛错。 | 无 | 已满足 |
| 收藏相关调试日志 | **问题**：useFavorites / useToggleFavorite 中多处 console.log/console.error 含 itemType、itemId、userId，生产环境可能泄露行为轨迹。 | **低** | **已修复**：所有调试日志改为仅在 process.env.NODE_ENV === 'development' 时输出；错误日志仅输出 message，不输出 userId/itemId。 |

---

## 3. 点赞 / 评论 / 转发 / 分享

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 用户只能操作自己的互动行为 | likes：INSERT WITH CHECK (auth.uid() = user_id)；comments：INSERT/UPDATE/DELETE 由 RLS 限制为本人或帖子作者/admin。reposts：user_id = auth.uid()。分享为前端复制链接，无写库。 | 无 | 已满足 |
| 点赞数量、评论内容、转发记录与数据库一致 | like_count、comment_count、repost_count 由 DB trigger 维护；CommentSection 乐观更新 + invalidateQueries；LikeButton 有 Realtime 订阅 likes 表并 invalidate likeCount。 | 无 | 已满足 |
| 异常操作（重复点赞、恶意评论）防护 | 点赞：(user_id, post_id) 唯一约束，23505 忽略；前端 300ms 防抖与 isPending。评论：新增/编辑均 sanitizeContent；2 秒内仅允许提交一次（RATE_LIMIT_MS）。转发：enforce_repost_rate_limit 60 秒 20 次；唯一约束防重复。 | 无 | 已满足 |
| 评论编辑 sanitize 与审计 | 评论编辑提交前使用 sanitizeContent(trimmedContent)；成功时 logAudit(update_comment)。 | 无 | 已满足（见 social-features-posts-interactions-audit） |

---

## 4. 打赏功能

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 用户余额和权限校验正确 | create-tip-session：须登录；checkTipEnabled、订阅 status/expires_at；不能给自己打赏；被拉黑则 403；post 存在且 author 匹配。process-tip-payment：再次校验黑名单、tip_enabled、checkTipLimits。支付经 Stripe，不依赖本地“余额”字段。 | 无 | 已满足 |
| 打赏金额正确写入数据库 | 金额由前端传入后 parseFloat 校验 > 0；Stripe Checkout 完成后 webhook 调 process-tip-payment，写入 tip_transactions；限额由 check_tip_limits RPC 校验。 | 无 | 已满足 |
| 异常操作可回滚或提示 | 支付失败不写 tip_transactions；create-tip-session 校验失败返回 400/403；process-tip-payment 失败返回 { success: false, error }，有 logPaymentFailure。 | 无 | 已满足 |

---

## 5. 异常处理与日志

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 所有互动操作异常是否记录日志 | 帖子创建/删除、评论创建/更新/删除成功时已调用 logAudit（见 social-features-posts-interactions-audit）；打赏有 payment logger。关注/收藏/点赞/转发为前端直连 Supabase，异常仅 toast + 可选 console，未统一 logAudit。 | 低 | 设计取舍：可选对关注/取关、收藏切换失败增加 logAudit；本次已收紧 useFavorites 生产环境日志。 |
| 日志中不泄露敏感信息 | logAudit 不记录正文或金额明细；handleApiError / payment logger 不记录请求体。useFavorites 调试日志已改为仅开发环境输出且不含 userId。 | 无 | 已满足 |
| 系统异常不会导致数据错误或用户体验异常 | 写库失败会 throw，前端 toast；乐观更新在失败时由 invalidateQueries 拉回真实状态；打赏失败不写 tip_transactions。 | 无 | 已满足 |

---

## 修复项汇总

| 项 | 文件 | 说明 |
|----|------|------|
| 1 | `src/lib/hooks/useFavorites.ts` | useIsFavorite / useToggleFavorite / useFavorites 中所有 console.log/console.warn/console.error 改为仅在 NODE_ENV === 'development' 时输出；错误日志仅输出 message，不输出 userId/itemId |

---

## 涉及页面与接口

- **关注**：/main/following、/profile/[id]/people；无独立 /api/follows，经 Supabase follows 表 + RLS；useProfile.useFollowMutation、useIsFollowing。
- **收藏**：/main/favorites；useFavorites、useToggleFavorite、FavoriteItem。
- **点赞/评论/转发/分享**：/main/post/[id]；LikeButton、CommentSection、RepostDialog、ShareDialog；comments/likes/reposts 表 + RLS。
- **打赏**：/api/payments/stripe/create-tip-session、create-user-tip-session；process-tip-payment、check-tip-limits。

---

## 与既有审计的衔接

本任务与 `docs/social-features-posts-interactions-audit.md` 一致：帖子发布与评论编辑 sanitize、帖子/评论 logAudit 已落地；关注/收藏/点赞/评论/转发/打赏的 RLS、唯一约束、限频与业务校验均已覆盖。本次补充：**收藏相关调试日志仅开发环境输出**，避免生产环境泄露用户行为轨迹。
