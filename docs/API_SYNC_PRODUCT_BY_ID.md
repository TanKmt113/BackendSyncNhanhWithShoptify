# API Đồng Bộ Sản Phẩm Thủ Công

## Endpoint: Đồng bộ sản phẩm từ Nhanh.vn bằng ID

API này cho phép đồng bộ thủ công sản phẩm từ Nhanh.vn lên Shopify bằng cách truyền ID sản phẩm từ Nhanh.vn.

### Endpoint

```
POST /api/sync/product-from-nhanh/:nhanhId
```

hoặc

```
POST /api/sync/product-from-nhanh
```

### Mô tả

API sẽ tự động:
1. Lấy thông tin chi tiết sản phẩm từ Nhanh.vn bằng hàm `getByIdProduct()`
2. Xử lý đồng bộ sản phẩm lên Shopify bằng hàm `syncProductAddFromNhanhWebhook()`
3. Xử lý các trường hợp:
   - Sản phẩm đơn (parentId = -2 hoặc -1): Tạo mới trên Shopify
   - Sản phẩm biến thể (parentId > 0): Thêm vào sản phẩm cha đã có

### Cách sử dụng

#### Cách 1: Truyền ID qua URL Parameter

**Request:**
```http
POST /api/sync/product-from-nhanh/123456
Content-Type: application/json
Authorization: Bearer <your-token>
```

**Response thành công:**
```json
{
  "success": true,
  "message": "Đã bắt đầu đồng bộ sản phẩm \"Tên sản phẩm\" từ Nhanh.vn",
  "data": {
    "nhanhId": 123456,
    "name": "Tên sản phẩm",
    "barcode": "ABC123"
  }
}
```

#### Cách 2: Truyền ID qua Request Body

**Request:**
```http
POST /api/sync/product-from-nhanh
Content-Type: application/json
Authorization: Bearer <your-token>

{
  "nhanhId": 123456
}
```

**Response thành công:**
```json
{
  "success": true,
  "message": "Đã bắt đầu đồng bộ sản phẩm \"Tên sản phẩm\" từ Nhanh.vn",
  "data": {
    "nhanhId": 123456,
    "name": "Tên sản phẩm",
    "barcode": "ABC123"
  }
}
```

### Response Error

#### Thiếu nhanhId
```json
{
  "error": "Missing nhanhId parameter"
}
```
**Status Code:** 400

#### nhanhId không hợp lệ
```json
{
  "error": "nhanhId must be a valid number"
}
```
**Status Code:** 400

#### Không tìm thấy sản phẩm
```json
{
  "error": "Không tìm thấy sản phẩm với ID 123456 trên Nhanh.vn"
}
```
**Status Code:** 404

#### Lỗi server
```json
{
  "error": "Chi tiết thông báo lỗi"
}
```
**Status Code:** 500

### Ví dụ với cURL

```bash
# Cách 1: Truyền qua URL
curl -X POST http://localhost:5000/api/sync/product-from-nhanh/123456 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Cách 2: Truyền qua body
curl -X POST http://localhost:5000/api/sync/product-from-nhanh \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"nhanhId": 123456}'
```

### Ví dụ với JavaScript/Axios

```javascript
// Cách 1: URL parameter
const response1 = await axios.post(
  'http://localhost:5000/api/sync/product-from-nhanh/123456',
  {},
  {
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN'
    }
  }
);

// Cách 2: Request body
const response2 = await axios.post(
  'http://localhost:5000/api/sync/product-from-nhanh',
  { nhanhId: 123456 },
  {
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN'
    }
  }
);
```

### Lưu ý

1. **Thông báo hệ thống**: API tự động tạo thông báo trong hệ thống về kết quả đồng bộ
2. **Xử lý không đồng bộ**: Quá trình đồng bộ có thể mất thời gian, hệ thống sẽ xử lý trong background
3. **Sản phẩm đã tồn tại**: Nếu sản phẩm đã có trên Shopify (theo SKU/barcode), hệ thống sẽ bỏ qua
4. **Biến thể sản phẩm**: 
   - Nếu sản phẩm có biến thể (childs), tất cả biến thể chưa tồn tại sẽ được tạo
   - Nếu sản phẩm là biến thể con (parentId > 0), sẽ được thêm vào sản phẩm cha
5. **Trạng thái sản phẩm**: Sản phẩm được tạo ở trạng thái "Draft" để admin review trước khi publish

### Workflow

```
1. Client gửi nhanhId → API
2. API gọi getByIdProduct(nhanhId) → Lấy dữ liệu từ Nhanh.vn
3. API gọi syncProductAddFromNhanhWebhook(productData) → Xử lý đồng bộ
4. Hệ thống kiểm tra:
   - Sản phẩm đã tồn tại chưa?
   - Là sản phẩm đơn hay biến thể?
   - Có sản phẩm cha không (nếu là biến thể)?
5. Thực hiện tạo/cập nhật trên Shopify
6. Lưu vào database local
7. Tạo thông báo hệ thống
8. Trả response về client
```
