"use strict";

const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const crypto = require("crypto");
const axios = require("axios");

const cloudinaryService = require("./cloudinaryService");

const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

const { FranchiseContractDocument } = require("../models");

// ===== Enterprise VN template versioning =====
// When you upgrade the PDF template, bump this constant so the system auto-creates
// a new document version for existing requests.
const TEMPLATE_LOCALE = "vi-VN";
const TEMPLATE_VERSION = "vn_official_enterprise_2026-02-16";

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function isHttpUrl(s) {
  return typeof s === "string" && /^https?:\/\//i.test(s);
}

async function fetchBufferFromUrl(url) {
  const r = await axios.get(url, { responseType: "arraybuffer" });
  return Buffer.from(r.data);
}

async function readPdfBuffer(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (isHttpUrl(pathOrUrl)) return fetchBufferFromUrl(pathOrUrl);
  return fsp.readFile(absFromRel(pathOrUrl));
}

function uploadsRoot() {
  // served by server.js at /uploads
  return path.join(process.cwd(), "uploads", "franchise-contracts");
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function absFromRel(relPath) {
  return path.join(process.cwd(), relPath);
}

function now() {
  return new Date();
}

function contractNoOf(fr) {
  const y = new Date().getFullYear();
  const id = String(fr?.id || "0").padStart(6, "0");
  return `GFMS/NQTM/${y}/${id}`;
}

async function getLatestDocument(franchiseRequestId, { transaction = null, lock = null } = {}) {
  return await FranchiseContractDocument.findOne({
    where: { franchiseRequestId },
    order: [["version", "DESC"]],
    transaction,
    lock,
  });
}

async function createNextVersion(franchiseRequestId, { transaction = null } = {}) {
  const latest = await getLatestDocument(franchiseRequestId, { transaction });
  const nextVersion = (latest?.version || 0) + 1;
  return await FranchiseContractDocument.create(
    {
      franchiseRequestId,
      version: nextVersion,
      isFrozen: false,
      meta: {},
    },
    { transaction }
  );
}

async function loadFonts(pdfDoc) {
  pdfDoc.registerFontkit(fontkit);

  const fontDir = path.join(process.cwd(), "src", "assets", "fonts");
  const regularPath = path.join(fontDir, "DejaVuSans.ttf");
  const boldPath = path.join(fontDir, "DejaVuSans-Bold.ttf");

  const regularBytes = await fsp.readFile(regularPath);
  const boldBytes = await fsp.readFile(boldPath);

  const regularFont = await pdfDoc.embedFont(regularBytes, { subset: true });
  const boldFont = await pdfDoc.embedFont(boldBytes, { subset: true });

  return { regularFont, boldFont };
}

function signatureLayout() {
  // A4 portrait (pdf points): 595 x 842
  // Signature boxes near bottom for enough space to print metadata under them.
  return {
    pageIndex: 0,
    ownerBox: { x: 50, y: 220, w: 230, h: 90 },
    adminBox: { x: 315, y: 220, w: 230, h: 90 },
  };
}

function wrapText(font, text, size, maxWidth) {
  const words = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    const width = font.widthOfTextAtSize(next, size);
    if (width <= maxWidth) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawParagraph(page, font, text, x, y, size, maxWidth, lineHeight, color = rgb(0.12, 0.14, 0.18)) {
  const lines = wrapText(font, text, size, maxWidth);
  for (const line of lines) {
    page.drawText(line, { x, y, size, font, color });
    y -= lineHeight;
  }
  return y;
}

function drawBulletList(page, font, items, x, y, size, maxWidth, lineHeight) {
  const bulletIndent = 10;
  for (const it of items) {
    const lines = wrapText(font, String(it || ""), size, maxWidth - bulletIndent);
    if (!lines.length) continue;
    page.drawText("•", { x, y, size, font, color: rgb(0.12, 0.14, 0.18) });
    page.drawText(lines[0], { x: x + bulletIndent, y, size, font, color: rgb(0.12, 0.14, 0.18) });
    y -= lineHeight;
    for (const l of lines.slice(1)) {
      page.drawText(l, { x: x + bulletIndent, y, size, font, color: rgb(0.12, 0.14, 0.18) });
      y -= lineHeight;
    }
  }
  return y;
}

function normalizeIp(ip) {
  if (!ip) return null;
  const s = String(ip);
  const first = s.split(",")[0].trim();
  return first.slice(0, 64);
}

function shortUa(ua, max = 90) {
  if (!ua) return null;
  const s = String(ua).replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function formatVNTime(d) {
  const dt = d instanceof Date ? d : new Date(d);
  try {
    const s = dt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
    return `${s} (GMT+7)`;
  } catch (e) {
    // Fallback: manual +07
    const ms = dt.getTime() + 7 * 60 * 60 * 1000;
    const vn = new Date(ms);
    const pad = (n) => String(n).padStart(2, "0");
    const s = `${pad(vn.getHours())}:${pad(vn.getMinutes())}:${pad(vn.getSeconds())} ${pad(vn.getDate())}/${pad(vn.getMonth() + 1)}/${vn.getFullYear()}`;
    return `${s} (GMT+7)`;
  }
}

async function generateOriginalPdf(fr, { transaction = null, forceNewVersion = false } = {}) {
  // Create document record if missing
  let doc = await getLatestDocument(fr.id, { transaction });
  const shouldAutoUpgrade =
    !!doc &&
    !forceNewVersion &&
    (doc?.meta?.locale !== TEMPLATE_LOCALE || doc?.meta?.templateVersion !== TEMPLATE_VERSION);

  if (!doc || forceNewVersion || shouldAutoUpgrade || doc.isFrozen) {
    doc = await createNextVersion(fr.id, { transaction });
  }

  // ✅ Enterprise: do NOT write PDF to local disk (Render filesystem is ephemeral)
  // We'll upload to Cloudinary (raw) and store URL in originalPdfPath.
  const relOriginalPath = null;
  const absOriginalPath = null;

  const contractNo = (doc?.meta && doc.meta.contractNo) || contractNoOf(fr);

  // Build PDF (enterprise VN template)
  const pdfDoc = await PDFDocument.create();
  const { regularFont, boldFont } = await loadFonts(pdfDoc);

  pdfDoc.setTitle(`Hợp đồng nhượng quyền thương mại - ${contractNo}`);
  pdfDoc.setSubject("Hợp đồng nhượng quyền thương mại (mẫu doanh nghiệp)");
  pdfDoc.setProducer("GFMS Contract Engine");
  pdfDoc.setCreator("GFMS");

  const PAGE_W = 595;
  const PAGE_H = 842;
  const marginX = 50;
  const contentW = PAGE_W - marginX * 2;
  const topY = PAGE_H - 86; // leave space for header bar
  const bottomLimit = 70; // leave space for footer

  const pages = [];

  function addPage() {
    const p = pdfDoc.addPage([PAGE_W, PAGE_H]);
    pages.push(p);
    return p;
  }

  function addHeaderFooter(page, pageNo, totalPages) {
    // Header bar
    page.drawRectangle({ x: 0, y: PAGE_H - 58, width: PAGE_W, height: 58, color: rgb(0.05, 0.09, 0.14) });
    page.drawRectangle({ x: 0, y: PAGE_H - 58, width: PAGE_W, height: 2.5, color: rgb(0.98, 0.55, 0.08) });

    page.drawText("GFMS · HỆ THỐNG NHƯỢNG QUYỀN", {
      x: marginX,
      y: PAGE_H - 36,
      size: 11.5,
      font: boldFont,
      color: rgb(0.93, 0.95, 0.99),
    });
    page.drawText(`Số: ${contractNo} · Phiên bản: v${doc.version}`, {
      x: marginX,
      y: PAGE_H - 52,
      size: 8.8,
      font: regularFont,
      color: rgb(0.75, 0.80, 0.88),
    });

    // Footer
    const footerY = 34;
    page.drawText(`Mã yêu cầu: #${fr.id}`, { x: marginX, y: footerY, size: 8, font: regularFont, color: rgb(0.45, 0.48, 0.54) });
    page.drawText(`Trang ${pageNo}/${totalPages}`, {
      x: PAGE_W - marginX - 80,
      y: footerY,
      size: 8,
      font: regularFont,
      color: rgb(0.45, 0.48, 0.54),
    });
  }

  function ensureSpace(curPage, y, needed) {
    if (y - needed >= bottomLimit) return { page: curPage, y };
    const np = addPage();
    return { page: np, y: topY };
  }

  // ===== Cover page =====
  let page = addPage();
  let y = topY;

  // Quốc hiệu
  const centerX = PAGE_W / 2;
  const qh1 = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
  const qh2 = "Độc lập – Tự do – Hạnh phúc";
  const dash = "--------------------------------";
  const qhSize = 12;

  const w1 = boldFont.widthOfTextAtSize(qh1, qhSize);
  const w2 = boldFont.widthOfTextAtSize(qh2, qhSize);
  const w3 = regularFont.widthOfTextAtSize(dash, 10);

  page.drawText(qh1, { x: centerX - w1 / 2, y, size: qhSize, font: boldFont, color: rgb(0.12, 0.14, 0.18) });
  y -= 18;
  page.drawText(qh2, { x: centerX - w2 / 2, y, size: qhSize, font: boldFont, color: rgb(0.12, 0.14, 0.18) });
  y -= 14;
  page.drawText(dash, { x: centerX - w3 / 2, y, size: 10, font: regularFont, color: rgb(0.40, 0.42, 0.46) });

  y -= 34;
  const title = "HỢP ĐỒNG NHƯỢNG QUYỀN THƯƠNG MẠI";
  const titleW = boldFont.widthOfTextAtSize(title, 16.5);
  page.drawText(title, { x: centerX - titleW / 2, y, size: 16.5, font: boldFont, color: rgb(0.05, 0.07, 0.10) });
  y -= 22;

  const soLine = `Số: ${contractNo}`;
  const soW = boldFont.widthOfTextAtSize(soLine, 11.5);
  page.drawText(soLine, { x: centerX - soW / 2, y, size: 11.5, font: boldFont, color: rgb(0.15, 0.17, 0.20) });
  y -= 24;

  const signPlace = process.env.CONTRACT_SIGN_PLACE || "TP. Hồ Chí Minh";
  page.drawText(`Địa điểm ký: ${signPlace} · Ngày tạo: ${formatVNTime(now())}`, {
    x: marginX,
    y,
    size: 9.8,
    font: regularFont,
    color: rgb(0.30, 0.32, 0.36),
  });
  y -= 18;

  const bases = [
    "Luật Thương mại số 36/2005/QH11 và các quy định về nhượng quyền thương mại;",
    "Nghị định số 35/2006/NĐ-CP và các văn bản sửa đổi, bổ sung (nếu có);",
    "Bộ luật Dân sự năm 2015 và các quy định pháp luật có liên quan;",
    "Nhu cầu và năng lực thực tế của các Bên.",
  ];

  page.drawText("Căn cứ:", { x: marginX, y, size: 11, font: boldFont, color: rgb(0.12, 0.14, 0.18) });
  y -= 16;
  y = drawBulletList(page, regularFont, bases, marginX, y, 10.2, contentW, 14);
  y -= 8;

  // Parties
  page.drawText("Các Bên tham gia:", { x: marginX, y, size: 11, font: boldFont, color: rgb(0.12, 0.14, 0.18) });
  y -= 16;

  const franchisorName = process.env.FRANCHISOR_NAME || "CÔNG TY TNHH GFMS";
  const franchisorAddr = process.env.FRANCHISOR_ADDRESS || "(Cập nhật địa chỉ doanh nghiệp)";
  const franchisorTax = process.env.FRANCHISOR_TAX_CODE || "(Cập nhật MST)";
  const franchisorRep = process.env.FRANCHISOR_REPRESENTATIVE || "(Cập nhật đại diện)";
  const franchisorTitle = process.env.FRANCHISOR_REP_TITLE || "Chức vụ";

  const franchiseeName = fr?.businessName || "(Tên doanh nghiệp/cơ sở)";
  const franchiseeAddr = fr?.location || "(Địa chỉ)";
  const franchiseeContact = fr?.contactPerson || "(Người liên hệ/đại diện)";
  const franchiseeEmail = fr?.contactEmail || "(Email)";

  // Bên A box
  page.drawRectangle({ x: marginX, y: y - 110, width: contentW, height: 110, borderColor: rgb(0.86, 0.88, 0.92), borderWidth: 1 });
  page.drawRectangle({ x: marginX, y: y - 26, width: contentW, height: 26, color: rgb(0.96, 0.97, 0.99) });
  page.drawText("BÊN A (BÊN NHƯỢNG QUYỀN)", { x: marginX + 10, y: y - 18, size: 10.6, font: boldFont, color: rgb(0.10, 0.12, 0.16) });

  let by = y - 42;
  const row = (k, v) => {
    page.drawText(k, { x: marginX + 10, y: by, size: 9.6, font: boldFont, color: rgb(0.18, 0.20, 0.24) });
    page.drawText(v, { x: marginX + 160, y: by, size: 9.6, font: regularFont, color: rgb(0.18, 0.20, 0.24) });
    by -= 14;
  };
  row("Tên doanh nghiệp:", franchisorName);
  row("Địa chỉ:", franchisorAddr);
  row("Mã số thuế:", franchisorTax);
  row("Đại diện:", `${franchisorRep} (${franchisorTitle})`);

  y = y - 128;

  // Bên B box
  page.drawRectangle({ x: marginX, y: y - 110, width: contentW, height: 110, borderColor: rgb(0.86, 0.88, 0.92), borderWidth: 1 });
  page.drawRectangle({ x: marginX, y: y - 26, width: contentW, height: 26, color: rgb(0.96, 0.97, 0.99) });
  page.drawText("BÊN B (BÊN NHẬN NHƯỢNG QUYỀN)", { x: marginX + 10, y: y - 18, size: 10.6, font: boldFont, color: rgb(0.10, 0.12, 0.16) });

  by = y - 42;
  row("Tên doanh nghiệp/cơ sở:", franchiseeName);
  row("Địa chỉ cơ sở:", franchiseeAddr);
  row("Người liên hệ:", franchiseeContact);
  row("Email:", franchiseeEmail);

  y = y - 128;

  const coverNote =
    "Hai Bên thống nhất ký kết Hợp đồng này với các điều khoản chi tiết dưới đây. Trường hợp có điều khoản chưa ghi rõ thông tin, Hai Bên sẽ hoàn thiện bằng phụ lục/biên bản và lưu kèm theo Hợp đồng.";
  y = drawParagraph(page, regularFont, coverNote, marginX, y, 10.2, contentW, 14, rgb(0.20, 0.22, 0.26));

  // ===== Content pages (10–12 điều khoản) =====
  page = addPage();
  y = topY;

  const sections = [
    {
      title: "Điều 1. Định nghĩa và phạm vi nhượng quyền",
      paras: [
        "Trong Hợp đồng này, “Nhượng quyền thương mại” được hiểu là việc Bên A cho phép và yêu cầu Bên B tự mình tiến hành hoạt động kinh doanh theo cách thức tổ chức do Bên A quy định, gắn với nhãn hiệu, tên thương mại, bí quyết kinh doanh, hệ thống nhận diện và các quyền sở hữu trí tuệ của Bên A.",
        "Phạm vi nhượng quyền: 01 (một) cơ sở/địa điểm kinh doanh tại địa chỉ đã nêu ở Bên B, trừ khi Hai Bên có thỏa thuận khác bằng văn bản.",
      ],
    },
    {
      title: "Điều 2. Đối tượng nhượng quyền và quyền được cấp",
      paras: [
        "Bên A cấp cho Bên B quyền sử dụng thương hiệu, mô hình vận hành, quy trình quản lý, tiêu chuẩn dịch vụ, tài liệu đào tạo và hệ thống phần mềm/quy chuẩn (nếu có) thuộc hệ thống GFMS trong thời hạn Hợp đồng.",
      ],
      bullets: [
        "Quyền sử dụng bộ nhận diện thương hiệu theo đúng quy chuẩn của Bên A.",
        "Quyền tiếp cận tài liệu vận hành, đào tạo nhân sự và hướng dẫn khai trương.",
        "Quyền tham gia các chương trình marketing/chính sách chung của hệ thống (nếu đáp ứng điều kiện).",
      ],
    },
    {
      title: "Điều 3. Phí nhượng quyền và phương thức thanh toán",
      paras: [
        "Các khoản phí có thể bao gồm: (i) phí nhượng quyền ban đầu; (ii) phí duy trì/royalty định kỳ; (iii) phí marketing/đóng góp quỹ thương hiệu; và/hoặc (iv) các khoản phí dịch vụ khác theo chính sách công bố của Bên A tại từng thời kỳ.",
        "Thanh toán được thực hiện theo hóa đơn/biên nhận hợp lệ và đúng thời hạn. Trường hợp chậm thanh toán, Bên B chịu lãi/phạt (nếu có) theo thỏa thuận và quy định pháp luật.",
      ],
    },
    {
      title: "Điều 4. Quyền và nghĩa vụ của Bên A",
      bullets: [
        "Cung cấp tài liệu vận hành, đào tạo ban đầu và hỗ trợ kỹ thuật trong phạm vi hệ thống.",
        "Hướng dẫn tiêu chuẩn thương hiệu, kiểm soát chất lượng định kỳ và khuyến nghị cải tiến.",
        "Bảo vệ quyền sở hữu trí tuệ của hệ thống; xử lý vi phạm thương hiệu theo quy định.",
        "Đối xử công bằng với các bên nhận nhượng quyền khác theo chính sách chung.",
      ],
    },
    {
      title: "Điều 5. Quyền và nghĩa vụ của Bên B",
      bullets: [
        "Vận hành cơ sở theo đúng quy chuẩn, quy trình và hướng dẫn của Bên A.",
        "Bảo đảm chất lượng dịch vụ, an toàn khách hàng, tuân thủ quy định pháp luật và quy định nội bộ.",
        "Thanh toán đầy đủ, đúng hạn các khoản phí; cung cấp báo cáo vận hành/kinh doanh theo yêu cầu hợp lý.",
        "Không được sử dụng thương hiệu/hệ thống ngoài phạm vi được cấp; không làm ảnh hưởng uy tín hệ thống.",
      ],
    },
    {
      title: "Điều 6. Tiêu chuẩn vận hành, đào tạo và kiểm tra",
      paras: [
        "Bên B cam kết duy trì các tiêu chuẩn tối thiểu về nhân sự, cơ sở vật chất, trang thiết bị, an toàn, vệ sinh và trải nghiệm khách hàng theo bộ tiêu chuẩn do Bên A ban hành.",
        "Bên A có quyền kiểm tra/đánh giá định kỳ hoặc đột xuất (có thông báo hợp lý), ghi nhận các điểm chưa phù hợp và yêu cầu khắc phục trong thời hạn nhất định.",
      ],
    },
    {
      title: "Điều 7. Sở hữu trí tuệ và sử dụng thương hiệu",
      paras: [
        "Mọi quyền sở hữu trí tuệ liên quan đến thương hiệu, tên thương mại, khẩu hiệu, biểu tượng, thiết kế, tài liệu và bí quyết thuộc về Bên A hoặc chủ sở hữu hợp pháp.",
        "Bên B chỉ được phép sử dụng trong phạm vi Hợp đồng và phải ngừng sử dụng ngay khi Hợp đồng chấm dứt/ hết hiệu lực.",
      ],
    },
    {
      title: "Điều 8. Bảo mật, dữ liệu và bảo vệ thông tin",
      paras: [
        "Hai Bên cam kết bảo mật thông tin kinh doanh, bí quyết, tài liệu vận hành và dữ liệu khách hàng theo quy định pháp luật và quy định của hệ thống.",
        "Bên B không được tiết lộ/ chuyển giao cho bên thứ ba nếu không có sự đồng ý bằng văn bản của Bên A, trừ trường hợp cung cấp theo yêu cầu cơ quan nhà nước có thẩm quyền.",
      ],
    },
    {
      title: "Điều 9. Không cạnh tranh và chuyển nhượng",
      paras: [
        "Trong thời hạn Hợp đồng và trong một thời gian hợp lý sau khi chấm dứt (nếu có thỏa thuận), Bên B không được trực tiếp/gián tiếp vận hành mô hình cạnh tranh tương tự gây ảnh hưởng đến hệ thống trong phạm vi đã thỏa thuận.",
        "Việc chuyển nhượng quyền/ nghĩa vụ theo Hợp đồng phải được Bên A chấp thuận bằng văn bản và tuân thủ điều kiện chuyển nhượng của hệ thống.",
      ],
    },
    {
      title: "Điều 10. Thời hạn, gia hạn và chấm dứt Hợp đồng",
      paras: [
        "Thời hạn Hợp đồng: theo thỏa thuận của Hai Bên và/hoặc phụ lục kèm theo. Việc gia hạn thực hiện trên cơ sở đánh giá tuân thủ và hiệu quả vận hành.",
        "Hợp đồng có thể bị chấm dứt trước hạn trong các trường hợp: vi phạm nghiêm trọng, chậm thanh toán kéo dài, sử dụng sai thương hiệu, hoặc theo thỏa thuận chấm dứt bằng văn bản.",
      ],
    },
    {
      title: "Điều 11. Bất khả kháng",
      paras: [
        "Bất khả kháng là các sự kiện khách quan, không thể lường trước và không thể khắc phục mặc dù đã áp dụng mọi biện pháp cần thiết trong khả năng cho phép.",
        "Bên gặp sự kiện bất khả kháng phải thông báo cho Bên còn lại trong thời gian sớm nhất và phối hợp để giảm thiểu thiệt hại.",
      ],
    },
    {
      title: "Điều 12. Giải quyết tranh chấp, luật áp dụng và hiệu lực",
      paras: [
        "Hợp đồng này được điều chỉnh bởi pháp luật Việt Nam. Tranh chấp được ưu tiên giải quyết thông qua thương lượng/ hòa giải. Nếu không đạt được thỏa thuận, tranh chấp được giải quyết tại Tòa án nhân dân có thẩm quyền tại Việt Nam, trừ khi Hai Bên có thỏa thuận trọng tài hợp lệ.",
        "Hợp đồng có hiệu lực kể từ thời điểm Hai Bên ký (bao gồm ký điện tử) và được lập thành bản điện tử lưu trữ trên hệ thống. Mọi sửa đổi, bổ sung phải được lập bằng văn bản (bao gồm văn bản điện tử) và được Hai Bên xác nhận.",
      ],
    },
  ];

  function drawSection(sec) {
    const titleSize = 12.2;
    const bodySize = 10.2;

    ({ page, y } = ensureSpace(page, y, 40));
    page.drawText(sec.title, { x: marginX, y, size: titleSize, font: boldFont, color: rgb(0.05, 0.07, 0.10) });
    y -= 16;
    page.drawRectangle({ x: marginX, y: y + 6, width: contentW, height: 1, color: rgb(0.86, 0.88, 0.92) });
    y -= 8;

    for (const p of sec.paras || []) {
      ({ page, y } = ensureSpace(page, y, 52));
      y = drawParagraph(page, regularFont, p, marginX, y, bodySize, contentW, 14);
      y -= 4;
    }
    if (sec.bullets && sec.bullets.length) {
      ({ page, y } = ensureSpace(page, y, 52));
      y = drawBulletList(page, regularFont, sec.bullets, marginX, y, bodySize, contentW, 14);
      y -= 4;
    }

    y -= 6;
  }

  for (const sec of sections) drawSection(sec);

  // ===== Signature page =====
  page = addPage();
  y = topY;

  page.drawText("CHỮ KÝ XÁC NHẬN", { x: marginX, y, size: 14, font: boldFont, color: rgb(0.05, 0.07, 0.10) });
  y -= 18;
  y = drawParagraph(
    page,
    regularFont,
    "Các Bên thống nhất ký Hợp đồng này bằng phương thức ký điện tử mô phỏng (quasi-digital signature). Hệ thống lưu vết IP/thiết bị, thời điểm ký và mã băm SHA-256 để phục vụ đối chiếu.",
    marginX,
    y,
    10.2,
    contentW,
    14,
    rgb(0.20, 0.22, 0.26)
  );
  y -= 10;

  const layout = signatureLayout();
  layout.pageIndex = pages.length - 1;

  const { ownerBox, adminBox } = layout;

  page.drawText("BÊN B (Bên nhận nhượng quyền)", {
    x: ownerBox.x,
    y: ownerBox.y + ownerBox.h + 16,
    size: 10.8,
    font: boldFont,
    color: rgb(0.12, 0.14, 0.18),
  });
  page.drawText("BÊN A (Bên nhượng quyền)", {
    x: adminBox.x,
    y: adminBox.y + adminBox.h + 16,
    size: 10.8,
    font: boldFont,
    color: rgb(0.12, 0.14, 0.18),
  });

  const border = rgb(0.55, 0.58, 0.64);
  page.drawRectangle({ x: ownerBox.x, y: ownerBox.y, width: ownerBox.w, height: ownerBox.h, borderColor: border, borderWidth: 1 });
  page.drawRectangle({ x: adminBox.x, y: adminBox.y, width: adminBox.w, height: adminBox.h, borderColor: border, borderWidth: 1 });

  page.drawText("Ký tại đây", { x: ownerBox.x + 8, y: ownerBox.y + ownerBox.h - 18, size: 9.5, font: regularFont, color: rgb(0.45, 0.48, 0.54) });
  page.drawText("Ký tại đây", { x: adminBox.x + 8, y: adminBox.y + adminBox.h - 18, size: 9.5, font: regularFont, color: rgb(0.45, 0.48, 0.54) });

  // Save to buffer (no local disk)
  const bytes = await pdfDoc.save();
  const buf = Buffer.from(bytes);

  const originalHash = sha256(buf);

  const uploadRes = await cloudinaryService.uploadRawBuffer(buf, {
    folder: `gfms/contracts/fr_${fr.id}/v${doc.version}`,
    filename: `HopDongNhuongQuyen_${fr.id}_v${doc.version}.pdf`,
    format: "pdf",
  });

  const meta = {
    ...(doc.meta || {}),
    contractNo,
    locale: TEMPLATE_LOCALE,
    templateVersion: TEMPLATE_VERSION,
    layout,
    generatedAt: now().toISOString(),
    pages: pages.length,
  };

  await doc.update(
    {
      originalPdfPath: uploadRes.secure_url,
      originalSha256: originalHash,
      meta: {
        ...meta,
        assets: {
          ...(meta.assets || {}),
          originalPublicId: uploadRes.public_id,
        },
      },
    },
    { transaction }
  );

  return { doc, absOriginalPath: null, relOriginalPath: doc.originalPdfPath, sha256: originalHash };
}

function parseDataUrlToBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:(image\/(png|jpeg));base64,(.+)$/i);
  if (!m) return null;
  return Buffer.from(m[3], "base64");
}

async function embedSignatureOnPdf({
  inputAbsPath,
  inputBuffer,
  outputAbsPath,
  pageIndex = 0,
  box,
  signaturePngBuffer,
  signerName,
  signedAt,
  label,
  ip = null,
  userAgent = null,
  consentAt = null,
  consentVersion = null,
  signingSessionId = null,
  contractNo = null,
  docVersion = null,
  documentId = null,
}) {
  const inputBytes = inputBuffer ? inputBuffer : await readPdfBuffer(inputAbsPath);
  const inputBuf = Buffer.isBuffer(inputBytes) ? inputBytes : Buffer.from(inputBytes);
  const inputSha = sha256(inputBuf);

  const pdfDoc = await PDFDocument.load(inputBuf);
  const { regularFont, boldFont } = await loadFonts(pdfDoc);

  const pages = pdfDoc.getPages();
  const page = pages[Math.max(0, Math.min(pageIndex, pages.length - 1))];

  const pngImage = await pdfDoc.embedPng(signaturePngBuffer);

  // Fit image into box with padding
  const pad = 6;
  const maxW = box.w - pad * 2;
  const maxH = box.h - pad * 2;
  const pngDims = pngImage.scale(1);
  const ratio = Math.min(maxW / pngDims.width, maxH / pngDims.height);
  const drawW = pngDims.width * ratio;
  const drawH = pngDims.height * ratio;

  page.drawImage(pngImage, {
    x: box.x + pad + (maxW - drawW) / 2,
    y: box.y + pad + (maxH - drawH) / 2,
    width: drawW,
    height: drawH,
  });

  // Metadata under signature (enterprise legal evidence)
  const infoStartY = box.y - 14;
  const size = 7.8;
  const gap = 10;

  const ipNorm = normalizeIp(ip) || "-";
  const uaShort = shortUa(userAgent) || "-";

  const lines = [];
  lines.push(`Ký bởi: ${signerName || "-"} (${label || "-"})`);
  lines.push(`Thời điểm ký (VN): ${formatVNTime(signedAt)}`);
  lines.push(`IP: ${ipNorm}`);

  // Wrap UA into 1-2 lines
  const uaLines = wrapText(regularFont, `Thiết bị/Trình duyệt: ${uaShort}`, size, box.w);
  lines.push(...uaLines.slice(0, 2));

  if (consentAt) {
    const cAt = consentAt instanceof Date ? consentAt : new Date(consentAt);
    lines.push(`Đồng ý ký điện tử: Có · ${formatVNTime(cAt)} · ${String(consentVersion || "v1")}`);
  }

  if (signingSessionId) lines.push(`Mã phiên ký: ${String(signingSessionId).slice(0, 64)}`);
  lines.push(`Hash trước ký (SHA-256): ${inputSha}`);

  // Contract identifiers (short)
  const idLine = `Mã HĐ: ${contractNo || "-"} · DocID: ${documentId || "-"} · v${docVersion || "-"}`;
  lines.push(idLine);

  let y = infoStartY;
  for (let i = 0; i < lines.length; i++) {
    const font = i === 0 ? boldFont : regularFont;
    const color = i === 0 ? rgb(0.15, 0.15, 0.15) : rgb(0.35, 0.35, 0.35);

    // wrap each line if needed (except the ua lines are already wrapped)
    const wrapped = i >= 3 && i <= 4 ? [lines[i]] : wrapText(font, lines[i], size, box.w);
    for (const wl of wrapped.slice(0, 2)) {
      page.drawText(wl, { x: box.x, y, size, font, color });
      y -= gap;
      if (y < 60) break;
    }
    if (y < 60) break;
  }

  const outBytes = await pdfDoc.save();
  const outBuf = Buffer.from(outBytes);

  if (outputAbsPath && !isHttpUrl(outputAbsPath)) {
    await fsp.writeFile(outputAbsPath, outBuf);
  }

  return { buffer: outBuf, sha256: sha256(outBuf), inputSha256: inputSha };
}

async function ownerSign(
  fr,
  { signatureDataUrl, signerName, ip = null, userAgent = null, consentAt = null, consentVersion = null, signingSessionId = null, transaction = null } = {}
) {
  const doc = await getLatestDocument(fr.id, { transaction });
  if (!doc || !doc.originalPdfPath) {
    await generateOriginalPdf(fr, { transaction, forceNewVersion: false });
  }
  const latest = await getLatestDocument(fr.id, { transaction });

  const layout = latest?.meta?.layout || signatureLayout();
  const ownerBox = layout.ownerBox || signatureLayout().ownerBox;

  const sigBuf = parseDataUrlToBuffer(signatureDataUrl);
  if (!sigBuf) {
    const e = new Error("Invalid signature image (expected data:image/png;base64,...)");
    e.statusCode = 400;
    throw e;
  }

  const relOwnerPath = null;
  const absOwnerPath = null;

  const signedAt = now();
  const contractNo = latest?.meta?.contractNo || contractNoOf(fr);

  const res = await embedSignatureOnPdf({
    inputAbsPath: latest.originalPdfPath,
    outputAbsPath: null,
    pageIndex: layout.pageIndex || 0,
    box: ownerBox,
    signaturePngBuffer: sigBuf,
    signerName,
    signedAt,
    label: "BÊN B",
    ip,
    userAgent,
    consentAt,
    consentVersion,
    signingSessionId,
    contractNo,
    docVersion: latest.version,
    documentId: latest.id,
  });

  const up = await cloudinaryService.uploadRawBuffer(res.buffer, {
    folder: `gfms/contracts/fr_${fr.id}/v${latest.version}`,
    filename: `HopDongNhuongQuyen_${fr.id}_v${latest.version}_owner-signed.pdf`,
    format: "pdf",
  });

  const signing = { ...(latest.meta?.signing || {}) };
  signing.owner = {
    role: "owner",
    label: "BÊN B",
    signerName: signerName || null,
    signedAt: signedAt.toISOString(),
    ip: normalizeIp(ip),
    userAgent: userAgent ? String(userAgent) : null,
    consentAt: consentAt ? new Date(consentAt).toISOString() : null,
    consentVersion: consentVersion ? String(consentVersion) : null,
    signingSessionId: signingSessionId ? String(signingSessionId) : null,
    inputSha256: res.inputSha256,
    outputSha256: res.sha256,
  };

  await latest.update(
    {
      ownerSignedPdfPath: up.secure_url,
      ownerSignedSha256: res.sha256,
      meta: {
        ...(latest.meta || {}),
        ownerSignedAt: signedAt.toISOString(),
        ownerSignerName: signerName || null,
        assets: {
          ...((latest.meta || {}).assets || {}),
          ownerSignedPublicId: up.public_id,
        },
        signing,
      },
    },
    { transaction }
  );

  return { doc: latest, absOwnerPath: null, relOwnerPath: latest.ownerSignedPdfPath, sha256: res.sha256, inputSha256: res.inputSha256, signedAt };
}

async function adminCountersign(
  fr,
  { signatureDataUrl, signerName, ip = null, userAgent = null, signingSessionId = null, transaction = null } = {}
) {
  const latest = await getLatestDocument(fr.id, { transaction });
  if (!latest || !latest.ownerSignedPdfPath) {
    const e = new Error("Owner-signed document not found. Owner must sign first.");
    e.statusCode = 400;
    throw e;
  }

  const layout = latest?.meta?.layout || signatureLayout();
  const adminBox = layout.adminBox || signatureLayout().adminBox;

  const sigBuf = parseDataUrlToBuffer(signatureDataUrl);
  if (!sigBuf) {
    const e = new Error("Invalid admin signature image (expected data:image/png;base64,...)");
    e.statusCode = 400;
    throw e;
  }

  const relFinalPath = null;
  const absFinalPath = null;

  const signedAt = now();
  const contractNo = latest?.meta?.contractNo || contractNoOf(fr);

  const res = await embedSignatureOnPdf({
    inputAbsPath: latest.ownerSignedPdfPath,
    outputAbsPath: null,
    pageIndex: layout.pageIndex || 0,
    box: adminBox,
    signaturePngBuffer: sigBuf,
    signerName,
    signedAt,
    label: "BÊN A",
    ip,
    userAgent,
    signingSessionId,
    contractNo,
    docVersion: latest.version,
    documentId: latest.id,
  });

  const up = await cloudinaryService.uploadRawBuffer(res.buffer, {
    folder: `gfms/contracts/fr_${fr.id}/v${latest.version}`,
    filename: `HopDongNhuongQuyen_${fr.id}_v${latest.version}_final.pdf`,
    format: "pdf",
  });

  const signing = { ...(latest.meta?.signing || {}) };
  signing.admin = {
    role: "admin",
    label: "BÊN A",
    signerName: signerName || null,
    signedAt: signedAt.toISOString(),
    ip: normalizeIp(ip),
    userAgent: userAgent ? String(userAgent) : null,
    signingSessionId: signingSessionId ? String(signingSessionId) : null,
    inputSha256: res.inputSha256,
    outputSha256: res.sha256,
  };

  await latest.update(
    {
      finalPdfPath: up.secure_url,
      finalSha256: res.sha256,
      meta: {
        ...(latest.meta || {}),
        adminSignedAt: signedAt.toISOString(),
        adminSignerName: signerName || null,
        assets: {
          ...((latest.meta || {}).assets || {}),
          finalPublicId: up.public_id,
        },
        signing,
      },
    },
    { transaction }
  );

  return { doc: latest, absFinalPath: null, relFinalPath: latest.finalPdfPath, sha256: res.sha256, inputSha256: res.inputSha256, signedAt };
}

async function generateCertificate(fr, { audits = [], transaction = null } = {}) {
  const latest = await getLatestDocument(fr.id, { transaction });
  if (!latest || !latest.finalPdfPath) {
    const e = new Error("Final document not found. Admin must countersign first.");
    e.statusCode = 400;
    throw e;
  }

  const relCertPath = null;
  const absCertPath = null;

  const contractNo = latest?.meta?.contractNo || contractNoOf(fr);
  const signing = latest?.meta?.signing || {};

  const pdfDoc = await PDFDocument.create();
  const { regularFont, boldFont } = await loadFonts(pdfDoc);
  pdfDoc.setTitle(`Chứng thư ký điện tử - ${contractNo}`);
  pdfDoc.setProducer("GFMS Contract Engine");

  const PAGE_W = 595;
  const PAGE_H = 842;
  const x = 50;
  const contentW = PAGE_W - x * 2;

  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

  // Header
  page.drawRectangle({ x: 0, y: PAGE_H - 58, width: PAGE_W, height: 58, color: rgb(0.05, 0.09, 0.14) });
  page.drawRectangle({ x: 0, y: PAGE_H - 58, width: PAGE_W, height: 2.5, color: rgb(0.98, 0.55, 0.08) });
  page.drawText("CHỨNG THƯ KÝ ĐIỆN TỬ (MÔ PHỎNG)", { x, y: PAGE_H - 38, size: 12, font: boldFont, color: rgb(0.93, 0.95, 0.99) });
  page.drawText(`Số HĐ: ${contractNo} · Phiên bản: v${latest.version}`, { x, y: PAGE_H - 52, size: 8.8, font: regularFont, color: rgb(0.75, 0.80, 0.88) });

  let y = PAGE_H - 88;

  page.drawText("Thông tin đối chiếu", { x, y, size: 12.5, font: boldFont, color: rgb(0.05, 0.07, 0.10) });
  y -= 18;

  const lines = [
    [`Mã yêu cầu:`, `#${fr.id}`],
    [`Cơ sở nhượng quyền:`, fr.businessName || "-"],
    [`Địa điểm:`, fr.location || "-"],
    [`Thời điểm tạo chứng thư (VN):`, formatVNTime(now())],
  ];

  for (const [k, v] of lines) {
    page.drawText(String(k), { x, y, size: 10, font: boldFont, color: rgb(0.18, 0.20, 0.24) });
    const vv = wrapText(regularFont, String(v), 10, contentW - 160).slice(0, 2);
    page.drawText(vv.join("\n"), { x: x + 160, y, size: 10, font: regularFont, color: rgb(0.18, 0.20, 0.24), lineHeight: 13 });
    y -= 16;
  }

  y -= 6;
  page.drawRectangle({ x, y, width: contentW, height: 1, color: rgb(0.86, 0.88, 0.92) });
  y -= 16;

  page.drawText("Chuỗi băm tài liệu (SHA-256)", { x, y, size: 12, font: boldFont, color: rgb(0.05, 0.07, 0.10) });
  y -= 16;

  const hashes = [
    ["Bản gốc", latest.originalSha256 || "-"],
    ["Bên B đã ký", latest.ownerSignedSha256 || "-"],
    ["Bản hoàn tất (countersigned)", latest.finalSha256 || "-"],
  ];

  for (const [k, h] of hashes) {
    page.drawText(`${k}:`, { x, y, size: 9.6, font: boldFont, color: rgb(0.18, 0.20, 0.24) });
    const hh = wrapText(regularFont, String(h), 9.2, contentW - 150).slice(0, 2);
    page.drawText(hh.join("\n"), { x: x + 150, y, size: 9.2, font: regularFont, color: rgb(0.18, 0.20, 0.24), lineHeight: 12 });
    y -= 16;
  }

  y -= 6;
  page.drawRectangle({ x, y, width: contentW, height: 1, color: rgb(0.86, 0.88, 0.92) });
  y -= 16;

  page.drawText("Dữ liệu ký (evidence)", { x, y, size: 12, font: boldFont, color: rgb(0.05, 0.07, 0.10) });
  y -= 16;

  const ev = [];
  if (signing?.owner) {
    ev.push(`Bên B ký: ${signing.owner.signerName || "-"} · ${formatVNTime(signing.owner.signedAt)}`);
    ev.push(`IP: ${signing.owner.ip || "-"}`);
    ev.push(`Phiên ký: ${signing.owner.signingSessionId || "-"}`);
    if (signing.owner.consentAt) ev.push(`Consent: Có · ${formatVNTime(signing.owner.consentAt)} · ${signing.owner.consentVersion || "v1"}`);
  }
  if (signing?.admin) {
    ev.push(`Bên A ký: ${signing.admin.signerName || "-"} · ${formatVNTime(signing.admin.signedAt)}`);
    ev.push(`IP: ${signing.admin.ip || "-"}`);
    ev.push(`Phiên ký: ${signing.admin.signingSessionId || "-"}`);
  }

  if (!ev.length) ev.push("(Không có dữ liệu ký trong meta)");

  y = drawBulletList(page, regularFont, ev, x, y, 9.8, contentW, 13);
  y -= 6;

  page.drawRectangle({ x, y, width: contentW, height: 1, color: rgb(0.86, 0.88, 0.92) });
  y -= 16;

  page.drawText("Audit trail (tối đa 30 dòng)", { x, y, size: 12, font: boldFont, color: rgb(0.05, 0.07, 0.10) });
  y -= 14;

  for (const a of (audits || []).slice(0, 30)) {
    const ts = a.createdAt ? formatVNTime(a.createdAt) : "-";
    const ip = a.ip ? normalizeIp(a.ip) : "-";
    const actor = a.actorRole || "-";
    const evt = a.eventType || "-";
    const line = `${ts} | ${actor} | ${evt} | IP: ${ip}`;
    const ls = wrapText(regularFont, line, 8.6, contentW);
    page.drawText(ls.slice(0, 2).join("\n"), { x, y, size: 8.6, font: regularFont, color: rgb(0.20, 0.22, 0.26), lineHeight: 11 });
    y -= 12;
    if (y < 70) break;
  }

  y -= 10;
  const note =
    "Chứng thư này do hệ thống tạo tự động nhằm mô phỏng tuân thủ ký điện tử (quasi-digital signature compliance). Để ký số theo Luật Giao dịch điện tử và chứng thư số, cần tích hợp nhà cung cấp chữ ký số/CA hợp lệ.";
  y = drawParagraph(page, regularFont, note, x, y, 9.4, contentW, 12, rgb(0.35, 0.35, 0.35));

  const bytes = await pdfDoc.save();
  const buf = Buffer.from(bytes);
  const certHash = sha256(buf);

  const up = await cloudinaryService.uploadRawBuffer(buf, {
    folder: `gfms/contracts/fr_${fr.id}/v${latest.version}`,
    filename: `HopDongNhuongQuyen_${fr.id}_v${latest.version}_certificate.pdf`,
    format: "pdf",
  });

  await latest.update(
    {
      certificatePdfPath: up.secure_url,
      certificateSha256: certHash,
      meta: {
        ...(latest.meta || {}),
        certificateGeneratedAt: now().toISOString(),
        assets: {
          ...((latest.meta || {}).assets || {}),
          certificatePublicId: up.public_id,
        },
      },
    },
    { transaction }
  );

  return { doc: latest, absCertPath: null, relCertPath: latest.certificatePdfPath, sha256: certHash };
}

async function freezeLatest(franchiseRequestId, { transaction = null } = {}) {
  const latest = await getLatestDocument(franchiseRequestId, { transaction });
  if (!latest) return null;
  await latest.update({ isFrozen: true, meta: { ...(latest.meta || {}), frozenAt: now().toISOString() } }, { transaction });
  return latest;
}

async function resolveDocumentPathByType(franchiseRequestId, type, { transaction = null } = {}) {
  const key = String(type || "").toLowerCase();
  const fieldByType = {
    original: "originalPdfPath",
    owner_signed: "ownerSignedPdfPath",
    owner: "ownerSignedPdfPath",
    final: "finalPdfPath",
    certificate: "certificatePdfPath",
  };
  const field = fieldByType[key];
  if (!field) return null;

  // Không chỉ dùng getLatestDocument(): sau resend có thể có version mới (chưa có final)
  // trong khi version cũ đã có final/certificate → owner (token) bị 404, admin vẫn xem được nếu trỏ đúng bản.
  const rows = await FranchiseContractDocument.findAll({
    where: { franchiseRequestId },
    order: [["version", "DESC"]],
    transaction,
  });
  if (!rows.length) return null;

  for (const docRow of rows) {
    const rel = docRow[field];
    if (rel && String(rel).trim()) {
      return {
        relPath: rel,
        absPath: isHttpUrl(rel) ? null : absFromRel(rel),
        doc: docRow,
        servedType: key,
      };
    }
  }
  return null;
}

function rowHasAnyPdfPath(docRow) {
  if (!docRow) return false;
  return [docRow.originalPdfPath, docRow.ownerSignedPdfPath, docRow.finalPdfPath, docRow.certificatePdfPath].some(
    (p) => p && String(p).trim()
  );
}

/**
 * Demo / DB lệch: chưa có file PDF trên bất kỳ version nào → tạo bản gốc (kể cả completed mock thiếu file).
 * Nếu đã có ít nhất một path thì không ghi đè.
 */
async function ensureFranchiseContractHasPdf(fr, { transaction = null } = {}) {
  const rows = await FranchiseContractDocument.findAll({
    where: { franchiseRequestId: fr.id },
    order: [["version", "DESC"]],
    transaction,
  });
  const hasAny = rows.some(rowHasAnyPdfPath);
  if (hasAny) return { ensured: false };
  await generateOriginalPdf(fr, { transaction });
  return { ensured: true };
}

module.exports = {
  getLatestDocument,
  createNextVersion,
  generateOriginalPdf,
  ownerSign,
  adminCountersign,
  generateCertificate,
  freezeLatest,
  resolveDocumentPathByType,
  ensureFranchiseContractHasPdf,
  sha256,
};
