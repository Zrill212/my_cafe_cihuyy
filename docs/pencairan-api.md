# API Docs - Pencairan saldo (Admin Cafe ↔ Superadmin)

Alur: **admin cafe** mengajukan pencairan (mis. transfer bank) → tersimpan di server → **superadmin** melihat daftar, mentransfer manual, lalu menandai **selesai** atau **tolak**.

## Status (`status`)

| Nilai API | Saran tampilan FE |
|-----------|-------------------|
| `processing` | Diproses (mis. 1×24 jam) |
| `pending` | Menunggu (jarang dipakai; default create = `processing`) |
| `completed` | Selesai |
| `rejected` | Ditolak |

---

## 1. Admin Cafe — kirim pengajuan

- **Method**: `POST`
- **URL**: `/api/withdrawals`
- **Auth**: `Authorization: Bearer <token JWT admin cafe>`

### Body (JSON)

| Field | Wajib | Keterangan |
|--------|--------|------------|
| `amount` | Ya | Nominal pencairan (angka &gt; 0) |
| `client_ref` | Disarankan | ID unik dari FE (mis. `WD-1775712101906`) agar tidak dobel saat sync ulang; unik per `cafe_id` |
| `method` | Tidak | Default `transfer_bank` |
| `bank_name` | Tidak | Nama bank |
| `account_number` | Tidak | Nomor rekening (boleh disamarkan di FE, yang disimpan apa yang dikirim) |
| `account_holder` | Tidak | Atas nama |
| `fingerprint` | Tidak | Identitas perangkat (opsional) |
| `note` | Tidak | Catatan dari cafe |

### Response sukses (201)

```json
{
  "status": 201,
  "message": "Pengajuan pencairan dikirim",
  "data": {
    "id": 1,
    "client_ref": "WD-1775712101906",
    "cafe_id": 6,
    "admin_id": 2,
    "amount": 500000,
    "method": "transfer_bank",
    "bank_name": "BCA",
    "account_number": "****6666",
    "account_holder": "Nama PT",
    "status": "processing",
    "fingerprint": null,
    "note": null,
    "superadmin_note": null,
    "processed_by_superadmin_id": null,
    "processed_at": null,
    "created_at": "2026-04-09T12:00:00.000Z",
    "updated_at": "2026-04-09T12:00:00.000Z"
  },
  "success": true
}
```

### Response gagal

- **409** — `client_ref` sudah pernah dipakai untuk cafe ini (kirim ulang dengan `client_ref` sama); FE bisa anggap sudah tersimpan.
- **403** — bukan role admin cafe.
- **400** — `amount` tidak valid.

---

## 2. Admin Cafe — riwayat pengajuan sendiri

- **Method**: `GET`
- **URL**: `/api/withdrawals`
- **Auth**: Bearer token admin cafe

### Query

| Param | Keterangan |
|--------|------------|
| `status` | Opsional: filter `processing`, `completed`, `rejected`, … |
| `limit` | Opsional, default 50, max 200 |

Contoh: `GET /api/withdrawals?limit=20&status=processing`

### Response sukses (200)

`data` berupa **array** objek dengan struktur sama seperti di atas.

---

## 2b. Admin Cafe — ambil saldo untuk halaman pencairan

- **Method**: `GET`
- **URL**: `/api/withdrawals/balance`
- **Auth**: Bearer token admin cafe

### Query

| Param | Keterangan |
|--------|------------|
| `limit` | Opsional, default 20, max 100 |

### Response sukses (200)

```json
{
  "status": 200,
  "message": "Berhasil mengambil saldo cafe",
  "data": {
    "cafe_id": 6,
    "total_saldo": 275000,
    "total_transaksi": 4,
    "transaksi": [
      {
        "id": 12,
        "order_id": "ORD-ABC123",
        "amount": 75000,
        "payment_method": "online",
        "created_at": "2026-04-09T03:10:22.000Z"
      }
    ]
  },
  "success": true
}
```

Catatan: endpoint ini **tidak membutuhkan** `cafe_id`/`meja` dari FE karena diambil dari token JWT admin.

---

## 3. Superadmin — daftar semua pengajuan

- **Method**: `GET`
- **URL**: `/api/superadmin/withdrawals`
- **Auth**: `Authorization: Bearer <token JWT superadmin>`

### Query

| Param | Keterangan |
|--------|------------|
| `status` | Opsional filter |
| `cafe_id` | Opsional filter cafe |
| `limit` | Opsional, default 50, max 200 |

Contoh: `GET /api/superadmin/withdrawals?status=processing`

### Response sukses (200)

Setiap item punya field tambahan **`nama_cafe`** (jika join ke tabel `cafe` berhasil).

---

## 4. Superadmin — tandai transfer selesai

Setelah transfer manual ke rekening cafe selesai.

- **Method**: `PATCH`
- **URL**: `/api/superadmin/withdrawals/:id/complete`
- **Auth**: Bearer token superadmin

### Body (opsional)

```json
{
  "superadmin_note": "Transfer sudah dikirim 09 Apr 2026"
}
```

### Response sukses (200)

Objek pengajuan terbaru dengan `status`: `"completed"`, `processed_at` terisi, `processed_by_superadmin_id` terisi.

---

## 5. Superadmin — tolak pengajuan

- **Method**: `PATCH`
- **URL**: `/api/superadmin/withdrawals/:id/reject`
- **Auth**: Bearer token superadmin

### Body (opsional)

```json
{
  "superadmin_note": "Data rekening tidak valid"
}
```

### Response sukses (200)

`status`: `"rejected"`.

---

## Catatan untuk FE

1. **Simpan ke server**: setelah `POST` sukses, simpan `id` / `client_ref` di state lokal dan tampilkan status dari **`GET /api/withdrawals`** (bukan hanya offline).
2. **Sync ulang**: jika user kirim lagi dengan `client_ref` yang sama → API mengembalikan **409**; FE bisa menganggap data sudah ada dan refresh list.
3. **Admin cafe**: route `/api/withdrawals` **tidak** memakai cek langganan aktif (bisa tetap ajukan pencairan).
4. **Superadmin panel**: polling atau refresh setelah aksi **complete** / **reject**.
