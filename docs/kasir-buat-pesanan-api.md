# API Docs - Kasir Buat Pesanan

Dokumentasi ini untuk kebutuhan fitur kasir membuat pesanan langsung dari halaman kasir.

## Endpoint

- **Method**: `POST`
- **URL**: `/api/orders/kasir`
- **Auth**: Bearer token kasir/admin

Contoh:

`POST /api/orders/kasir`

## Body Request (JSON)

```json
{
  "table_number": 12,
  "customer_name": "Budi",
  "note": "Tanpa es",
  "items": [
    {
      "menu_id": 101,
      "qty": 2,
      "note": "Pedas level 2",
      "variants": []
    }
  ],
  "payment_method": "kasir"
}
```

## Validasi Minimum (Backend)

- `table_number` wajib.
- `items` wajib, minimal 1 item.
- Tiap item wajib punya `menu_id` dan `qty >= 1`.
- `variants` saat ini **diabaikan** oleh backend endpoint ini (disimpan sebagai order item biasa).

## Response Sukses (contoh)

Status: `201 Created`

```json
{
  "status": 201,
  "message": "Pesanan kasir berhasil dibuat",
  "data": {
    "id": "ORD-KSR001",
    "status": "selesai",
    "delivery_status": "siap",
    "status_pengantaran": "siap",
    "is_delivered": false,
    "meja": 12,
    "nama": "Budi",
    "total": 46000,
    "items": [
      { "menu_id": 101, "name": "Ayam Geprek", "qty": 2, "price": 23000 }
    ]
  },
  "success": true
}
```

## Response Gagal (contoh)

### 400 Bad Request

```json
{
  "success": false,
  "message": "items minimal 1"
}
```

### 401 Unauthorized

```json
{
  "success": false,
  "message": "Unauthorized"
}
```

### 422 Unprocessable Entity

```json
{
  "success": false,
  "message": "menu_id tidak valid"
}
```

## Catatan Integrasi FE

1. Setelah `POST` sukses, FE kasir perlu refetch list `GET /api/orders/kasir?status=aktif` (atau endpoint list yang dipakai) agar order baru langsung muncul.
2. Pembayaran kasir dianggap **sukses/paid**, sehingga:
   - `status = selesai`
   - `delivery_status = siap` (belum otomatis `diantar`)
   - `is_delivered = false`
3. Order baru pindah ke **Sudah Diantar** hanya setelah kasir memanggil endpoint tandai pengantaran (`PATCH /api/orders/kasir/:id/status` dengan `is_delivered=true` atau `delivery_status=\"diantar\"`).
