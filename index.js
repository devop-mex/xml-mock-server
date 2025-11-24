import express from "express";
import { XMLParser } from "fast-xml-parser";

const app = express();
const port = process.env.PORT || 10000;

// YALNIZCA XML'i text olarak al
app.use(
  express.text({
    type: ["application/xml", "text/xml"],
    defaultCharset: "utf-8",
  })
);

// Detaylı request logging
app.use((req, _res, next) => {
  console.log("\n" + "=".repeat(80));
  console.log(`📥 INCOMING REQUEST [${new Date().toISOString()}]`);
  console.log(`${req.method} ${req.path}`);
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  
  if (typeof req.body === "string" && req.body.length) {
    console.log("\n📄 Request Body (XML):");
    console.log(req.body);
  }
  console.log("=".repeat(80) + "\n");
  
  next();
});

// Health check
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "xml-mock", time: new Date().toISOString() });
});

// Default mock cevabı (XML -> XML)
app.post(["/", "/cc5/pay"], (req, res) => {
  try {
    const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
    const data = parser.parse(req.body || "");

    // FULL DATA DEBUG
    console.log("\n🔍 FULL PARSED DATA:");
    console.log(JSON.stringify(data, null, 2));

    // OrderId boş gelirse dinamik oluştur
    const orderId = data?.CC5Request?.OrderId || `ORDER-${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
    
    // MAXIPUANSORGU kontrolü - Extra tag'i içinde
    const maxiPuanSorgu = data?.CC5Request?.Extra?.MAXIPUANSORGU;
    
    console.log("\n🔍 DEBUG:");
    console.log("OrderId:", orderId);
    console.log("MAXIPUANSORGU değeri:", maxiPuanSorgu);
    console.log("MAXIPUANSORGU type:", typeof maxiPuanSorgu);
    console.log("Extra içeriği:", JSON.stringify(data?.CC5Request?.Extra, null, 2));
    console.log("Kontrol sonucu:", maxiPuanSorgu === "MAXIPUANSORGU");
    if (maxiPuanSorgu === "MAXIPUANSORGU") {
      console.log("\n🔍 MAXIPUANSORGU talebi algılandı");
      console.log("📦 OrderId:", orderId);
      
      const maxiPuanResponseXml = `<CC5Response>
    <ErrMsg></ErrMsg>
    <OrderId>${orderId}</OrderId>
    <ProcReturnCode>00</ProcReturnCode>
    <Response>Approved</Response>
    <AuthCode>P11222</AuthCode>
    <TransId>25328LPjH13565</TransId>
    <HostRefNum>532800067953</HostRefNum>
    <Extra>
        <ERRORCODE></ERRORCODE>
        <NUMCODE>00</NUMCODE>
        <HOSTMSG>TOPLAMMAXIPUAN: 50.00 TL</HOSTMSG>
        <MAXIPUAN>50.00</MAXIPUAN>
        <HOSTDATE>1124-111536</HOSTDATE>
    </Extra>
</CC5Response>`;

      console.log("\n📤 Dönen MaxiPuan Response XML:");
      console.log(maxiPuanResponseXml);
      console.log("\n" + "=".repeat(80) + "\n");
      
      res.set("Content-Type", "application/xml; charset=utf-8");
      res.status(200).send(maxiPuanResponseXml);
      return;
    }

    // Normal ödeme yanıtı
    console.log("\n💳 Normal ödeme işlemi");
    console.log("📦 OrderId:", orderId);
    
    const responseXml = `<CC5Response>
    <OrderId>${orderId}</OrderId>
    <GroupId>${orderId}</GroupId>
    <Response>Approved</Response>
    <AuthCode>621715</AuthCode>
    <HostRefNum>531113545069</HostRefNum>
    <ProcReturnCode>00</ProcReturnCode>
    <TransId>25311NVIA12472</TransId>
    <ErrMsg></ErrMsg>
    <Extra>
        <SETTLEID>2885</SETTLEID>
        <TRXDATE>${new Date().toISOString().replace("T", " ").split(".")[0]}</TRXDATE>
        <ERRORCODE></ERRORCODE>
        <CARDBRAND>MASTERCARD</CARDBRAND>
        <CARDISSUER>AKBANK T.A.S.</CARDISSUER>
        <KAZANILANPUAN>000000010.00</KAZANILANPUAN>
        <NUMCODE>00</NUMCODE>
    </Extra>
</CC5Response>`;

    console.log("\n📤 Dönen Ödeme Response XML:");
    console.log(responseXml);
    console.log("\n" + "=".repeat(80) + "\n");

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.status(200).send(responseXml);
  } catch (err) {
    console.error("Parse error:", err);
    res.status(400).send("<error>Invalid XML</error>");
  }
});

// Start
app.listen(port, () => {
  console.log(`✅ XML mock sunucusu ${port} portunda yayında`);
});
