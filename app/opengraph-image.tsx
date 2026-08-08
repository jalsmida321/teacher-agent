import { ImageResponse } from "next/og";

export const alt = "师座 TeacherDeck - 教师自己的 AI 工作台";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 82px", background: "#f4f5f3", color: "#1c2420", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: "#176b4d", color: "white", fontSize: 32 }}>师</div>
        <div style={{ display: "flex", flexDirection: "column" }}><b style={{ fontSize: 34 }}>师座</b><span style={{ fontSize: 18, color: "#68716c" }}>TeacherDeck</span></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.18 }}>教师自己的 AI 工作台</div>
        <div style={{ fontSize: 27, color: "#516059" }}>作文批改 · 期末评语 · 出题组卷 · 教学反思 · 家校沟通</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "2px solid #dfe3df", paddingTop: 24 }}>
        <span style={{ fontSize: 21, color: "#176b4d" }}>teacherdeck.org</span>
        <span style={{ fontSize: 20, color: "#68716c" }}>图片 / Word / Excel / PDF 输入与导出</span>
      </div>
    </div>,
    size,
  );
}
