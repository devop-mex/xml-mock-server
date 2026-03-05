import express from "express";
import { XMLParser } from "fast-xml-parser";
import crypto from "crypto";

const app = express();
const port = process.env.PORT || 10000;

// URL-encoded form data desteği ekle (önce bu olmalı)
app.use(express.urlencoded({ extended: true }));

// Tüm request body'leri text olarak al (XML, JSON header'ı ile gelse bile)
app.use(
  express.text({
    type: ["application/xml", "text/xml", "application/json"],
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
    console.log("\n📄 Request Body (raw):");
    console.log(req.body);
  } else if (typeof req.body === "object") {
    console.log("\n📄 Request Body (parsed):");
    console.log(JSON.stringify(req.body, null, 2));
  }
  console.log("=".repeat(80) + "\n");
  
  next();
});

// Health check
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "xml-mock", time: new Date().toISOString() });
});

// Default mock cevabı (XML -> XML veya Form Data -> JSON)
app.post(["/", "/cc5/pay"], (req, res) => {
  try {
    let data = {};
    let isFormData = false;

    // Content-Type'a göre parse et
    const contentType = req.headers["content-type"] || "";
    
    if (contentType.includes("application/x-www-form-urlencoded")) {
      // Form data gelmiş
      isFormData = true;
      data = req.body;
      console.log("\n✅ Form data algılandı");
    } else if (typeof req.body === "string" && req.body.trim().startsWith("<")) {
      // XML gelmiş
      const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
      data = parser.parse(req.body || "");
      console.log("\n✅ XML data algılandı");
    } else {
      console.log("\n⚠️ Bilinmeyen format");
    }

    // FULL DATA DEBUG
    console.log("\n🔍 FULL PARSED DATA:");
    console.log(JSON.stringify(data, null, 2));

    // OrderId - form data veya XML'den al
    const orderId = data?.oid || data?.CC5Request?.OrderId || `ORDER-${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
    
    // 3D kontrolü - form data'da storetype, XML'de Extra.STORETYPE
    const storeType = data?.storetype || data?.CC5Request?.Extra?.STORETYPE;
    
    // MAXIPUANSORGU kontrolü - Extra tag'i içinde
    const maxiPuanSorgu = data?.CC5Request?.Extra?.MAXIPUANSORGU;
    
    console.log("\n🔍 DEBUG:");
    console.log("OrderId:", orderId);
    console.log("STORETYPE değeri:", storeType);
    console.log("MAXIPUANSORGU değeri:", maxiPuanSorgu);
    console.log("Is Form Data:", isFormData);

    // 1. ÖNCELİK: 3D Secure işlemi
    if (storeType === "3d" || storeType === "3D" || storeType === "3d_pay" || storeType === "3D_PAY") {
      console.log("\n🔐 3D Secure işlemi algılandı");
      console.log("📦 OrderId:", orderId);
      
      // 3D Response parametreleri - form data veya XML'den al
      const amount = data?.amount || data?.CC5Request?.Total || "123.00";
      const currency = data?.Currency || data?.CC5Request?.Currency || "949";
      const merchantID = data?.clientid || data?.CC5Request?.ClientId || "100100000";
      const rndValue = data?.rnd || Math.random().toString(36).substring(2, 15);
      const okURL = data?.okURL || data?.CC5Request?.Extra?.okURL || "https://test.mobilexpress.com.tr/VPayment/TD/50687965-bfcb-40ea-8bfe-2696f64175c0";
      const failUrl = data?.failUrl || data?.CC5Request?.Extra?.failUrl || "https://test.mobilexpress.com.tr/VPayment/TD/50687965-bfcb-40ea-8bfe-2696f64175c0";
      
      // Kart bilgileri
      const pan = data?.pan || data?.CC5Request?.Number || "5571135571135575";
      const maskedPan = pan.substring(0, 2) + "** **** **** " + pan.substring(pan.length - 4);
      const expMonth = data?.Ecom_Payment_Card_ExpDate_Month || "12";
      const expYear = data?.Ecom_Payment_Card_ExpDate_Year || "26";
      
      // Dinamik değerler
      const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').substring(0, 12);
      const acsTransID = generateUUID();
      const dsTransID = generateUUID();
      const threeDSServerTransID = generateUUID();
      
      // MD değeri (Hash için)
      const mdData = `${maskedPan.substring(0, 6)}:${generateRandomHash()}:3389:##${merchantID}`;
      
      // 3D parametrelerini önce oluştur (HASH hariç)
      const threeDParams = {
        TRANID: "",
        hashAlgorithm: "ver3",
        PAResSyntaxOK: "true",
        lang: data?.lang || "tr",
        "TDS2.authTimestamp": timestamp,
        merchantID: merchantID,
        maskedCreditCard: maskedPan,
        amount: amount,
        okURL: okURL,
        sID: "2",
        ACQBIN: "550383",
        "TDS2.RReqExtensions": '[{"name":"B******g","id":"A000000802-004","criticalityIndicator":false,"data":{"addData":{"authenticationMethod":["10"]},"version":"2.0"}}]',
        SUBMERCHANTPOSTALCODE: "34000",
        Ecom_Payment_Card_ExpDate_Year: expYear,
        SUBMERCHANTMCC: "",
        MaskedPan: maskedPan,
        merchantName: "Akbank",
        "TDS2.acsOperatorID": "3DS_LOA_ACS_MOMD_020301_00793",
        clientIp: "77.75.35.206",
        "TDS2.transStatus": "Y",
        "TDS2.acsTransID": acsTransID,
        Currency: currency,
        protocol: "3DS2.2.0",
        md: mdData,
        "TDS2.dsTransID": dsTransID,
        paresTxStatus: "Y",
        signature: generateSignature(),
        Ecom_Payment_Card_ExpDate_Month: expMonth,
        storetype: "3d",
        veresEnrolledStatus: "Y",
        "TDS2.acsReferenceNumber": "3DS_LOA_ACS_MOMD_020301_00793",
        "TDS2.AResExtensions": '[{"name":"B******g","id":"A000000802-004","criticalityIndicator":false,"data":{"addData":{"authenticationMethod":["10"]},"version":"2.0"}}]',
        mdErrorMsg: "Y-status/Challenge authentication via ACS: https://3ds-acs.test.modirum.com/mdpayacs/creq;token=362959071.1764773813.bzqYL9szu4W",
        PAResVerified: "true",
        cavv: generateCAVV(),
        digest: "digest",
        callbackCall: "true",
        failUrl: failUrl,
        xid: generateXID(),
        encoding: "UTF-8",
        SUBMERCHANTCOUNTRY: "792",
        oid: orderId,
        mdStatus: "1",
        dsId: "2",
        SUBMERCHANTID: "6080712084",
        eci: "02",
        version: "4.0",
        "TDS2.authenticationType": "01",
        SUBMERCHANTNAME: "",
        "TDS2.threeDSServerTransID": threeDSServerTransID,
        clientid: merchantID,
        SUBMERCHANTCITY: "İstanbul",
        rnd: rndValue
      };

      // ============================================================
      // NestPay / Asseco HASH v3 Hesaplama (SHA-512 + Base64)
      // ============================================================
      
      const STORE_KEY = process.env.STORE_KEY || "123456";
      
      // 1. HASH hesaplamasına dahil edilmeyecek alanlar
      const excludeFields = new Set(['HASH', 'hash', 'encoding', 'countdown']);
      
      // 2. Tüm parametreleri al ve hariç tutulanları filtrele
      const paramsForHash = Object.entries(threeDParams)
        .filter(([key]) => !excludeFields.has(key));
      
      // 3. Parametre isimlerini alfabetik sıraya göre sırala (A-Z)
      paramsForHash.sort((a, b) => a[0].localeCompare(b[0]));
      
      // 4. Değerleri escape et: | -> \| ve \ -> \\
      const escapeHashValue = (value) => {
        return String(value)
          .replace(/\\/g, '\\\\')  // önce \ -> \\
          .replace(/\|/g, '\\|');   // sonra | -> \|
      };
      
      // 5. Hash string'i oluştur: deger1|deger2|...|STOREKEY
      const hashValues = paramsForHash.map(([_, value]) => escapeHashValue(value));
      const hashPlainText = hashValues.join('|') + '|' + STORE_KEY;
      
      // 6. Console'a log (bankanın loguyla karşılaştırmak için)
      console.log('\n🔐 HASH v3 Hesaplama Detayları:');
      console.log('═'.repeat(80));
      console.log('📋 Sıralı parametreler:');
      paramsForHash.forEach(([key, value]) => {
        console.log(`  ${key}: ${escapeHashValue(value)}`);
      });
      console.log('─'.repeat(80));
      console.log('📝 Hash PlainText (| ile birleştirilmiş):');
      console.log(hashPlainText);
      console.log('─'.repeat(80));
      
      // 7. SHA-512 hash hesapla ve Base64'e çevir
      const calculatedHash = crypto
        .createHash('sha512')
        .update(hashPlainText, 'utf8')
        .digest('base64');
      
      console.log('✅ Hesaplanan HASH (SHA-512 -> Base64):');
      console.log(calculatedHash);
      console.log('═'.repeat(80) + '\n');
      
      // 8. HASH'i threeDParams'a ekle
      threeDParams.HASH = calculatedHash;
      threeDParams.hashAlgorithm = "ver3";

      // HTML form ile okURL'e POST redirect
      const formFields = Object.entries(threeDParams)
        .map(([key, value]) => `<input type="hidden" name="${key}" value="${String(value).replace(/"/g, '&quot;')}">`)
        .join('\n        ');

      const redirectHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>3D Secure Doğrulama</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: Inter, Arial, sans-serif;
            background: #f5f7fa;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
            color: #1b355e;
            line-height: 1.5714285714;
            font-feature-settings: 'liga','kern';
            font-kerning: normal;
            -webkit-font-smoothing: antialiased;
            text-rendering: optimizeLegibility;
        }
        .c-card {
            background: white;
            border-radius: 8px;
            border: 1px solid #e2e8f2;
            box-shadow: 0 2px 8px rgba(27, 53, 94, 0.08);
            width: 100%;
            max-width: 520px;
            overflow: hidden;
        }
        .c-card__header {
            background: #21345b;
            padding: 24px;
            border-bottom: 1px solid #e2e8f2;
            display: flex;
            align-items: center;
            gap: 16px;
        }
        .lidio-logo {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .lidio-logo-text {
            font-size: 28px;
            font-weight: 700;
            color: #1b355e;
        }
        .lidio-logo-accent {
            background: #00d4aa;
            color: white;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 28px;
            font-weight: 700;
        }
        .c-card__divider {
            border: 0;
            border-top: 1px solid #e2e8f2;
            margin: 0;
        }
        .c-card__body {
            padding: 24px;
        }
        .c-list-item {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 20px;
        }
        .c-list-item__main-slot h5 {
            font-size: 14px;
            font-weight: 600;
            color: #1b355e;
            margin: 0;
        }
        .c-list-item__main-slot p {
            font-size: 16px;
            font-weight: 500;
            color: #4a5f7f;
            margin: 4px 0 0 0;
            letter-spacing: 1px;
        }
        .c-list-item__right-slot {
            margin-left: auto;
            font-size: 18px;
            font-weight: 600;
            color: #1b355e;
        }
        .c-form-field {
            margin-bottom: 20px;
        }
        .c-form-label {
            display: block;
            font-size: 13px;
            font-weight: 500;
            color: #4a5f7f;
            margin-bottom: 8px;
        }
        .c-form-control {
            width: 100%;
            padding: 12px 16px;
            border: 1px solid #d1dbe8;
            border-radius: 6px;
            font-size: 20px;
            font-weight: 600;
            color: #1b355e;
            text-align: center;
            letter-spacing: 6px;
            transition: all 0.2s;
            background: white;
            font-family: Inter, Arial, sans-serif;
        }
        .c-form-control:focus {
            outline: none;
            border-color: #00d4aa;
            box-shadow: 0 0 0 3px rgba(0, 212, 170, 0.1);
        }
        .c-form-control::placeholder {
            letter-spacing: normal;
            font-size: 14px;
            font-weight: normal;
            color: #8895aa;
        }
        .info-box {
            background: #f0f9ff;
            border: 1px solid #bae6fd;
            border-radius: 6px;
            padding: 12px 16px;
            margin: 16px 0;
            font-size: 13px;
            color: #1b355e;
            line-height: 1.5;
        }
        .info-box strong {
            font-weight: 600;
            color: #0891b2;
        }
        .c-checkbox {
            display: flex;
            align-items: start;
            gap: 10px;
            cursor: pointer;
            margin: 16px 0;
        }
        .c-checkbox__inp {
            width: 18px;
            height: 18px;
            margin-top: 2px;
            cursor: pointer;
            accent-color: #00d4aa;
        }
        .c-checkbox__label {
            font-size: 13px;
            color: #4a5f7f;
            line-height: 1.5;
            flex: 1;
        }
        .c-button {
            width: 100%;
            background: linear-gradient(135deg, #1b355e 0%, #2d4a7c 100%);
            color: white;
            border: none;
            padding: 14px 24px;
            border-radius: 6px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            margin-top: 20px;
            font-family: Inter, Arial, sans-serif;
            position: relative;
        }
        .c-button:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(27, 53, 94, 0.3);
        }
        .c-button:active {
            transform: translateY(0);
        }
        .c-button:disabled {
            background: #d1dbe8;
            cursor: not-allowed;
            transform: none;
            opacity: 0.6;
        }
        .security-footer {
            text-align: center;
            padding: 16px 24px;
            background: #f8fafc;
            border-top: 1px solid #e2e8f2;
            font-size: 12px;
            color: #8895aa;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        .spinner {
            display: none;
            border: 3px solid rgba(255,255,255,0.3);
            border-top: 3px solid white;
            border-radius: 50%;
            width: 18px;
            height: 18px;
            animation: spin 0.8s linear infinite;
            margin: 0 auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .loading .spinner {
            display: inline-block;
        }
        .loading .btn-text {
            display: none;
        }
        .amount-badge {
            background: transparent;
            border: none;
            padding: 0;
            font-size: 18px;
            font-weight: 600;
            color: #1b355e;
        }
    </style>
</head>
<body>
    <div class="c-card">
        <div class="c-card__header">
            <img src="data:image/png;base64,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" alt="Lidio" style="height: 36px;">
        </div>
        
        <hr class="c-card__divider">
        
        <div class="c-card__body">
            <div class="c-list-item">
                <div class="c-list-item__main-slot">
                    <h5>KART NUMARASI</h5>
                    <p>${threeDParams.MaskedPan}</p>
                </div>
                <div class="c-list-item__right-slot">
                    <span class="amount-badge">${threeDParams.amount} ${threeDParams.Currency === '949' ? 'TL' : 'USD'}</span>
                </div>
            </div>

            <hr class="c-card__divider" style="margin: 20px 0;">

            <div class="c-form-field">
                <label class="c-form-label">SMS Doğrulama Kodu</label>
                <input type="text" 
                       id="otpInput" 
                       class="c-form-control" 
                       maxlength="6" 
                       placeholder="6 haneli kodu girin"
                       autocomplete="off">
            </div>

            <div class="info-box">
                ℹ️ Test için sabit OTP: <strong>429500</strong>
            </div>

            <button type="button" class="c-button" id="submitBtn" disabled>
                <span class="btn-text">${threeDParams.amount} ${threeDParams.Currency === '949' ? 'TL' : 'USD'} Öde</span>
                <div class="spinner"></div>
            </button>
        </div>

        <div class="security-footer">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C6.9 0 6 .9 6 2v1H4.5C3.7 3 3 3.7 3 4.5v9c0 .8.7 1.5 1.5 1.5h7c.8 0 1.5-.7 1.5-1.5v-9c0-.8-.7-1.5-1.5-1.5H10V2c0-1.1-.9-2-2-2zM7 2c0-.6.4-1 1-1s1 .4 1 1v1H7V2z"/>
            </svg>
            Bu işlem güvenli bir bağlantı üzerinden gerçekleştirilmektedir.
        </div>
    </div>

    <form id="threeDForm" method="POST" action="${okURL}" style="display:none;">
        ${formFields}
    </form>

    <script>
        const otpInput = document.getElementById('otpInput');
        const submitBtn = document.getElementById('submitBtn');
        const threeDForm = document.getElementById('threeDForm');
        const CORRECT_OTP = '429500';

        // OTP input sadece sayı kabul etsin
        otpInput.addEventListener('input', function(e) {
            this.value = this.value.replace(/[^0-9]/g, '');
            
            // 6 hane girildiyse butonu aktif et
            if (this.value.length === 6) {
                submitBtn.disabled = false;
            } else {
                submitBtn.disabled = true;
            }
        });

        // Enter tuşu ile submit
        otpInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && this.value.length === 6) {
                submitBtn.click();
            }
        });

        // Submit butonu
        submitBtn.addEventListener('click', function() {
            const enteredOTP = otpInput.value;

            if (enteredOTP !== CORRECT_OTP) {
                otpInput.style.borderColor = '#e74c3c';
                otpInput.style.animation = 'shake 0.5s';
                setTimeout(() => {
                    otpInput.style.animation = '';
                }, 500);
                
                alert('❌ Hatalı OTP kodu! Lütfen tekrar deneyin.\\n\\nTest için: 429500');
                otpInput.value = '';
                submitBtn.disabled = true;
                return;
            }

            // Başarılı - Loading göster ve formu gönder
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
            otpInput.disabled = true;

            setTimeout(function() {
                threeDForm.submit();
            }, 1000);
        });

        // Shake animasyonu için CSS
        const style = document.createElement('style');
        style.textContent = \`
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
                20%, 40%, 60%, 80% { transform: translateX(5px); }
            }
        \`;
        document.head.appendChild(style);

        // Sayfa yüklendiğinde input'a focus
        setTimeout(() => otpInput.focus(), 500);
    </script>
</body>
</html>`;

      console.log("\n📤 3D Redirect HTML oluşturuldu");
      console.log("🔗 Redirect URL:", okURL);
      console.log("📊 Parametre sayısı:", Object.keys(threeDParams).length);
      console.log("\n" + "=".repeat(80) + "\n");
      
      res.set("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(redirectHTML);
      return;
    }

// 2. ÖNCELİK: MAXIPUANSORGU kontrolü
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
        <HOSTMSG>TOPLAMMAXIPUAN: 100000.00 TL</HOSTMSG>
        <MAXIPUAN>100000.00</MAXIPUAN>
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

// 2.1 ÖNCELİK: PUANSORGU kontrolü
const puanSorgu = data?.CC5Request?.Extra?.PUANSORGU;

if (puanSorgu === "PUANSORGU") {
  console.log("\n🔍 PUANSORGU talebi algılandı");
  console.log("📦 OrderId:", orderId);

  const puanSorguResponseXml = `<CC5Response>
 <ErrMsg></ErrMsg>
 <OrderId>${orderId}</OrderId>
 <ProcReturnCode>00</ProcReturnCode>
 <Response>Approved</Response>
 <AuthCode>571880</AuthCode>
 <TransId>26064OYOG11828</TransId>
 <HostRefNum>606414606923</HostRefNum>
 <Extra>
 <ERRORCODE></ERRORCODE>
 <NUMCODE>00</NUMCODE>
 <KATLIDAHILKULLANILABILIRPUAN>000000455.40</KATLIDAHILKULLANILABILIRPUAN>
 <KATLIKULLANILABILIRPUAN>000000355.40</KATLIKULLANILABILIRPUAN>
 <KULLANILABILIRPUAN>000000082.40</KULLANILABILIRPUAN>
 </Extra>
</CC5Response>`;

  console.log("\n📤 Dönen PuanSorgu Response XML:");
  console.log(puanSorguResponseXml);
  console.log("\n" + "=".repeat(80) + "\n");

  res.set("Content-Type", "application/xml; charset=utf-8");
  res.status(200).send(puanSorguResponseXml);
  return;
}

// 3. VARSAYILAN: Normal ödeme yanıtı
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
    res.status(400).send("<error>Invalid request</error>");
  }
});

// Yardımcı fonksiyonlar
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateRandomHash() {
  return crypto.randomBytes(32).toString('hex').toUpperCase();
}

function generateSignature() {
  return crypto.randomBytes(128).toString('base64');
}

function generateCAVV() {
  return crypto.randomBytes(16).toString('base64');
}

function generateXID() {
  return crypto.randomBytes(16).toString('base64');
}

// Start
app.listen(port, () => {
  console.log(`✅ XML mock sunucusu ${port} portunda yayında`);
});
