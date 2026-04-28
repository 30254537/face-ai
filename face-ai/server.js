import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import OpenAI from "openai";
import puppeteer from "puppeteer";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "20mb" }));

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const orders = {};

function randomCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function fallbackProfile() {
  return {
    season: "柔秋",
    subtype: "Soft Autumn",
    tone: "暖中性",
    brightness: "中",
    chroma: "柔和",
    contrast: "中低",
    keywords: ["柔和", "知性", "温婉", "轻熟"],
    recommendedColors: ["#F3E5D0", "#D4BFA4", "#C77D5C", "#D4A495", "#8A9A5B", "#92A092", "#A7B86A", "#8B6F47", "#5C4838"],
    enhancedColors: ["#A85A48", "#B8A055", "#445D4A", "#6B4E34", "#A0522D", "#8B6B3D"],
    avoidColors: ["#FF1493", "#000000", "#FF0000", "#00BFFF", "#FFFFFF", "#9B30FF"],
    outfitTips: "用燕麦米、豆沙粉、陶土橘构建通勤与约会场景；以亚麻、针织、垂坠面料提升高级感。",
    makeupTips: "底妆选自然光泽，眼影用奶茶棕与暖灰棕，唇色偏亚砖橘或暖豆沙。",
    hairstyleTips: "发色优先暖棕、焦糖棕，避免偏蓝黑；发型推荐柔和层次与空气感刘海。"
  };
}

async function buildProfileWithAI() {
  if (!client) {
    return fallbackProfile();
  }

  try {
    const completion = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: "你是专业个人色彩与形象顾问，只输出严格 JSON。"
        },
        {
          role: "user",
          content:
            "请生成一份个人色彩分析报告数据，需包含season/subtype/tone/brightness/chroma/contrast/keywords/recommendedColors/enhancedColors/avoidColors/outfitTips/makeupTips/hairstyleTips。颜色数组需是十六进制色值，推荐色9个、强调色6个、避雷色6个。"
        }
      ],
      text: {
        format: {
          type: "json_object"
        }
      }
    });

    const parsed = JSON.parse(completion.output_text);
    return { ...fallbackProfile(), ...parsed };
  } catch {
    return fallbackProfile();
  }
}

function colorBlocks(colors) {
  return colors
    .map(
      (c) => `
      <div class="chip">
        <div class="sw" style="background:${c}"></div>
        <div class="code">${c}</div>
      </div>
    `
    )
    .join("");
}

function avatarStrip(imageBase64, count = 5) {
  return Array.from({ length: count })
    .map(() => `<img src="${imageBase64}" class="mini"/>`)
    .join("");
}

function buildPosterHTML({ imageBase64, profile }) {
  return `
  <html>
    <head>
      <meta charset="UTF-8"/>
      <style>
        body { margin: 0; font-family: "PingFang SC", "Noto Sans SC", sans-serif; background: #f4efe8; }
        .poster { width: 1240px; min-height: 1754px; margin: 0 auto; background: #f8f3ec; color: #4c4035; padding: 34px 36px; box-sizing: border-box; }
        .title { text-align: center; border-bottom: 1px solid #d8cbbc; padding-bottom: 14px; }
        .title h1 { margin: 0; font-size: 58px; letter-spacing: 1px; }
        .title p { margin: 6px 0 0; font-size: 36px; }

        .hero { display: grid; grid-template-columns: 360px 1fr; margin-top: 22px; gap: 22px; }
        .portrait { border: 1px solid #ddcfbf; background: #fff; padding: 10px; }
        .portrait img { width: 100%; height: 420px; object-fit: cover; }
        .badge { margin-top: 10px; background: #e8ded1; padding: 10px 16px; text-align: center; }
        .badge .cn { font-size: 52px; font-weight: 600; }
        .badge .en { font-size: 30px; color: #7f6f61; }

        .grid { border: 1px solid #ddcfbf; background: #fefaf5; padding: 14px; }
        .grid h3 { margin: 0 0 10px; font-size: 34px; border-bottom: 1px solid #e3d8cc; padding-bottom: 8px; }
        .metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; font-size: 24px; }
        .metric { background: #fff; border: 1px solid #eadfd2; border-radius: 8px; padding: 8px 10px; }

        .kw { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
        .kw span { background: #efe4d6; border-radius: 999px; padding: 5px 12px; font-size: 22px; }

        .section { margin-top: 20px; border: 1px solid #ddcfbf; background: #fffaf4; padding: 12px; }
        .section h4 { margin: 0 0 10px; font-size: 32px; border-bottom: 1px solid #e5d9cd; padding-bottom: 8px; }

        .chips { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
        .chip { background: #f4ecdf; border-radius: 8px; overflow: hidden; border: 1px solid #e2d4c5; }
        .sw { height: 48px; }
        .code { font-size: 18px; text-align: center; padding: 4px; color: #594d42; }

        .line-text { font-size: 24px; line-height: 1.6; color: #56483c; }
        .strip { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
        .mini { width: 100%; height: 190px; object-fit: cover; border: 1px solid #e1d2c3; }

        .foot { margin-top: 16px; border-top: 1px solid #dccdbc; padding-top: 10px; font-size: 19px; color: #7a6859; }
      </style>
    </head>
    <body>
      <div class="poster">
        <div class="title">
          <h1>PERSONAL IMAGE REPORT</h1>
          <p>个人形象诊断总报告</p>
        </div>

        <div class="hero">
          <div class="portrait">
            <img src="${imageBase64}" />
            <div class="badge">
              <div class="cn">${profile.season}</div>
              <div class="en">${profile.subtype}</div>
            </div>
          </div>

          <div class="grid">
            <h3>色彩坐标与风格关键词</h3>
            <div class="metrics">
              <div class="metric">底调：${profile.tone}</div>
              <div class="metric">明度：${profile.brightness}</div>
              <div class="metric">彩度：${profile.chroma}</div>
              <div class="metric">对比度：${profile.contrast}</div>
            </div>
            <div class="kw">${profile.keywords.map((k) => `<span>${k}</span>`).join("")}</div>
          </div>
        </div>

        <div class="section">
          <h4>推荐色</h4>
          <div class="chips">${colorBlocks(profile.recommendedColors)}</div>
        </div>

        <div class="section">
          <h4>强调色</h4>
          <div class="chips">${colorBlocks(profile.enhancedColors)}</div>
        </div>

        <div class="section">
          <h4>避雷色</h4>
          <div class="chips">${colorBlocks(profile.avoidColors)}</div>
        </div>

        <div class="section">
          <h4>穿搭 / 妆容 / 发型建议</h4>
          <div class="line-text">穿搭：${profile.outfitTips}</div>
          <div class="line-text">妆容：${profile.makeupTips}</div>
          <div class="line-text">发型：${profile.hairstyleTips}</div>
        </div>

        <div class="section">
          <h4>造型预览（同人像风格演示位）</h4>
          <div class="strip">${avatarStrip(imageBase64, 5)}</div>
        </div>

        <div class="foot">* 本页为 AI 生成的商业化 H5 报告模板，可对接支付系统后发放随机密码解锁高清图。</div>
      </div>
    </body>
  </html>`;
}

app.post("/create-order", (req, res) => {
  const orderId = uuidv4();
  const token = uuidv4();
  const unlockCode = randomCode();

  orders[orderId] = {
    token,
    unlockCode,
    paid: true,
    report: null,
    preview: null
  };

  res.json({
    orderId,
    token,
    unlockCode
  });
});

app.post("/generate", async (req, res) => {
  const { imageBase64, token } = req.body;
  const orderEntry = Object.entries(orders).find(([, order]) => order.token === token);

  if (!orderEntry) {
    return res.status(403).json({ error: "未支付或 token 无效" });
  }

  if (!imageBase64) {
    return res.status(400).json({ error: "缺少图片" });
  }

  try {
    const [orderId, order] = orderEntry;
    const profile = await buildProfileWithAI();
    const html = buildPosterHTML({ imageBase64, profile });

    const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle0" });

    const full = await page.screenshot({ type: "png", fullPage: true });
    await browser.close();

    const reportData = `data:image/png;base64,${full.toString("base64")}`;

    order.report = reportData;
    order.preview = reportData;

    orders[orderId] = order;

    res.json({ report: reportData });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "生成失败" });
  }
});

app.post("/unlock", (req, res) => {
  const { orderId, unlockCode } = req.body;
  const order = orders[orderId];

  if (!order) {
    return res.status(404).json({ error: "订单不存在" });
  }

  if (!order.paid) {
    return res.status(403).json({ error: "订单未支付" });
  }

  if (order.unlockCode !== unlockCode) {
    return res.status(403).json({ error: "密码错误" });
  }

  if (!order.report) {
    return res.status(400).json({ error: "请先生成报告" });
  }

  res.json({
    success: true,
    report: order.report
  });
});

app.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});
