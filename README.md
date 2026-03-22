# FundFlow

 Dashboard สำหรับบันทึกผลรายวันลง Google Sheet และแสดงผลบนปฏิทิน โดยใช้ Tailwind CSS

## แนวคิดการใช้งาน

- หน้าเว็บนี้ไม่ใช่เว็บเทรด
- ใช้สำหรับ `คลิกวันที่บนปฏิทิน`
- กรอก `ผลของวัน` เช่น `120.50` หรือ `-45.00`
- กรอก `note` เพิ่มได้ถ้าต้องการ
- กดบันทึก แล้วระบบจะเขียนลงชีต

1 วัน = 1 รายการ

ถ้าบันทึกวันเดิมอีกครั้ง ระบบจะ `อัปเดตข้อมูลเดิม` ไม่ได้เพิ่มหลายแถว

## โครงสร้างไฟล์

- `Code.gs` = Google Apps Script backend / API / เขียนข้อมูลลงชีต
- `appsscript.json` = GAS manifest
- `Index.html` = หน้า dashboard
- `Index.html` โหลด `Tailwind CSS` ผ่าน CDN
- `app.js` = logic ฝั่ง frontend
- `config.js` = URL สำหรับเชื่อมไปยัง GAS web app

## โครงสร้างข้อมูลในชีต

ระบบจะสร้างชีตชื่อ `DailyResults`

คอลัมน์มีดังนี้:

- `recordId`
- `resultDate`
- `pnl`
- `note`
- `createdAt`

## วิธี deploy

### 1. Deploy GAS

1. สร้างโปรเจกต์ Google Apps Script ใหม่
2. คัดลอกไฟล์ `Code.gs` และ `appsscript.json` ไปวาง
3. Deploy เป็น `Web app`
4. ใช้ URL ที่ได้ในขั้นตอนถัดไป

### 2. ตั้งค่า frontend

แก้ไฟล์ `config.js`

```js
window.APP_CONFIG = {
  appName: 'FundFlow',
  currency: 'USDT',
  gasWebAppUrl: 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec',
  requestTimeoutMs: 15000
};
```

### 3. เปิดหน้าเว็บ

เปิด `Index.html` ผ่าน static host หรือ local web server

- GitHub Pages
- Netlify
- Vercel
- local server

## API ที่ใช้

- `GET ?action=getDashboardData&monthKey=YYYY-MM`
- `GET ?action=saveDailyResult&resultDate=YYYY-MM-DD&pnl=...&note=...`
- `GET ?action=seedSampleResults`

หมายเหตุ:

- frontend ใช้ `JSONP` เพื่อเรียก GAS จาก static HTML ได้
- เพราะใช้ `GET` ในการบันทึกข้อมูล ควรเก็บ `note` แบบสั้น

## ฟังก์ชันตัวอย่าง

ถ้าต้องการข้อมูลตัวอย่าง:

- เปิด `.../exec?action=seedSampleResults`
- หรือรัน `seedSampleResults()` จาก Apps Script editor
