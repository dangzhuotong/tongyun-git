/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 日期。 */
export function relativeTime(timestampSec: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, Math.floor(nowMs / 1000 - timestampSec));
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(timestampSec * 1000).toLocaleDateString();
}
