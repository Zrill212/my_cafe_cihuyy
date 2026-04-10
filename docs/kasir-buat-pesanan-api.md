# API Docs - Kasir Buat Pesanan

Dokumentasi ini untuk fitur kasir membuat pesanan langsung dari halaman kasir.

## Endpoint

- **Method**: `POST`
- **URL**: `/api/orders/kasir`
- **Auth**: Bearer token kasir/admin

Contoh:

`POST /api/orders/kasir`

## Body Request (JSON)

Backend saat ini menerima item berbasis menu (`menu_id`).

```json
{
  "table_number": 12,
  "customer_name": "Budi",
  "note": "Tanpa es",
  "payment_method": "kasir",
  "items": [
    {
      "menu_id": 101,
      "qty": 2,
      "note": "Pedas level 2"
    }
  ]
}
```

## Field yang Didukung

- `table_number` atau `meja` (wajib)
- `customer_name` atau `nama` (opsional)
- `note` (opsional)
- `payment_method` (opsional, default `kasir`)
- `items` (wajib, minimal 1 item)
  - `menu_id` atau `id`
  - `qty` atau `quantity`
  - `note` / `catatan` (opsional)

## Validasi Backend

- Meja wajib diisi.
- `items` minimal 1.
- `menu_id` harus valid pada cafe kasir yang login.
- `qty` harus angka > 0.

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
  "status": 400,
  "message": "items minimal 1",
  "data": null,
  "success": false
}
```

### 401 Unauthorized

```json
{
  "status": 401,
  "message": "Unauthorized",
  "data": null,
  "success": false
}
```

### 422 Unprocessable Entity

```json
{
  "status": 422,
  "message": "menu_id tidak valid: 101",
  "data": null,
  "success": false
}
```

## Catatan Integrasi FE

1. Setelah `POST` sukses, langsung refetch list kasir (mis. `GET /api/orders/kasir?status=aktif`) agar order baru muncul.
2. Order kasir baru dibuat dengan:
   - `status = selesai` (pembayaran dianggap sukses)
   - `delivery_status = siap`
   - `is_delivered = false`
3. Pindah ke tab **Sudah Diantar** hanya setelah update pengantaran (`PATCH /api/orders/kasir/:id/status` dengan `is_delivered=true` atau `delivery_status="diantar"`).
