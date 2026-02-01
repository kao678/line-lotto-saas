require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");
const fs = require("fs");
const dayjs = require("dayjs");

const app = express();

/* ===== LINE CONFIG ===== */
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
};
const client = new line.Client(config);
const ADMIN = process.env.ADMIN_USER_ID;

/* ===== DB (JSON) ===== */
let db = fs.existsSync("data.json")
  ? JSON.parse(fs.readFileSync("data.json"))
  : { tenants: [], orders: [] };

const saveDB = () =>
  fs.writeFileSync("data.json", JSON.stringify(db, null, 2));

/* ===== TEMP STATE ===== */
const userState = {};

/* ===== TENANT CHECK ===== */
function getTenantByUser(userId) {
  return db.tenants.find(t => t.ownerLineId === userId);
}

/* ===== WEBHOOK ===== */
app.post("/webhook", line.middleware(config), async (req, res) => {
  for (const event of req.body.events) {
    await handleEvent(event);
  }
  res.sendStatus(200);
});

/* ===== HANDLE EVENT ===== */
async function handleEvent(event) {
  if (event.type === "message" && event.message.type === "text") {
    return handleText(event);
  }
  if (event.type === "postback") {
    return handlePostback(event);
  }
}

/* ===== HANDLE TEXT ===== */
async function handleText(event) {
  const text = event.message.text.trim();
  const userId = event.source.userId;

  /* เรียกฟอร์ม */
  if (text === "แทงหวย") {
    userState[userId] = {};
    return client.replyMessage(event.replyToken, flexSelectStock());
  }

  const state = userState[userId];
  if (!state) return;

  /* รับเลข */
  if (!state.number && /^\d{3}$/.test(text)) {
    state.number = text;
    return reply(event, "💰 ใส่จำนวนเงิน");
  }

  /* รับเงิน */
  if (state.number && /^\d+$/.test(text)) {
    state.amount = Number(text);
    return client.replyMessage(event.replyToken, flexConfirm(state));
  }
}

/* ===== POSTBACK ===== */
async function handlePostback(event) {
  const data = event.postback.data;
  const userId = event.source.userId;
  userState[userId] = userState[userId] || {};

  if (data.startsWith("stock=")) {
    userState[userId].stock = data.split("=")[1];
    return reply(event, "✏️ ใส่เลข 3 ตัว");
  }

  if (data === "confirm=bet") {
    const s = userState[userId];
    db.orders.push({
      orderId: Date.now().toString(),
      userId,
      stock: s.stock,
      number: s.number,
      amount: s.amount,
      status: "รอผล",
      createdAt: dayjs().format("YYYY-MM-DD HH:mm")
    });
    saveDB();
    delete userState[userId];
    return reply(event, "✅ รับโพยเรียบร้อย");
  }
}

/* ===== FLEX ===== */
function flexSelectStock() {
  return {
    type: "flex",
    altText: "เลือกหุ้น",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "🎯 เลือกหุ้น", weight: "bold" },
          {
            type: "button",
            action: {
              type: "postback",
              label: "SET",
              data: "stock=SET"
            }
          }
        ]
      }
    }
  };
}

function flexConfirm(s) {
  return {
    type: "flex",
    altText: "ยืนยันโพย",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "🧾 สรุปโพย", weight: "bold" },
          { type: "text", text: `หุ้น: ${s.stock}` },
          { type: "text", text: `เลข: ${s.number}` },
          { type: "text", text: `เงิน: ${s.amount} บาท` },
          {
            type: "button",
            style: "primary",
            action: {
              type: "postback",
              label: "ยืนยัน",
              data: "confirm=bet"
            }
          }
        ]
      }
    }
  };
}

/* ===== REPLY ===== */
function reply(event, text) {
  return client.replyMessage(event.replyToken, {
    type: "text",
    text
  });
}

/* ===== ADMIN API ===== */
app.post("/admin/tenant", express.json(), (req, res) => {
  db.tenants.push(req.body);
  saveDB();
  res.send({ ok: true });
});

app.listen(process.env.PORT || 3000, () =>
  console.log("BOT RUNNING")
);
