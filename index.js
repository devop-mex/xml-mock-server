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

// Basit log (body string ise yaz)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (typeof req.body === "string" && req.body.length) {
    console.log("body:", req.body.slice(0, 300));
  }
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

    const orderId = data?.CC5Request?.OrderId || "UNKNOWN_ORDER";
    const responseXml = `
<CC5Response>
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
</CC5Response>`.trim();

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
