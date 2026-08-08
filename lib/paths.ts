/**
 * 路径配置 —— 集中管理所有文件系统路径。
 *
 * 部署要点：
 * - artifacts 目录可用 ARTIFACTS_DIR 环境变量覆盖（生产环境指向 /var/data/shizuo/artifacts）
 * - 字体文件随仓库走（assets/fonts/kaiti.ttf），系统字体兜底
 * - 不依赖 process.cwd()（部署时 cwd 可能变化）
 */
import { join, resolve } from "node:path";

/** 项目根目录（部署后即代码目录） */
export const APP_ROOT = process.env.APP_ROOT
  ? resolve(process.env.APP_ROOT)
  : process.cwd();

/** 成果目录（教案/试卷/报告输出），可用 ARTIFACTS_DIR 覆盖 */
export const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR
  ? resolve(process.env.ARTIFACTS_DIR)
  : join(APP_ROOT, "artifacts");

/** 内置字体目录 */
export const FONTS_DIR = join(APP_ROOT, "assets", "fonts");
