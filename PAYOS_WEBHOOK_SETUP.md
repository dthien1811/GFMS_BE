# Hướng dẫn đăng ký Webhook PayOS

## 📋 Tổng quan

Webhook PayOS sẽ gọi về endpoint: `POST /api/payment/payos/webhook` khi có thay đổi trạng thái thanh toán.

---

## 🔧 Bước 1: Lấy URL Webhook công khai

### Option A: Dùng ngrok (cho Local Development)

1. **Cài đặt ngrok:**
   - Tải tại: https://ngrok.com/download
   - Hoặc dùng npm: `npm install -g ngrok`

2. **Chạy ngrok:**
   ```bash
   # Mở terminal mới, chạy:
   ngrok http 8080
   # (8080 là PORT của BE, xem trong .env hoặc server.js)
   ```

3. **Copy URL Forwarding:**
   - Sẽ có dạng: `https://abc123.ngrok-free.app`
   - **Webhook URL của bạn:** `https://abc123.ngrok-free.app/api/payment/payos/webhook`

### Option B: Deploy lên Server (Production)

- Nếu đã deploy BE lên server (VPS, Heroku, Railway, etc.)
- Webhook URL: `https://your-domain.com/api/payment/payos/webhook`

---

## 🔐 Bước 2: Đăng ký Webhook trong PayOS Dashboard

1. **Đăng nhập PayOS Dashboard:**
   - Truy cập: https://pay.payos.vn/
   - Đăng nhập tài khoản PayOS của bạn

2. **Vào mục Webhook:**
   - Menu: **Cài đặt** → **Webhook** (hoặc **Settings** → **Webhook**)
   - Hoặc tìm mục **Webhook Configuration**

3. **Thêm Webhook URL:**
   - Nhập URL: `https://your-ngrok-url.ngrok-free.app/api/payment/payos/webhook`
   - (Thay `your-ngrok-url` bằng URL ngrok của bạn)
   - Chọn **Events** cần nhận: `payment.success`, `payment.paid` (hoặc tất cả events)

4. **Lưu cấu hình:**
   - Click **Lưu** hoặc **Save**
   - PayOS sẽ gửi test request để verify webhook

---

## ✅ Bước 3: Verify Webhook hoạt động

### Test bằng cách:

1. **Tạo giao dịch test:**
   - Vào trang mua gói trên FE
   - Chọn PayOS và thanh toán
   - PayOS sẽ gọi webhook khi thanh toán thành công

2. **Kiểm tra logs:**
   - Xem console của BE server
   - Nếu thấy log: `[payOS webhook] received` → Webhook đã nhận được
   - Nếu có lỗi: `[payOS webhook] error:` → Kiểm tra lại code

3. **Kiểm tra Database:**
   - Transaction có `paymentStatus = "paid"`?
   - PackageActivation đã được tạo với `status = "active"`?

---

## 🐛 Troubleshooting

### Webhook không nhận được request?

1. **Kiểm tra ngrok:**
   ```bash
   # Xem requests đến ngrok tại: http://localhost:4040
   # (ngrok tự động mở web interface)
   ```

2. **Kiểm tra Firewall:**
   - Đảm bảo port 8080 không bị block
   - Nếu dùng VPS, mở port 8080 trong firewall

3. **Kiểm tra PayOS Dashboard:**
   - Vào **Webhook Logs** trong PayOS
   - Xem có request nào được gửi không
   - Xem response code (200 = OK, 4xx/5xx = lỗi)

### Webhook nhận được nhưng lỗi?

1. **Kiểm tra Checksum:**
   - PayOS gửi kèm checksum để verify
   - Code đã có `payosService.verifyWebhook()` để verify
   - Nếu lỗi checksum → Kiểm tra `PAYOS_CHECKSUM_KEY` trong `.env`

2. **Kiểm tra Database:**
   - Transaction có tồn tại với `id = orderCode`?
   - Member và Package có tồn tại?

3. **Xem logs chi tiết:**
   ```bash
   # Trong BE console, sẽ có:
   [payOS webhook] error: <error message>
   ```

---

## 📝 Lưu ý quan trọng

1. **ngrok URL thay đổi mỗi lần restart:**
   - Nếu restart ngrok, URL mới → Cần cập nhật lại trong PayOS Dashboard
   - Hoặc dùng ngrok với custom domain (trả phí)

2. **Production:**
   - Nên dùng HTTPS (PayOS yêu cầu HTTPS cho webhook)
   - Đảm bảo server có SSL certificate

3. **Security:**
   - Webhook endpoint không cần JWT (đúng rồi)
   - Nhưng PayOS sẽ gửi kèm checksum để verify
   - Code đã có verify checksum trong `payosService.verifyWebhook()`

---

## 🔗 Tài liệu tham khảo

- PayOS Webhook Docs: https://payos.vn/docs/webhook/
- PayOS Dashboard: https://pay.payos.vn/
- ngrok Docs: https://ngrok.com/docs

---

## ✅ Checklist

- [ ] Đã cài ngrok hoặc có server deploy
- [ ] Đã lấy được URL webhook công khai
- [ ] Đã đăng ký URL trong PayOS Dashboard
- [ ] Đã test tạo giao dịch và webhook hoạt động
- [ ] Đã kiểm tra Transaction và PackageActivation được tạo đúng
