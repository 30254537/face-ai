import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import OpenAI from "openai";
import puppeteer from "puppeteer";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

// 👉 填你自己的 OPENAI KEY（或用环境变量）
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 👉 模拟订单数据库
let orders = {};

// ==============================
// ① 创建订单（测试用）
// ==============================
app.post("/create-order", (req, res) => {
  const orderId = uuidv4();
  const token = uuidv4();

  orders[orderId] = {
    paid: true, // ⚠️ 测试阶段直接已支付
    token
  };

  res.json({ orderId, token });
});

// ==============================
// ② 生成报告
// ==============================
app.post("/generate", async (req, res) => {
  const { imageBase64, token } = req.body;

  // 👉 验证 token
  const valid = Object.values(orders).find(o => o.token === token);
  if (!valid) {
    return res.status(403).json({ error: "未支付或无效token" });
  }

  try {
    // ==============================
    // 👉 调用 ChatGPT 生成内容
    // ==============================
    const ai = await client.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "user",
          content: `
请根据人物生成高级形象分析：
输出JSON格式：
{
 "tags": ["风格1","风格2","风格3"],
 "colors": ["#xxxxxx","#xxxxxx","#xxxxxx","#xxxxxx"],
 "outfit": "穿搭建议一句话",
 "makeup": "妆容建议一句话"
}
          `
        }
      ]
    });

    // 👉 解析AI返回
    let parsed;
    try {
      parsed = JSON.parse(ai.choices[0].message.content);
    } catch {
      parsed = {
        tags: ["柔和","知性","温婉"],
        colors: ["#F3E5D0","#D4BFA4","#C77D5C","#8A9A5B"],
        outfit: "柔软面料 + 简约剪裁",
        makeup: "暖调自然光泽妆"
      };
    }

    // ==============================
    // 👉 构建顶级UI海报
    // ==============================
    const html = `
    <html>
    <head>
    <style>
      body {
        margin:0;
        background:#000;
        font-family:sans-serif;
      }
      .poster {
        width:1080px;
        height:1920px;
        padding:80px;
        background:radial-gradient(circle,#1a1a1a,#000);
        color:#fff;
        display:flex;
        flex-direction:column;
        justify-content:space-between;
      }
      .top {
        display:flex;
        justify-content:space-between;
      }
      .title {
        font-size:50px;
        font-weight:bold;
      }
      .avatar {
        width:320px;
        height:420px;
        border-radius:20px;
        object-fit:cover;
      }
      .tags {
        display:flex;
        gap:10px;
        flex-wrap:wrap;
      }
      .tag {
        padding:10px 20px;
        background:#222;
        border-radius:20px;
      }
      .colors {
        display:flex;
        gap:15px;
      }
      .color {
        width:80px;
        height:80px;
        border-radius:10px;
      }
      .text {
        font-size:28px;
        line-height:1.6;
      }
    </style>
    </head>

    <body>
    <div class="poster">

      <div class="top">
        <div class="title">PERSONAL IMAGE</div>
        <img src="${imageBase64}" class="avatar"/>
      </div>

      <div>
        <h2>STYLE</h2>
        <div class="tags">
          ${parsed.tags.map(t => `<div class="tag">${t}</div>`).join("")}
        </div>
      </div>

      <div>
        <h2>COLOR</h2>
        <div class="colors">
          ${parsed.colors.map(c => `<div class="color" style="background:${c}"></div>`).join("")}
        </div>
      </div>

      <div class="text">
        <h2>OUTFIT</h2>
        ${parsed.outfit}
      </div>

      <div class="text">
        <h2>MAKEUP</h2>
        ${parsed.makeup}
      </div>

    </div>
    </body>
    </html>
    `;

    // ==============================
    // 👉 转图片（关键）
    // ==============================
    const browser = await puppeteer.launch({
      args: ["--no-sandbox"]
    });

    const page = await browser.newPage();
    await page.setContent(html);
    const img = await page.screenshot({
      type: "png"
    });

    await browser.close();

    res.json({
      report: `data:image/png;base64,${img.toString("base64")}`
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "生成失败" });
  }
});

// ==============================
// 启动服务
// ==============================
app.listen(3000, () => {
  console.log("🚀 Server running on 3000");
});