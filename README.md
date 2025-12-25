# Project: Nhanh.vn & Shopify Synchronization System

Hệ thống kết nối và đồng bộ dữ liệu tự động giữa nền tảng quản lý bán hàng **Nhanh.vn** (v3) và nền tảng thương mại điện tử **Shopify**.

---

## 📌 Tổng quan dự án
Dự án tập trung vào việc duy trì tính nhất quán của dữ liệu tồn kho và quản lý đơn hàng tập trung. Hệ thống lấy Nhanh.vn làm gốc để quản lý tồn kho và Shopify làm kênh bán hàng chính.

## 🔑 Nguyên tắc khớp dữ liệu (Data Mapping)
Mọi hoạt động đồng bộ dựa trên khóa chính là **Mã vạch (Barcode)** ở cấp độ từng biến thể sản phẩm (Variant).

| Trường thông tin | Hệ thống Nhanh.vn | Hệ thống Shopify |
| :--- | :--- | :--- |
| **Khóa chính** | `Mã vạch` | `Variant Barcode` |

### Sản phẩm Test (UAT):
1. **Mũ Lưỡi Trai Trek Cap**: Mỏng Nhẹ, Thoáng Khí, Thời Trang.
2. **Balo dã ngoại thể thao Seeker**: 20L, gọn nhẹ cho chuyến đi ngắn ngày.

---

## 🛠 Chức năng chính

### 1. Đồng bộ Tồn kho (Inventory Sync)
**Luồng dữ liệu:** Nhanh.vn → Shopify.

- **Nguồn dữ liệu:** Sử dụng trường `Có thể bán` từ API Nhanh.vn.
- **Logic xử lý:**
    - Khi số lượng `Có thể bán` trên Nhanh.vn thay đổi, hệ thống cập nhật tương ứng lên Shopify.
    - **Trường hợp đặc biệt:** Nếu số lượng `Có thể bán` **≤ 0**, biến thể sản phẩm trên Shopify phải tự động chuyển sang trạng thái **Hết hàng** (Out of stock).

### 2. Đồng bộ Đơn hàng (Order Sync)
**Luồng dữ liệu:** Shopify → Nhanh.vn.

- **Trigger:** Khi có đơn hàng mới phát sinh trên Shopify.
- **Dữ liệu cần chuyển tới Nhanh.vn:**
    - **Nguồn:** `Website`.
    - **Thông tin khách hàng:** Tên, Số điện thoại, Email (nếu có), Địa chỉ giao hàng chi tiết.
    - **Chi tiết đơn:** Danh sách sản phẩm (khớp qua Barcode), số lượng, đơn giá, tổng tiền.

---

## 📚 Tài liệu API tham chiếu
- **Nhanh.vn API v3:** [https://apidocs.nhanh.vn/v3](https://apidocs.nhanh.vn/v3)
- **Shopify API:** [https://shopify.dev/docs/api/usage/versioning](https://shopify.dev/docs/api/usage/versioning)

---

## 🚀 Hướng dẫn cho AI/Developer
1. **Kiểm tra Mapping:** Trước khi đồng bộ đơn hàng, cần thực hiện một bước kiểm tra (lookup) để đảm bảo `Variant Barcode` từ Shopify tồn tại trên hệ thống Nhanh.vn.
2. **Xử lý tồn kho:** Nên sử dụng Webhook từ Nhanh.vn (nếu có) hoặc cơ chế Polling định kỳ để quét các sản phẩm có sự thay đổi về số lượng `Có thể bán`.
3. **Lưu ý đơn hàng:** Đảm bảo xử lý đúng các trường hợp đơn hàng có mã giảm giá hoặc phí vận chuyển khi đẩy về Nhanh.vn.

---
*Tài liệu này được soạn thảo để phục vụ mục đích cấu hình hệ thống đồng bộ tự động.*

cloudflared tunnel run my-api

