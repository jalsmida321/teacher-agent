import { redirect } from "next/navigation";

/**
 * 根路径 → 正式产品页。
 * 师座主页面是 /billing-demo（BYOK + 场景 + 自定义任务 + 附件 + 导出）。
 * 旧版 app/page.tsx 教师工作台（pi 调试通道）已由本页面取代。
 */
export default function Home() {
  redirect("/billing-demo");
}
