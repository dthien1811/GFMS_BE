# 🧪 Hướng dẫn Test Chức năng Thanh toán PayOS

## 📋 Checklist trước khi test

- [ ] Backend đã chạy (port 8080)
- [ ] Frontend đã chạy (port 3000)
- [ ] ngrok đã chạy và có URL công khai
- [ ] Đã đăng ký webhook trong PayOS Dashboard
- [ ] Đã cấu hình `.env` với PayOS credentials
- [ ] Có tài khoản Member để test
- [ ] Có gói tập (Package) trong database để mua

---

## 🚀 Bước 1: Chuẩn bị môi trường

### 1.1. Kiểm tra Backend

```bash
cd GFMS_BE
npm install  # Nếu chưa cài @payos/node
npm start   # Chạy server (port 8080)
```

**Kiểm tra:**
- Console hiển thị: `Server running at: http://localhost:8080`
- Không có lỗi import PayOS

### 1.2. Kiểm tra Frontend

```bash
cd GFMS_FE
npm start   # Chạy React app (port 3000)
```

**Kiểm tra:**
- Browser mở: `http://localhost:3000`
- Không có lỗi console

### 1.3. Kiểm tra ngrok

```bash
ngrok http 8080
```

**Kiểm tra:**
- Copy URL Forwarding (ví dụ: `https://abc123.ngrok-free.app`)
- Mở http://localhost:4040 để xem requests

### 1.4. Kiểm tra .env

File `GFMS_BE/.env` cần có:

```env
PAYOS_CLIENT_ID=your_client_id
PAYOS_API_KEY=your_api_key
PAYOS_CHECKSUM_KEY=your_checksum_key
PAYOS_RETURN_URL=http://localhost:3000/member/my-packages?payos=success
PAYOS_CANCEL_URL=http://localhost:3000/member/packages?payos=cancel
```

---

## 🧪 Bước 2: Test Flow Thanh toán

### 2.1. Đăng nhập với tài khoản Member

1. Mở browser: `http://localhost:3000`
2. Đăng nhập với tài khoản có role **Member**
3. Kiểm tra:
   - Đăng nhập thành công
   - Redirect đến `/member` hoặc `/member/packages`

### 2.2. Vào trang "Gói tập"

1. Navigate đến: `/member/packages`
2. Kiểm tra:
   - Danh sách gói tập hiển thị
   - Có nút "Mua gói" trên mỗi gói

### 2.3. Mua gói với PayOS

1. Click nút **"Mua gói"** trên một gói bất kỳ
2. Modal thanh toán hiển thị
3. Chọn phương thức: **💳 PayOS (Khuyến nghị)**
4. Click **"Xác nhận mua"**

**Kỳ vọng:**
- Modal đóng
- Browser redirect đến trang PayOS checkout
- URL PayOS có dạng: `https://pay.payos.vn/web/...`

### 2.4. Thanh toán trên PayOS

1. Trên trang PayOS checkout:
   - Nhập thông tin test (PayOS có sandbox/test mode)
   - Hoặc dùng thẻ test của PayOS
2. Click **"Thanh toán"**

**Kỳ vọng:**
- PayOS xử lý thanh toán
- Redirect về: `http://localhost:3000/member/my-packages?payos=success`

### 2.5. Kiểm tra kết quả

#### a) Kiểm tra Frontend:

1. Trang "Gói của tôi" (`/member/my-packages`) hiển thị:
   - ✅ Banner thành công: "Thanh toán PayOS thành công!"
   - Gói mới xuất hiện trong "Gói đang sử dụng" (sau vài giây)

#### b) Kiểm tra Backend Console:

```bash
# Sẽ thấy log:
[payOS webhook] received orderCode: <transaction_id>
[payOS webhook] OK, activationId: <activation_id>
```

#### c) Kiểm tra ngrok Web Interface:

1. Mở: http://localhost:4040
2. Xem tab **"Webhook"** hoặc **"Requests"**
3. Sẽ thấy request POST đến `/api/payment/webhook`

#### d) Kiểm tra Database:

```sql
-- Kiểm tra Transaction
SELECT * FROM transaction 
WHERE paymentMethod = 'payos' 
ORDER BY createdAt DESC LIMIT 1;

-- Kỳ vọng:
-- paymentStatus = 'paid'
-- transactionDate = <thời gian hiện tại>

-- Kiểm tra PackageActivation
SELECT * FROM packageactivation 
WHERE transactionId = <transaction_id>;

-- Kỳ vọng:
-- status = 'active'
-- sessionsRemaining = <số buổi của gói>
```

---

## 🐛 Troubleshooting

### Lỗi: "Không redirect đến PayOS"

**Nguyên nhân:**
- PayOS service chưa được cấu hình đúng
- Thiếu credentials trong `.env`

**Giải pháp:**
1. Kiểm tra `.env` có đủ `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`
2. Kiểm tra console BE có lỗi gì không
3. Xem response từ API `/api/member/packages/:id/purchase`

### Lỗi: "Webhook không nhận được"

**Nguyên nhân:**
- Webhook chưa đăng ký trong PayOS Dashboard
- ngrok URL đã thay đổi
- Firewall block request

**Giải pháp:**
1. Kiểm tra PayOS Dashboard → Webhook → URL đúng chưa
2. Kiểm tra ngrok vẫn chạy và URL không đổi
3. Test webhook bằng cách gửi request thủ công:
   ```bash
   curl -X POST https://your-ngrok-url.ngrok-free.app/api/payment/webhook \
     -H "Content-Type: application/json" \
     -d '{"orderCode": 123, "amount": 100000, "status": "PAID"}'
   ```

### Lỗi: "Gói không được kích hoạt sau thanh toán"

**Nguyên nhân:**
- Webhook nhận được nhưng xử lý lỗi
- Transaction không tìm thấy
- Member/Package không tồn tại

**Giải pháp:**
1. Xem console BE có log lỗi: `[payOS webhook] error: ...`
2. Kiểm tra Transaction có tồn tại với `id = orderCode`
3. Kiểm tra Member và Package có tồn tại

### Lỗi: "Banner success không hiển thị"

**Nguyên nhân:**
- Query param `?payos=success` không được xử lý
- Component chưa mount đúng

**Giải pháp:**
1. Kiểm tra URL có `?payos=success` không
2. Kiểm tra console FE có lỗi React không
3. Refresh trang và kiểm tra lại

---

## ✅ Test Cases

### Test Case 1: Thanh toán thành công
- [ ] Mua gói với PayOS
- [ ] Redirect đến PayOS checkout
- [ ] Thanh toán thành công
- [ ] Redirect về `/member/my-packages?payos=success`
- [ ] Banner success hiển thị
- [ ] Gói được kích hoạt trong database
- [ ] Gói hiển thị trong "Gói đang sử dụng"

### Test Case 2: Thanh toán hủy
- [ ] Mua gói với PayOS
- [ ] Redirect đến PayOS checkout
- [ ] Click "Hủy" hoặc đóng trang
- [ ] Redirect về `/member/packages?payos=cancel`
- [ ] Transaction vẫn có `paymentStatus = "pending"`
- [ ] Gói chưa được kích hoạt

### Test Case 3: Webhook retry
- [ ] Thanh toán thành công trên PayOS
- [ ] PayOS gửi webhook lần 1 → OK
- [ ] PayOS gửi webhook lần 2 (retry) → Phải idempotent (không tạo duplicate)
- [ ] Chỉ có 1 PackageActivation được tạo

### Test Case 4: Pending packages hiển thị
- [ ] Mua gói với PayOS nhưng chưa thanh toán
- [ ] Vào `/member/my-packages`
- [ ] Section "Gói chờ thanh toán" hiển thị
- [ ] Sau khi thanh toán → Gói chuyển sang "Gói đang sử dụng"

---

## 📊 Kiểm tra Database sau khi test

```sql
-- 1. Xem tất cả Transaction PayOS
SELECT 
  id,
  transactionCode,
  memberId,
  packageId,
  amount,
  paymentMethod,
  paymentStatus,
  transactionDate,
  createdAt
FROM transaction
WHERE paymentMethod = 'payos'
ORDER BY createdAt DESC;

-- 2. Xem PackageActivation liên quan
SELECT 
  pa.id,
  pa.memberId,
  pa.packageId,
  pa.transactionId,
  pa.status,
  pa.sessionsRemaining,
  pa.activationDate,
  p.name as packageName
FROM packageactivation pa
JOIN package p ON pa.packageId = p.id
WHERE pa.transactionId IN (
  SELECT id FROM transaction WHERE paymentMethod = 'payos'
)
ORDER BY pa.createdAt DESC;

-- 3. Kiểm tra metadata PayOS
SELECT 
  id,
  transactionCode,
  JSON_EXTRACT(metadata, '$.payos.orderCode') as payosOrderCode,
  JSON_EXTRACT(metadata, '$.payos.checkoutUrl') as payosCheckoutUrl
FROM transaction
WHERE paymentMethod = 'payos'
ORDER BY createdAt DESC LIMIT 1;
```

---

## 🎯 Kết quả mong đợi

Sau khi test thành công:

1. ✅ User có thể mua gói với PayOS
2. ✅ Redirect đến PayOS checkout
3. ✅ Thanh toán thành công
4. ✅ Webhook nhận được và xử lý đúng
5. ✅ Transaction được cập nhật `paymentStatus = "paid"`
6. ✅ PackageActivation được tạo với `status = "active"`
7. ✅ Banner success hiển thị trên FE
8. ✅ Gói hiển thị trong "Gói đang sử dụng"

---

## 📝 Notes

- PayOS có **sandbox/test mode** để test không cần tiền thật
- Nếu dùng ngrok, URL sẽ thay đổi mỗi lần restart → Cần cập nhật lại trong PayOS Dashboard
- Webhook có thể retry nhiều lần → Code đã xử lý idempotent (không tạo duplicate)
